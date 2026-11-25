/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/roundPriceChoiceToldAsItStands.test.js
 *
 * Issue #364 ROUND-PRICE-CHOICE-UNTESTED.
 *
 * A miss whose price is one of the player's choices — Explore a Waypoint's
 * with a match (Pay the Price, or Confront Chaos instead), Sojourn's ("No
 * relief — Pay the Price", or the community's need taken on with a vow) — is
 * narrated as the choice stands when the narration is written
 * (resolution.priceChoice → resultUpgrade.priceChoiceStatus →
 * resolver.settlePriceChoice). A Batch Mode round records its entries — and
 * posts their choice cards — before its one narration, so that narration may
 * be written with the choice still open, the price paid, or the price
 * declined. Only the round's prompt builder was tested for it
 * (waypointMissMatchPriceChoice.test.js, with a hand-built entry).
 *
 * Here a real round is driven on a booted GM + two-player table
 * (tests/helpers/multiClient.js) through the real relays: Kira's line is
 * read, confirmed, rolled and recorded by the round; her choice card is
 * picked on her player's client; and the round's one narration request is
 * read at the Claude boundary. Ren's weak hit, with momentum to burn, holds
 * the round at its upgrade step while Kira chooses.
 *
 * Scripted at their boundaries: the pacing decision, the interpretation (by
 * the line's words), the ability scan, entity detection and the dice.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ stakes: null }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => {
    const base = { adds: 0, rationale: 'test', mischiefApplied: false, playerNarration: narration, inputMethod: 'chat' };
    if (/derelict/.test(narration)) {
      return { ...base, moveId: 'explore_a_waypoint', moveName: 'Explore a Waypoint', statUsed: 'wits',
        ...(control.stakes ? { stakes: { ...control.stakes } } : {}) };
    }
    if (/shelter/.test(narration)) {
      return { ...base, moveId: 'sojourn', moveName: 'Sojourn', statUsed: 'heart',
        ...(control.stakes ? { stakes: { ...control.stakes } } : {}) };
    }
    return { ...base, moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge' };
  }),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
// The dice, by the move rolled (challenge, challenge, action; then a price's d100):
//   Explore a Waypoint — 7 and 7, action 1 (+wits 2): a miss with a match; the price's d100 = 71.
//   Sojourn            — 7 and 8, action 1 (+heart 2): a miss; the price's d100 = 71.
//   Face Danger        — 4 and 8, action 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
const DICE = {
  explore_a_waypoint: [0.65, 0.65, 0, 0.705],
  sojourn:            [0.65, 0.75, 0, 0.705],
  face_danger:        [0.35, 0.75, 0.4],
};
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const n of DICE[args[0]?.moveId] ?? []) dice.mockReturnValueOnce(n);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { progressTracksJournal } from '../helpers/fullStateFixture.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const REPLY = 'The dark gives nothing back.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const WASTE = 'You waste resources';

const WAYPOINT_LINE = "I search the derelict's hold.";
const WAYPOINT_MISS = "The hold's deck gives way and you drop into the dark below.";
const WAYPOINT_STAKES = { hit: 'You find what the wreck was carrying.', miss: WAYPOINT_MISS,
  missSuffer: { move: 'endure_harm', amount: 1 }, priceStated: true };
const SOJOURN_LINE = 'I ask the settlement for shelter.';
const SOJOURN_MISS = "The settlement's gates stay shut against you.";
const SOJOURN_STAKES = { hit: 'The settlement takes you in.', miss: SOJOURN_MISS,
  missSuffer: { move: 'endure_stress', amount: 1 }, priceStated: true };

const PICK = '[data-action="sf-suffer-pick"]';
const option = (i) => `${PICK}[data-option-index="${i}"]`;

let table, kira;
const round      = () => table.world.getSetting('batchMode.round');
const roundCalls = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /THIS ROUND/.test(c.userText ?? ''));
const roundCards = () => table.cards(f => f.roundId && f.narratorCard);
const choiceCard = (moveId) => table.cards(f => f.sufferCard && f.moveId === moveId).at(-1) ?? null;
const moveCard   = () => table.cards(f => f.moveResolution && f.actorId === 'pc-kira').at(-1);
const flagsOf    = (card) => table.world.message(card._id).flags[MODULE_ID];
const ptpCards   = () => table.cards(f => f.payThePriceCard);
const forced     = () => table.world.messages().filter(m => m.flags?.[MODULE_ID]?.forcedMoveId === 'confront_chaos');
/** Kira's entry in the round's narration request: from her heading to the next entry's, or the end. */
const kirasEntry = (userText) => (String(userText ?? '').match(/### \d+\. Kira — [\s\S]*?(?=\n### \d+\. |\n## |$)/) ?? [''])[0];

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.stakes = null;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: 'rpc-s1', currentSessionId: 'rpc-s1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'rpc-scene', sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  // a waypoint is explored on an expedition (the move gate's EXPEDITION_OR_SITE) — overhaul 4.
  table.journal._set(progressTracksJournal([{ id: 'ex-1', label: 'To the Drift', type: 'expedition', rank: 'dangerous', ticks: 8, completed: false }]));
  // Kira's momentum 2 beats neither of her challenge dice: no Burn, so her own result holds nothing.
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] },
    system: { wits: 2, heart: 2, momentum: { value: 2 }, supply: { value: 3 }, health: { value: 5 }, spirit: { value: 5 } } });
  // Ren's momentum 9 beats both of his: a Burn is offered, and the round waits for him.
  table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-2': 3 }, items: { contents: [] },
    system: { edge: 2, momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}
async function click(card, selector) {
  await table.client('pl-1').click(card._id, selector);
  await table.settle(); await table.drain();
}

/** Kira submits and confirms her line; Ren passes: the round rolls, records and narrates at once. */
async function kiraActsAlone(line) {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: line, submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await table.drain();
}

/** Both act: the round rolls and records both, posts Kira's choice card, and waits for Ren's Burn / Keep. */
async function roundWaitingForRen(line) {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: line, submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I hold the airlock against the drones.', submissionId: 'r1' });
  await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
  await table.drain();
  expect(round(), 'setup: the round waits at its upgrade step').toMatchObject({ phase: 'upgrading' });
  expect(round().entries['pl-2'].upgrade, 'setup: it waits for Ren').toMatchObject({ decided: null });
  expect(round().entries['pl-1'].upgrade ?? null, 'setup: Kira has nothing to decide but her choice card').toBeNull();
  expect(roundCalls(), 'setup: nothing narrated yet').toHaveLength(0);
}

/** Ren keeps his result: the round goes on to its one narration. */
async function renKeeps() {
  await relay('pl-2', 'batch.keep', { roundId: round().id });
  await table.drain();
  expect(roundCalls(), 'the round was narrated once').toHaveLength(1);
  expect(roundCards()).toHaveLength(1);
  return kirasEntry(roundCalls()[0].userText);
}

describe("a Batch Mode round — Explore a Waypoint's miss with a match is told as its choice stands (issue #364)", () => {
  beforeEach(() => { control.stakes = WAYPOINT_STAKES; });

  it('narrated before the pick: the price is offered — never what the miss costs', async () => {
    await kiraActsAlone(WAYPOINT_LINE);

    expect(roundCalls()).toHaveLength(1);
    const card = choiceCard('explore_a_waypoint');
    expect(card, "the round posted the miss's choice card").toBeTruthy();
    expect(flagsOf(card).resolved).toBe(false);
    const entry = kirasEntry(roundCalls()[0].userText);
    expect(entry).toMatch(/Kira — Explore a Waypoint.*: miss/);
    expect(entry).toContain(`- On a miss: ${WAYPOINT_MISS} (Endure Harm −1)`);
    expect(entry).toContain("[price] THE PRICE IS THE PLAYER'S CHOICE.");
    expect(entry).toContain('the player may Pay the Price or Confront Chaos instead, and has not chosen yet');
    expect(entry).toContain(`The price it offers: ${WAYPOINT_MISS}`);
    expect(entry).toContain(`Pay the Price: ${WAYPOINT_MISS}`);
    expect(entry).not.toContain('it is what this miss costs');
    // Nothing was charged, and the price is still payable on its card.
    expect(kira.system.health.value).toBe(5);
    await click(card, option(0));
    expect(ptpCards()).toHaveLength(1);
    expect(kira.system.health.value).toBe(4);
    expect(roundCalls(), 'the pick asks for no second narration').toHaveLength(1);
  }, 60_000);

  it('the price paid first: the round delivers the stated miss as what the miss costs', async () => {
    await roundWaitingForRen(WAYPOINT_LINE);
    await click(choiceCard('explore_a_waypoint'), option(0));
    expect(ptpCards()).toHaveLength(1);
    expect(kira.system.health.value).toBe(4);

    const entry = await renKeeps();
    expect(entry).toContain('deliver the miss as stated — it is what this miss costs');
    expect(entry).toContain(`Pay the Price: ${WAYPOINT_MISS}`);
    expect(entry).not.toMatch(/THE PRICE (IS THE PLAYER'S CHOICE|WAS NOT PAID)/);
  }, 60_000);

  it('Confront Chaos taken first: the round is told no price is paid — none seeded, none delivered', async () => {
    await roundWaitingForRen(WAYPOINT_LINE);
    const card = choiceCard('explore_a_waypoint');
    await click(card, option(1));
    expect(flagsOf(moveCard()).waypointRewardClaimed).toBe('alternative');
    expect(flagsOf(card)).toMatchObject({ resolved: true, superseded: true, retiredBy: 'chaos' });
    expect(forced()).toHaveLength(1);
    // Mid-round, the Confront Chaos it posts is held for the next round: the
    // claim stands, and this round's narration leaves what follows to it.
    expect(table.cards(f => f.batchHeldMoveNotice)).toHaveLength(1);

    const entry = await renKeeps();
    expect(entry).toContain('[price] THE PRICE WAS NOT PAID.');
    expect(entry).toContain('the player chose to Confront Chaos instead of paying a price: no price is paid');
    expect(entry).toContain('the miss stated before the roll does not come to pass');
    expect(entry).not.toMatch(/Pay the Price: /);
    expect(entry).not.toContain('it is what this miss costs');
    expect(ptpCards()).toEqual([]);
    expect(kira.system.health.value).toBe(5);
  }, 60_000);

  it('no miss stated: the table\'s price is seeded as the price on offer, and dropped once Confront Chaos is taken', async () => {
    control.stakes = null;
    await roundWaitingForRen(WAYPOINT_LINE);
    expect(flagsOf(choiceCard('explore_a_waypoint')).sufferPrompt.options[0].price).toMatchObject({ roll: 71, result: WASTE });
    await click(choiceCard('explore_a_waypoint'), option(1));

    const entry = await renKeeps();
    expect(entry).toContain('[price] THE PRICE WAS NOT PAID.');
    expect(entry).not.toContain(WASTE);
    expect(kira.system.supply.value).toBe(3);
  }, 60_000);
});

describe("a Batch Mode round — Sojourn's miss is told as its choice stands (issue #364)", () => {
  beforeEach(() => { control.stakes = SOJOURN_STAKES; });

  it('narrated before the pick: the price is offered beside the vow — never what the miss costs', async () => {
    await kiraActsAlone(SOJOURN_LINE);

    expect(roundCalls()).toHaveLength(1);
    expect(flagsOf(choiceCard('sojourn')).resolved).toBe(false);
    const entry = kirasEntry(roundCalls()[0].userText);
    expect(entry).toMatch(/Kira — Sojourn.*: miss/);
    expect(entry).toContain("[price] THE PRICE IS THE PLAYER'S CHOICE.");
    expect(entry).toContain('Swear an Iron Vow');
    expect(entry).toContain(`The price it offers: ${SOJOURN_MISS}`);
    expect(entry).not.toContain('it is what this miss costs');
    expect(entry).not.toMatch(/with a match|Confront Chaos/);
    expect(kira.system.spirit.value).toBe(5);
  }, 60_000);

  it('"No relief" picked first: the round delivers the stated miss as what the miss costs', async () => {
    await roundWaitingForRen(SOJOURN_LINE);
    await click(choiceCard('sojourn'), option(1));
    expect(ptpCards()).toHaveLength(1);
    expect(kira.system.spirit.value).toBe(4);

    const entry = await renKeeps();
    expect(entry).toContain('deliver the miss as stated — it is what this miss costs');
    expect(entry).toContain(`Pay the Price: ${SOJOURN_MISS}`);
    expect(entry).not.toMatch(/THE PRICE (IS THE PLAYER'S CHOICE|WAS NOT PAID)/);
  }, 60_000);

  it('the vow picked first: the round is told no price is paid — none seeded, none delivered', async () => {
    await roundWaitingForRen(SOJOURN_LINE);
    await click(choiceCard('sojourn'), option(0));
    // The card the need is answered on (sojournNeed.js) — it was a bare reminder to swear.
    expect(table.cards(f => f.sojournNeedCard)).toHaveLength(1);
    expect(table.cards(f => f.sufferDeferred && f.route === 'swear_an_iron_vow')).toEqual([]);

    const entry = await renKeeps();
    expect(entry).toContain('[price] THE PRICE WAS NOT PAID.');
    expect(entry).toContain('no price is paid, and the miss stated before the roll does not come to pass');
    expect(entry).not.toMatch(/Pay the Price: /);
    expect(entry).not.toContain('it is what this miss costs');
    expect(ptpCards()).toEqual([]);
    expect(kira.system.spirit.value).toBe(5);
  }, 60_000);

  // Issue #364 SOJOURN-VOW-OPTION-REMINDER-ONLY: the answered need resolves
  // the Sojourn as a strong hit, narrated as a beat of its own — after the
  // round has told the miss, never beside the round's one narration.
  it("It is done pressed while the round still waits is refused and said; after the round is told it resolves, narrated after it", async () => {
    const DONE = '[data-action="sf-sojourn-need-done"]';
    const strongHits = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL
      && /Narrate the consequence/.test(c.userText ?? '') && /A miss, resolved as a strong hit/.test(c.userText ?? ''));
    await roundWaitingForRen(SOJOURN_LINE);
    await click(choiceCard('sojourn'), option(0));
    const need = table.cards(f => f.sojournNeedCard).at(-1);

    await click(need, DONE);
    expect(flagsOf(need)).toMatchObject({ resolved: false });
    expect(table.cards(f => f.pressRefusedNotice).at(-1).content).toContain('A round is being resolved');
    expect(flagsOf(moveCard()).resolutionId).toBe(flagsOf(need).resolutionId);
    expect(table.world.message(moveCard()._id).content).not.toContain('sf-sojourn-resolved');
    expect(strongHits()).toHaveLength(0);

    const entry = await renKeeps();
    expect(entry).toContain('[price] THE PRICE WAS NOT PAID.');
    await table.client('gm-1').click(need._id, DONE);
    await table.settle(); await table.drain();

    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(table.world.message(moveCard()._id).content).toContain("✦ Resolved as a strong hit — the community's need was met.");
    expect(strongHits()).toHaveLength(1);
    expect(strongHits()[0].userText).toContain(`- On a hit: ${SOJOURN_STAKES.hit}`);
    expect(table.claude.calls.indexOf(strongHits()[0])).toBeGreaterThan(table.claude.calls.indexOf(roundCalls()[0]));
    expect(roundCalls(), 'the round was narrated once').toHaveLength(1);
  }, 60_000);
});

/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/roundHeldCardMoveAcrossSessionEnd.test.js
 *
 * Issue #364 ROUND-CONFRONT-CHAOS-HELD-AT-SESSION-END (left open by
 * ROUND-PRICE-CHOICE-UNTESTED, "not verified"). In a Batch Mode round,
 * 🌀 Confront Chaos pressed on a matched Explore a Waypoint miss retires the
 * price at once — the round is told no price is paid — while the Confront
 * Chaos it posts is "Held for the next round"
 * (tests/unit/roundPriceChoiceToldAsItStands.test.js). What becomes of that
 * held move when the session ends before a next round opens was never run.
 *
 * Run, it is not lost at the session's end: no round opens into a session
 * that is over, and the move stays held on the canonical GM's page — its card
 * still claimed, nothing handed back, nothing more said — and is its roller's
 * entry in the first round of the next session, as the notice said. That is
 * the rule free-flow keeps for the same case (a claimed card's move pressed
 * with no session in play is held until one begins — issue #325 W02, #329
 * X14), so this file pins it and changes no source: End a Session, and a
 * session over by four idle hours.
 *
 * NOT pinned here: the hold lives in the canonical GM's page memory, so a
 * world load between the two sessions drops it (the card stays claimed, the
 * price retired, nothing confronted) — that is known-issues
 * FORCED-MOVE-HOLD-RELOAD, tracked and deferred, and not this row's.
 *
 * On a booted table (tests/helpers/multiClient.js), as
 * roundPriceChoiceToldAsItStands: the round through the canonical GM's real
 * relays, the choice card's real click, the session ended and begun as the
 * Session panel's writes do.
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

const WAYPOINT_LINE = "I search the derelict's hold.";

const PICK = '[data-action="sf-suffer-pick"]';
const option = (i) => `${PICK}[data-option-index="${i}"]`;

let table;
const round      = () => table.world.getSetting('batchMode.round');
const roundCalls = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /THIS ROUND/.test(c.userText ?? ''));
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
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] },
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

const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const world = () => table.world.campaignState();
const heldNotices = () => table.cards(f => f.batchHeldMoveNotice);
const notRolled = () => table.cards(f => f.moveNotRolledNotice || f.sessionGateNotice);
/** Confront Chaos's own move card (it rolls no action die) — the waypoint's card names the move too. */
const chaosCards = () => table.cards(f => f.moveResolution)
  .filter(c => /Confront Chaos\s+no action roll/.test(String(c.content ?? '').replace(/<[^>]+>/g, ' ')));

/** Round 1 waits on Ren; Kira takes Confront Chaos on her miss's choice card: the price is retired, the move held. */
async function confrontChaosHeldMidRound() {
  await roundWaitingForRen(WAYPOINT_LINE);
  await click(choiceCard('explore_a_waypoint'), option(1));
  expect(forced(), 'setup: one Confront Chaos posted').toHaveLength(1);
  expect(heldNotices(), 'setup: told once it is held').toHaveLength(1);
  expect(heldNotices()[0].content).toContain('Held for the next round');
  expect(flagsOf(choiceCard('explore_a_waypoint')), 'setup: the price is retired').toMatchObject({ resolved: true, retiredBy: 'chaos' });
  return { roundId: round().id, heldId: forced()[0].id ?? forced()[0]._id };
}

/** What the session's end must leave: round 1 narrated and closed, no round after it, the move still held and its card still claimed. */
function expectStillHeld({ roundId }) {
  expect(round(), 'round 1 was kept for Ren and narrated').toMatchObject({ id: roundId, phase: 'closed', closeReason: 'resolved' });
  expect(roundCalls()).toHaveLength(1);
  expect(kirasEntry(roundCalls()[0].userText)).toContain('the player chose to Confront Chaos instead of paying a price: no price is paid');
  expect(chaosCards(), 'not rolled yet').toEqual([]);
  expect(notRolled(), 'nothing handed back, nothing gated').toEqual([]);
  expect(heldNotices(), 'told once, not again').toHaveLength(1);
  expect(flagsOf(moveCard()).waypointRewardClaimed, 'its card stays claimed').toBe('alternative');
  expect(flagsOf(choiceCard('explore_a_waypoint'))).toMatchObject({ resolved: true, retiredBy: 'chaos' });
  expect(ptpCards(), 'and no price was paid meanwhile').toEqual([]);
}

/** Begin a Session, on the page the GM left loaded: the next session, in play. */
async function beginTheNextSession() {
  await table.client('gm-1').setSetting('campaignState', { ...world(), sessionActive: true, currentSessionId: 'rpc-s2',
    sessionStartedId: 'rpc-s2', sessionNumber: 2, lastSessionTimestamp: new Date().toISOString() });
  await table.settle(); await table.drain();
}

/** The next session's first round holds the move as Kira's entry; confirmed, it is rolled and told with that round. */
async function expectMadeInTheNextRound({ roundId, heldId }) {
  expect(round(), 'a round opened into the new session').toMatchObject({ phase: 'collecting', sessionId: 'rpc-s2' });
  expect(round().id).not.toBe(roundId);
  const entry = round().entries['pl-1'];
  expect(entry.readAs, 'the held Confront Chaos is her entry').toMatchObject({ move: true, messageId: heldId, forced: { moveId: 'confront_chaos' } });
  expect(entry.reading).toMatchObject({ kind: 'move', moveId: 'confront_chaos' });
  expect(forced(), 'the same post — not pressed or posted again').toHaveLength(1);

  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: entry.submissionId, choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await table.drain();
  expect(chaosCards(), 'Confront Chaos was made, once').toHaveLength(1);
  expect(chaosCards()[0].flags[MODULE_ID].actorId).toBe('pc-kira');
  expect(roundCalls(), 'and told with its round').toHaveLength(2);
  expect(roundCalls()[1].userText).toContain('Confront Chaos');
  expect(ptpCards(), 'the retired price never came back').toEqual([]);
}

describe("issue #364 ROUND-CONFRONT-CHAOS-HELD-AT-SESSION-END — a card move held for the next round outlives the session's end", () => {
  it("End a Session: the move stays held, and is its roller's entry in the next session's first round", async () => {
    const held = await confrontChaosHeldMidRound();

    // End a Session's own first write: the gate shut, the session marked ended.
    await table.client('gm-1').setSetting('campaignState', { ...world(), sessionActive: false, sessionEndedId: 'rpc-s1' });
    await table.settle(); await table.drain();
    expectStillHeld(held);

    await beginTheNextSession();
    await expectMadeInTheNextRound(held);
  }, 90_000);

  it('four idle hours, then the Keep the round waited for: held the same, and made once a session begins', async () => {
    const held = await confrontChaosHeldMidRound();

    // Time passing writes nothing and runs no pass: the session's last sighting is aged in the store.
    table.world.setSetting('campaignState', { ...world(), lastSessionTimestamp: ago(6 * HOUR) });
    table.world.setSetting('sessionActivity', { sessionId: 'rpc-s1', at: ago(5 * HOUR) });
    await relay('pl-2', 'batch.keep', { roundId: held.roundId });
    await table.drain();
    expectStillHeld(held);

    await beginTheNextSession();
    await expectMadeInTheNextRound(held);
  }, 90_000);

  it('control: with the session still in play the next round takes it at once', async () => {
    const held = await confrontChaosHeldMidRound();
    await relay('pl-2', 'batch.keep', { roundId: held.roundId });
    await table.drain();

    expect(round().id, 'round 2 opened').not.toBe(held.roundId);
    expect(round()).toMatchObject({ phase: 'collecting', sessionId: 'rpc-s1' });
    expect(round().entries['pl-1'].readAs).toMatchObject({ move: true, messageId: held.heldId, forced: { moveId: 'confront_chaos' } });
  }, 90_000);
});

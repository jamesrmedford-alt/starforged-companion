/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/sojournVowSwornAsRoundEntry.test.js
 *
 * Issue #364 SOJOURN-SWEAR-AS-ROUND-ENTRY.
 *
 * A Sojourn miss answered with a vow is resolved as a strong hit once that
 * vow's Swear an Iron Vow is rolled and told (src/moves/sojournNeed.js). In
 * Batch Mode the vow card's ⚔ Swear it (roll) is not rolled at once: it
 * becomes its roller's entry in the round, and the round rolls it, tells it
 * in its one narration, and only then finishes its moves
 * (batch/driver.js finishRound → movePipeline.finishMove →
 * resolveSojournNeedsForVow). That path had no test.
 *
 * Here a real round is driven on a booted GM + two-player table
 * (tests/helpers/multiClient.js) through the real relays and cards: round 1
 * rolls and tells Kira's Sojourn miss; she takes the community's need on,
 * writes the vow from its card and presses ⚔ Swear it (roll), which becomes
 * her entry in round 2. Ren's weak hit, with momentum to burn, holds round 2
 * at its upgrade step — a round being resolved, with the swear rolled and not
 * yet told.
 *
 * Scripted at their boundaries: the pacing decision, the interpretation (by
 * the line's words), the ability scan, entity detection and the dice. The
 * vow's Item is made by a stand-in `Item.create` that fires the createItem
 * hook, as the system does.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => {
    const base = { adds: 0, rationale: 'test', mischiefApplied: false, playerNarration: narration, inputMethod: 'chat' };
    if (/shelter/.test(narration)) return { ...base, moveId: 'sojourn', moveName: 'Sojourn', statUsed: 'heart' };
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
//   Sojourn           — 7 and 8, action 1 (+heart 2): a miss; the price's d100 = 71.
//   Swear an Iron Vow — 1 and 2, action 6: a strong hit, nothing to upgrade.
//   Face Danger       — 4 and 8, action 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
const DICE = {
  sojourn:           [0.65, 0.75, 0, 0.705],
  swear_an_iron_vow: [0, 0.1, 0.9],
  face_danger:       [0.35, 0.75, 0.4],
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
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const REPLY = 'The dark gives nothing back.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const SOJOURN_LINE = 'I ask the settlement for shelter.';
const REN_LINE = 'I hold the airlock against the drones.';

const NEED     = '[data-action="sf-suffer-pick"][data-option-index="0"]';
const SWEAR    = '[data-action="sf-sojourn-need-swear"]';
const DONE     = '[data-action="sf-sojourn-need-done"]';
const SWEAR_IT = '[data-action="sf-player-vow-swear"]';

let table, kira, savedItem;
const round      = () => table.world.getSetting('batchMode.round');
const roundCalls = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /THIS ROUND/.test(c.userText ?? ''));
const refuges    = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL
  && /Narrate the consequence/.test(c.userText ?? '') && /A miss, resolved as a strong hit/.test(c.userText ?? ''));
const flagsOf    = (card) => table.world.message(card._id).flags[MODULE_ID];
const contentOf  = (card) => table.world.message(card._id).content;
const named      = (move) => table.cards(f => f.moveResolution).find(m => m.content.includes(`<div class="sf-move-name">${move}</div>`)) ?? null;
const needCard   = () => table.cards(f => f.sojournNeedCard).at(-1) ?? null;
const vowCard    = () => table.cards(f => f.playerVowCard).at(-1) ?? null;
const notices    = () => table.cards(f => f.pressRefusedNotice);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: 'svr-s1', currentSessionId: 'svr-s1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'svr-scene', sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  // Kira's momentum 2 beats none of her challenge dice: no Burn, so her results hold nothing.
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] },
    system: { heart: 2, momentum: { value: 2 }, supply: { value: 3 }, health: { value: 5 }, spirit: { value: 5 } } });
  // Ren's momentum 9 beats both of his: a Burn is offered, and a round he acts in waits for him.
  table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-2': 3 }, items: { contents: [] },
    system: { edge: 2, momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => REPLY });
  savedItem = globalThis.Item;
  let made = 0;
  globalThis.Item = { async create(data, { parent } = {}) {
    made += 1;
    const item = {
      id: `vow-${made}`, type: data.type, name: data.name, parent, flags: JSON.parse(JSON.stringify(data.flags ?? {})),
      system: { ...data.system, completed: false },
      async update(changes) { if (typeof changes?.name === 'string') item.name = changes.name; return item; },
      async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
    };
    parent.items.contents.push(item);
    for (const c of table.connectedClients) c.run(() => Hooks.callAll('createItem', item, {}, 'gm-1'));
    return item;
  } };
  silenceConsoleErrors();
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
});
afterEach(async () => {
  globalThis.Item = savedItem;
  table.client('gm-1').answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

async function settled() { await table.settle(); await table.drain(); }
async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}
async function click(card, selector, as = 'pl-1') {
  await table.client(as).click(card._id, selector);
  await settled();
}

/**
 * Round 1 rolls and tells Kira's Sojourn miss (Ren passes); she takes the
 * community's need on and writes the vow from its card; her ⚔ Swear it (roll)
 * then becomes her entry in round 2.
 */
async function swearEnteredInTheRound() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: SOJOURN_LINE, submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await settled();
  expect(roundCalls(), 'setup: round 1 told the miss').toHaveLength(1);
  await click(table.cards(f => f.sufferCard && f.moveId === 'sojourn').at(-1), NEED);
  const need = needCard();
  table.client('pl-1').render(need._id).querySelector('.sf-sojourn-need-vow-name').value = 'Clear the reactor of raiders';
  table.client('pl-1').click(need._id, SWEAR);
  await settled(); await settled();
  expect(kira.items.contents, 'setup: the vow is on the sheet').toHaveLength(1);

  await click(vowCard(), SWEAR_IT);
  expect(round().entries['pl-1'], "setup: the swear is Kira's entry, not rolled yet").toMatchObject({
    status: 'read', readAs: { forced: { moveId: 'swear_an_iron_vow', moveTargetId: kira.items.contents[0].id } } });
  expect(named('Swear an Iron Vow'), 'setup: nothing rolled').toBeNull();
  return need;
}

/** Kira confirms the swear and Ren acts: round 2 rolls and records both, and waits for Ren's Burn / Keep. */
async function roundWaitingForRen() {
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: round().entries['pl-1'].submissionId, choices: {} });
  await relay('pl-2', 'batch.submit', { roundId: round().id, text: REN_LINE, submissionId: 'r2' });
  await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r2', choices: {} });
  await settled();
  expect(round(), 'setup: the round waits at its upgrade step').toMatchObject({ phase: 'upgrading' });
  expect(named('Swear an Iron Vow'), 'setup: the swear is rolled').toBeTruthy();
  expect(roundCalls(), 'setup: round 2 is not told yet').toHaveLength(1);
}

describe("a vow sworn for a Sojourn's need as a Batch Mode round entry (issue #364 SOJOURN-SWEAR-AS-ROUND-ENTRY)", () => {
  it('rolled and not yet told: the Sojourn is not resolved while the round is being resolved', async () => {
    const need = await swearEnteredInTheRound();

    await roundWaitingForRen();

    expect(flagsOf(need)).toMatchObject({ resolved: false });
    expect(refuges(), 'no refuge before the round tells the oath').toHaveLength(0);
    expect(contentOf(named('Sojourn'))).not.toContain('sf-sojourn-resolved');
  }, 90_000);

  it('once the round has told the swear, the Sojourn is resolved — once, and narrated after the round', async () => {
    const need = await swearEnteredInTheRound();
    await roundWaitingForRen();

    await relay('pl-2', 'batch.keep', { roundId: round().id });
    await settled();

    expect(roundCalls(), 'round 2 was narrated once').toHaveLength(2);
    expect(roundCalls()[1].userText).toMatch(/Kira — Swear an Iron Vow/);
    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain("an iron vow was sworn to see the community's need done");
    expect(contentOf(need)).not.toContain('data-action');
    expect(contentOf(named('Sojourn')).match(/sf-sojourn-resolved/g)).toHaveLength(1);
    expect(contentOf(named('Sojourn'))).toContain("✦ Resolved as a strong hit — an iron vow was sworn to see the community's need done.");
    expect(refuges()).toHaveLength(1);
    const calls = table.claude.calls;
    expect(calls.indexOf(refuges()[0]), "the refuge follows the round's narration").toBeGreaterThan(calls.indexOf(roundCalls()[1]));
    // The next round is open, and nothing resolves the Sojourn a second time.
    expect(round()).toMatchObject({ phase: 'collecting' });
    await relay('pl-1', 'batch.pass', { roundId: round().id });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await settled();
    expect(refuges()).toHaveLength(1);
  }, 90_000);

  it("✔ It is done pressed while the round is being resolved is refused and said, and stays live; the round's swear then resolves the Sojourn as sworn", async () => {
    const need = await swearEnteredInTheRound();
    await roundWaitingForRen();

    await click(need, DONE);

    expect(flagsOf(need)).toMatchObject({ resolved: false });
    expect(notices().at(-1).content).toContain('A round is being resolved — press ✔ It is done once the round is narrated.');
    expect(notices().at(-1).whisper).toEqual(expect.arrayContaining(['pl-1', 'gm-1']));
    expect(refuges()).toHaveLength(0);
    for (const who of ['gm-1', 'pl-1']) {
      expect(table.client(who).render(need._id).querySelector(DONE)?.disabled, `✔ is still live for ${who}`).toBe(false);
    }

    await relay('pl-2', 'batch.keep', { roundId: round().id });
    await settled();

    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain("an iron vow was sworn to see the community's need done");
    expect(refuges()).toHaveLength(1);
    expect(contentOf(named('Sojourn')).match(/sf-sojourn-resolved/g)).toHaveLength(1);
  }, 90_000);

  it("the GM's page reloaded while the round waits: the round it resumes still resolves the Sojourn its swear answers", async () => {
    const need = await swearEnteredInTheRound();
    await roundWaitingForRen();

    // The reloaded page rolled nothing itself: the swear's vow is read back from the round's stored entry.
    await table.reload('gm-1');
    await settled();
    expect(round(), 'setup: the round still waits for Ren').toMatchObject({ phase: 'upgrading' });
    expect(flagsOf(need)).toMatchObject({ resolved: false });

    await relay('pl-2', 'batch.keep', { roundId: round().id });
    await settled();

    expect(roundCalls()).toHaveLength(2);
    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(refuges()).toHaveLength(1);
    expect(table.claude.calls.indexOf(refuges()[0])).toBeGreaterThan(table.claude.calls.indexOf(roundCalls()[1]));
    expect(contentOf(named('Sojourn')).match(/sf-sojourn-resolved/g)).toHaveLength(1);
  }, 90_000);

  it("✔ It is done pressed while the round still collects resolves the Sojourn; the round's swear resolves nothing twice", async () => {
    const need = await swearEnteredInTheRound();
    expect(round()).toMatchObject({ phase: 'collecting' });

    await click(need, DONE);
    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(refuges()).toHaveLength(1);

    await roundWaitingForRen();
    await relay('pl-2', 'batch.keep', { roundId: round().id });
    await settled();

    expect(roundCalls()).toHaveLength(2);
    expect(refuges()).toHaveLength(1);
    expect(contentOf(need)).toContain("the community's need was met");
    expect(contentOf(named('Sojourn')).match(/sf-sojourn-resolved/g)).toHaveLength(1);
  }, 90_000);
});

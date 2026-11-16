/* global silenceConsoleErrors -- tests/setup.js */
/**
 * PROBE — BATCH · HELD-RESULT-OUTLIVES-ROUND-ENTRY (seam: issue #354 P2-10 × Batch Mode)
 *
 * Scenario: free-flow play. Kira's miss can be burned, so it is held
 * (P2-10): nothing is paid, nothing is narrated, the card says "Your next
 * line keeps it." The GM switches Batch Mode on before Kira has chosen. Kira
 * goes on — her next action is her entry in the round.
 *
 * Correct (decisions.md P2-10: "The roller going on keeps it: their next line
 * or move … so the story stays in order"): the held miss is kept — its Pay the
 * Price paid, its narration posted — before the round that tells Kira's next
 * action is narrated.
 *
 * Today:
 *   - an entry with no roll (a narrative reading) keeps nothing: chat is table
 *     talk in Batch Mode, so the line never reaches index.js's
 *     keepHeldResultsOf, and the round narrates Kira's next action with the
 *     miss unpaid, un-narrated and still burnable;
 *   - an entry that rolls keeps it only after the new move is recorded, and
 *     not awaited (resultUpgrade.js closeUpgradesForLaterMove → `void …
 *     keepHeldResult`): the round goes on to its own narration without it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ pace: null, interpret: null, dice: [], ptp: [78] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async ({ playerText }) => control.pace(playerText)),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpret, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});
vi.mock('../../../src/oracles/roller.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== 'pay_the_price') return real.rollOracle(...args);
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 6 and 7, action die 1 (+2): a miss momentum 9 burns to a strong hit — held in free-flow.
const BURNABLE_MISS = [0.55, 0.65, 0.1];
// challenge 1 and 2: a strong hit — nothing to upgrade.
const STRONG = [0.05, 0.15, 0.9];
const FACE_DANGER = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false };

let table, kira;
let seq = 0;
const round       = () => table.world.getSetting('batchMode.round');
const flags       = (id) => table.world.message(id).flags[MODULE_ID];
const narrations  = () => table.cards(f => f.narratorCard && !f.narrationFallback);
const priceCards  = () => table.cards(f => f.payThePriceCard);
const isRoundCall = (c) => /THIS ROUND/.test(c.userText ?? '');
const isMoveCall  = (c) => /MOVE OUTCOME/.test(c.userText ?? '') && !isRoundCall(c);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

let claude;
beforeEach(async () => {
  control.pace = (text) => (/^I keep watch/.test(text)
    ? { runMove: false, decision: 'NARRATIVE', suggestedMove: null, suggestedTargetId: null }
    : { runMove: true, decision: 'MOVE', suggestedMove: null });
  control.interpret = { ...FACE_DANGER };
  control.dice = [];
  control.ptp = [78];   // Pay the Price 78: "You are harmed" — Endure Harm (-1)
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] }, system: { momentum: { value: 9 } } });
  table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-2': 3 }, items: { contents: [] } });
  claude = scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}
async function submitAndConfirm(userId, text) {
  const submissionId = `sub-${userId}-${++seq}`;
  await relay(userId, 'batch.submit', { roundId: round().id, text, submissionId });
  await relay(userId, 'batch.confirm', { roundId: round().id, submissionId, choices: {} });
}

/** Free-flow: Kira's burnable miss is held; then the GM switches Batch Mode on. */
async function heldMissThenBatchModeOn() {
  control.dice = [BURNABLE_MISS];
  await table.client('pl-1').chat('I slip through the vent before the drones turn.', { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
  const card = table.cards(f => f.moveResolution).at(-1);
  expect(flags(card._id).awaitingUpgrade, 'setup: the miss is held').toMatchObject({ open: true });
  expect(priceCards(), 'setup: nothing paid yet').toEqual([]);
  expect(narrations(), 'setup: nothing narrated yet').toEqual([]);

  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
  expect(round(), 'setup: a round is collecting').toMatchObject({ phase: 'collecting' });
  return card;
}

describe('BATCH — a free-flow result held for Burn / Improve / Keep when Batch Mode turns on', () => {
  it('her next action taken as a round entry with no roll keeps the held miss before the round is narrated', async () => {
    const card = await heldMissThenBatchModeOn();
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await submitAndConfirm('pl-1', 'I keep watch at the door.');
    await table.drain();

    // Setup: the round told Kira's next action.
    const roundCards = table.cards(f => f.narratorCard && f.roundId);
    expect(roundCards, 'setup: the round was narrated').toHaveLength(1);
    expect(roundCards[0].flags[MODULE_ID].roundEntries.map(e => e.playerText)).toEqual(['I keep watch at the door.']);

    // FAILS today: the miss is still held — unpaid, un-narrated, still burnable — after her next action was told.
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false });
    expect(priceCards()).toHaveLength(1);
    expect(kira.system.health.value).toBe(4);
    expect(narrations().map(c => c.flags[MODULE_ID].roundId ? 'round' : c.flags[MODULE_ID].outcome)).toEqual(['miss', 'round']);
  }, 60_000);

  it('her next action taken as a rolled round entry: the held miss is narrated before the round is', async () => {
    const card = await heldMissThenBatchModeOn();
    // The held miss's own narration is slow; the round's is not.
    const heldNarration = claude.hold(isMoveCall);
    control.dice = [STRONG];
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await submitAndConfirm('pl-1', 'I push on through the hatch.');
    await heldNarration.arrived;            // the keep is paying and narrating the miss
    await table.settle();
    const roundNarratedMeanwhile = table.cards(f => f.narratorCard && f.roundId).length;
    heldNarration.release(REPLY);
    await table.drain();

    // Setup: the keep ran (the later move's record closes the held card), and both were narrated in the end.
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: 'later' });
    expect(narrations()).toHaveLength(2);
    // FAILS today: the round did not wait for the held miss — its card posted while the miss's narration was still being written.
    expect(roundNarratedMeanwhile, 'the round narrated before the held miss\'s narration was posted').toBe(0);
    expect(narrations().map(c => c.flags[MODULE_ID].roundId ? 'round' : c.flags[MODULE_ID].outcome)).toEqual(['miss', 'round']);
  }, 60_000);

  it('control: in free-flow her next line keeps the held miss first — two narrations, in order', async () => {
    control.dice = [BURNABLE_MISS];
    await table.client('pl-1').chat('I slip through the vent before the drones turn.', { speaker: { actor: kira.id } });
    await table.settle(); await table.drain();
    const first = table.cards(f => f.moveResolution).at(-1);
    expect(flags(first._id).awaitingUpgrade.open).toBe(true);

    control.dice = [STRONG];
    await table.client('pl-1').chat('I push on through the hatch.', { speaker: { actor: kira.id } });
    await table.settle(); await table.drain();

    expect(flags(first._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: 'later' });
    expect(priceCards()).toHaveLength(1);
    expect(kira.system.health.value).toBe(4);
    expect(narrations().map(c => c.flags[MODULE_ID].outcome)).toEqual(['miss', 'strong_hit']);
  }, 60_000);

  it('control: with nothing held, a round narrates a no-roll entry as before', async () => {
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await submitAndConfirm('pl-1', 'I keep watch at the door.');
    await table.drain();
    expect(table.cards(f => f.narratorCard && f.roundId)).toHaveLength(1);
    expect(priceCards()).toEqual([]);
  }, 60_000);
});

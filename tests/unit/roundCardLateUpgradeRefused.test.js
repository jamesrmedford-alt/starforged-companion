/* global silenceConsoleErrors -- tests/setup.js */
// tests/unit/roundCardLateUpgradeRefused.test.js
//
// Issue #344 A03 — a Batch Mode round decides its rollers' Burn / Improve
// before its one narration, and closes each result card's upgrades
// (`roundClosed`, driver.js closeCardUpgrades): after a Keep, and again as the
// narration begins. Both writes refused — the refusals only warned — the card
// stayed open, and the GM handlers judged a press on the card's flags alone: a
// Burn pressed after the round was narrated spent momentum, consumed the card
// and posted a second, separate narration of a result the round had told.
//
// Now the handlers judge a round's card by the round's own record too — its
// round still the stored one, still rolling or asking, its roller undecided —
// and a refused press writes the card's closure again, so it shows closed.
// Improve Result shares the gate.
//
// Production entry points on a booted table (the multi-client harness): the
// real relay handlers, round transitions, move pipeline, burn, improvement
// and narration. Pacing, the interpreter, ability detection and the dice are
// controlled at their boundaries (the probe's setup, issue #344 Appendix A).

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ abilities: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => control.abilities),
}));
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    // A weak hit that a burn of 9 raises to a strong hit.
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.35).mockReturnValueOnce(0.75).mockReturnValueOnce(0.4);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, failWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { upgradeClosedByRound } from '../../src/batch/round.js';

const REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const SESSION = { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] };
const FUGITIVE = [{ assetId: null, assetName: 'Fugitive', resultImprovement: { improveTo: 'strong_hit' }, hasClock: false }];

let table;
const round = () => table.world.getSetting('batchMode.round');
const momentum = () => table.actors.get('pc-kira').system.momentum.value;
const cardFlags = (cardId) => table.world.message(cardId).flags[MODULE_ID];
const narrators = () => table.cards(f => f.narratorCard);
// The round's writes closing a result card's upgrades (after Keep, as the narration begins).
const closure = (w) => w.kind === 'message.update'
  && (w.changes?.[`flags.${MODULE_ID}.burn.roundClosed`] === true || w.changes?.[`flags.${MODULE_ID}.improve.roundClosed`] === true);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.abilities = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false, campaignState: SESSION,
  } } });
  await table.setClaudeKey('gm-1', 'test-fixture-key');
  await table.setClaudeKey('gm-2', 'test-fixture-key');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  table.actors.get('pc-kira').system.momentum.value = 9;
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

/** Kira's weak hit waits for her decision; she keeps it, and the round is narrated. */
async function kiraKeepsAndTheRoundIsNarrated() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await table.drain();
  const r = round();
  expect(r).toMatchObject({ number: 1, phase: 'upgrading' });
  await relay('pl-1', 'batch.keep', { roundId: r.id });
  await table.drain();
  expect(round().number).toBe(2);
  expect(narrators().filter(c => c.flags[MODULE_ID].roundId === r.id)).toHaveLength(1);
  return { roundId: r.id, cardId: r.entries['pl-1'].rolled.cardId };
}

async function press(kind, cardId) {
  await relay('pl-1', kind, { messageId: cardId });
  await table.drain();
}

describe('issue #344 A03 — a round result cannot be upgraded after the round told it', () => {
  it('control: after a Keep and the narration, a late Burn is refused', async () => {
    const { cardId } = await kiraKeepsAndTheRoundIsNarrated();
    expect(cardFlags(cardId).burn.roundClosed).toBe(true);
    await press('move.burnMomentum', cardId);
    expect(cardFlags(cardId).burn.consumed).not.toBe(true);
    expect(momentum()).toBe(9);
    expect(narrators()).toHaveLength(1);
  }, 30_000);

  it('the card\'s closures refused: a late Burn is still refused — no momentum spent, no second narration', async () => {
    const fault = failWrites(table, closure, { times: 1_000 });
    const { cardId } = await kiraKeepsAndTheRoundIsNarrated();
    expect(fault.refused).toBeGreaterThanOrEqual(2);
    expect(cardFlags(cardId).burn.roundClosed).not.toBe(true);

    await press('move.burnMomentum', cardId);
    // It was: consumed, momentum 9 → 3, and a second narrator card for the burn.
    expect(cardFlags(cardId).burn.consumed).not.toBe(true);
    expect(momentum()).toBe(9);
    expect(narrators()).toHaveLength(1);
  }, 30_000);

  it('…and once the world takes writes again, the refused press closes the card, so it shows closed', async () => {
    const fault = failWrites(table, closure, { times: 1_000 });
    const { cardId } = await kiraKeepsAndTheRoundIsNarrated();
    fault.off();
    expect(cardFlags(cardId).burn.roundClosed).not.toBe(true);

    await press('move.burnMomentum', cardId);
    expect(cardFlags(cardId).burn.consumed).not.toBe(true);
    expect(cardFlags(cardId).burn.roundClosed, 'the closure written again').toBe(true);
    expect(momentum()).toBe(9);
  }, 30_000);

  it('Improve Result shares the gate: a late improvement of a told round result is refused', async () => {
    control.abilities = FUGITIVE;
    const fault = failWrites(table, closure, { times: 1_000 });
    const { cardId } = await kiraKeepsAndTheRoundIsNarrated();
    expect(cardFlags(cardId).improve).toMatchObject({ canImprove: true });
    expect(cardFlags(cardId).improve.roundClosed).not.toBe(true);
    expect(fault.refused).toBeGreaterThanOrEqual(2);

    await press('move.improveResult', cardId);
    expect(cardFlags(cardId).improve.consumed).not.toBe(true);
    expect(narrators()).toHaveLength(1);
  }, 30_000);

  it('control: while the round still asks, the card\'s Burn is taken', async () => {
    const fault = failWrites(table, closure, { times: 1_000 });
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await table.drain();
    const r = round();
    await press('move.burnMomentum', r.entries['pl-1'].rolled.cardId);
    fault.off();
    expect(momentum()).toBe(3);
    expect(round().number).toBe(2);
    const told = narrators().filter(c => c.flags[MODULE_ID].roundId === r.id);
    expect(told).toHaveLength(1);
    expect(told[0].flags[MODULE_ID].roundEntries[0].outcome).toBe('strong_hit');
  }, 30_000);
});

describe('issue #344 A03 — the round\'s own record of a card\'s upgrades', () => {
  const card = { roundId: 'r-1', roundUserId: 'pl-1' };
  const at = (phase, entry = { userId: 'pl-1', upgrade: { burn: {}, decided: null } }, id = 'r-1') =>
    ({ id, phase, entries: { 'pl-1': entry } });

  it('open while its round rolls or asks and its roller has not decided', () => {
    expect(upgradeClosedByRound(at('rolling', { userId: 'pl-1' }), card)).toBe(false);
    expect(upgradeClosedByRound(at('upgrading'), card)).toBe(false);
  });

  it('closed once decided, narrating, closed, or another round is the stored one', () => {
    expect(upgradeClosedByRound(at('upgrading', { userId: 'pl-1', upgrade: { decided: 'keep' } }), card)).toBe(true);
    expect(upgradeClosedByRound(at('narrating'), card)).toBe(true);
    expect(upgradeClosedByRound(at('closed'), card)).toBe(true);
    expect(upgradeClosedByRound(at('collecting', {}, 'r-2'), card)).toBe(true);
    expect(upgradeClosedByRound(null, card)).toBe(true);
  });

  it('a card no round posted is not its business', () => {
    expect(upgradeClosedByRound(null, { resolutionId: 'x' })).toBe(false);
    expect(upgradeClosedByRound(at('collecting', {}, 'r-2'), {})).toBe(false);
  });
});

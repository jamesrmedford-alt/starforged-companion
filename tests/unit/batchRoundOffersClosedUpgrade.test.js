/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundOffersClosedUpgrade.test.js
 *
 * Issue #342 Z27 UPGRADE-OFFER-IGNORES-CHOICE (the eleventh audit's UPG-4).
 *
 * Kira's Face Danger rolls a weak hit in a round; its record posts the move
 * card (🔥 Burn Momentum, momentum 9 → strong hit) and the weak hit's choice
 * card ("Make a suffer move (-1)"). The round enters its upgrade step and
 * waits for Kira. She resolves the consequence first: Lose Momentum on the
 * choice card — which closes both upgrades (issue #311 P03). The round's
 * offer was built from `burn.canBurn` alone and never revisited: the round
 * kept waiting on her, and her window kept offering a Burn its relay refused.
 * The pick is now her Keep: the round goes on, and her window offers no Burn
 * (the refusal on the GM stays the backstop for a press no window offers).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false })),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
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
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const ROUND_REPLY = 'Kira slips through the vent as the drones turn.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 4 and 8, action die 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
const WEAK = [0.35, 0.75, 0.4];

let table, kira;
const round = () => table.world.getSetting('batchMode.round');
const flags = (id) => table.world.message(id).flags[MODULE_ID];

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] }, system: { momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => ROUND_REPLY });
  silenceConsoleErrors();
});

/** Kira's weak hit: the round waits on her upgrade; returns the move card and its choice card. */
async function weakHitRound() {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
  control.dice = [WEAK];
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'sub-1' });
  const r = round();
  await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
  await table.drain();
  expect(round()).toMatchObject({ phase: 'upgrading' });
  expect(round().entries['pl-1'].upgrade).toMatchObject({ burn: { previewOutcome: 'strong_hit' }, decided: null });
  const rolled = round().entries['pl-1'].rolled;
  const choice = table.cards(f => f.sufferCard && f.resolutionId === rolled.resolutionId).at(-1);
  expect(choice?.flags?.[MODULE_ID]?.sufferPrompt).toMatchObject({ kind: 'any', amount: 1 });
  return { cardId: rolled.cardId, choice };
}

/** Kira resolves the weak hit's cost on its card: Lose Momentum (-1). */
async function chooseConsequence(choice) {
  await relay('pl-1', 'suffer.pick', { messageId: choice._id, pickKind: 'any', sufferId: 'lose_momentum' });
  await table.drain();
}

describe('Z27 — the round and an upgrade its card has closed', () => {
  it('control: the chosen consequence closes the card\'s Burn, and the card says so', async () => {
    const { cardId, choice } = await weakHitRound();
    await chooseConsequence(choice);
    expect(kira.system.momentum.value).toBe(8);
    expect(flags(cardId).burn.choiceMade).toBe(true);
  }, 30_000);

  it('control: a Burn from the window before any choice applies, and the round narrates the strong hit', async () => {
    const { cardId } = await weakHitRound();
    await relay('pl-1', 'move.burnMomentum', { messageId: cardId });
    await table.drain();
    expect(flags(cardId).burn.consumed).toBe(true);
    expect(round()).toMatchObject({ number: 2 });
  }, 30_000);

  it('once the choice closed the upgrade, the round no longer waits on it', async () => {
    const { choice } = await weakHitRound();
    await chooseConsequence(choice);

    const r = round();
    const stillAsked = r.phase === 'upgrading' && !!r.entries['pl-1']?.upgrade && !r.entries['pl-1'].upgrade.decided;
    expect(stillAsked).toBe(false);
  }, 30_000);

  it('the window no longer offers the Burn the choice closed; the round narrates the result as rolled', async () => {
    const { cardId, choice } = await weakHitRound();
    await chooseConsequence(choice);

    // The round went on: the weak hit narrated, round 2 open, Kira's window offers no upgrade.
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    const narrated = table.cards(f => f.narratorCard && f.roundId);
    expect(narrated).toHaveLength(1);
    const c = table.client('pl-1');
    const mod = await c.import('../../src/ui/roundWindow.js');
    const view = await c.run(async () => (await new mod.RoundWindowApp()._prepareContext({})).view);
    expect(view.own?.upgrade ?? null).toBeNull();

    // A press nobody's window offers is still refused on the GM: the consequence was chosen.
    await relay('pl-1', 'move.burnMomentum', { messageId: cardId });
    await table.drain();
    expect(flags(cardId).burn.consumed).not.toBe(true);
  }, 30_000);
});

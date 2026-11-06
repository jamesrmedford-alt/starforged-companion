/**
 * Eleventh audit — UPG-D1 ROUND-DROPS-OWED-RESIST-ROLL (a decision row:
 * Batch Mode × issue #330 D3).
 *
 * Batch Mode on a simulated table (tests/helpers/multiClient.js — the
 * batchModeTable.test.js harness). Kira (health 1, momentum 0 — no upgrade on
 * offer) misses a Face Danger in round 1; its Pay the Price lands "You are
 * harmed": Endure Harm (-1) takes her to 0 health and the harm step owes the
 * resist roll — "Then, if your health is 0 … you must roll +health or +iron"
 * (vendored Endure Harm; issue #330 D3) — a 🛡 card whose press posts the
 * forced Endure Harm as Kira. Round 1 narrates; round 2 opens and Kira writes
 * her action for it. She presses 🛡 Resist: the card resolves ("Endure Harm
 * rolled to resist") and its forced move becomes, in Batch Mode, a card
 * move "offered beside" her own entry (driver.js takeForcedMove →
 * round.js offerForcedMove) — and the window's "Keep mine" (her confirm),
 * Edit, Withdraw or Pass drops it (confirmEntry / withdrawEntry / passEntry
 * set `offer: null`). The mandatory roll is never made, the resist card says
 * it was, and nothing says it is still owed. Free-flow rolls it at once
 * (held only while the lock is busy — `deferWhileBusy`).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/upgrades/roundDropsOwedResistRoll.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], ptp: 78 }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false })),
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
// Pay the Price 78: "You are harmed" — Endure Harm (-1).
vi.mock('../../../src/oracles/roller.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== 'pay_the_price') return real.rollOracle(...args);
    const rng = vi.spyOn(Math, 'random').mockReturnValueOnce((control.ptp - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const ROUND_REPLY = 'The bulkhead buckles around Kira.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 9 and 10, action die 1 (+edge 2 = 3): a miss.
const MISS   = [0.85, 0.95, 0.0];
// challenge 3 and 4, action die 6 (+edge 2 = 8): a strong hit.
const STRONG = [0.25, 0.35, 0.9];

let table, kira;
const round = () => table.world.getSetting('batchMode.round');
const resistCards = () => table.cards(f => f.sufferCard && f.sufferPrompt?.resist === 'health');
const endureHarmRolls = () => table.cards(f => f.moveResolution && f.actorId === 'pc-kira')
  .filter(c => /sf-move-name">Endure Harm</.test(c.content ?? ''));

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

async function submitAndConfirm(text, dice) {
  control.dice.push(dice);
  const submissionId = `sub-${Math.random().toString(36).slice(2)}`;
  await relay('pl-1', 'batch.submit', { roundId: round().id, text, submissionId });
  await table.drain();
  const r = round();
  await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
  await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] },
    system: { momentum: { value: 0 }, health: { value: 1, max: 5 } } });
  scriptClaude(table, { fallback: () => ROUND_REPLY });
  silenceConsoleErrors();
});

/** Round 1: the miss, its price to 0 health, the resist card; round 2 opens. */
async function harmedToZero() {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
  await submitAndConfirm('I sprint across the collapsing gantry.', MISS);
  expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  expect(kira.system.health.value).toBe(0);
  const [resist] = resistCards();
  expect(resist).toBeTruthy();
  return resist;
}

describe('UPG-D1 — the resist roll a price owes, inside a round', () => {
  it('control: in free-flow the press rolls the Endure Harm at once', async () => {
    const resist = await harmedToZero();
    await table.client('gm-1').setSetting('batchMode.enabled', false);
    await table.settle();
    control.dice.push(STRONG);
    await relay('pl-1', 'suffer.pick', { messageId: resist._id, pickKind: 'enum', optionIndex: '0' });
    await table.drain();
    expect(endureHarmRolls()).toHaveLength(1);
  }, 30_000);

  it('control: pressed, it becomes a card move offered beside the action Kira already wrote', async () => {
    const resist = await harmedToZero();
    control.dice.push(STRONG);
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I drag myself behind the console.', submissionId: 'own-2' });
    await table.drain();
    await relay('pl-1', 'suffer.pick', { messageId: resist._id, pickKind: 'enum', optionIndex: '0' });
    await table.drain();
    expect(table.world.message(resist._id).flags[MODULE_ID].resolved).toBe(true);
    expect(round().entries['pl-1'].offer?.forced?.moveId).toBe('endure_harm');
  }, 30_000);

  it('Keep mine drops it: the round resolves Kira\'s own action — and the owed roll is never made, nor still owed', async () => {
    const resist = await harmedToZero();
    control.dice.push(STRONG);
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I drag myself behind the console.', submissionId: 'own-2' });
    await table.drain();
    await relay('pl-1', 'suffer.pick', { messageId: resist._id, pickKind: 'enum', optionIndex: '0' });
    await table.drain();
    expect(round().entries['pl-1'].offer?.forced?.moveId).toBe('endure_harm');

    // "Keep mine" — the window confirms her own reading.
    const r = round();
    await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
    await table.drain();
    expect(round()).toMatchObject({ number: 3 });                         // round 2 resolved her own action

    const owedStill = table.world.message(resist._id).flags[MODULE_ID].resolved !== true;
    expect(endureHarmRolls().length > 0 || owedStill).toBe(true);
  }, 30_000);
});

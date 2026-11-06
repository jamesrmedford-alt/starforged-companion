/**
 * STARFORGED COMPANION
 * tests/unit/batchOwedResistRoll.test.js
 *
 * Issue #342 D2 (ROUND-DROPS-OWED-RESIST-ROLL; the maintainer's ruling A),
 * Batch Mode × issue #330 D3. A harm step that takes a PC to 0 health owes
 * the resist roll — "Then, if your health is 0 … you must roll +health or
 * +iron" (vendored Endure Harm) — and its 🛡 card posts the forced Endure
 * Harm as the PC (`owedMove`). In free-flow the press rolls it at once. In a
 * round it used to become an optional offer beside the action the player had
 * already written, which their own Keep mine / Edit / Withdraw / Pass
 * dropped while the card read resolved: the roll the rules make mandatory was
 * never made, nor still owed.
 *
 * Ruling A: a forced move a suffer card owes is the roller's next move and
 * not optional in a round — it becomes their entry even beside one already
 * written (that one set aside for the next round, as their draft), and the
 * window offers no Keep mine / Withdraw / Pass / Edit on it.
 *
 * Harness: the batchModeTable.test.js shape (simulated table, the real
 * driver, relays, resolveMove, Pay the Price and the resist card's
 * `suffer.pick` relay); Pay the Price is pinned to 78, "You are harmed".
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], ptp: 78 }));
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
// Pay the Price 78: "You are harmed" — Endure Harm (-1).
vi.mock('../../src/oracles/roller.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== 'pay_the_price') return real.rollOracle(...args);
    const rng = vi.spyOn(Math, 'random').mockReturnValueOnce((control.ptp - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const ROUND_REPLY = 'The bulkhead buckles around Kira.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 9 and 10, action die 1 (+edge 2 = 3): a miss.
const MISS   = [0.85, 0.95, 0.0];
// challenge 3 and 4, action die 6: a strong hit.
const STRONG = [0.25, 0.35, 0.9];
const OWN = 'I drag myself behind the console.';

let table, kira;
const round = () => table.world.getSetting('batchMode.round');
const resistCards = () => table.cards(f => f.sufferCard && f.sufferPrompt?.resist === 'health');
const endureHarmRolls = () => table.cards(f => f.moveResolution && f.actorId === 'pc-kira')
  .filter(c => /sf-move-name">Endure Harm</.test(c.content ?? ''));
const refusedTo = (userId) => table.cards(f => f.batchRefusedNotice).filter(c => c.whisper?.includes(userId)).map(c => c.content).join(' ');

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

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
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
  table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => ROUND_REPLY });
  silenceConsoleErrors();
});

/** Round 1: the miss, its price to 0 health, the resist card; round 2 opens. */
async function harmedToZero() {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await submitAndConfirm('I sprint across the collapsing gantry.', MISS);
  expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  expect(kira.system.health.value).toBe(0);
  const [resist] = resistCards();
  expect(resist).toBeTruthy();
  return resist;
}

/** Kira has written her round-2 action; she presses 🛡 Resist. */
async function resistBesideOwnAction(resist) {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: OWN, submissionId: 'own-2' });
  await table.drain();
  await relay('pl-1', 'suffer.pick', { messageId: resist._id, pickKind: 'enum', optionIndex: '0' });
  await table.drain();
}

describe('D2 — the resist roll a price owes, inside a round (ruling A)', () => {
  it('control: in free-flow the press rolls the Endure Harm at once', async () => {
    const resist = await harmedToZero();
    await table.client('gm-1').setSetting('batchMode.enabled', false);
    await table.settle();
    control.dice.push(STRONG);
    await relay('pl-1', 'suffer.pick', { messageId: resist._id, pickKind: 'enum', optionIndex: '0' });
    await table.drain();
    expect(endureHarmRolls()).toHaveLength(1);
  }, 30_000);

  it('pressed beside the action Kira already wrote, the resist roll is her entry — her action set aside for the next round', async () => {
    const resist = await harmedToZero();
    await resistBesideOwnAction(resist);
    expect(table.world.message(resist._id).flags[MODULE_ID].resolved).toBe(true);
    const e = round().entries['pl-1'];
    expect(e).toMatchObject({ status: 'read', text: 'Kira resists the harm.', readAs: { forced: { moveId: 'endure_harm', owed: true } } });
    expect(e.offer).toBeNull();
    expect(e.setAside).toMatchObject({ text: OWN });
    // Her window keeps the action she wrote as her draft (the GM cannot write it).
    expect(table.client('pl-1').getSetting('batchMode.draft')).toBe(OWN);
  }, 30_000);

  it('no Keep mine, Withdraw, Pass or Edit on it: each is refused, and the owed roll is rolled when she confirms', async () => {
    const resist = await harmedToZero();
    await resistBesideOwnAction(resist);
    const r = round();
    const sid = r.entries['pl-1'].submissionId;
    await relay('pl-1', 'batch.withdraw', { roundId: r.id });                         // Edit relays a withdraw
    await relay('pl-1', 'batch.pass', { roundId: r.id });
    await relay('pl-1', 'batch.submit', { roundId: r.id, text: 'I run instead.', submissionId: 'other' });
    await relay('pl-1', 'batch.reread', { roundId: r.id, submissionId: sid, newSubmissionId: 'x', useOffer: true });
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', submissionId: sid, readAs: { forced: { moveId: 'endure_harm' } } });
    expect(refusedTo('pl-1')).toMatch(/This roll is owed/);

    control.dice.push(STRONG);
    await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: sid, choices: {} });
    await relay('pl-2', 'batch.pass', { roundId: r.id });
    await table.drain();
    expect(round()).toMatchObject({ number: 3 });
    expect(endureHarmRolls()).toHaveLength(1);                                         // the owed roll is made
    expect(table.client('pl-1').getSetting('batchMode.draft')).toBe(OWN);             // her action, for round 3
  }, 30_000);

  it('the rules auditor\'s order — Kira confirmed her own action, then pressed — waits for the owed roll and rolls it', async () => {
    const resist = await harmedToZero();
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: OWN, submissionId: 'own-2' });
    await table.drain();
    const r = round();
    await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: 'own-2', choices: {} });
    expect(round().entries['pl-1'].status).toBe('ready');
    // The press: the owed roll is her entry now, so Ren's pass doesn't resolve
    // the round on her confirmed action — it waits for the roll's confirm.
    await relay('pl-1', 'suffer.pick', { messageId: resist._id, pickKind: 'enum', optionIndex: '0' });
    await table.drain();
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await table.drain();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', readAs: { forced: { moveId: 'endure_harm' } }, setAside: { text: OWN } });

    // A GM's Send now uses it as read.
    control.dice.push(STRONG);
    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.drain();
    expect(round()).toMatchObject({ number: 3 });
    expect(endureHarmRolls()).toHaveLength(1);
  }, 30_000);
});

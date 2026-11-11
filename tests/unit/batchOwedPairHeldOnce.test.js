/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchOwedPairHeldOnce.test.js
 *
 * Issue #345 AA08 (OWED-PAIR-HELD-LOOPS) — a regression of issue #342 D2
 * (ROUND-DROPS-OWED-RESIST-ROLL) with Z05's takeCardMoves.
 *
 * D2 made the resist roll a suffer card owes (the 🛡 card's forced Endure
 * Harm / Endure Stress, `owedMove`) its roller's round entry, and "a second
 * owed move while one is the entry is held for the next round itself"
 * (round.js offerForcedMove: the round unchanged, the post handed back in
 * `held`). Z05 made a round closed unresolved hold every card-move entry for
 * the next round too (takeCardMoves, closeCollectingRound).
 *
 * So a player with two owed rolls — the first their entry, the second held —
 * whose round is closed unresolved (a GM's Discard), or who pressed both while
 * a round was being narrated, has BOTH held when the next round opens. The
 * driver's joinHeldMoves drained `_heldForRound` with
 * `while (length) shift()`: the first became the entry; the second met an
 * owed entry, was handed back, and holdForNextRound pushed it onto the list
 * again — and the loop took it again. Forever: each turn whispered "Held for
 * the next round" and awaited only an unchanged queued round write, so the
 * canonical GM's page stopped responding.
 *
 * The fix: a drain takes the moves held as the round opens — one handed back
 * waits for the round after — and a round's held moves join it once (its
 * opening is heard twice: the closer's own open and the close's echo).
 *
 * The loop is bounded HERE only by a fuse in the test (the speaker resolver
 * the loop calls once a turn returns null after 30 turns, which ends it); the
 * assertions are on what the table sees.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], watch: false, calls: 0, cap: 30 }));
vi.mock('../../src/multiplayer/speaker.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    resolveSpeakerActorId: (...args) => {
      if (control.watch) {
        control.calls += 1;
        // The test's own fuse: ends a runaway joinHeldMoves loop (the move
        // then reads as having no roller in the round).
        if (control.calls > control.cap) { control.watch = false; return null; }
      }
      return real.resolveSpeakerActorId(...args);
    },
  };
});
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

// challenge 3 and 4, action die 6: a strong hit.
const STRONG = [0.25, 0.35, 0.9];

let table;
const round = () => table.world.getSetting('batchMode.round');
const heldNotices = () => table.cards(f => f.batchHeldMoveNotice);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.dice = []; control.watch = false; control.calls = 0;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  // Kira at 0 health and 0 spirit: a price of harm and stress owes both resist rolls.
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] },
    system: { momentum: { value: 0 }, health: { value: 0, max: 5 }, spirit: { value: 0, max: 5 } } });
  table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table);
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

/** The two resist cards a price of harm and stress posts for Kira at 0 / 0 (sufferExecutor postResistRoll). */
async function twoResistCards() {
  const gm = table.client('gm-1');
  const { resistRollPrompt } = await gm.import('../../src/moves/sufferExecutor.js');
  const { postSufferChoiceCard } = await gm.import('../../src/moves/sufferCard.js');
  const post = (which, moveId) => gm.run(() => postSufferChoiceCard({
    sufferPrompt: resistRollPrompt(which), actor: game.actors.get('pc-kira'), moveId, resolutionId: null,
  }));
  const harm = await post('harm', 'endure_harm');
  const stress = await post('stress', 'endure_stress');
  await table.settle();
  return [harm, stress];
}

const press = (card) => relay('pl-1', 'suffer.pick', { messageId: card.id ?? card._id, pickKind: 'enum', optionIndex: '0' });
const owedEntry = (moveId) => ({ readAs: { forced: { moveId, owed: true } } });

/** Kira presses both 🛡 cards in round 1: the first owed roll is her entry, the second is held (D2). */
async function bothOwed() {
  const [harm, stress] = await twoResistCards();
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await press(harm);
  await table.drain();
  await press(stress);
  await table.drain();
  expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
  expect(round().entries['pl-1']).toMatchObject(owedEntry('endure_harm'));
  expect(heldNotices()).toHaveLength(1);                      // the stress roll: held for the next round
}

/** The GM discards round 1 with both owed rolls Kira's (the entry and the held one); round 2 opens. */
async function discardWithBothOwed() {
  await bothOwed();
  control.watch = true; control.calls = 0;
  await relay('gm-1', 'batch.discard', { roundId: round().id });
  await table.drain();
  const turns = control.calls;
  control.watch = false;
  return turns;
}

describe('issue #345 AA08 — two owed resist rolls held when a round opens join it once', () => {
  it("the GM discards the round: round 2 opens with one owed roll as Kira's entry, the other held — once", async () => {
    const turns = await discardWithBothOwed();

    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect.soft(turns, 'joinHeldMoves took the held moves a bounded number of times (the fuse is 30)').toBeLessThanOrEqual(4);
    expect(heldNotices().length, '"Held for the next round" whispers').toBeLessThanOrEqual(3);
    // The older held roll (the stress one, held in round 1) is her entry.
    expect(round().entries['pl-1']).toMatchObject(owedEntry('endure_stress'));
  }, 60_000);

  it('no GM action: Kira presses both 🛡 cards while round 1 is being narrated — round 2 opens and takes them once', async () => {
    const claude = scriptClaude(table);
    const held = claude.hold(call => /## THIS ROUND/.test(call?.userText ?? ''));
    const [harm, stress] = await twoResistCards();
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    control.dice.push(STRONG);
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I haul myself up the ladder.', submissionId: 'k1' });
    await table.drain();
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    await held.arrived;
    expect(round()).toMatchObject({ number: 1, phase: 'narrating' });

    await press(harm);                                          // both pressed while the round resolves: both held
    await press(stress);
    expect(heldNotices()).toHaveLength(2);

    control.watch = true; control.calls = 0;
    held.release();
    await table.settle(); await table.drain();
    const turns = control.calls;
    control.watch = false;

    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect.soft(turns, 'joinHeldMoves took the held moves a bounded number of times (the fuse is 30)').toBeLessThanOrEqual(4);
    expect(heldNotices().length, '"Held for the next round" whispers').toBeLessThanOrEqual(3);
    expect(round().entries['pl-1']).toMatchObject(owedEntry('endure_harm'));
  }, 60_000);

  it("a second open of the same round (get-or-create — the close's echo is one) takes nothing again and tells no one again", async () => {
    await discardWithBothOwed();
    const notices = heldNotices().length;
    const gm = table.client('gm-1');
    const driver = await gm.import('../../src/batch/driver.js');
    control.watch = true; control.calls = 0;
    await gm.run(() => driver.openRoundIfDue('again'));
    await table.settle(); await table.drain();
    const turns = control.calls;
    control.watch = false;
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(round().entries['pl-1']).toMatchObject(owedEntry('endure_stress'));
    expect({ turns, notices: heldNotices().length }).toEqual({ turns: 0, notices });
  }, 60_000);

  it('the roll handed back waits for the round after: rolled round 2 opens round 3 with it as her entry', async () => {
    await discardWithBothOwed();
    expect(round().entries['pl-1']).toMatchObject(owedEntry('endure_stress'));
    const r2 = round();
    control.dice.push(STRONG);
    await relay('pl-2', 'batch.pass', { roundId: r2.id });
    await relay('pl-1', 'batch.confirm', { roundId: r2.id, submissionId: r2.entries['pl-1'].submissionId, choices: {} });
    await table.drain();

    expect(round()).toMatchObject({ number: 3, phase: 'collecting' });
    expect(round().entries['pl-1']).toMatchObject(owedEntry('endure_harm'));
    const stressRolls = table.cards(f => f.moveResolution && f.roundUserId === 'pl-1')
      .filter(c => /sf-move-name">Endure Stress</.test(c.content ?? ''));
    expect(stressRolls).toHaveLength(1);
  }, 60_000);

  it('control: one owed roll as the entry — the discard holds it, and round 2 takes it once', async () => {
    const [harm] = await twoResistCards();
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await press(harm);
    await table.drain();
    expect(round().entries['pl-1']).toMatchObject(owedEntry('endure_harm'));
    control.watch = true; control.calls = 0;
    await relay('gm-1', 'batch.discard', { roundId: round().id });
    await table.drain();
    const turns = control.calls;
    control.watch = false;
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(round().entries['pl-1']).toMatchObject(owedEntry('endure_harm'));
    expect(turns).toBeLessThanOrEqual(4);
    expect(heldNotices().length).toBeLessThanOrEqual(1);
    expect(table.world.message(round().entries['pl-1'].readAs.messageId)?.flags?.[MODULE_ID]?.owedMove).toBe(true);
  }, 60_000);
});

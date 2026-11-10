/* global silenceConsoleErrors -- tests/setup.js */
/**
 * PROBE — BATCH: ROUND-NARRATION-CLAIM-REFUSED-SILENT (twelfth audit, 2026-11-09)
 *
 * A Batch Mode round claims the move lock twice: once for its rolls and
 * records (startResolution), once again for its narration (narrateTheRound).
 * A claim the world refuses comes back `{ claim: null, refused: true }`
 * (index.js claimPendingMoveLock 2150-2178 at 22bdbeb).
 *
 *   - startResolution (src/batch/driver.js 791-803) handles it: the round
 *     stays collecting and the GMs are whispered "the round did not start …
 *     Press Send now to try again".
 *   - narrateTheRound (driver.js 1224-1228) and rollRound's own claim
 *     (driver.js 842-847, a pass re-entering a rolling round) handle only
 *     `busy`: on a refusal they return false — the advance pass ends, nothing
 *     is whispered (tellRoundStopped runs only on a throw, 613-616), nothing
 *     waits for the lock (`_waitingForLock` is not set, so noteMoveLockFreed
 *     and the lock-free write do not wake it). The round sits in
 *     "narrating" with every move rolled and recorded and no narration;
 *     every window says "The round is being resolved…"; no next round opens;
 *     typed chat stays table talk. Only a GM who guesses to press Send now
 *     (requestSendNow re-enters a narrating round) gets the table moving.
 *
 * The help ("The GM's window"): "If the world doesn't save a step of a round
 * being resolved, the round stops and the GMs are told; Send now tries
 * again." Issue #342 Z18/Z19 made the other stopped steps say so.
 *
 * Harness: batchRoundWriteRefusedMidRoll.test.js's; the refusal is the one
 * campaignState write that claims the lock while the round is narrating.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: narration, inputMethod: 'chat',
  })),
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
    // challenge 3 and 4, action 6 (+iron): a strong hit — no upgrade to wait for.
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { failWrites, scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';

let table;
const round = () => table.world.getSetting('batchMode.round');
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
const gmBatchWhispers = () => table.cards(f => f.batchNotice).filter(m => (m.whisper ?? []).includes('gm-1'));
/** The campaignState write that claims the move lock, made while the round is in `phase`. */
const lockClaimDuring = (phase) => (w) => w.kind === 'setting' && w.key === `${MODULE_ID}.campaignState`
  && w.value?.pendingMove === true && table.world.getSetting('batchMode.round')?.phase === phase;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
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

/** Kira acts, Ren passes: the round resolves. */
async function kiraActsRenPasses() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I brace the hatch.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await table.drain();
}

describe('ROUND-NARRATION-CLAIM-REFUSED-SILENT — the narration\'s lock claim refused', () => {
  it('control: the same refusal of the rolls\' claim (round collecting) is told to the GMs, the round still collecting', async () => {
    const refused = failWrites(table, lockClaimDuring('collecting'));
    await kiraActsRenPasses();
    expect(refused.refused).toBe(1);
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
    expect(gmBatchWhispers().some(m => /did not start/.test(m.content))).toBe(true);
  }, 60_000);

  it('control: with nothing refused the round is narrated and round 2 opens', async () => {
    await kiraActsRenPasses();
    expect(narrations()).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 60_000);

  it('control: the stalled round goes on when a GM presses Send now (nobody said to)', async () => {
    failWrites(table, lockClaimDuring('narrating'));
    await kiraActsRenPasses();
    expect(round()).toMatchObject({ number: 1, phase: 'narrating' });
    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.drain();
    expect(narrations()).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 60_000);

  it('refused at the narration: the round stops silently — the GMs must be told it stopped (or it must go on)', async () => {
    const refused = failWrites(table, lockClaimDuring('narrating'));
    await kiraActsRenPasses();
    expect(refused.refused).toBe(1);
    // Every move rolled and recorded; the round waits for nothing.
    expect(round().entries['pl-1'].status).toBe('recorded');
    const r = round();
    const outcome = {
      narratedOrMovedOn: narrations().length > 0 || r.number > 1,
      gmsTold: gmBatchWhispers().some(m => /stopped|did not|not saved|Send now/i.test(m.content)),
    };
    // Correct: either the round went on, or the GMs were told (the help's promise).
    expect({ ...outcome, phase: r.phase }).toSatisfy(o => o.narratedOrMovedOn || o.gmsTold,
      'the round went on, or the GMs were told it stopped');
  }, 60_000);
});

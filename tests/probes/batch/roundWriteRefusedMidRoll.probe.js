/* global silenceConsoleErrors -- tests/setup.js and Node globals, as in tests/unit */
/**
 * Probe — BATCH-1 ROUND-WRITE-REFUSED-LOSES-RECORD (eleventh audit).
 *
 * A Batch Mode round rolls an entry (rollMove posts its result card), then
 * writes `markRolled` to the round, then records the move (recordMove →
 * persistResolution: the roller's meters and the move's record). When the
 * world refuses that one round write, the exception leaves rollEntry before
 * recordMove runs: the strong hit's +1 momentum never lands, no unsaved-record
 * card with a Retry is posted, the GMs are told nothing (console only), and the
 * round stays `rolling` — Send now is disabled while it rolls, so nothing moves
 * it on until a reload or a user (dis)connects.
 *
 * Correct (brief: "one write's refusal must not lose another's record"; "a
 * refused write is said where it was asked"): the move's record lands — or is
 * reported to the GMs with a Retry, as recordMove reports its own refusals —
 * and the round does not sit silently wedged.
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
    // challenge 3 and 4, action 6 (+iron): a strong hit, +1 momentum.
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

let table;
const round = () => table.world.getSetting('batchMode.round');
const momentum = (id) => table.actors.get(id).system.momentum.value;
const roundWrite = (w) => w.kind === 'setting' && w.key === `${MODULE_ID}.batchMode.round` && w.client === 'gm-1';

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
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

async function kiraActsRenPasses() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I brace against the hull and push through.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await table.drain();
}

describe('BATCH-1 — a round write refused between a move\'s roll and its record', () => {
  it('control: with no refusal the strong hit is recorded (+1 momentum) and round 2 opens', async () => {
    const before = momentum('pc-kira');
    await kiraActsRenPasses();
    expect(momentum('pc-kira')).toBe(before + 1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);

  it('the move\'s record still lands (its +1 momentum) when the round\'s "rolled" write is refused', async () => {
    const before = momentum('pc-kira');
    const refused = failWrites(table, (w) => roundWrite(w) && w.value?.entries?.['pl-1']?.status === 'rolled', { times: 1 });
    await kiraActsRenPasses();
    expect(refused.refused).toBe(1);
    // The result card is up — the move was rolled.
    expect(table.cards(f => f.moveResolution && f.roundId)).toHaveLength(1);
    // Correct: the record is the move's, not the round's bookkeeping.
    expect(momentum('pc-kira')).toBe(before + 1);
  }, 30_000);

  it('the round is not left silently wedged in "rolling": the GMs are told, or it goes on', async () => {
    failWrites(table, (w) => roundWrite(w) && w.value?.entries?.['pl-1']?.status === 'rolled', { times: 1 });
    await kiraActsRenPasses();
    // The GM's only control while a round resolves: Send now (disabled in the
    // window while rolling; relayed it answers "resolving" and does nothing).
    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.drain();
    const told = table.cards(f => f.batchNotice).some(m => (m.whisper ?? []).includes('gm-1'));
    const movedOn = round()?.phase !== 'rolling';
    expect(told || movedOn, `GMs told: ${told}; round phase: ${round()?.phase}`).toBe(true);
  }, 30_000);
});

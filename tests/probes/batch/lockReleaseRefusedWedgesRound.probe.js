/* global silenceConsoleErrors -- tests/setup.js and Node globals, as in tests/unit */
/**
 * Probe — BATCH-10 ROUND-LOCK-RELEASE-NO-RETRY (eleventh audit).
 *
 * The free-flow contract (faultMatrix "the move lock survives a refused
 * write"): "the lock release is refused once: the pipeline's finally releases
 * it — the next move runs". The round driver releases the lock in a `finally`
 * too (startResolution, narrateTheRound), but ignores releasePendingMoveLock's
 * `false` and never retries. One refused release after the round's rolls
 * leaves campaignState.pendingMove held by the canonical GM itself; the
 * round's own narration then meets a busy lock (`_waitingForLock`), which only
 * a lock-free campaignState write would wake — and none comes. The round sits
 * in `narrating` with no narration, every later round with it, and nobody is
 * told, until a GM reloads (staleMoveLockAtReady).
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
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { campaignStateWrite, failWrites, scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);

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

describe('BATCH-10 — the move lock\'s release refused once during a round', () => {
  it('control: no refusal — narrated once, the lock free, round 2 open', async () => {
    await kiraActsRenPasses();
    expect(roundCards()).toHaveLength(1);
    expect(world().pendingMove).toBe(false);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);

  it('the release after the rolls is refused once: it is retried, and the round is still narrated', async () => {
    const refused = failWrites(table, (w) => campaignStateWrite('gm-1')(w) && w.value?.pendingMove === false, { times: 1 });
    await kiraActsRenPasses();
    expect(refused.refused).toBe(1);
    expect(roundCards(), `round ${round()?.number} ${round()?.phase}; lock held: ${world().pendingMove}`).toHaveLength(1);
  }, 30_000);
});

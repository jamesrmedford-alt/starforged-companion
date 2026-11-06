/* global silenceConsoleErrors -- tests/setup.js and Node globals, as in tests/unit */
/**
 * Probe — BATCH-15 ROUND-CLOSE-REFUSED-RIDERS-TWICE (eleventh audit).
 *
 * finishRound closes the round, opens the next, then runs each acting entry's
 * finishMove (the asset consequence riders) — whether or not its close
 * landed. When the world refuses the close write, finishRound logs it, runs
 * the riders anyway, and returns; the advance pass goes round again, finds the
 * round still `narrating` with its card posted, and calls finishRound a
 * second time — which closes it and runs every entry's riders AGAIN (rebuilt
 * from the round: `_rolledHere` was cleared). Kira's automatic "+1 momentum on
 * a hit" rider pays twice. Correct (brief: "an outcome applies once"): the
 * riders run once per round — after the close that ends it.
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
// Kira's asset: "on a hit, take +1 momentum" — an automatic rider (not optional).
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => [
    { key: 'ace:0', assetName: 'Ace', abilityName: 'Steady', text: 'When you Face Danger, on a hit take +1 momentum.', adds: 0, detection: 'structured' },
  ]),
}));
vi.mock('../../../src/moves/consequenceRiders.js', async (importOriginal) => ({
  ...(await importOriginal()),
  extractRiders: vi.fn(async () => [
    { key: 'ace:0', assetName: 'Ace', riders: [{ resource: 'momentum', condition: 'hit', amount: 1, label: '+1 momentum' }] },
  ]),
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
    // a strong hit: +1 momentum from the move
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
const closeWrite = (w) => w.kind === 'setting' && w.key === `${MODULE_ID}.batchMode.round` && w.client === 'gm-1'
  && w.value?.phase === 'closed' && w.value?.closeReason === 'resolved';

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

describe('BATCH-15 — the round\'s close refused once', () => {
  it('control: no refusal — the strong hit (+1) and the rider (+1) pay once each: +2', async () => {
    const before = momentum('pc-kira');
    await kiraActsRenPasses();
    expect(momentum('pc-kira')).toBe(before + 2);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);

  it('the close is refused once and retried: the rider still pays once (+2, not +3)', async () => {
    const before = momentum('pc-kira');
    const refused = failWrites(table, closeWrite, { times: 1 });
    await kiraActsRenPasses();
    expect(refused.refused).toBe(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });   // the retry closed it
    expect(momentum('pc-kira')).toBe(before + 2);
  }, 30_000);
});

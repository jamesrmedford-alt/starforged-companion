/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundNarrationRefusedTold.test.js
 *
 * Issue #342 Z21 ROUND-CARD-REFUSED-UNTOLD (the eleventh audit's BATCH-7).
 *
 * When the world refuses a narration's card AND its fallback, free-flow
 * catches the rejection and tells the GM "the narration could not be posted
 * to chat; the move's result was still applied" (issue #322 V09). A Batch
 * Mode round caught the same rejection with console.error only, closed the
 * round and opened the next: its moves stood with no narration, no fallback
 * and no word to anyone. The canonical GM is now told by a notification (a
 * whisper could be refused as the cards were) and the other GMs by a
 * whisper.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

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
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { failWrites, scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const round = () => table.world.getSetting('batchMode.round');
const momentum = (id) => table.actors.get(id).system.momentum.value;
const narratorCardWrite = (w) => w.kind === 'message.create' && w.data?.flags?.[MODULE_ID]?.narratorCard === true;
/** What a GM was told: their warning / error notifications and any whisper to them. */
const told = (gmId) => [
  ...table.client(gmId).notifications.filter(n => n.level === 'warn' || n.level === 'error').map(n => n.message),
  ...table.cards().filter(m => (m.whisper ?? []).includes(gmId)).map(m => m.content ?? ''),
].join('\n');

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  // Gina (gm-1) holds the key: she is the canonical GM; Gus (gm-2) is the other GM.
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

describe('Z21 — the round\'s card and its fallback both refused', () => {
  it('control (free-flow, V09): the GM is told the narration could not be posted; the result stands', async () => {
    const before = momentum('pc-kira');
    failWrites(table, narratorCardWrite, { times: 2 });
    await table.client('pl-1').chat('I slip through the vent before the drones turn.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    await table.drain();
    expect(momentum('pc-kira')).toBe(before + 1);
    expect(told('gm-1')).toMatch(/could not be posted/);
  }, 30_000);

  it('a round: the GMs are told its narration could not be posted; its moves stand and the next round opens', async () => {
    const before = momentum('pc-kira');
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
    const refused = failWrites(table, narratorCardWrite, { times: 2 });
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await table.drain();
    expect(refused.refused).toBe(2);                         // the round card, then its fallback
    expect(momentum('pc-kira')).toBe(before + 1);            // the move stands
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(told('gm-1')).toMatch(/could not be posted|narration.*(refused|not posted|wasn't posted)/i);   // the GM resolving it
    expect(told('gm-2')).toMatch(/narration could not be posted/);                                         // and the other GM
    expect(told('pl-1')).not.toMatch(/narration could not be posted/);
  }, 30_000);
});

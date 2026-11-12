/**
 * STARFORGED COMPANION
 * tests/unit/batchModeRecovery.test.js
 *
 * Issue #340 — a round survives the GM resolving it going away
 * (rules/reachability.md §7). The canonical GM disconnects mid-roll; the
 * other GM, canonical now, resumes the round: an entry recorded is never
 * rolled again, one whose result card is up without its record is reported
 * to the GMs as possibly incomplete (not rolled again), the rest roll, and
 * the round narrates once. A player who reloads mid-collect gets the window
 * back with their submitted entry and their draft.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 't', mischiefApplied: false })),
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
import { scriptClaude, holdWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { resolveMove } from '../../src/moves/resolver.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
let table;
const round = () => table.world.getSetting('batchMode.round');
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
const momentum = (id) => table.actors.get(id).system.momentum.value;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  resolveMove.mockClear();
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  await table.setClaudeKey('gm-2', 'sk-ant-gus');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => 'The round turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
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

describe('the GM resolving a round goes away', () => {
  it('the other GM resumes it: no entry rolled twice, the possibly-incomplete one told, one narration', async () => {
    const kira = momentum('pc-kira');
    const ren = momentum('pc-ren');
    // gm-1 crashes once Kira's move is rolled and its record written, before
    // the round knows it was recorded.
    const held = holdWrites(table, w => w.kind === 'setting' && w.key === `${MODULE_ID}.batchMode.round`
      && w.client === 'gm-1' && w.value?.entries?.['pl-1']?.status === 'recorded');
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'k1' });
    await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I vault the barricade.', submissionId: 'r1' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
    await held.arrived;
    expect(round()).toMatchObject({ phase: 'rolling', resolverId: 'gm-1' });
    expect(resolveMove).toHaveBeenCalledTimes(1);
    expect(momentum('pc-kira')).toBe(kira + 1);

    await table.leave('gm-1');
    await table.settle();
    await table.drain();

    expect(resolveMove).toHaveBeenCalledTimes(2);            // Ren's, by gm-2 — Kira's never again
    expect(momentum('pc-kira')).toBe(kira + 1);
    expect(momentum('pc-ren')).toBe(ren + 1);
    expect(table.cards(f => f.batchIncompleteNotice)).toHaveLength(1);
    expect(narrations().map(c => c.client)).toEqual(['gm-2']);
    expect(table.cards(f => f.narratorCard && f.roundId)).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(table.world.campaignState().pendingMove).toBe(false);

    held.release();   // gm-1's stalled write lands on a round that has moved on: it changes nothing
    await table.settle();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    await table.join('gm-1');
  }, 30_000);
});

describe('a player reloads mid-collect', () => {
  it('gets the window back with their submitted entry and their draft', async () => {
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'k1' });
    await table.client('pl-1').setSetting('batchMode.draft', 'Then I signal Ren.');
    const c = table.client('pl-1');
    const mod = await c.import('../../src/ui/roundWindow.js');
    // A fresh window, as after a reload: everything it shows is stored.
    const view = await c.run(async () => {
      const app = new mod.RoundWindowApp();
      return app._prepareContext({});
    });
    expect(view.view.own).toMatchObject({ status: 'read', text: 'I slip through the vent.' });
    expect(view.draft).toBe('Then I signal Ren.');
  }, 30_000);
});

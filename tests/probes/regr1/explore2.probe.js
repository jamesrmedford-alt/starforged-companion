/* global silenceConsoleErrors -- tests/setup.js */
// EXPLORATORY — not a finding.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'test',
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
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'Kira slips through the vent, scraped and late.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const ACTION = 'I slip through the vent before the drones turn.';
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const WEAK = [0.35, 0.75, 0.4];
const STRONG = [0.25, 0.35, 0.9];

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const roundNarr = (n) => table.cards(f => f.roundNumber === n && f.narratorCard === true);
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
      lastSessionTimestamp: new Date().toISOString() },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  await table.setClaudeKey('gm-2', 'sk-ant-gus');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  table.actors.get('pc-kira').system.momentum.value = 9;
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle(); await table.drain();
  return res;
}
async function xcard(by = 'pl-2') {
  await table.client(by).chat('!x');
  await table.settle(); await table.drain();
}
async function resume(by) {
  const gm = table.client(by);
  const safety = await gm.import('../../src/context/safety.js');
  await gm.run(() => safety.resumeNarrationAfterXCard());
  await table.settle(); await table.drain();
}

describe('explore 2', () => {
  it('X-Card hold in upgrading, canonical GM leaves, the other GM resumes', async () => {
    control.dice = [WEAK];
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: ACTION, submissionId: 'k1' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    console.log('phase', round().phase);
    await xcard();
    await relay('pl-1', 'batch.keep', { roundId: round().id });
    console.log('after keep', round().phase, world().xCardActive);
    await table.leave('gm-1');
    await table.settle(); await table.drain();
    console.log('after leave', round().number, round().phase, world().pendingMove);
    await resume('gm-2');
    console.log('after resume', round().number, round().phase, roundNarr(1).length, world().pendingMove, world().xCardActive);
  }, 60_000);

  it('X-Card hold in narrating; End a Session; resume', async () => {
    control.dice = [WEAK];
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: ACTION, submissionId: 'k2' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k2', choices: {} });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await xcard();
    await relay('pl-1', 'batch.keep', { roundId: round().id });
    console.log('held', round().number, round().phase);
    const res = await relay('gm-1', 'session.end', {});
    console.log('end res', JSON.stringify(res), world().sessionActive, round().number, round().phase, world().xCardActive);
    await resume('gm-1');
    console.log('after resume', round().number, round().phase, roundNarr(1).length, world().pendingMove);
    const res2 = await relay('gm-1', 'session.begin', { vignetteRolled: false, includeGalley: false });
    console.log('begin', JSON.stringify(res2), world().sessionActive, round().number, round().phase, round().sessionId, world().currentSessionId);
  }, 60_000);
});

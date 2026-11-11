/* global silenceConsoleErrors -- tests/setup.js */
// EXPLORATORY — not a finding. Deleted before hand-back unless it becomes one.
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

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = 'Kira keeps her word.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const WEAK = [0.35, 0.75, 0.4];

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
const ownVowNarrations = () => table.cards(f => f.narratorCard && f.moveId === 'fulfill_your_vow' && !f.roundId);
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);
const heldNotices = () => table.cards(f => f.batchHeldMoveNotice);

function nativeProgressCard({ source, value, dice, actorId = 'pc-kira' }) {
  const roll = { preRollOptions: { progress: { source, value }, actorId }, rawChallengeDiceValues: dice };
  const json = JSON.stringify(roll).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<article class='ironsworn-roll' data-ironswornroll='${json}'><h3>Progress Roll: ${source}</h3></article>`;
}
async function rollsVowOnTheSheet({ userId = 'pl-1', actorId = 'pc-kira', alias = 'Kira', source = 'Find Chen' } = {}) {
  let id = null;
  await table.client(userId).run(async () => {
    const m = await globalThis.ChatMessage.create({
      content: nativeProgressCard({ source, value: 1, dice: [5, 8], actorId }),
      speaker: { actor: actorId, alias },
      rolls: [{ formula: '{d10,d10}', total: 0 }],
    });
    id = m?.id ?? m?._id ?? null;
  });
  await table.settle();
  await table.drain();
  return id;
}
async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle(); await table.drain();
  return res;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

async function resetWith(cs = {}) {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
      lastSessionTimestamp: new Date().toISOString(), ...cs },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({
    id: 'pc-kira', name: 'Kira', type: 'character', hasPlayerOwner: true, ownership: { 'pl-1': 3 },
    items: { contents: [
      { id: 'vow-1', type: 'progress', name: 'Find Chen', system: { subtype: 'vow', rank: 'dangerous', current: 4 }, flags: {} },
    ] },
  });
  table.addActor({ id: 'pc-ren', name: 'Ren', type: 'character', hasPlayerOwner: true, ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
}

describe('explore', () => {
  it('E-A: sheet roll with Batch Mode on and no session begun', async () => {
    await resetWith({ sessionActive: false });
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
    console.log('E-A round before', JSON.stringify(round()));
    await rollsVowOnTheSheet();
    console.log('E-A', { own: ownVowNarrations().length, narr: narrations().length, held: heldNotices().map(m => m.content) });
  }, 60_000);

  it('E-B: sheet roll with Batch Mode OFF and no session begun (control)', async () => {
    await resetWith({ sessionActive: false });
    await rollsVowOnTheSheet();
    console.log('E-B', { own: ownVowNarrations().length, narr: narrations().length });
  }, 60_000);

  it('E-C: two sheet rolls in one round', async () => {
    await resetWith();
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
    await rollsVowOnTheSheet();
    await rollsVowOnTheSheet({ source: 'Find Chen' });
    console.log('E-C r1', round().number, round().phase, round().entries['pl-1'].status, heldNotices().length);
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    console.log('E-C r2', round().number, round().phase, round().entries['pl-1'].status, round().entries['pl-1'].reading?.kind, heldNotices().length, narrations().length);
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    console.log('E-C r3', round().number, round().phase, round().entries['pl-1'].status, heldNotices().length, narrations().length);
  }, 60_000);
});

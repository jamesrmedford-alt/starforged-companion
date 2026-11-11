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

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = 'Kira keeps her word.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const STRONG = [0.25, 0.35, 0.9];

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
const heldNotices = () => table.cards(f => f.batchHeldMoveNotice);
const snap = (label) => console.log(label, JSON.stringify({ n: round().number, ph: round().phase,
  k: { s: round().entries['pl-1']?.status, rk: round().entries['pl-1']?.reading?.kind, ra: round().entries['pl-1']?.readAs?.messageId ?? null, off: round().entries['pl-1']?.offer?.messageId ?? null },
  r: { s: round().entries['pl-2']?.status }, held: heldNotices().length, narr: narrations().length, cards: table.cards(f => f.moveResolution).length }));

function nativeProgressCard({ source, value, dice, actorId = 'pc-kira' }) {
  const roll = { preRollOptions: { progress: { source, value }, actorId }, rawChallengeDiceValues: dice };
  const json = JSON.stringify(roll).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<article class='ironsworn-roll' data-ironswornroll='${json}'><h3>Progress Roll: ${source}</h3></article>`;
}
async function rollsVowOnTheSheet() {
  await table.client('pl-1').run(async () => {
    await globalThis.ChatMessage.create({
      content: nativeProgressCard({ source: 'Find Chen', value: 1, dice: [5, 8] }),
      speaker: { actor: 'pc-kira', alias: 'Kira' },
      rolls: [{ formula: '{d10,d10}', total: 0 }],
    });
  });
  await table.settle(); await table.drain();
}
async function kiraCardMove(text, extra = {}) {
  let id = null;
  await table.client('gm-1').run(async () => {
    const m = await globalThis.ChatMessage.create({
      content: text, speaker: { actor: 'pc-kira', alias: 'Kira' },
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'face_danger', deferWhileBusy: true, ...extra } },
    });
    id = m?.id ?? m?._id;
  });
  await table.settle(); await table.drain();
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

beforeEach(async () => {
  control.dice = [STRONG, STRONG, STRONG, STRONG, STRONG, STRONG];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
      lastSessionTimestamp: new Date().toISOString() },
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
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
});

describe('explore 4', () => {
  it('card move pressed, then Pass, across rounds', async () => {
    const id = await kiraCardMove('CARD: Kira dives for cover.');
    snap('after press');
    await relay('pl-1', 'batch.pass', { roundId: round().id });
    snap('after pass');
    await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'Ren watches the door.', submissionId: 'r1' });
    await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
    snap('after ren confirm');
    await relay('pl-2', 'batch.keep', { roundId: round().id });
    snap('round 2?');
    await relay('pl-1', 'batch.pass', { roundId: round().id });
    snap('after pass 2');
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    snap('round 3?');
    console.log('card id', id);
  }, 60_000);

  it('card move entry (read), then sheet roll displaces it; next round', async () => {
    const id = await kiraCardMove('CARD: Kira dives for cover.');
    snap('after press');
    await rollsVowOnTheSheet();
    snap('after sheet roll');
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    snap('round 2?');
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: round().entries['pl-1'].submissionId, choices: {} });
    snap('after kira confirm');
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    snap('round 3?');
    console.log('card id', id);
  }, 60_000);

  it('owed card move + sheet roll + second owed', async () => {
    await kiraCardMove('OWED1: Kira resists.', { owedMove: true, forcedMoveId: 'endure_harm' });
    snap('owed1');
    await rollsVowOnTheSheet();
    snap('sheet beside owed');
    await kiraCardMove('OWED2: Kira resists stress.', { owedMove: true, forcedMoveId: 'endure_stress' });
    snap('owed2');
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: round().entries['pl-1'].submissionId, choices: {} });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await relay('pl-1', 'batch.keep', { roundId: round().id });
    snap('round 2?');
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    snap('after ren pass r2');
    if (round().entries['pl-1']?.status === 'read') await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: round().entries['pl-1'].submissionId, choices: {} });
    await relay('pl-1', 'batch.keep', { roundId: round().id });
    snap('round 3?');
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    if (round().entries['pl-1']?.status === 'read') await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: round().entries['pl-1'].submissionId, choices: {} });
    await relay('pl-1', 'batch.keep', { roundId: round().id });
    snap('round 4?');
  }, 60_000);
});

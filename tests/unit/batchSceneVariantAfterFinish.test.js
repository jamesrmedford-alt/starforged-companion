/**
 * STARFORGED COMPANION
 * tests/unit/batchSceneVariantAfterFinish.test.js
 *
 * Issue #342 Z39 (BATCH-SCENE-VARIANT-AFTER-FINISH; the rules auditor's
 * probe). Batch Mode, a scene challenge "The Escape" open. Kira submits
 * "I finish the scene" (Finish the Scene) and Ren "I sprint for the hatch
 * before it seals"; both are read while the challenge is open, so Ren's
 * reading is Face Danger (Scene Challenge) (issue #338 D2). Kira confirms
 * first, so her Finish the Scene rolls first and ends the challenge. Ren's
 * entry was then rolled as the variant against no challenge: its strong hit
 * took no momentum, marked nothing, and a ⬡ card said "Nothing was marked".
 * The module's own rule — a variant with no challenge open is the ordinary
 * move (moveOutsideSceneChallenge) — was applied only as readMove reads;
 * rollMove now applies it as the move is rolled.
 *
 * Harness: batchModeTable.test.js's.
 */

/* global silenceConsoleErrors, structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ pace: null, interpret: null, dice: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
    decidePacing: vi.fn(async ({ playerText }) => control.pace(playerText)),
  };
});
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, interpretMove: vi.fn(async (text) => control.interpret(text)) };
});
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

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const P3 = Object.freeze({ id: 'pl-3', name: 'Rook', isGM: false });
const ROUND_REPLY = 'The hatch seals behind them.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 3 and 4, action die 6 (+edge 2 = 8): a strong hit.
const STRONG = [0.25, 0.35, 0.9];
const MOVE = { runMove: true, decision: 'MOVE', suggestedMove: null };
const CHALLENGE = 'The Escape';

let table;
const round = () => table.world.getSetting('batchMode.round');
let seq = 0;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2, P3] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.pace = () => ({ ...MOVE });
  control.interpret = (text) => (/finish the scene/i.test(text)
    ? { moveId: 'finish_the_scene', moveName: 'Finish the Scene', statUsed: null, adds: 0, isProgressMove: true, moveTarget: CHALLENGE, rationale: 'r', mischiefApplied: false }
    : { moveId: 'face_danger_scene_challenge', moveName: 'Face Danger (Scene Challenge)', statUsed: 'edge', adds: 0, moveTarget: CHALLENGE, rationale: 'r', mischiefApplied: false });
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    narratorSessionSummary: false,
    combatTrackerEnabled: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ash',  name: 'Ash',  ownership: { 'pl-3': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => ROUND_REPLY });
  silenceConsoleErrors();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}
async function batchModeOn() {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
}
async function submit(userId, text) {
  const submissionId = `sub-${userId}-${++seq}`;
  await relay(userId, 'batch.submit', { roundId: round().id, text, submissionId });
  return submissionId;
}
async function confirm(userId, choices = {}) {
  const r = round();
  return relay(userId, 'batch.confirm', { roundId: r.id, submissionId: r.entries[userId].submissionId, choices });
}
const pass = (userId) => relay(userId, 'batch.pass', { roundId: round().id });

async function sceneChallenge() {
  const gm = table.client('gm-1');
  const store = await gm.import('../../src/ui/progressTracks.js');
  if (!table.journal.get('tracks-journal')) {
    table.journal._set({ id: 'tracks-journal', name: 'Starforged Progress Tracks', _flags: {},
      getFlag(mod, key) { return this._flags[`${mod}.${key}`]; },
      async setFlag(mod, key, value) { this._flags[`${mod}.${key}`] = structuredClone(value); } });
  }
  const track = await gm.run(() => store.addProgressTrack({ label: CHALLENGE, type: 'scene_challenge', rank: 'dangerous' }));
  await table.settle();
  await gm.run(() => store.markProgressById(track.id, 2));
  await table.settle();
  return { gm, store, track };
}

const renCards = () => table.cards(f => f.moveResolution && f.roundUserId === 'pl-2').map(c => c.content ?? '');
const nothingMarkedCards = () => table.cards(f => f.sceneChallengeCard).filter(c => /Nothing was marked/.test(c.content ?? ''));

describe('a scene-challenge variant rolled after the round finished its challenge (issue #342 Z39)', () => {
  it('control: alone in the round, with the challenge open, Ren\'s variant marks progress on it', async () => {
    const { gm, store, track } = await sceneChallenge();
    await batchModeOn();
    control.dice = [STRONG];
    await submit('pl-2', 'I sprint for the hatch before it seals.');
    await confirm('pl-2');
    await pass('pl-1');
    await pass('pl-3');
    await table.drain();
    expect(renCards()).toHaveLength(1);
    expect(renCards()[0]).toMatch(/Scene Challenge/);
    const after = (await gm.run(() => store.listProgressTracks())).find(t => t.id === track.id);
    expect(after.ticks).toBe(2 * 8 + 8);          // marked once (dangerous: 8 ticks)
    expect(nothingMarkedCards()).toEqual([]);
  }, 30_000);

  it('after Kira\'s Finish the Scene earlier in the round, Ren\'s variant is rolled as the ordinary Face Danger', async () => {
    const { gm, store, track } = await sceneChallenge();
    await batchModeOn();
    const momentumBefore = table.actors.get('pc-ren').system.momentum.value;

    await submit('pl-1', 'I finish the scene — we blow the hatch.');
    await submit('pl-2', 'I sprint for the hatch before it seals.');
    // Both read while the challenge is open.
    expect(round().entries['pl-2'].reading).toMatchObject({ moveId: 'face_danger_scene_challenge' });
    control.dice = [[0.0, 0.05], STRONG];   // Kira's progress roll (challenge 1, 1), then Ren's strong hit
    await confirm('pl-1');
    await confirm('pl-2');
    await pass('pl-3');
    await table.drain();

    // Kira's Finish the Scene ended the challenge first.
    const after = (await gm.run(() => store.listProgressTracks())).find(t => t.id === track.id);
    expect(after.completed).toBe(true);
    expect(round()).toMatchObject({ number: 2 });

    // Ren's move must not be the scene-challenge variant against nothing: as
    // the ordinary Face Danger (the module's own rule — its strong hit takes
    // +1 momentum), or refused like a fight that ended earlier in the round.
    const momentumGained = table.actors.get('pc-ren').system.momentum.value - momentumBefore;
    expect({
      renRolledAsVariant: renCards().some(c => /Scene Challenge/.test(c)),
      nothingMarked: nothingMarkedCards().length,
    }, `Ren's strong hit took ${momentumGained} momentum`).toEqual({ renRolledAsVariant: false, nothingMarked: 0 });
    // Rolled as the ordinary Face Danger: a strong hit takes +1 momentum.
    expect(renCards()).toHaveLength(1);
    expect(renCards()[0]).toMatch(/Face Danger/);
    expect(momentumGained).toBe(1);
  }, 30_000);
});

/**
 * STARFORGED COMPANION
 * tests/unit/batchSceneVariantTwoChallenges.test.js
 *
 * ROUND-VARIANT-TWO-CHALLENGES (found while fixing issue #342). Batch Mode,
 * two scene challenges open: "The Escape" and "The Storm". Kira submits "I
 * finish the scene" (Finish the Scene on The Escape) and Ren "I sprint for
 * the hatch before it seals" — read while The Escape is open, so Ren's
 * reading is Face Danger (Scene Challenge) on The Escape (issue #338 D2).
 * Kira confirms first, so her Finish the Scene rolls first and ends The
 * Escape. Z39 makes a variant rolled with no challenge open the ordinary
 * move (moveOutsideSceneChallenge) — but The Storm is still open, so Ren's
 * entry was rolled as the variant, and the scoring, finding the challenge it
 * named over, took the sole open one: Ren's sprint for the hatch marked
 * progress on The Storm, and his strong hit took no momentum. The round now
 * notes the challenge a variant was read against (noteReadTrack), and an
 * entry whose own challenge ended before its roll is rolled as the ordinary
 * move (rollEntry), whatever else is open.
 *
 * Harness: batchSceneVariantAfterFinish.test.js's (Z39).
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
const ESCAPE = 'The Escape';
const STORM = 'The Storm';

let table;
const round = () => table.world.getSetting('batchMode.round');
let seq = 0;
let renTarget = ESCAPE;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2, P3] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  renTarget = ESCAPE;
  control.pace = () => ({ ...MOVE });
  control.interpret = (text) => (/finish the scene/i.test(text)
    ? { moveId: 'finish_the_scene', moveName: 'Finish the Scene', statUsed: null, adds: 0, isProgressMove: true, moveTarget: ESCAPE, rationale: 'r', mischiefApplied: false }
    : { moveId: 'face_danger_scene_challenge', moveName: 'Face Danger (Scene Challenge)', statUsed: 'edge', adds: 0, moveTarget: renTarget, rationale: 'r', mischiefApplied: false });
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

async function twoSceneChallenges() {
  const gm = table.client('gm-1');
  const store = await gm.import('../../src/ui/progressTracks.js');
  if (!table.journal.get('tracks-journal')) {
    table.journal._set({ id: 'tracks-journal', name: 'Starforged Progress Tracks', _flags: {},
      getFlag(mod, key) { return this._flags[`${mod}.${key}`]; },
      async setFlag(mod, key, value) { this._flags[`${mod}.${key}`] = structuredClone(value); } });
  }
  const escape = await gm.run(() => store.addProgressTrack({ label: ESCAPE, type: 'scene_challenge', rank: 'dangerous' }));
  await table.settle();
  const storm = await gm.run(() => store.addProgressTrack({ label: STORM, type: 'scene_challenge', rank: 'dangerous' }));
  await table.settle();
  await gm.run(() => store.markProgressById(escape.id, 2));
  await table.settle();
  const ticks = async (id) => (await gm.run(() => store.listProgressTracks())).find(t => t.id === id);
  return { escape, storm, ticks };
}

const renCards = () => table.cards(f => f.moveResolution && f.roundUserId === 'pl-2').map(c => c.content ?? '');
const sceneChallengeCards = () => table.cards(f => f.sceneChallengeCard).map(c => c.content ?? '');

async function kiraFinishesThenRenSprints() {
  await batchModeOn();
  await submit('pl-1', 'I finish the scene — we blow the hatch.');
  await submit('pl-2', 'I sprint for the hatch before it seals.');
  // Both read while their challenges are open.
  expect(round().entries['pl-2'].reading).toMatchObject({ moveId: 'face_danger_scene_challenge' });
  control.dice = [[0.0, 0.05], STRONG];   // Kira's progress roll (challenge 1, 1), then Ren's strong hit
  await confirm('pl-1');
  await confirm('pl-2');
  await pass('pl-3');
  await table.drain();
}

describe('a scene-challenge variant whose own challenge ended earlier in the round, another still open', () => {
  it('control: with both challenges open, Ren\'s variant marks progress on its own, The Escape — not The Storm', async () => {
    const { escape, storm, ticks } = await twoSceneChallenges();
    await batchModeOn();
    control.dice = [STRONG];
    await submit('pl-2', 'I sprint for the hatch before it seals.');
    await confirm('pl-2');
    await pass('pl-1');
    await pass('pl-3');
    await table.drain();
    expect(renCards()).toHaveLength(1);
    expect(renCards()[0]).toMatch(/Scene Challenge/);
    expect((await ticks(escape.id)).ticks).toBe(2 * 8 + 8);   // marked once (dangerous: 8 ticks)
    expect((await ticks(storm.id)).ticks).toBe(0);
  }, 30_000);

  it('after Kira\'s Finish the Scene ends The Escape, Ren\'s variant on it is rolled as the ordinary Face Danger — The Storm untouched', async () => {
    const { escape, storm, ticks } = await twoSceneChallenges();
    const momentumBefore = table.actors.get('pc-ren').system.momentum.value;
    await kiraFinishesThenRenSprints();

    expect((await ticks(escape.id)).completed).toBe(true);      // Kira's Finish the Scene ended it first
    expect(round()).toMatchObject({ number: 2 });

    expect((await ticks(storm.id)).ticks).toBe(0);              // was: marked once — Ren's hatch sprint scored on The Storm
    expect(renCards()).toHaveLength(1);
    expect(renCards()[0]).not.toMatch(/Scene Challenge/);       // was: rolled as the variant
    expect(renCards()[0]).toMatch(/Face Danger/);
    expect(sceneChallengeCards().filter(c => /The Storm/.test(c))).toEqual([]);
    // The ordinary Face Danger's strong hit takes +1 momentum.
    expect(table.actors.get('pc-ren').system.momentum.value - momentumBefore).toBe(1);
  }, 30_000);

  it('control: a variant on The Storm, still open after The Escape ended, stays the variant and marks The Storm', async () => {
    renTarget = STORM;
    const { storm, ticks } = await twoSceneChallenges();
    await kiraFinishesThenRenSprints();
    expect(renCards()).toHaveLength(1);
    expect(renCards()[0]).toMatch(/Scene Challenge/);
    expect((await ticks(storm.id)).ticks).toBe(8);              // marked once on its own challenge
  }, 30_000);
});

/* global silenceConsoleErrors, structuredClone -- tests/setup.js and Node globals, as in tests/unit */
/**
 * Probe — BATCH-13 ROUND-ROLL-INSTEAD-NO-TARGET (eleventh audit; PACED-VARIANT-NO-TARGET in the round).
 *
 * PACED-VARIANT-NO-TARGET (fixed in fcf612e for free-flow): with two scene
 * challenges open, a paced "Roll Face Danger (Scene Challenge)" scores the
 * challenge the classifier named — decidePacing resolves it to
 * `suggestedTargetId`, the paced card keeps it, and its Roll forwards it as
 * `forcedMoveTargetId`. A Batch Mode reading runs the same decidePacing and
 * stores `suggestedTargetId` on the no-roll reading (movePipeline.js
 * readAction) — but nothing reads it: the window's "Roll ⟨move⟩" relays only
 * the move (`batch.reread` → rereadEntry → `readAs: { move, moveId }`) and
 * readAction forces `{ moveId }` with no target. So the round's roll names no
 * challenge, its scoring is ambiguous, and the ⬡ card asks "which scene
 * challenge?" — the strong hit's progress lands on neither.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const isClassifier = (call) => /pacing pre-classifier/.test(call.system ?? '');
const isNarration  = (call) => /SIDECAR|NARRATOR ROLE/.test(call.system ?? '');
const nwma = (suggestedMove, sceneChallenge) => JSON.stringify({ decision: 'NARRATIVE_WITH_MOVE_AVAILABLE',
  suggestedMove, sceneChallenge, category: 'exploration', confidence: 0.6, reasoning: 'a risk the player may want to press' });
const STRONG = [0.0, 0.15, 0.9];   // challenge 1, 2; die 6 → a strong hit
const LINE   = 'I gun the engine and cut through the night market.';

let table, journal, negotiation, chase, script;
const gm = () => table.client('gm-1');
const round = () => table.world.getSetting('batchMode.round');
const ticks = (t) => (journal.getFlag(MODULE_ID, 'tracks') ?? []).find(x => x.id === t.id)?.ticks;
const sceneCard = () => table.cards(f => f.sceneChallengeCard).at(-1)?.content ?? '';

function progressJournal() {
  const flags = {};
  return {
    id: 'pt-progress', name: 'Starforged Progress Tracks',
    getFlag: (scope, key) => flags[`${scope}.${key}`],
    setFlag: async (scope, key, value) => { flags[`${scope}.${key}`] = structuredClone(value); },
  };
}

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  await table.drain();
  return res;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'pt-s1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'pt-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  journal = progressJournal();
  table.journal._set(journal);
  const store = await gm().import('../../src/ui/progressTracks.js');
  negotiation = await gm().run(() => store.addProgressTrack({ label: 'The Negotiation', type: 'scene_challenge', rank: 'dangerous' }));
  chase       = await gm().run(() => store.addProgressTrack({ label: 'The Chase', type: 'scene_challenge', rank: 'dangerous' }));
  await table.settle();
  script = scriptClaude(table, { fallback: (call) => (isNarration(call)
    ? 'The night market blurs past.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' : '{}') });
  silenceConsoleErrors();
  await gm().setSetting('batchMode.enabled', true);
  await table.settle();
});

describe('BATCH-13 — a round\'s "Roll ⟨Face Danger (Scene Challenge)⟩" with two challenges open', () => {
  it('control: the reading knows which challenge the classifier named (suggestedTargetId)', async () => {
    script.when(isClassifier, nwma('face_danger_scene_challenge', 'the chase'));
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: LINE, submissionId: 'k1' });
    expect(round().entries['pl-1'].reading).toMatchObject({
      kind: 'narrative', suggestedMove: 'face_danger_scene_challenge', suggestedTargetId: chase.id,
    });
  }, 30_000);

  it('Roll ⟨move⟩ in the window, confirmed: the strong hit marks The Chase alone, as the paced card\'s Roll does', async () => {
    script.when(isClassifier, nwma('face_danger_scene_challenge', 'the chase'));
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: LINE, submissionId: 'k1' });
    await relay('pl-1', 'batch.reread', { roundId: round().id, submissionId: 'k1', newSubmissionId: 'k2', moveId: 'face_danger_scene_challenge' });
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', reading: { kind: 'move', moveId: 'face_danger_scene_challenge' } });
    control.dice = STRONG;
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k2', choices: {} });
    expect(round()).toMatchObject({ number: 2 });
    expect([ticks(chase), ticks(negotiation)], `⬡ card: ${sceneCard().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160)}`).toEqual([8, 0]);
  }, 30_000);
});

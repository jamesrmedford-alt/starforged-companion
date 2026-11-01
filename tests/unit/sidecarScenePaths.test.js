/**
 * STARFORGED COMPANION
 * tests/unit/sidecarScenePaths.test.js
 *
 * The session vignette, clock vignette and vow-swearing narrations start (or
 * continue) a scene before their sidecar writes its facts (issue #321 U34) —
 * the single-client half of tests/unit/sidecarWithoutScene.test.js, which
 * covers the oracle follow-up on the multi-client table. Written under no
 * scene, those facts were ended as a phantom scene by the next move.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import {
  narrateSessionVignette,
  narrateClockAdvancement,
  narrateVowSwearing,
} from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const SIDECAR_REPLY = 'The galley smells of burnt recaf. Mara hums off-key.\n```json\n'
  + JSON.stringify({
    newTruths:    [{ subject: 'Mara', fact: 'Hums off-key when she is nervous' }],
    stateChanges: [{ subject: 'Mara', attribute: 'location', value: 'the galley' }],
    sceneFrame:   { location: 'the galley', present: ['Mara'], situation: 'Breakfast before the jump' },
  })
  + '\n```';

const noScene = () => ({
  currentSessionId: 'sess-2', sessionNumber: 2,
  currentSceneId: null, sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null,
});

const stored = () => game.settings.get(MODULE_ID, 'campaignState');

beforeEach(() => {
  ChatMessage._reset();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(KEY, noScene());
  vi.mocked(apiPost).mockResolvedValue({ content: [{ type: 'text', text: SIDECAR_REPLY }] });
});
afterEach(() => {
  game.settings._store.clear();
  vi.mocked(apiPost).mockReset();
});

/** The scene the narration recorded its facts in. */
async function sceneOfTheFacts() {
  await new Promise(r => setTimeout(r, 0));   // the sidecar persist settles
  const cs = stored();
  expect(typeof cs.currentSceneId).toBe('string');
  expect(cs.sceneTruths.map(t => [t.fact, t.sceneId])).toEqual([['Hums off-key when she is nervous', cs.currentSceneId]]);
  expect(cs.sceneFrame).toMatchObject({ location: 'the galley', sceneId: cs.currentSceneId });
  expect(cs.sceneState.sceneId).toBe(cs.currentSceneId);
  return cs.currentSceneId;
}

describe('sidecar-writing narrations open a scene first', () => {
  it('a session vignette', async () => {
    const text = await narrateSessionVignette({ userMessage: 'Write the galley vignette.', campaignState: stored() });
    expect(text).toMatch(/burnt recaf/);
    await sceneOfTheFacts();
  });

  it('a clock vignette', async () => {
    const clock = { _id: 'clk-1', name: 'The Syndicate closes in', type: 'campaign', filled: 2, segments: 6 };
    const text = await narrateClockAdvancement({ clock, campaignState: stored() });
    expect(text).toMatch(/burnt recaf/);
    await sceneOfTheFacts();
  });

  it('a vow-swearing scene', async () => {
    const vow = { name: 'Find who silenced the beacon', rank: 'dangerous' };
    const text = await narrateVowSwearing({ vow, campaignState: stored() });
    expect(text).toMatch(/burnt recaf/);
    await sceneOfTheFacts();
  });

  it('continues a scene that is already open instead of starting another', async () => {
    game.settings._store.set(KEY, { ...noScene(), currentSceneId: 'sc-open', sceneState: { bySubject: {}, sceneId: 'sc-open' } });
    await narrateSessionVignette({ userMessage: 'Write the galley vignette.', campaignState: noScene() });   // an older snapshot
    expect(await sceneOfTheFacts()).toBe('sc-open');
  });
});

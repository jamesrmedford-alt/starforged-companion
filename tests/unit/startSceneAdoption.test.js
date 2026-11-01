/**
 * STARFORGED COMPANION
 * tests/unit/startSceneAdoption.test.js
 *
 * startScene continues the scene in progress when its caller's snapshot
 * predates it (issue #321 U06f).
 *
 * Narrator paths call ensureSceneStarted(campaignState) with the snapshot they
 * hold — the move pipeline's is read when it claims the move lock, before the
 * confirm dialog, the interpretation / relevance calls and the move card.
 * When that snapshot predated a scene another narration started meanwhile (a
 * paced turn or `@scene` at the top of a session), startScene saw "no scene",
 * minted a second id and persisted SCENE_FIELDS from the snapshot over the
 * store: the live scene's truths, state and frame were overwritten — neither
 * kept nor archived. startScene now adopts the store's active scene into a
 * caller that holds none.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import { startScene } from '../../src/factContinuity/sceneLifecycle.js';
import { narratePacedInput } from '../../src/narration/narrator.js';
import { JOURNAL_NAMES } from '../../src/world/worldJournal.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const truthA = {
  id: 'tr-live0001', subject: { kind: 'text', text: 'the dockmaster' },
  fact: 'Owes the PC a favour for the medkit', sessionId: 'sess-1', sessionNum: 3,
  sceneId: 'sc-live', moveId: null, source: 'narrator_sidecar', asserter: 'narrator',
  createdAt: 1, retracted: false, retractedBy: null, retractedAt: null, correctedTo: null, migratedTo: null,
};

/** The move pipeline's snapshot, read before any scene existed. */
const staleSnapshot = () => ({
  currentSessionId: 'sess-1', sessionNumber: 3,
  currentSceneId: null, sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null,
});

/** Meanwhile a paced turn narrated: scene sc-live started, with a truth, state and a frame. */
function storeLiveScene() {
  game.settings._store.set(KEY, {
    ...staleSnapshot(),
    currentSceneId: 'sc-live',
    sceneTruths: [truthA],
    sceneState: { bySubject: { 'the dockmaster': [{ attribute: 'location', value: 'the cargo bay', updatedAt: 1 }] }, sceneId: 'sc-live' },
    sceneFrame: { location: 'Bleakhold docking ring', present: ['the dockmaster'], situation: 'Haggling over the medkit', sceneId: 'sc-live' },
  });
}

let installed;
beforeEach(() => {
  installed = installJournalMock();
  ChatMessage._reset();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
});
afterEach(() => {
  installed.restore();
  game.settings._store.clear();
  vi.mocked(apiPost).mockReset();
});

describe('startScene from a snapshot older than the live scene', () => {
  it('does not wipe the scene another narration started meanwhile', async () => {
    storeLiveScene();
    const snapshot = staleSnapshot();

    // The move now narrates: ensureSceneStarted sees the snapshot's null id.
    const id = await startScene(snapshot, { reason: 'first_narration_move_resolution' });

    expect(id).toBe('sc-live');
    const stored = game.settings.get(MODULE_ID, 'campaignState');
    expect(stored.sceneTruths.map(t => t.id)).toEqual(['tr-live0001']);
    expect(stored.sceneFrame?.location).toBe('Bleakhold docking ring');
    const archived = (installed.journals.get(JOURNAL_NAMES.lore)?.pages.contents ?? []);
    expect(archived).toEqual([]);    // nothing ended
  });

  it("adopts the live scene into the caller's copy, as a copy, and writes nothing", async () => {
    storeLiveScene();
    const snapshot = staleSnapshot();
    const set = vi.spyOn(game.settings, 'set');
    try {
      await startScene(snapshot, { reason: 'first_narration_move_resolution' });
      expect(set).not.toHaveBeenCalled();
    } finally {
      set.mockRestore();
    }
    expect(snapshot.currentSceneId).toBe('sc-live');
    expect(snapshot.sceneTruths.map(t => t.id)).toEqual(['tr-live0001']);
    expect(snapshot.sceneState.bySubject['the dockmaster'][0].value).toBe('the cargo bay');
    snapshot.sceneTruths.push({ id: 'tr-new' });
    expect(game.settings.get(MODULE_ID, 'campaignState').sceneTruths).toHaveLength(1);   // not shared
  });

  // Control: an explicit `!scene start` reads the store first, so it holds
  // the active scene — it still ends it and starts a new one (as before).
  it('control: a caller holding the active scene still ends it and starts a new one', async () => {
    storeLiveScene();
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    const id = await startScene(cs, { reason: 'scene_command' });
    expect(id).not.toBe('sc-live');
    expect(game.settings.get(MODULE_ID, 'campaignState').currentSceneId).toBe(id);
    expect(game.settings.get(MODULE_ID, 'campaignState').sceneTruths).toEqual([]);
  });

  it("a paced narration from a stale snapshot records its facts in the live scene", async () => {
    storeLiveScene();
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    vi.mocked(apiPost).mockResolvedValue({ content: [{ type: 'text', text:
      'The dockmaster counts the credits twice.\n```json\n'
      + JSON.stringify({ newTruths: [{ subject: 'the dockmaster', fact: 'Counts every credit twice' }], stateChanges: [] })
      + '\n```' }] });

    await narratePacedInput('I hand over the credits.', staleSnapshot());
    await new Promise(r => setTimeout(r, 0));

    const stored = game.settings.get(MODULE_ID, 'campaignState');
    expect(stored.currentSceneId).toBe('sc-live');
    expect(stored.sceneTruths.map(t => t.fact)).toEqual([
      'Owes the PC a favour for the medkit',
      'Counts every credit twice',
    ]);
  });
});

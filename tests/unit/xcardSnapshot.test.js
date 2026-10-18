/**
 * STARFORGED COMPANION
 * tests/unit/xcardSnapshot.test.js
 *
 * The X-Card against the move pipeline's stale campaignState snapshot.
 *
 * - narrateResolution (move narration) had no X-Card gate at all after the
 *   context assembler was retired (its ASSEMBLER-003 check went with it), so a
 *   move narrated right through an active X-Card.
 * - The pipeline narrates from a snapshot read before its confirm dialog and
 *   Claude calls, so an X-Card relayed to the GM meanwhile is only visible in
 *   the stored setting — every narrator gate now reads the live flag too.
 * - Scene start/end and the narrator-sidecar persist wrote the caller's whole
 *   object back, reverting a relayed X-Card; they now merge only the fields
 *   they own onto the latest stored campaignState (persistCampaignStateFields).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { narrateResolution, narratePacedInput } from '../../src/narration/narrator.js';
import { persistCampaignStateFields, startScene } from '../../src/factContinuity/sceneLifecycle.js';

const MODULE_ID = 'starforged-companion';

function stored() {
  return game.settings._store.get(`${MODULE_ID}.campaignState`);
}

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
});

const resolution = {
  _id: 'res-x-1', moveId: 'face_danger', moveName: 'Face Danger',
  outcome: 'weak_hit', outcomeLabel: 'Weak Hit',
};

describe('narrateResolution honours the X-Card', () => {
  it('posts a paused notice (not a narrator card) when the snapshot says X-Card active', async () => {
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    const out = await narrateResolution(resolution, { xCardActive: true, currentSessionId: 's1' });
    expect(out).toBeNull();
    const card = ChatMessage._created.at(-1);
    expect(card.flags[MODULE_ID]).toMatchObject({ narrationPaused: true, moveId: 'face_danger' });
    expect(card.flags[MODULE_ID].narratorCard).toBeUndefined();
    expect(card.content).toContain('X-Card is active');
  });

  it('reads the live setting when the pipeline snapshot predates the X-Card', async () => {
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    game.settings._store.set(`${MODULE_ID}.campaignState`, { xCardActive: true });
    const snapshot = { xCardActive: false, currentSessionId: 's1' };   // read before the X-Card
    expect(await narrateResolution(resolution, snapshot)).toBeNull();
    expect(ChatMessage._created.at(-1).flags[MODULE_ID].narrationPaused).toBe(true);
  });

  it('paced narration also reads the live flag', async () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, { xCardActive: true });
    expect(await narratePacedInput('I look around the hangar.', { xCardActive: false })).toBeNull();
  });
});

describe('persistCampaignStateFields', () => {
  it('merges only the owned fields onto the latest stored campaignState', async () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      xCardActive: true, nextMoveAdd: { value: 1 }, sceneTruths: [], legacyTracks: { bonds: { ticks: 4 } },
    });
    const staleSnapshot = {
      xCardActive: false, sceneTruths: [{ id: 't1' }], legacyTracks: { bonds: { ticks: 0 } },
    };
    await persistCampaignStateFields(staleSnapshot, ['sceneTruths'], 'test');
    expect(stored()).toEqual({
      xCardActive: true, nextMoveAdd: { value: 1 }, sceneTruths: [{ id: 't1' }], legacyTracks: { bonds: { ticks: 4 } },
    });
  });

  it('writes the caller\'s object as-is when it is the stored one', async () => {
    const state = { xCardActive: false, sceneTruths: [] };
    game.settings._store.set(`${MODULE_ID}.campaignState`, state);
    state.sceneTruths.push({ id: 't2' });
    await persistCampaignStateFields(state, ['sceneTruths'], 'test');
    expect(stored()).toBe(state);
  });

  it('startScene on a stale snapshot does not revert a relayed X-Card', async () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, { xCardActive: true, sceneTruths: [] });
    const snapshot = { xCardActive: false, sceneTruths: [], sceneState: { bySubject: {}, sceneId: null } };
    await startScene(snapshot, { reason: 'test' });
    expect(stored().xCardActive).toBe(true);
    expect(stored().currentSceneId).toBe(snapshot.currentSceneId);
    expect(typeof stored().currentSceneId).toBe('string');
  });
});

describe('narrator sidecar persist', () => {
  it('writes the ledger fields onto the latest store, keeping a relayed X-Card', async () => {
    const { applyNarratorSidecar } = await import('../../src/narration/narrator.js');
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      xCardActive: true, currentSceneId: 'sc', sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc' },
    });
    const snapshot = {
      xCardActive: false, currentSessionId: 's', currentSceneId: 'sc',
      sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc' },
    };
    const raw = 'The hatch groans open.\n\n```json\n'
      + '{"newTruths":[{"subject":"hatch","fact":"The hatch is open."}],"stateChanges":[]}\n```';
    expect(applyNarratorSidecar(raw, snapshot, {})).toBe('The hatch groans open.');
    await new Promise(r => setTimeout(r, 0));
    expect(stored().xCardActive).toBe(true);
    expect(stored().sceneTruths.map(t => t.fact)).toContain('The hatch is open.');
  });

  // Second review round: the ledgers themselves were written whole from the
  // snapshot, so a `!truth` strike or an oracle truth that landed during the
  // narration was lost, and a scene End a Session had closed came back.
  it('keeps a mid-narration `!truth` strike and oracle truth (union by id, retraction sticks)', async () => {
    const { applyNarratorSidecar } = await import('../../src/narration/narrator.js');
    const t1 = { id: 't1', subject: 'door', fact: 'The door is locked.', retracted: false };
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      currentSceneId: 'sc', sceneState: { bySubject: {}, sceneId: 'sc' },
      sceneTruths: [{ ...t1, retracted: true }, { id: 't2', subject: 'oracle', fact: 'A distress beacon pulses.' }],
    });
    const snapshot = {
      currentSessionId: 's', currentSceneId: 'sc',
      sceneTruths: [{ ...t1 }], sceneState: { bySubject: {}, sceneId: 'sc' },
    };
    const raw = 'The hatch groans open.\n\n```json\n'
      + '{"newTruths":[{"subject":"hatch","fact":"The hatch is open."}],"stateChanges":[]}\n```';
    applyNarratorSidecar(raw, snapshot, {});
    await new Promise(r => setTimeout(r, 0));
    const truths = stored().sceneTruths;
    expect(truths.find(t => t.id === 't1').retracted).toBe(true);
    expect(truths.map(t => t.fact)).toEqual(expect.arrayContaining(['A distress beacon pulses.', 'The hatch is open.']));
  });

  it('writes nothing when the scene changed meanwhile — a closed scene stays closed', async () => {
    const { applyNarratorSidecar } = await import('../../src/narration/narrator.js');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const closed = { xCardActive: false, currentSceneId: null, sceneTruths: [], sceneState: { bySubject: {}, sceneId: null } };
    game.settings._store.set(`${MODULE_ID}.campaignState`, closed);
    const snapshot = {
      currentSessionId: 's', currentSceneId: 'sc',
      sceneTruths: [{ id: 't1', subject: 'door', fact: 'The door is locked.' }],
      sceneState: { bySubject: {}, sceneId: 'sc' },
    };
    const raw = 'The hatch groans open.\n\n```json\n'
      + '{"newTruths":[{"subject":"hatch","fact":"The hatch is open."}],"stateChanges":[]}\n```';
    applyNarratorSidecar(raw, snapshot, {});
    await new Promise(r => setTimeout(r, 0));
    expect(stored()).toBe(closed);
    expect(stored().sceneTruths).toEqual([]);
    expect(debug.mock.calls.some(c => /the scene changed meanwhile — narrator sidecar not persisted/.test(String(c[0])))).toBe(true);
  });
});

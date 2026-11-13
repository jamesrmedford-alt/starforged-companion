/**
 * Issue #354 P2-07 / P2-08 — Rotating Spotlight is off by default.
 *
 * In the alpha 23 playtest (one user running two characters) seven of eleven
 * narrations ended on a prompt to a named character: the setting defaulted
 * on, and it counts characters, not players. The maintainer asked for it off
 * by default, and — since saving the Narrator tab stores every field — for a
 * world's stored "on" to be switched off once, with the GMs told.
 *
 * P2-08: with the spotlight on in second person, the block told the narrator
 * to address a different character directly, so "you" changed person inside
 * one card. It now brings that character in by name, in the third person.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { buildNarratorExtras } from '../../src/narration/narrator.js';
import { buildNarratorSystemPrompt } from '../../src/narration/narratorPrompt.js';
import {
  applySpotlightDefaultOff, SPOTLIGHT_SETTING, SPOTLIGHT_DEFAULT_OFF_APPLIED,
} from '../../src/narration/spotlightDefault.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const RELEVANCE = { resolvedClass: 'interaction', entityIds: [], entityTypes: [], matchedNames: [], needsClarification: false, referenceType: 'none' };

const twoPcScene = () => ({
  currentSessionId: 'sess-2', sessionNumber: 2, currentSceneId: 'sc-1',
  sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' },
  sceneFrame: { location: 'the bridge', present: ['Isaac', 'Karthik'], situation: 'A hail is waiting', sceneId: 'sc-1' },
  spotlight: { lastActorId: null, sceneId: 'sc-1' },
});

const extrasFor = (mode = 'move_resolution') => buildNarratorExtras(mode,
  JSON.parse(JSON.stringify(game.settings.get(MODULE_ID, 'campaignState'))), {
    playerNarration: 'Answer the hail', character: { actorId: 'a-actor', name: 'Isaac Sutton' }, relevance: RELEVANCE,
  });

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.user = { id: 'gm-1', isGM: true };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }, { id: 'pl-1', isGM: false, active: true }];
  game.actors._set('a-actor', makeTestActor({ id: 'a-actor', name: 'Isaac Sutton' }));
  game.actors._set('b-actor', makeTestActor({ id: 'b-actor', name: 'Karthik Shepherd' }));
  game.settings._store.set(KEY, twoPcScene());
});

describe('issue #354 P2-07 — Rotating Spotlight is off unless the table switched it on', () => {
  it('two PCs in the scene and the setting never stored: no SPOTLIGHT block, and the pointer stays where it was', async () => {
    const extras = await extrasFor();
    expect(extras.spotlightBlock).toBe('');
    expect(game.settings.get(MODULE_ID, 'campaignState').spotlight).toEqual({ lastActorId: null, sceneId: 'sc-1' });
  });

  it('control: switched on, the same scene carries the block', async () => {
    game.settings._store.set(`${MODULE_ID}.${SPOTLIGHT_SETTING}`, true);
    const extras = await extrasFor();
    expect(extras.spotlightBlock).toContain('## SPOTLIGHT');
    expect(extras.spotlightBlock).toMatch(/Karthik Shepherd is next/);
  });
});

describe('issue #354 P2-07 — a world\'s stored "on" is switched off once', () => {
  it('a stored "on" is switched off, the GMs are told, and the world is marked', async () => {
    game.settings._store.set(`${MODULE_ID}.${SPOTLIGHT_SETTING}`, true);
    const result = await applySpotlightDefaultOff();
    expect(result).toEqual({ switchedOff: true, marked: true });
    expect(game.settings.get(MODULE_ID, SPOTLIGHT_SETTING)).toBe(false);
    expect(game.settings.get(MODULE_ID, SPOTLIGHT_DEFAULT_OFF_APPLIED)).toBe(true);
    const notice = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.spotlightDefaultNotice);
    expect(notice, 'a notice was posted').toBeTruthy();
    expect(notice.whisper).toEqual(['gm-1']);
    expect(notice.content).toMatch(/Rotating spotlight is now off/);
  });

  it('a GM who ticks it again keeps it: the switch-off does not run a second time', async () => {
    game.settings._store.set(`${MODULE_ID}.${SPOTLIGHT_SETTING}`, true);
    await applySpotlightDefaultOff();
    ChatMessage._reset();
    game.settings._store.set(`${MODULE_ID}.${SPOTLIGHT_SETTING}`, true);   // the GM's own choice
    const again = await applySpotlightDefaultOff();
    expect(again).toEqual({ switchedOff: false, marked: false });
    expect(game.settings.get(MODULE_ID, SPOTLIGHT_SETTING)).toBe(true);
    expect(ChatMessage._created).toHaveLength(0);
  });

  it('a world that never stored it is marked, and no notice is posted', async () => {
    const result = await applySpotlightDefaultOff();
    expect(result).toEqual({ switchedOff: false, marked: true });
    expect(game.settings.get(MODULE_ID, SPOTLIGHT_DEFAULT_OFF_APPLIED)).toBe(true);
    expect(ChatMessage._created).toHaveLength(0);
  });

  it('a refused switch-off leaves the world unmarked, so the next load tries again', async () => {
    game.settings._store.set(`${MODULE_ID}.${SPOTLIGHT_SETTING}`, true);
    const spy = vi.spyOn(game.settings, 'set').mockRejectedValue(new Error('the world refused the write'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await applySpotlightDefaultOff();
      expect(result.marked).toBe(false);
      expect(ChatMessage._created).toHaveLength(0);
    } finally { spy.mockRestore(); warn.mockRestore(); }
    expect(game.settings.get(MODULE_ID, SPOTLIGHT_DEFAULT_OFF_APPLIED)).not.toBe(true);
    expect((await applySpotlightDefaultOff()).switchedOff).toBe(true);
  });

  it('a player\'s client changes nothing', async () => {
    game.settings._store.set(`${MODULE_ID}.${SPOTLIGHT_SETTING}`, true);
    global.game.user = { id: 'pl-1', isGM: false };
    expect(await applySpotlightDefaultOff()).toEqual({ switchedOff: false, marked: false });
    expect(game.settings.get(MODULE_ID, SPOTLIGHT_SETTING)).toBe(true);
  });
});

describe('issue #354 P2-08 — "you" is one character for the whole card', () => {
  it('second person, spotlight on: the other PC is brought in by name, never addressed as "you"', async () => {
    game.settings._store.set(`${MODULE_ID}.${SPOTLIGHT_SETTING}`, true);
    game.settings._store.set(`${MODULE_ID}.narrationPerspective`, 'second_person');
    const extras = await extrasFor('paced_narrative');
    expect(extras.spotlightBlock).toMatch(/Karthik Shepherd is next/);
    expect(extras.spotlightBlock).toMatch(/never\s+address Karthik Shepherd as "you"/);
    expect(extras.spotlightBlock).not.toContain('"Karthik Shepherd, what do you do?"');
  });

  it('third person, spotlight on: the closing prompt names them, as before', async () => {
    game.settings._store.set(`${MODULE_ID}.${SPOTLIGHT_SETTING}`, true);
    game.settings._store.set(`${MODULE_ID}.narrationPerspective`, 'third_person');
    const extras = await extrasFor('paced_narrative');
    expect(extras.spotlightBlock).toContain('"Karthik Shepherd, what do you do?"');
  });

  it('Auto follows the perspective the session began with', async () => {
    game.settings._store.set(`${MODULE_ID}.${SPOTLIGHT_SETTING}`, true);
    game.settings._store.set(KEY, { ...twoPcScene(), sessionPerspective: { sessionId: 'sess-2', perspective: 'second_person' } });
    expect((await extrasFor()).spotlightBlock).not.toContain('"Karthik Shepherd, what do you do?"');
    game.settings._store.set(KEY, { ...twoPcScene(), sessionPerspective: { sessionId: 'sess-2', perspective: 'third_person' } });
    expect((await extrasFor()).spotlightBlock).toContain('"Karthik Shepherd, what do you do?"');
  });

  it('the second-person style rule keeps "you" for the acting character and names every other PC', () => {
    const prompt = buildNarratorSystemPrompt({}, { narrationPerspective: 'second_person' }, { name: 'Isaac Sutton' }, '', { mode: 'paced_narrative' });
    expect(prompt).toMatch(/never call them by name in narration/);
    expect(prompt).toMatch(/never call anyone else "you"/);
    const third = buildNarratorSystemPrompt({}, { narrationPerspective: 'third_person' }, { name: 'Isaac Sutton' }, '', { mode: 'paced_narrative' });
    expect(third).not.toMatch(/never call anyone else "you"/);
  });
});

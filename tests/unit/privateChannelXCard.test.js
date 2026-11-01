/**
 * The Private Channel stands down during an X-Card pause (issue #321 U09).
 *
 * decisions.md "X-Card: anyone plays it, a GM resumes it": while
 * campaignState.xCardActive is set every narrator entry point stands down —
 * on entry, and again when each Claude call returns. The Private Channel
 * never read the flag: the private narrator kept answering, and Publish
 * posted the reflection to MAIN CHAT as a narrator card (narratorCard /
 * narrationText / sessionId — canon for the recent-narration ring, the
 * rolling summary and the tier pass) in the middle of the pause, so what the
 * card was played to stop could come straight back to the table. Both now
 * refuse while the live flag is set, and tell the player why. The maintainer
 * chose this on 2026-10-31.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { publishToMainChat, XCARD_PUBLISH_REFUSED } from '../../src/private-channel/publish.js';
import { requestPrivateNarration } from '../../src/private-channel/narrate.js';
import { apiPost } from '../../src/api-proxy.js';

const MODULE_ID = 'starforged-companion';
const STATE_KEY = `${MODULE_ID}.campaignState`;
let saved;

const state = () => game.settings._store.get(STATE_KEY);
const setState = (patch) => game.settings._store.set(STATE_KEY, { ...state(), ...patch });

beforeEach(() => {
  saved = { users: global.game.users };
  global.game.actors._setAll([makeTestActor({ id: 'pc-dax', name: 'Dax', ownership: { 'player-1': 3 } })]);
  const users = new Map([['player-1', { id: 'player-1', name: 'Sam', isGM: false, active: true, character: { id: 'pc-dax', name: 'Dax' } }]]);
  global.game.users = { get: (id) => users.get(id) ?? null, get contents() { return [...users.values()]; } };
  game.settings._store.set(STATE_KEY, {
    currentSessionId: 'ses-1', characterIds: ['pc-dax'], xCardActive: true, xCardPlays: 1,
  });
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  global.ChatMessage._reset();
  apiPost.mockReset().mockResolvedValue({ content: [{ type: 'text', text: 'The memory sits heavy.' }] });
});

afterEach(() => {
  global.game.actors._reset();
  global.game.users = saved.users;
  game.settings._store.delete(STATE_KEY);
  game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
});

const canonCards = () => global.ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.narratorCard);

describe('publishing a reflection while the X-Card is active', () => {
  it('puts no narrator (canon) card into main chat during the pause, and tells the player', async () => {
    const warn = vi.spyOn(ui.notifications, 'warn');
    const msg = await publishToMainChat({ userId: 'player-1', content: 'I keep thinking about what they did to the prisoner.' });
    expect(msg).toBeNull();
    expect(canonCards()).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(XCARD_PUBLISH_REFUSED);
  });

  it('control: once a GM resumes, the reflection is published as canon', async () => {
    setState({ xCardActive: false });
    await publishToMainChat({ userId: 'player-1', content: 'I keep the ring.' });
    expect(canonCards()).toHaveLength(1);
  });
});

describe('the private narrator during an X-Card pause', () => {
  it('stands down on entry: no Claude call, and the window is told why', async () => {
    const result = await requestPrivateNarration({
      campaignState: state(), userId: 'player-1', actorId: 'pc-dax', transcriptTurns: [], playerMessage: 'Why did they do it?',
    });
    expect(result).toEqual({ ok: false, reason: 'x-card' });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('discards a reply written while the card was played', async () => {
    silenceConsoleErrors();   // the private prompt's shared-story readers log on this bare world
    setState({ xCardActive: false });
    const before = state();
    apiPost.mockImplementation(async () => {
      setState({ xCardActive: true, xCardPlays: 2 });   // a player plays the X-Card meanwhile
      return { content: [{ type: 'text', text: 'They did it because—' }] };
    });
    const result = await requestPrivateNarration({
      campaignState: before, userId: 'player-1', actorId: 'pc-dax', transcriptTurns: [], playerMessage: 'Why did they do it?',
    });
    expect(result).toEqual({ ok: false, reason: 'x-card' });
  });

  it('control: with no X-Card in play the private narrator answers', async () => {
    silenceConsoleErrors();
    setState({ xCardActive: false });
    const result = await requestPrivateNarration({
      campaignState: state(), userId: 'player-1', actorId: 'pc-dax', transcriptTurns: [], playerMessage: 'Why did they do it?',
    });
    expect(result).toEqual({ ok: true, text: 'The memory sits heavy.' });
  });
});

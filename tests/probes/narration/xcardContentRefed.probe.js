// tests/probes/narration/xcardContentRefed.probe.test.js
//
// PROBE (audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// XCARD-CONTENT-REFED: the X-Card is played AFTER the narration that prompted
// it has posted (help: "The current scene is immediately suppressed. The
// narrator will not continue until the scene is redirected"; the card: "Current
// content is suppressed"). suppressScene / clearXCard (src/context/safety.js)
// only flip xCardActive and count plays — nothing marks the X-carded narrator
// card, and sessionNarratorCards (src/narration/narrator.js) has no exclude for
// it (it has one for burnSuperseded prose). So the moment a GM resumes, the
// very next narration's RECENT SCENE carries the X-carded prose verbatim, the
// rolling summary re-summarises it into STORY SO FAR, and the facts its
// sidecar ledgered stay "binding" — the narrator is handed the content the
// table removed.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { postNarrationCard, getRecentNarrationContext } from '../../../src/narration/narrator.js';
import { suppressScene, clearXCard } from '../../../src/context/safety.js';

const MODULE_ID = 'starforged-companion';
const SESSION = 'sess-2';

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: SESSION, currentSceneId: 'sc-1', xCardActive: false, xCardPlays: 0 });
  global.game.messages = { contents: [] };
});

describe('content the table X-carded is not fed back to the narrator', () => {
  it('after the X-Card is played and resumed, the X-carded narration is not in the next narration\'s RECENT SCENE', async () => {
    const state = game.settings.get(MODULE_ID, 'campaignState');
    await postNarrationCard('The interrogator lifts the cutting torch toward the prisoner\'s hand.',
      { moveId: 'compel', outcome: 'miss', _id: 'res-x' }, state, { playerText: 'I press him harder.', playerName: 'Kira' });
    global.game.messages = { contents: ChatMessage._created.slice() };

    // A player plays the X-Card on that beat; the GM later resumes.
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(game.settings.get(MODULE_ID, 'campaignState').xCardActive).toBe(true);
    expect(await clearXCard()).toBe(true);

    const ring = getRecentNarrationContext(SESSION, 20);
    expect(ring).not.toContain('cutting torch');
  });
});

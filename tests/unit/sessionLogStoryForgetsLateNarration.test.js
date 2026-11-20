/**
 * STARFORGED COMPANION
 * tests/unit/sessionLogStoryForgetsLateNarration.test.js
 *
 * Issue #364 LATE-ROUND-NOT-IN-LAST-SESSION — the Session Log's side of it.
 *
 * A narration posted into the session LAST SESSION names, after the mint that
 * closed it, is summarised into LAST SESSION (narrator.js
 * bringLastSessionUpToDate → catchUpUnsummarisedSession). The X-Card still
 * answers that narration (XCARD-MISSES-LATE-ROUND-CARD), so it takes it out
 * of LAST SESSION again — and off that session's Session Log page, whose
 * "Story so far" is the same summary: the page's story goes with LAST
 * SESSION's text (safety.js finishXCardRemoval → retractSessionLogSummary)
 * and is written back when LAST SESSION is made again from the cards that
 * remain (restoreSessionLogStory), as for an X-Card played after End a
 * Session (issue #345 AA27, SESSION-LOG-STORY-NOT-REBUILT).
 *
 * And a summary made from the late narration that is still waiting to be
 * written when the X-Card removes that narration is not stored: the catch-up
 * checks the X-Card's play count again at its write's turn, as the rolling
 * summary's own write does (issue #345 AA25) — the X-Card's pause jumps the
 * write chain, and LAST SESSION was written after it with the removed beat.
 *
 * The harness of tests/unit/sessionLogForgetsXCardedBeat.test.js.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

const replies = vi.hoisted(() => ({ summary: '', vignette: '', summaryHeld: null }));
vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const model = String(body?.model ?? '');
    // `summaryHeld`: the summary's call stays out until the test lets it answer.
    if (/haiku/.test(model) && replies.summaryHeld) await replies.summaryHeld;
    if (/haiku/.test(model)) return { content: [{ type: 'text', text: replies.summary }] };
    return { content: [{ type: 'text', text: replies.vignette }] };
  }),
}));

import { applyNarratorSidecar, postNarrationCard, registerRollingSummaryRefreshHook } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { applyEndSession } from '../../src/safety/sessionLifecycleDialogs.js';
import { JOURNAL_NAMES } from '../../src/world/worldJournal.js';
import { rollSessionIfDue } from '../../src/session/lifecycle.js';
import { serialiseCampaignStateWrite } from '../../src/multiplayer/campaignStateChain.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-4';
const AT_END    = 'Kira dug through the rubble of the Bleakhold mine and left in silence.';
const WITH_LATE = 'Kira dug through the rubble of the Bleakhold mine; later the drones cornered her in the vent.';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };
const ticks = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 5)); };
/** Wait (≤ 3 s) until `fn()` is truthy. */
const until = async (fn) => { for (let i = 0; i < 300 && !fn(); i++) await new Promise(r => setTimeout(r, 10)); return fn(); };

beforeAll(() => { registerRollingSummaryRefreshHook(); });

let journals, hadCallAll;
beforeEach(() => {
  hadCallAll = typeof Hooks.callAll === 'function';
  if (!hadCallAll) Hooks.callAll = (event, ...args) => { Hooks.call(event, ...args); return true; };
  journals = installJournalMock();
  ChatMessage._reset();
  game.settings._store.clear();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-gina');
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 4, currentSceneId: 'sc-1',
    sessionActive: true, sessionStartedId: SESSION, sessionEndedId: null,
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [], clocks: [],
  });
  replies.summary  = AT_END;
  replies.vignette = 'On the quay, Vance mends a torn cargo net and hums.';
  replies.summaryHeld = null;
});
afterEach(() => { journals.restore(); if (!hadCallAll) delete Hooks.callAll; });

const sessionLogSummary = () => {
  const page = journals.journals.get(JOURNAL_NAMES.sessionLog)?.pages.contents[0];
  return page?.flags?.[MODULE_ID]?.sessionLogPage?.summary ?? null;
};

/** A narration card as the narrator posts one, filed under `cs`'s session; its post fires the summary's hook. */
async function narrate(cs, narrationId, prose) {
  const text = applyNarratorSidecar(`${prose}\n\`\`\`json\n{"newTruths":[],"stateChanges":[]}\n\`\`\``, cs, { narrationId });
  const card = await postNarrationCard(text, { moveId: 'face_danger', outcome: 'weak_hit', _id: `res-${narrationId}` },
    cs, { playerText: 'I press on.', playerName: 'Kira', narrationId });
  card.timestamp ??= Date.now();
  syncChat();
  Hooks.call('createChatMessage', card, {}, 'gm-1');
  await ticks();
  return card;
}

/** Session 4 is played and ended, and the next world load mints session 5. */
async function sessionEndedAndTheNextMinted() {
  await narrate(stored(), 'nar-early', 'Kira digs through the rubble of the Bleakhold mine.');
  await ChatMessage.create({ content: 'We head back to the ship.', flags: {} });   // someone speaks
  syncChat();
  await applyEndSession({}, { local: true });
  await until(() => ChatMessage._created.some(m => m.flags?.[MODULE_ID]?.sessionVignetteCard));
  await ticks();
  syncChat();
  expect(sessionLogSummary()?.narrative, 'setup: End wrote the story so far').toBe(AT_END);
  const cs = { ...stored(), sessionEndedId: SESSION };
  expect(await rollSessionIfDue(cs), 'setup: the load mints the next session').toBe(true);
  game.settings._store.set(KEY, cs);
  await ticks();
  expect(stored().currentSessionId).not.toBe(SESSION);
  expect(stored().previousSessionSummary, 'setup: LAST SESSION as the mint kept it').toMatchObject({ sessionId: SESSION, sessionNumber: 4, text: AT_END });
}

/** A narration posted late into the ended session: LAST SESSION is brought up to date with it. */
async function lateNarrationJoinsLastSession() {
  replies.summary = WITH_LATE;
  const late = await narrate({ ...stored(), currentSessionId: SESSION, sessionNumber: 4 }, 'nar-late', 'The drones corner Kira in the vent.');
  expect(late.flags[MODULE_ID].sessionId, 'setup: filed under the ended session').toBe(SESSION);
  await until(() => stored().previousSessionSummary?.text === WITH_LATE);
  expect(stored().previousSessionSummary, 'setup: LAST SESSION tells the late narration').toMatchObject({ sessionId: SESSION, text: WITH_LATE });
  // End's story on the page was written before it: it tells it now too (issue #364
  // LATE-ROUND-NOT-IN-SESSION-LOG-STORY — End's story stood, without it).
  await until(() => sessionLogSummary()?.narrative === WITH_LATE);
  expect(sessionLogSummary()?.narrative).toBe(WITH_LATE);
  return late;
}

describe('issue #364 LATE-ROUND-NOT-IN-LAST-SESSION — an X-Card on a narration posted late into last session', () => {
  it('takes it out of LAST SESSION and off that session\'s Session Log story; both are made again from what remains', async () => {
    await sessionEndedAndTheNextMinted();
    const late = await lateNarrationJoinsLastSession();

    expect(await suppressScene({}, { local: true })).toBe(true);     // a player's X-Card, on the GM
    await ticks();

    expect(late.flags[MODULE_ID].xCarded, 'setup: the X-Card answered the late narration').toBe(true);
    expect(stored().previousSessionSummary.text, 'LAST SESSION no longer tells it').toBe('');
    expect(stored().unsummarisedSession, 'its session is owed its summary again').toMatchObject({ sessionId: SESSION, sessionNumber: 4 });
    expect(sessionLogSummary()?.narrative ?? '', 'nor does the page\'s story').toBe('');
    expect(sessionLogSummary()?.narrativeXCarded).toBe(true);

    // A GM resumes; the new session's next narration posts: the summary is made again from the cards that remain.
    game.settings._store.set(KEY, { ...stored(), xCardActive: false });
    replies.summary = AT_END;
    await narrate(stored(), 'nar-open', 'The Forge hums awake around the crew.');
    await until(() => !stored().unsummarisedSession);

    expect(stored().previousSessionSummary).toMatchObject({ sessionId: SESSION, sessionNumber: 4, text: AT_END });
    expect(sessionLogSummary()?.narrative).toBe(AT_END);
    expect(sessionLogSummary()?.narrativeXCarded).toBeUndefined();
  });

  it('played while LAST SESSION\'s new summary waits to be written: the summary made from the removed narration is not stored', async () => {
    await sessionEndedAndTheNextMinted();
    // The late narration posts; the summary's call is out …
    let answer;
    replies.summaryHeld = new Promise((resolve) => { answer = resolve; });
    replies.summary = WITH_LATE;
    const late = await narrate({ ...stored(), currentSessionId: SESSION, sessionNumber: 4 }, 'nar-late', 'The drones corner Kira in the vent.');
    expect(stored().unsummarisedSession, 'setup: last session is owed the late narration').toMatchObject({ sessionId: SESSION });
    // … and answers while another campaignState write holds the chain: its own write waits behind it.
    let letGo;
    const holding = serialiseCampaignStateWrite(() => new Promise((resolve) => { letGo = resolve; }), 'test: a write ahead of it');
    answer();
    replies.summaryHeld = null;
    await ticks();
    // The X-Card lands first (the pause jumps the chain) and removes the late narration.
    const played = suppressScene({}, { local: true });
    await ticks();
    letGo();
    await holding;
    expect(await played).toBe(true);
    await ticks();

    expect(late.flags[MODULE_ID].xCarded, 'setup: the X-Card answered the late narration').toBe(true);
    expect(stored().previousSessionSummary.text, 'the summary made from it was not stored').toBe(AT_END);
    expect(stored().unsummarisedSession, 'still owed: the next try makes it from what remains').toMatchObject({ sessionId: SESSION });

    game.settings._store.set(KEY, { ...stored(), xCardActive: false });
    replies.summary = AT_END;
    await narrate(stored(), 'nar-open', 'The Forge hums awake around the crew.');
    await until(() => !stored().unsummarisedSession);
    expect(stored().previousSessionSummary).toMatchObject({ sessionId: SESSION, text: AT_END });
  });

  it('control: an X-Card on a narration of the new session leaves LAST SESSION and the page\'s story as they are', async () => {
    await sessionEndedAndTheNextMinted();
    await lateNarrationJoinsLastSession();
    await ChatMessage.create({ content: 'Ready when you are.', flags: {} });   // someone speaks: a new beat
    syncChat();
    const opening = await narrate(stored(), 'nar-open', 'The Forge hums awake around the crew.');

    expect(await suppressScene({}, { local: true })).toBe(true);
    await ticks();

    expect(opening.flags[MODULE_ID].xCarded).toBe(true);
    expect(stored().previousSessionSummary).toMatchObject({ sessionId: SESSION, text: WITH_LATE });
    expect(stored().unsummarisedSession ?? null).toBeNull();
    expect(sessionLogSummary()?.narrative).toBe(WITH_LATE);
  });
});

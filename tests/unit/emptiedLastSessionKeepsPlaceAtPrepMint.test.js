/**
 * STARFORGED COMPANION
 * tests/unit/emptiedLastSessionKeepsPlaceAtPrepMint.test.js
 *
 * Issue #364 EMPTIED-LAST-SESSION-PREP-ONLY-MINT.
 *
 * An X-Card on a narration posted late into last session drops LAST
 * SESSION's own text and marks that session owed its summary
 * (dropLastSessionTelling, LATE-ROUND-NOT-IN-LAST-SESSION); the catch-up makes
 * it again from the cards that remain. When that catch-up failed and the
 * world was then opened only to prepare — a session nobody began, with a
 * summary of its own — the mint replaced LAST SESSION outright: mintSession
 * folded a session nobody began only onto text that was there (issue #331
 * X65). LAST SESSION then named the prep session, the mark was let go with
 * it, and the session the table last played was never told again.
 *
 * Now a mint folds onto a LAST SESSION whose session is still owed — its mark
 * names it — even when its own text is empty, so the owed session keeps its
 * place, its mark survives, and its catch-up writes its own text in front of
 * the fold. A mint with nothing owed is unchanged.
 *
 * The harness of tests/unit/lastSessionOwedSurvivesNextMint.test.js.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

const replies = vi.hoisted(() => ({ summary: '', vignette: '' }));
vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const model = String(body?.model ?? '');
    if (/haiku/.test(model)) return { content: [{ type: 'text', text: replies.summary }] };
    return { content: [{ type: 'text', text: replies.vignette }] };
  }),
}));

import { applyNarratorSidecar, postNarrationCard, registerRollingSummaryRefreshHook, catchUpUnsummarisedSession } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { applyEndSession } from '../../src/safety/sessionLifecycleDialogs.js';
import { rollSessionIfDue, mintSession } from '../../src/session/lifecycle.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-4';
const HOUR = 3_600_000;
const AT_END    = 'Kira dug through the rubble of the Bleakhold mine and left in silence.';
const WITH_LATE = 'Kira dug through the rubble of the Bleakhold mine; later the drones cornered her in the vent.';
const PREP = 'The crew drilled in the hold.';
const FOLD = `Narrated between sessions, while no session was begun: ${PREP}`;
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
});
afterEach(() => { journals.restore(); if (!hadCallAll) delete Hooks.callAll; });

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
  const cs = { ...stored(), sessionEndedId: SESSION };
  expect(await rollSessionIfDue(cs), 'setup: the load mints the next session').toBe(true);
  game.settings._store.set(KEY, cs);
  await ticks();
  expect(stored().previousSessionSummary, 'setup: LAST SESSION as the mint kept it').toMatchObject({ sessionId: SESSION, sessionNumber: 4, text: AT_END });
}

/**
 * A narration posted late into session 4 joins LAST SESSION; the X-Card takes
 * it back, emptying LAST SESSION's own text; and the catch-up that should make
 * it again from the cards that remain fails.
 */
async function lastSessionEmptiedAndItsCatchUpFailed() {
  await sessionEndedAndTheNextMinted();
  replies.summary = WITH_LATE;
  const late = await narrate({ ...stored(), currentSessionId: SESSION, sessionNumber: 4 }, 'nar-late', 'The drones corner Kira in the vent.');
  await until(() => stored().previousSessionSummary?.text === WITH_LATE);
  expect(await suppressScene({}, { local: true })).toBe(true);
  await ticks();
  expect(late.flags[MODULE_ID].xCarded, 'setup: the X-Card removed the late narration').toBe(true);
  expect(stored().previousSessionSummary.text, 'setup: … and emptied LAST SESSION').toBe('');
  replies.summary = '';                                           // the summary call fails
  expect(await catchUpUnsummarisedSession(), 'setup: the catch-up failed').toBe(false);
  expect(stored().unsummarisedSession, 'setup: last session is still owed its summary').toMatchObject({ sessionId: SESSION, sessionNumber: 4 });
}

/** The world was opened only to prepare: nobody began session 5, which has a summary of its own; the next load mints again. */
async function aPrepOnlySessionIsMintedOver() {
  game.settings._store.set(KEY, { ...stored(), xCardActive: false,
    sessionSummary: { sessionId: stored().currentSessionId, text: PREP, coveredCount: 0, updatedAt: new Date().toISOString() } });
  const cs = { ...stored() };
  expect(await rollSessionIfDue(cs, { now: Date.now() + 5 * HOUR }), 'setup: the idle session is closed out and the next minted').toBe(true);
  game.settings._store.set(KEY, cs);
  await ticks();
  expect(stored().sessionNumber, 'setup: nobody began session 5, so its number passes on').toBe(5);
}

describe('issue #364 EMPTIED-LAST-SESSION-PREP-ONLY-MINT — a mint folds a prep session onto an emptied LAST SESSION still owed', () => {
  it('the owed session keeps its place and its mark, and its catch-up writes its own text in front of the fold', async () => {
    await lastSessionEmptiedAndItsCatchUpFailed();

    await aPrepOnlySessionIsMintedOver();

    expect(stored().previousSessionSummary, 'LAST SESSION still names the session the table last played')
      .toMatchObject({ sessionId: SESSION, sessionNumber: 4, text: FOLD });
    expect(stored().unsummarisedSession, 'which is still owed its summary').toMatchObject({ sessionId: SESSION, sessionNumber: 4 });

    // The catch-up (index.js, after the mint) makes it from the cards that remain, and keeps the fold.
    replies.summary = AT_END;
    expect(await catchUpUnsummarisedSession()).toBe(true);
    expect(stored().previousSessionSummary).toMatchObject({ sessionId: SESSION, sessionNumber: 4, text: `${AT_END}\n\n${FOLD}` });
    expect(stored().unsummarisedSession ?? null).toBeNull();
  });

  it('a mint\'s record of a session whose round was left to be narrated, still owed, takes the fold the same way', () => {
    const older = { sessionId: 'sess-3', sessionNumber: 3, text: 'Summary: older.', updatedAt: null };
    const recorded = { sessionId: SESSION, sessionNumber: 4, text: '', updatedAt: null, displaced: older };
    const cs = mintSession({
      currentSessionId: 'prep', sessionNumber: 5, sessionActive: false, sessionStartedId: SESSION, sessionEndedId: null,
      sessionSummary: { sessionId: 'prep', text: PREP, updatedAt: null }, previousSessionSummary: recorded,
      unsummarisedSession: { sessionId: SESSION, sessionNumber: 4 },
    });
    expect(cs.previousSessionSummary, 'its place kept, the older record still behind it').toEqual({ ...recorded, text: FOLD });
  });
});

describe('issue #364 EMPTIED-LAST-SESSION-PREP-ONLY-MINT — a mint with nothing owed is unchanged', () => {
  const prep = (previousSessionSummary, unsummarisedSession = null) => mintSession({
    currentSessionId: 'prep', sessionNumber: 5, sessionActive: false, sessionStartedId: SESSION, sessionEndedId: null,
    sessionSummary: { sessionId: 'prep', text: PREP, updatedAt: null }, previousSessionSummary, unsummarisedSession,
  }).previousSessionSummary;

  it('a LAST SESSION with text takes the fold after its own text, as before', () => {
    const last = { sessionId: SESSION, sessionNumber: 4, text: AT_END, updatedAt: null };
    expect(prep(last)).toEqual({ ...last, text: `${AT_END}\n\n${FOLD}` });
  });

  it('an empty LAST SESSION nothing is owed is replaced by the prep session\'s summary, as before', () => {
    const last = { sessionId: SESSION, sessionNumber: 4, text: '', updatedAt: null };
    expect(prep(last)).toEqual({ sessionId: 'prep', sessionNumber: null, text: PREP, updatedAt: null });
    expect(prep(last, { sessionId: 'sess-2', sessionNumber: 2 }), 'a mark for another session').toEqual({ sessionId: 'prep', sessionNumber: null, text: PREP, updatedAt: null });
  });
});

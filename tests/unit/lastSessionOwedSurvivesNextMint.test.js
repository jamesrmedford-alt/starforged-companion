/**
 * STARFORGED COMPANION
 * tests/unit/lastSessionOwedSurvivesNextMint.test.js
 *
 * Issue #364 LAST-SESSION-OWED-LOST-AT-MINT.
 *
 * A session owed its LAST SESSION summary is marked on campaignState
 * (`unsummarisedSession`), and the canonical GM makes the summary from its
 * cards at the next narrator card, at a world load or when its key is set
 * (narrator.js catchUpUnsummarisedSession). Every mint replaced the mark with
 * the closing session's own (or none), so the summary was never made when the
 * next session was minted first — and the load's catch-up runs after the mint:
 *
 *   - an X-Card on a narration posted late into last session empties LAST
 *     SESSION's text and marks the session (LATE-ROUND-NOT-IN-LAST-SESSION);
 *     the table stops there, nothing else is narrated, and the next week's
 *     load mints the next session: LAST SESSION stayed empty for good;
 *   - a session a keyless GM closed out short, with a session nobody began
 *     after it.
 *
 * rollSessionIfDue now keeps the mark while LAST SESSION goes on naming the
 * marked session (the closing session left no summary of its own). A mark for
 * a session LAST SESSION does not name is let go, as before.
 *
 * The harness of tests/unit/sessionLogForgetsXCardedBeat.test.js.
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
import { rollSessionIfDue } from '../../src/session/lifecycle.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-4';
const HOUR = 3_600_000;
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
    // A place for End a Session's closing cutaway to show (issue #381 D6: with
    // nobody on record and nowhere to show, there is no closing).
    activeSectorId: 'sec-q', sectors: [{ id: 'sec-q', name: 'Quiet Reach', settlements: [{ id: 'st-q', name: 'Lantern Rest' }] }],
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

/** The world is loaded again after four idle hours: the load mints the next session, then runs the catch-up. */
async function theNextLoadMintsAgain() {
  const cs = { ...stored() };
  expect(await rollSessionIfDue(cs, { now: Date.now() + 5 * HOUR }), 'setup: the idle session is closed out and the next minted').toBe(true);
  game.settings._store.set(KEY, cs);
  await ticks();
  expect(stored().sessionNumber, 'setup: nobody began session 5, so its number passes on').toBe(5);
}

describe('issue #364 LAST-SESSION-OWED-LOST-AT-MINT — a session owed its LAST SESSION summary when the next session is minted', () => {
  it('an X-Card emptied LAST SESSION and nothing was narrated before the next load: the load still makes it again', async () => {
    await sessionEndedAndTheNextMinted();
    replies.summary = WITH_LATE;
    const late = await narrate({ ...stored(), currentSessionId: SESSION, sessionNumber: 4 }, 'nar-late', 'The drones corner Kira in the vent.');
    await until(() => stored().previousSessionSummary?.text === WITH_LATE);
    expect(await suppressScene({}, { local: true })).toBe(true);
    await ticks();
    expect(late.flags[MODULE_ID].xCarded, 'setup: the X-Card removed the late narration').toBe(true);
    expect(stored().previousSessionSummary.text, 'setup: … and emptied LAST SESSION').toBe('');
    expect(stored().unsummarisedSession, 'setup: last session is owed its summary').toMatchObject({ sessionId: SESSION, sessionNumber: 4 });

    // The table stops there. Next week's load closes out the session nobody began and mints the next …
    await theNextLoadMintsAgain();

    expect(stored().previousSessionSummary, 'LAST SESSION still names the session the table last played').toMatchObject({ sessionId: SESSION });
    expect(stored().unsummarisedSession, 'which is still owed its summary').toMatchObject({ sessionId: SESSION, sessionNumber: 4 });

    // … and its catch-up (index.js, after the mint) makes it from the cards that remain.
    replies.summary = AT_END;
    expect(await catchUpUnsummarisedSession()).toBe(true);
    expect(stored().previousSessionSummary).toMatchObject({ sessionId: SESSION, sessionNumber: 4, text: AT_END });
    expect(stored().unsummarisedSession ?? null).toBeNull();
  });

  it('control: a mark for a session LAST SESSION does not name is let go by the mint, as before', async () => {
    await sessionEndedAndTheNextMinted();
    game.settings._store.set(KEY, { ...stored(), unsummarisedSession: { sessionId: 'sess-2', sessionNumber: 2 } });

    await theNextLoadMintsAgain();

    expect(stored().previousSessionSummary).toMatchObject({ sessionId: SESSION, text: AT_END });
    expect(stored().unsummarisedSession ?? null).toBeNull();
  });
});

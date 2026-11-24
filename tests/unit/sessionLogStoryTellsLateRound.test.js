/**
 * STARFORGED COMPANION
 * tests/unit/sessionLogStoryTellsLateRound.test.js
 *
 * Issue #364 LATE-ROUND-NOT-IN-SESSION-LOG-STORY (found while fixing
 * LATE-ROUND-NOT-IN-LAST-SESSION and LATE-ROUND-NO-LAST-SESSION-RECORD).
 *
 * A Batch Mode round narrated after End a Session wrote its session's Session
 * Log page — and after the load minted the next session — keeps its own
 * session (ROUND-CARD-SESSION-ID-AFTER-MINT), and is summarised into LAST
 * SESSION (narrator.js bringLastSessionUpToDate → catchUpUnsummarisedSession).
 * The page's "Story so far" was written at End from the cards present then,
 * and the catch-up rewrote it only when an X-Card had emptied it
 * (worldJournal.js restoreSessionLogStory, `narrativeXCarded`): the round
 * never reached the page. Once a later mint moves LAST SESSION on, the world
 * snapshot's memory of that session is the page's story (worldSnapshot.js
 * memoryUnits) — told without the round.
 *
 * Now the catch-up also rewrites the page's story when it was written before
 * the newest narration the summary was made from (the page's
 * `summary.writtenAt` against that card's time), and stamps the rewrite, so a
 * later catch-up made from the same cards leaves the page alone.
 *
 * The harness of tests/unit/sessionLogStoryForgetsLateNarration.test.js (the
 * Session Log needs journals, which tests/helpers/multiClient.js does not
 * model): the real End a Session, mint and refresh hook on one GM client; the
 * late card is filed under the ended session, as a late round's card is.
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
import { applyEndSession } from '../../src/safety/sessionLifecycleDialogs.js';
import { JOURNAL_NAMES } from '../../src/world/worldJournal.js';
import { rollSessionIfDue } from '../../src/session/lifecycle.js';
import { collectWorldUnits } from '../../src/narration/worldSnapshot.js';
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
    // A place for End a Session's closing cutaway to show (issue #381 D6: with
    // nobody on record and nowhere to show, there is no closing).
    activeSectorId: 'sec-q', sectors: [{ id: 'sec-q', name: 'Quiet Reach', settlements: [{ id: 'st-q', name: 'Lantern Rest' }] }],
  });
  replies.summary  = AT_END;
  replies.vignette = 'On the quay, Vance mends a torn cargo net and hums.';
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

/** Session 4 is played and ended — End writes its Session Log story — and the next world load mints session 5. */
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
  expect(sessionLogSummary()?.narrative, 'setup: the mint left the page as End wrote it').toBe(AT_END);
}

/** A narration posted late into the ended session — a late round's card: LAST SESSION is brought up to date with it. */
async function lateNarration(narrationId, summary) {
  replies.summary = summary;
  const late = await narrate({ ...stored(), currentSessionId: SESSION, sessionNumber: 4 }, narrationId, 'The drones corner Kira in the vent.');
  expect(late.flags[MODULE_ID].sessionId, 'setup: filed under the ended session').toBe(SESSION);
  await until(() => stored().previousSessionSummary?.text === summary);
  expect(stored().previousSessionSummary, 'setup: LAST SESSION tells the late narration').toMatchObject({ sessionId: SESSION, text: summary });
  return late;
}

describe('issue #364 LATE-ROUND-SESSION-LOG-BEFORE-MINT — a narration posted after End a Session but before the next session is minted', () => {
  // Send now on a round of the ended session, before the next world load: the
  // session is still the current one, so its card is filed under it as an
  // ordinary card — the late-card catch-up never sees it. The mint's summary
  // tells it; the page's story is rebuilt from that summary when the story
  // was written before the newest card it tells.
  it('reaches the page\'s story at the mint', async () => {
    await narrate(stored(), 'nar-early', 'Kira digs through the rubble of the Bleakhold mine.');
    await ChatMessage.create({ content: 'We head back to the ship.', flags: {} });   // someone speaks
    syncChat();
    await applyEndSession({}, { local: true });
    await until(() => ChatMessage._created.some(m => m.flags?.[MODULE_ID]?.sessionVignetteCard));
    await ticks();
    syncChat();
    expect(sessionLogSummary()?.narrative, 'setup: End wrote the story so far').toBe(AT_END);

    await new Promise(r => setTimeout(r, 5));
    replies.summary = WITH_LATE;
    const late = await narrate(stored(), 'nar-late', 'The drones corner Kira in the vent.');
    expect(late.flags[MODULE_ID].sessionId, 'setup: filed under the session still current').toBe(SESSION);
    expect(stored().currentSessionId, 'setup: no mint yet').toBe(SESSION);

    const cs = { ...stored(), sessionEndedId: SESSION };
    expect(await rollSessionIfDue(cs), 'setup: the load mints the next session').toBe(true);
    game.settings._store.set(KEY, cs);
    await until(() => sessionLogSummary()?.narrative === WITH_LATE);
    const page = sessionLogSummary();
    expect(page.narrative, 'the story so far tells the narration posted before the mint').toBe(WITH_LATE);
    expect(Date.parse(page.writtenAt), 'stamped no earlier than the card it now tells').toBeGreaterThanOrEqual(late.timestamp);
  }, 20_000);

  it('control: with no narration after End, the mint leaves the page as End wrote it', async () => {
    await sessionEndedAndTheNextMinted();
    expect(sessionLogSummary()?.narrative).toBe(AT_END);
  }, 20_000);
});

describe('issue #364 LATE-ROUND-NOT-IN-SESSION-LOG-STORY — a narration posted late into the session End wrote the Session Log of', () => {
  it('reaches the page\'s story, which the snapshot tells once LAST SESSION has moved on', async () => {
    await sessionEndedAndTheNextMinted();
    const atEnd = sessionLogSummary();

    const late = await lateNarration('nar-late', WITH_LATE);
    await until(() => sessionLogSummary()?.narrative === WITH_LATE);

    const page = sessionLogSummary();
    expect(page.narrative, 'the story so far tells the late narration').toBe(WITH_LATE);
    expect(page.narrativeXCarded).toBeUndefined();
    expect(Date.parse(page.writtenAt), 'stamped no earlier than the card it now tells').toBeGreaterThanOrEqual(late.timestamp);
    expect(page.lore, 'the rest of End\'s summary stands').toEqual(atEnd.lore);
    expect(page.threats).toEqual(atEnd.threats);
    // The page's body is its rendered mirror.
    const body = journals.journals.get(JOURNAL_NAMES.sessionLog).pages.contents[0];
    expect(JSON.stringify(body.text ?? body)).toContain('the drones cornered her in the vent');

    // A later mint moves LAST SESSION on: the snapshot's memory of session 4 is the page's story.
    const movedOn = { ...stored(), currentSessionId: 'sess-6', previousSessionSummary: { sessionId: 'sess-5', sessionNumber: 5, text: 'Session five went quietly.' } };
    const memory = collectWorldUnits(movedOn).filter(u => u.section === 'memory').map(u => u.text).join('\n');
    expect(memory).toContain(`Session 4: ${WITH_LATE}`);
  }, 20_000);

  it('a later catch-up made from the same cards leaves the page alone; a later late card rewrites it again', async () => {
    await sessionEndedAndTheNextMinted();
    await lateNarration('nar-late', WITH_LATE);
    await until(() => sessionLogSummary()?.narrative === WITH_LATE);
    const rewritten = JSON.parse(JSON.stringify(sessionLogSummary()));

    // Session 4 owed again with no new card: its summary is made again, the page is not rewritten.
    replies.summary = 'Kira went to the mine; the drones found her there.';
    game.settings._store.set(KEY, { ...stored(), unsummarisedSession: { sessionId: SESSION, sessionNumber: 4 } });
    expect(await catchUpUnsummarisedSession()).toBe(true);
    expect(stored().previousSessionSummary.text, 'LAST SESSION was made again').toBe('Kira went to the mine; the drones found her there.');
    expect(sessionLogSummary(), 'never twice for the same card').toEqual(rewritten);

    // Another late narration: the page is brought up to date with it.
    await new Promise(r => setTimeout(r, 5));
    const SECOND = 'Kira dug through the mine, the drones cornered her, and she slipped away through the vent.';
    await lateNarration('nar-later', SECOND);
    await until(() => sessionLogSummary()?.narrative === SECOND);
    expect(sessionLogSummary().narrative).toBe(SECOND);
  }, 20_000);
});

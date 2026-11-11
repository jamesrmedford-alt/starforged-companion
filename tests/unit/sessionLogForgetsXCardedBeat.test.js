/**
 * STARFORGED COMPANION
 * tests/unit/sessionLogForgetsXCardedBeat.test.js
 *
 * Issue #345 AA27 XCARD-AFTER-END-SESSION-LOG-KEEPS-BEAT (SAFETY, journal) —
 * the twelfth audit's CONT-6 probe.
 *
 * End a Session writes the session's rolling summary and lore list onto the
 * World Journal's Session Log page (sessionLifecycleDialogs.js endSessionOnce
 * → worldJournal.js writeSessionLog: `flag.summary = { narrative:
 * sessionSummary.text, lore: [titles], … }`), then posts the closing vignette.
 * The table's X-Card answers that vignette and its beat — every narrator card
 * since the last message someone sent, within two minutes (narrator.js
 * xCardedNarrationCards) — so the session's last narration goes with it when
 * End was pressed from the Session panel (no chat line between). The X-Card
 * empties the campaignState summary that covered it (applyXCardToNarratorMemory;
 * Z41 rebuilds LAST SESSION from the remaining cards at the mint), and its undo
 * takes Session Log BEATS off the page by narration id (undoNarrationEntries)
 * — but nothing revisited the page's `summary`: the "Story so far" written at
 * End kept telling the removed beat, for good, and "Lore this session" kept
 * naming lore the X-Card retracted.
 *
 * Fixed: the X-Card's finish (safety.js finishXCardRemoval → worldJournal.js
 * retractSessionLogSummary) drops the page's story when the X-Card dropped the
 * summary it was written from, and takes retracted lore off its list.
 *
 * Controls: the X-Card did reach the campaignState summary (emptied); an
 * X-Card whose beat stops short of the summarised narration leaves the story.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const replies = vi.hoisted(() => ({ summary: '', vignette: '' }));
vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const model = String(body?.model ?? '');
    if (/haiku/.test(model)) return { content: [{ type: 'text', text: replies.summary }] };
    return { content: [{ type: 'text', text: replies.vignette }] };
  }),
}));

import { applyNarratorSidecar, postNarrationCard } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { applyEndSession } from '../../src/safety/sessionLifecycleDialogs.js';
import { JOURNAL_NAMES, recordLoreDiscovery } from '../../src/world/worldJournal.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-4';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };
const ticks = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 5)); };
/** Wait (≤ 3 s) until `fn()` is truthy. */
const until = async (fn) => { for (let i = 0; i < 300 && !fn(); i++) await new Promise(r => setTimeout(r, 10)); return fn(); };

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
  replies.summary  = 'Kira watched the small body go still beneath the collapsed bulkhead, and the crew left Bleakhold in silence.';
  replies.vignette = 'On the quay, Vance mends a torn cargo net and hums.';
});
afterEach(() => { journals.restore(); if (!hadCallAll) delete Hooks.callAll; });

/** The session's last narration — its card, as the narrator posts it. */
async function lastNarration() {
  const text = applyNarratorSidecar(
    'The small body lies still beneath the collapsed bulkhead.\n```json\n{"newTruths":[],"stateChanges":[]}\n```',
    stored(), { narrationId: 'nar-last' },
  );
  syncChat();
  await postNarrationCard(text, { moveId: 'face_danger', outcome: 'miss', _id: 'res-last' },
    stored(), { playerText: 'I dig through the rubble.', playerName: 'Kira', narrationId: 'nar-last' });
  syncChat();
}

const sessionLogSummary = () => {
  const page = journals.journals.get(JOURNAL_NAMES.sessionLog)?.pages.contents[0];
  return page?.flags?.[MODULE_ID]?.sessionLogPage?.summary ?? null;
};

describe("issue #345 AA27 — an X-Card played after End a Session takes the removed beat off the Session Log's summary", () => {
  it('the "Story so far" End wrote no longer tells the X-carded beat', async () => {
    await lastNarration();
    await applyEndSession({}, { local: true });          // the Session panel's End (the GM's handler)
    await until(() => ChatMessage._created.some(m => m.flags?.[MODULE_ID]?.sessionVignetteCard));
    await ticks();
    syncChat();
    expect(sessionLogSummary()?.narrative).toMatch(/small body/);              // setup: End wrote the story so far
    const vignette = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.sessionVignetteCard);
    expect(vignette).toBeDefined();                                             // setup: the closing vignette posted

    expect(await suppressScene({}, { local: true })).toBe(true);               // a player's X-Card, on the GM
    await ticks();
    expect(stored().xCardedNarrationIds).toEqual(expect.arrayContaining(['nar-last']));   // the beat reached back to it
    expect(stored().sessionSummary?.text ?? '').toBe('');                       // control: the summary store was emptied

    expect(sessionLogSummary()?.narrative ?? '').not.toMatch(/small body/);
  });
  it('"Lore this session" no longer names lore the removed narration recorded; lore that stands stays', async () => {
    await recordLoreDiscovery('The collapsed bulkhead', { text: 'The bulkhead came down on the child', confirmed: true, narratorAsserted: true, narrationId: 'nar-last' }, stored());
    await recordLoreDiscovery('Bleakhold', { text: 'A mining hold on the rim', confirmed: true }, stored());
    await lastNarration();
    await applyEndSession({}, { local: true });
    await until(() => ChatMessage._created.some(m => m.flags?.[MODULE_ID]?.sessionVignetteCard));
    await ticks();
    syncChat();
    expect(sessionLogSummary()?.lore).toEqual(['The collapsed bulkhead', 'Bleakhold']);   // setup: End listed both

    expect(await suppressScene({}, { local: true })).toBe(true);
    await ticks();
    expect(stored().xCardedNarrationIds).toEqual(expect.arrayContaining(['nar-last']));

    expect(sessionLogSummary()?.lore).toEqual(['Bleakhold']);
    expect(sessionLogSummary()?.narrative ?? '').not.toMatch(/small body/);
  });

  it('control: an X-Card whose beat stops short of the narration the story was written from leaves the story', async () => {
    await lastNarration();
    await ChatMessage.create({ content: 'We head back to the ship.', flags: {} });   // someone speaks: the next beat starts after it
    syncChat();
    await applyEndSession({}, { local: true });
    await until(() => ChatMessage._created.some(m => m.flags?.[MODULE_ID]?.sessionVignetteCard));
    await ticks();
    syncChat();
    expect(sessionLogSummary()?.narrative).toMatch(/small body/);

    expect(await suppressScene({}, { local: true })).toBe(true);   // it answers the closing vignette alone
    await ticks();
    expect(stored().xCardedNarrationIds ?? []).not.toContain('nar-last');
    expect(stored().sessionSummary?.text).toMatch(/small body/);       // the summary did not cover the vignette: kept

    expect(sessionLogSummary()?.narrative).toMatch(/small body/);
  });
});

// tests/unit/recap.test.js
// Coverage for the Previously On / recap feature:
//   postSessionRecap()           — src/narration/narrator.js (a view of the session record)
//   getCampaignRecap()           — src/narration/narrator.js (cache behaviour)
//   buildCampaignRecapUserMessage() — src/narration/narratorPrompt.js
//   isRecapCommand()             — src/index.js

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isRecapCommand } from '../../src/index.js';
import { postSessionRecap, getCampaignRecap, campaignRecapCacheKey } from '../../src/narration/narrator.js';
import { buildCampaignRecapUserMessage } from '../../src/narration/narratorPrompt.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { recordedEvent, seedSessionRecord } from '../helpers/sessionRecordSeed.js';
import {
  addChronicleEntry, getChronicleEntries, updateChronicleEntry,
  deleteChronicleEntry, setChronicleEntryPinned, setChronicleEntryType,
} from '../../src/character/chronicle.js';

const MODULE_ID = 'starforged-companion';

/**
 * A recap reply as the model is asked for it since issue #382 slice 2: cited
 * sentences. Its one sentence cites the source's first own note — every
 * Chronicle entry below is a player's (not the automatic scribe's), so the
 * recap is given it as THE PLAYERS' OWN NOTES, [note-1] first.
 */
const cited = (text, because = ['note-1']) => JSON.stringify({ paragraphs: [[{ text, because }]] });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCampaignState(overrides = {}) {
  return {
    currentSessionId:    'test-session',
    sessionNumber:       3,
    lastSessionTimestamp: null,
    campaignRecapCache: { text: '', generatedAt: null, chronicleLength: 0 },
    characterIds: [],
    connectionIds: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. (retired) isNewSessionStart() — the auto-recap follows the session the
//    world load starts since issue #342 D6: autoRecapFollowsSessionMint.test.js
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// 2. isRecapCommand()
// ---------------------------------------------------------------------------

describe('isRecapCommand()', () => {
  beforeEach(() => {
    // Set recapGmOnly = true (GM-only mode) in settings store
    game.settings._store.set(`${MODULE_ID}.recapGmOnly`, true);
  });

  afterEach(() => {
    game.settings._store.delete(`${MODULE_ID}.recapGmOnly`);
  });

  function makeMessage(content, isGM = true) {
    return {
      content,
      flags: {},
      author: { isGM },
    };
  }

  it('returns true for "!recap" from GM', () => {
    expect(isRecapCommand(makeMessage('!recap'))).toBe(true);
  });

  it('returns true for "!recap campaign" from GM', () => {
    expect(isRecapCommand(makeMessage('!recap campaign'))).toBe(true);
  });

  it('returns true for "!recap session" from GM', () => {
    expect(isRecapCommand(makeMessage('!recap session'))).toBe(true);
  });

  it('returns true for "!recap session 3" from GM', () => {
    expect(isRecapCommand(makeMessage('!recap session 3'))).toBe(true);
  });

  it('returns false for "!recap" from non-GM when recapGmOnly is true', () => {
    expect(isRecapCommand(makeMessage('!recap', false))).toBe(false);
  });

  it('returns false for plain narration', () => {
    expect(isRecapCommand(makeMessage('I strike at the enemy', true))).toBe(false);
  });

  it('returns false for already-flagged recap cards', () => {
    const msg = { content: '!recap', flags: { [MODULE_ID]: { recapCard: true } }, author: { isGM: true } };
    expect(isRecapCommand(msg)).toBe(false);
  });
});


// ---------------------------------------------------------------------------
// 3. postSessionRecap() — the `!recap session` card, a view of the session
//    record (issue #382 slice 5, record/sessionCardView.js). It read the
//    session's narrator cards in chat; it reads the moves the record holds —
//    seeded here on the session's page as rollMove records them
//    (tests/helpers/sessionRecordSeed.js). The real producer → card hop is
//    multiplayerComposition.test.js's; tests/unit/sessionCardView.test.js
//    has the corrections (a burn, an X-Card, a fallback) and `!recap session N`.
// ---------------------------------------------------------------------------

describe('postSessionRecap()', () => {
  let journals;
  beforeEach(() => {
    ChatMessage._reset();
    journals = installJournalMock();
    global.game.messages = { contents: [] };
  });
  afterEach(() => journals.restore());

  /** A session's rolled moves on its page — `[moveId, outcome, isMatch?]` each — and a telling of the first. */
  const recorded = (sessionId, moves, { number = 3, told = null } = {}) => seedSessionRecord(sessionId, [
    recordedEvent(sessionId, 'session.begun', { d: { number } }),
    ...moves.map(([moveId, outcome, isMatch = false], i) => recordedEvent(sessionId, 'move.resolved', {
      ref: { res: `res-${sessionId}-${i}` }, d: { moveId, outcome, isMatch, rollKind: 'action' } })),
    ...(told ? [recordedEvent(sessionId, 'narration', { ref: { nar: `nar-${sessionId}`, res: `res-${sessionId}-0` }, d: { mode: 'move' }, text: told })] : []),
  ], { number });

  it('posts an empty recap card when the session record holds no move', async () => {
    const state = makeCampaignState();
    await postSessionRecap(state);
    expect(ChatMessage._created).toHaveLength(1);
    expect(ChatMessage._created[0].content).toContain('sf-recap-session-card');
    expect(ChatMessage._created[0].content).toContain('No moves are recorded for this session.');
    expect(ChatMessage._created[0].flags[MODULE_ID]).toMatchObject({ recapEmpty: true, sessionNumber: 3 });
  });

  it('formats each move with its name and outcome', async () => {
    await recorded('test-session', [['face_danger', 'strong_hit']]);
    await postSessionRecap(makeCampaignState());
    const card = ChatMessage._created[0];
    expect(card.content).toContain('• Face Danger → Strong Hit');
  });

  it('quotes nothing of a narration — the chat holds the telling', async () => {
    await recorded('test-session', [['face_danger', 'strong_hit']], { told: 'You dodge the blast with ease. The corridor is clear.' });
    await postSessionRecap(makeCampaignState());
    const card = ChatMessage._created[0];
    expect(card.content).toContain('• Face Danger → Strong Hit');
    expect(card.content).not.toContain('You dodge the blast');
  });

  it('counts strong hits in the summary', async () => {
    await recorded('test-session', [['face_danger', 'strong_hit'], ['strike', 'strong_hit'], ['clash', 'miss']]);
    await postSessionRecap(makeCampaignState());
    const card = ChatMessage._created[0];
    expect(card.content).toContain('2 strong hits');
    expect(card.content).toContain('3 moves resolved');
  });

  // The match line read a narrator-card `isMatch` flag that no code wrote
  // (RECAP-MATCH-DEAD, issue #282). It is the roll's own now: rollMove
  // records the match on `move.resolved` (multiplayerComposition.test.js runs
  // the real pipeline to the card).
  it('notes a match rolled in the session — the roll\'s match, on the record', async () => {
    await recorded('test-session', [['face_danger', 'strong_hit', true], ['clash', 'miss', false]]);
    await postSessionRecap(makeCampaignState());
    expect(ChatMessage._created[0].content).toContain('A match was rolled — Face Danger.');
  });

  it('says nothing about a match when none was rolled', async () => {
    await recorded('test-session', [['clash', 'miss']]);
    await postSessionRecap(makeCampaignState());
    expect(ChatMessage._created[0].content).not.toContain('match');
  });

  it('filters by sessionId when provided', async () => {
    await recorded('session-a', [['face_danger', 'strong_hit']], { number: 2 });
    await recorded('session-b', [['strike', 'miss']], { number: 3 });
    const state = makeCampaignState({ currentSessionId: 'session-b' });
    await postSessionRecap(state, 'session-a');
    const card = ChatMessage._created[0];
    expect(card.content).toContain('Face Danger');
    expect(card.content).not.toContain('Strike');
    expect(card.flags[MODULE_ID]).toMatchObject({ sessionId: 'session-a', sessionNumber: 2 });
  });

  it('stamps recapCard and recapType flags on the posted card', async () => {
    await recorded('test-session', [['face_danger', 'strong_hit']]);
    await postSessionRecap(makeCampaignState());
    const card = ChatMessage._created[0];
    expect(card.flags?.[MODULE_ID]?.recapCard).toBe(true);
    expect(card.flags?.[MODULE_ID]?.recapType).toBe('session');
  });
});


// ---------------------------------------------------------------------------
// 4. getCampaignRecap() — cache behaviour
// ---------------------------------------------------------------------------

describe('getCampaignRecap() — cache', () => {
  beforeEach(() => {
    ChatMessage._reset();
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, '');
  });

  afterEach(() => {
    game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
  });

  it('returns empty string when no API key is configured', async () => {
    const state = makeCampaignState();
    const result = await getCampaignRecap(state);
    expect(result).toBe('');
  });

  it('returns cached text while the chronicle is unchanged', async () => {
    const state = makeCampaignState({
      campaignRecapCache: {
        text:            'Previously, in the void...',
        generatedAt:     new Date().toISOString(),
        ...(await campaignRecapCacheKey(makeCampaignState())),
      },
      characterIds: [],
    });
    const result = await getCampaignRecap(state);
    expect(result).toBe('Previously, in the void...');
  });

  it('bypasses cache when forceRefresh is true', async () => {
    // No API key — will return empty but the cache is ignored
    const state = makeCampaignState({
      campaignRecapCache: {
        text:            'Old cached text',
        generatedAt:     new Date().toISOString(),
        ...(await campaignRecapCacheKey(makeCampaignState())),
      },
    });
    const result = await getCampaignRecap(state, { forceRefresh: true });
    // No API key → returns '' not the cached text
    expect(result).toBe('');
  });

  it('ignores a cache made from another source (its sourceHash does not match)', async () => {
    const state = makeCampaignState({
      campaignRecapCache: {
        text:        'Stale cache',
        generatedAt: new Date().toISOString(),
        sourceHash:  'feedface',
      },
      characterIds: [],
    });
    // The source as it stands hashes otherwise: the cache is not used.
    const result = await getCampaignRecap(state);
    // No API key → '' (not the stale cache)
    expect(result).toBe('');
  });
});


// ---------------------------------------------------------------------------
// 4b. Regression — chronicle is actually read when characterIds is populated.
// Before the v1.2.3 fix, _getChronicleEntries treated characterIds as journal
// IDs (they are actor IDs). The recap card always rendered the empty-state
// HTML even when the chronicle had entries.
// ---------------------------------------------------------------------------

describe('getCampaignRecap() — populated chronicle (regression)', () => {
  // The setup.js makeTestActor + game.actors mock already gives us actor
  // lookup. We need to also install a journal mock so chronicle.js can find
  // "Chronicle — {actor.name}" by name and read its page flag.
  // Chain-friendly journal installer — keeps existing get/getName behaviour
  // and adds this journal on top. Tests can install one per PC.
  function installChronicleJournal(actorName, entries) {
    const flags = { 'starforged-companion': { chronicle: entries } };
    const page = {
      id:     `page-${actorName}`,
      name:   'Chronicle',
      flags,
      getFlag: (mod, key) => flags?.[mod]?.[key],
      setFlag: async (mod, key, val) => {
        flags[mod] = flags[mod] ?? {};
        flags[mod][key] = val;
      },
    };
    const journal = {
      id:    `journal-chronicle-${actorName}`,
      name:  `Chronicle — ${actorName}`,
      pages: { contents: [page] },
      flags: {},
    };
    const previousGet     = game.journal.get;
    const previousGetName = game.journal.getName;
    game.journal.get     = (id) => id === journal.id ? journal : previousGet(id);
    game.journal.getName = (n)  => n === journal.name ? journal : previousGetName(n);
    return {
      journal,
      restore() {
        game.journal.get     = previousGet;
        game.journal.getName = previousGetName;
      },
    };
  }

  beforeEach(() => {
    ChatMessage._reset();
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, '');
    game.actors._reset();
  });

  afterEach(() => {
    game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
    game.actors._reset();
  });

  it('a populated Chronicle reaches the source, so a cache made without it is not used', async () => {
    const actor = makeTestActor({ id: 'pc-1', name: 'Kira' });
    game.actors._set('pc-1', actor);
    // The key of the source as it was before the Chronicle could be read (the
    // v1.2.3 bug read none: its helper returned 0, and a cache for 0 passed).
    const unread = await campaignRecapCacheKey(makeCampaignState({ characterIds: ['pc-1'] }));
    const installed = installChronicleJournal('Kira', [
      { id: 'e1', timestamp: '2026-01-01T00:00:00Z', text: 'Set out from the station.' },
      { id: 'e2', timestamp: '2026-01-02T00:00:00Z', text: 'Found the derelict.' },
      { id: 'e3', timestamp: '2026-01-03T00:00:00Z', text: 'Lost the trail.' },
    ]);

    // No API key → getCampaignRecap returns '' even when the Chronicle is
    // populated. The entries are read into the source, so its hash moved and
    // the cache made without them is not used.
    const state = makeCampaignState({
      characterIds: ['pc-1'],
      campaignRecapCache: {
        text:        'Stale cache',
        generatedAt: new Date().toISOString(),
        ...unread,
      },
    });
    expect((await campaignRecapCacheKey(state)).sourceHash).not.toBe(unread.sourceHash);
    const result = await getCampaignRecap(state);
    // Were the Chronicle unread, the source would hash the same and the test
    // would receive 'Stale cache' verbatim: mismatch → no API key → ''.
    expect(result).not.toBe('Stale cache');
    expect(result).toBe('');
    installed.restore();
  });

  it('chronicle entries from multiple PCs are merged and sorted by timestamp', async () => {
    const a = makeTestActor({ id: 'pc-1', name: 'Kira' });
    const b = makeTestActor({ id: 'pc-2', name: 'Soren' });
    game.actors._set('pc-1', a);
    game.actors._set('pc-2', b);

    const installedA = installChronicleJournal('Kira',  [
      { id: 'k1', timestamp: '2026-01-01T00:00:00Z', text: 'Kira set out.' },
      { id: 'k2', timestamp: '2026-01-03T00:00:00Z', text: 'Kira found the wreck.' },
    ]);
    const installedB = installChronicleJournal('Soren', [
      { id: 's1', timestamp: '2026-01-02T00:00:00Z', text: 'Soren joined the crew.' },
    ]);

    // Set the api key so getCampaignRecap will reach the user-message builder.
    let captured = null;
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');

    // Stub fetch — capture the user message and return canned text.
    const origFetch = global.fetch;
    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      captured = body.messages?.[body.messages.length - 1]?.content;
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: 'text', text: cited('recap ok') }] }),
        text: async () => '',
      };
    });

    const state = makeCampaignState({ characterIds: ['pc-1', 'pc-2'] });
    const result = await getCampaignRecap(state);
    expect(result).toBe('recap ok');
    // The user message must include entries from BOTH PCs, sorted chronologically.
    expect(captured).toContain('Kira set out');
    expect(captured).toContain('Soren joined the crew');
    expect(captured).toContain('Kira found the wreck');
    // Soren's entry (2026-01-02) is between Kira's two (01-01 and 01-03).
    const kira1 = captured.indexOf('Kira set out');
    const soren = captured.indexOf('Soren joined');
    const kira2 = captured.indexOf('Kira found');
    expect(kira1).toBeLessThan(soren);
    expect(soren).toBeLessThan(kira2);

    global.fetch = origFetch;
    installedB.restore();
    installedA.restore();
  });

  // Regression for v1.2.10 → v1.2.12: campaignState.characterIds is never
  // populated by the module, so the recap reader must fall back to
  // actorBridge.getPlayerActors() — the same source the assembler uses.
  // Without this fallback, the recap card always shows "No campaign history
  // available yet" no matter how many chronicle entries have been written.
  it('falls back to player-owned Actors when characterIds is empty', async () => {
    const pc = makeTestActor({ id: 'pc-fallback-recap', name: 'Wren' });
    pc.hasPlayerOwner = true;
    game.actors._set(pc.id, pc);

    const installed = installChronicleJournal('Wren', [
      { id: 'w1', timestamp: '2026-02-01T00:00:00Z', text: 'Wren left Pol.' },
      { id: 'w2', timestamp: '2026-02-02T00:00:00Z', text: 'Wren hailed the Resolute.' },
    ]);

    let captured = null;
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    const origFetch = global.fetch;
    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      captured = body.messages?.[body.messages.length - 1]?.content;
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: 'text', text: cited('recap ok') }] }),
        text: async () => '',
      };
    });

    // characterIds intentionally left empty — mirrors the real-world bug.
    const state = makeCampaignState({ characterIds: [] });
    const result = await getCampaignRecap(state);
    expect(result).toBe('recap ok');
    expect(captured).toContain('Wren left Pol');
    expect(captured).toContain('Wren hailed the Resolute');

    global.fetch = origFetch;
    installed.restore();
  });
});


// ---------------------------------------------------------------------------
// 4c. Issue #301 B03 — characters who share a name each bring their own
// chronicle to the recap, once. The name lookup read the first "Chronicle —
// Ash" journal for both, so its entries reached the recap twice and the other
// character's not at all.
// ---------------------------------------------------------------------------

describe('getCampaignRecap() — same-named characters (issue #301 B03)', () => {
  let savedJournal, origFetch;

  function chronicleJournal(id, owner, entries) {
    const page = { name: 'Chronicle', flags: { [MODULE_ID]: { chronicle: entries } }, setFlag: async () => {} };
    return { id, name: 'Chronicle — Ash', flags: { [MODULE_ID]: { chronicleActorId: owner } }, pages: { contents: [page] } };
  }

  beforeEach(() => {
    ChatMessage._reset();
    game.actors._reset();
    savedJournal = game.journal;
    origFetch = global.fetch;
  });
  afterEach(() => {
    game.journal = savedJournal;
    global.fetch = origFetch;
    game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
    game.actors._reset();
  });

  it('each character\'s entries reach the recap once', async () => {
    game.actors._set('pc-a', makeTestActor({ id: 'pc-a', name: 'Ash' }));
    game.actors._set('pc-b', makeTestActor({ id: 'pc-b', name: 'Ash' }));
    const journals = [
      chronicleJournal('j-a', 'pc-a', [{ id: 'a1', timestamp: '2026-01-01T00:00:00Z', text: 'Ash A found a vault.' }]),
      chronicleJournal('j-b', 'pc-b', [{ id: 'b1', timestamp: '2026-01-02T00:00:00Z', text: 'Ash B met Sable.' }]),
    ];
    game.journal = {
      contents: journals,
      get: (id) => journals.find(j => j.id === id) ?? null,
      getName: (n) => journals.find(j => j.name === n) ?? null,
    };

    let captured = '';
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      captured = body.messages?.[body.messages.length - 1]?.content ?? '';
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: cited('recap ok') }] }), text: async () => '' };
    });

    const result = await getCampaignRecap(makeCampaignState({ characterIds: ['pc-a', 'pc-b'] }));
    expect(result).toBe('recap ok');
    expect(captured.split('Ash A found a vault.').length - 1).toBe(1);
    expect(captured.split('Ash B met Sable.').length - 1).toBe(1);
  });
});


// ---------------------------------------------------------------------------
// 4d. Issue #301 B04 — a recap cache is valid only for the chronicle it was
// made from. It was checked by entry count alone, so a correction that kept
// the count ("Vex died." → "Vex survived.") kept serving the old recap.
// ---------------------------------------------------------------------------

describe('getCampaignRecap() — the cache after a chronicle correction (issue #301 B04)', () => {
  let journals, savedJournal, savedCreate, origFetch, requests;
  const state = (overrides = {}) => makeCampaignState({ characterIds: ['pc-vex'], ...overrides });

  beforeEach(() => {
    ChatMessage._reset();
    game.actors._reset();
    game.actors._set('pc-vex', makeTestActor({ id: 'pc-vex', name: 'Vex' }));
    journals = [];
    savedJournal = game.journal;
    savedCreate  = JournalEntry.create;
    game.journal = {
      get contents() { return [...journals]; },
      get: (id) => journals.find(j => j.id === id) ?? null,
      getName: (n) => journals.find(j => j.name === n) ?? null,
    };
    JournalEntry.create = async (data) => {
      const page = { name: 'Chronicle', flags: { [MODULE_ID]: { chronicle: [] } },
        setFlag: async (mod, key, val) => { (page.flags[mod] ??= {})[key] = val; } };
      const journal = { id: `j-${journals.length + 1}`, name: data.name, flags: data.flags ?? {},
        pages: { contents: [page] }, createEmbeddedDocuments: async () => [] };
      journals.push(journal);
      return journal;
    };
    origFetch = global.fetch;
    requests = [];
    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      requests.push(body.messages?.[body.messages.length - 1]?.content ?? '');
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: cited('Fresh recap.') }] }), text: async () => '' };
    });
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, '');
    game.settings._store.delete(`${MODULE_ID}.campaignState`);
  });
  afterEach(() => {
    game.journal = savedJournal;
    JournalEntry.create = savedCreate;
    global.fetch = origFetch;
    game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
    game.settings._store.delete(`${MODULE_ID}.campaignState`);
    game.actors._reset();
  });

  /** A cache made from the chronicle as it stands now. */
  const cacheOf = async (text) => ({ text, generatedAt: null, ...(await campaignRecapCacheKey(state())) });

  it('an in-place correction invalidates it — and with no key, no stale recap is returned', async () => {
    await addChronicleEntry('pc-vex', { text: 'Vex died.' });
    const withCache = state({ campaignRecapCache: await cacheOf('Vex died.') });
    expect(await getCampaignRecap(withCache)).toBe('Vex died.');

    const [entry] = await getChronicleEntries('pc-vex');
    await updateChronicleEntry('pc-vex', entry.id, 'Vex survived.');
    expect((await getChronicleEntries('pc-vex'))[0].text).toBe('Vex survived.');
    expect(await getCampaignRecap(withCache)).toBe('');
  });

  it('a same-count replacement — the wrong entry deleted, the right one added — invalidates it', async () => {
    await addChronicleEntry('pc-vex', { text: 'Vex died.' });
    const withCache = state({ campaignRecapCache: await cacheOf('Vex died.') });
    const [wrong] = await getChronicleEntries('pc-vex');
    await deleteChronicleEntry('pc-vex', wrong.id);
    await addChronicleEntry('pc-vex', { text: 'Vex survived.' });
    expect(await getChronicleEntries('pc-vex')).toHaveLength(1);
    expect(await getCampaignRecap(withCache)).toBe('');
  });

  it('with a key, the recap is regenerated from the corrected chronicle, and that cache is then reused', async () => {
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    await addChronicleEntry('pc-vex', { text: 'Vex died.' });
    const withCache = state({ campaignRecapCache: await cacheOf('Vex died.') });
    const [entry] = await getChronicleEntries('pc-vex');
    await updateChronicleEntry('pc-vex', entry.id, 'Vex survived.');

    expect(await getCampaignRecap(withCache)).toBe('Fresh recap.');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain('Vex survived.');
    expect(requests[0]).not.toContain('Vex died.');

    const stored = game.settings.get(MODULE_ID, 'campaignState');
    expect(await getCampaignRecap(stored)).toBe('Fresh recap.');
    expect(requests).toHaveLength(1);                     // the regenerated cache is current
  });

  it('an unchanged chronicle reuses the cache without a Claude call', async () => {
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    await addChronicleEntry('pc-vex', { text: 'Vex died.' });
    expect(await getCampaignRecap(state({ campaignRecapCache: await cacheOf('Cached recap.') }))).toBe('Cached recap.');
    expect(requests).toHaveLength(0);
  });

  it('pinning or re-typing an entry keeps the recap — neither is in it', async () => {
    await addChronicleEntry('pc-vex', { type: 'annotation', text: 'Vex died.' });
    const withCache = state({ campaignRecapCache: await cacheOf('Cached recap.') });
    const [entry] = await getChronicleEntries('pc-vex');
    await setChronicleEntryPinned('pc-vex', entry.id, true);
    await setChronicleEntryType('pc-vex', entry.id, 'scar');
    expect(await getCampaignRecap(withCache)).toBe('Cached recap.');
  });

  it('forceRefresh regenerates even a current recap', async () => {
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    await addChronicleEntry('pc-vex', { text: 'Vex died.' });
    const withCache = state({ campaignRecapCache: await cacheOf('Cached recap.') });
    expect(await getCampaignRecap(withCache, { forceRefresh: true })).toBe('Fresh recap.');
    expect(requests).toHaveLength(1);
  });

  it('a cache from before the hash existed is regenerated once, even with a matching count', async () => {
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    await addChronicleEntry('pc-vex', { text: 'Vex died.' });
    const legacy = state({ campaignRecapCache: { text: 'Old recap.', generatedAt: null, chronicleLength: 1 } });
    expect(await getCampaignRecap(legacy)).toBe('Fresh recap.');
    expect(requests).toHaveLength(1);
  });
});


// ---------------------------------------------------------------------------
// 5. buildCampaignRecapUserMessage()
// ---------------------------------------------------------------------------

describe('buildCampaignRecapUserMessage()', () => {
  const source = { text: '## THE RECORD\n\n### Session 1 — the latest session, in full\n[s1-1] Kira — the player wrote “We set out from the station.”' };

  it('carries the record\'s source as it was built', () => {
    expect(buildCampaignRecapUserMessage(source)).toContain('[s1-1] Kira — the player wrote “We set out from the station.”');
  });

  it('contains the recap instructions', () => {
    const msg = buildCampaignRecapUserMessage(source);
    expect(msg).toContain('3–5 paragraphs');
    expect(msg).toContain('vows sworn');
    expect(msg).toContain('second person');
    expect(msg).toContain('Every beat marked LASTING is told');
  });

  it('asks for cited sentences, and says a sentence that rests on nothing is left out (decision D11)', () => {
    const msg = buildCampaignRecapUserMessage(source);
    expect(msg).toMatch(/Reply with JSON only: \{"paragraphs": \[\[\{"text": "<one sentence>", "because": \["<id>", …\]\}/);
    expect(msg).toMatch(/A sentence that rests on no line given above is left out of the recap/);
    expect(msg).not.toContain('CAMPAIGN CHRONICLE');
  });
});

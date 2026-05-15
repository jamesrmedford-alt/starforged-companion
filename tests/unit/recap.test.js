// tests/unit/recap.test.js
// Coverage for the Previously On / recap feature:
//   postSessionRecap()           — src/narration/narrator.js
//   isNewSessionStart()          — src/index.js
//   getCampaignRecap()           — src/narration/narrator.js (cache behaviour)
//   buildCampaignRecapUserMessage() — src/narration/narratorPrompt.js
//   isRecapCommand()             — src/index.js

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isNewSessionStart, isRecapCommand } from '../../src/index.js';
import { postSessionRecap, getCampaignRecap } from '../../src/narration/narrator.js';
import { buildCampaignRecapUserMessage } from '../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hoursAgo(n) {
  return new Date(Date.now() - n * 3_600_000).toISOString();
}

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

function makeNarratorCard(overrides = {}) {
  return {
    flags: {
      [MODULE_ID]: {
        narratorCard:  true,
        narrationText: overrides.narrationText ?? 'The ship shuddered.',
        sessionId:     overrides.sessionId     ?? 'test-session',
        sessionNumber: overrides.sessionNumber ?? 3,
        moveId:        overrides.moveId        ?? 'face_danger',
        outcome:       overrides.outcome       ?? 'strong_hit',
        isMatch:       overrides.isMatch       ?? false,
        timestamp:     new Date().toISOString(),
        ...overrides.extraFlags,
      },
    },
    content: overrides.content ?? '',
  };
}

// ---------------------------------------------------------------------------
// 1. isNewSessionStart()
// ---------------------------------------------------------------------------

describe('isNewSessionStart()', () => {
  it('returns false when lastSessionTimestamp is null', () => {
    const state = makeCampaignState({ lastSessionTimestamp: null });
    expect(isNewSessionStart(state, 4)).toBe(false);
  });

  it('returns false when gap is less than the threshold', () => {
    const state = makeCampaignState({ lastSessionTimestamp: hoursAgo(2) });
    expect(isNewSessionStart(state, 4)).toBe(false);
  });

  it('returns true when gap exceeds the threshold', () => {
    const state = makeCampaignState({ lastSessionTimestamp: hoursAgo(5) });
    expect(isNewSessionStart(state, 4)).toBe(true);
  });

  it('returns false when gap equals the threshold exactly', () => {
    vi.useFakeTimers();
    const now = Date.now();
    const state = makeCampaignState({
      lastSessionTimestamp: new Date(now - 4 * 3_600_000).toISOString(),
    });
    expect(isNewSessionStart(state, 4)).toBe(false);
    vi.useRealTimers();
  });

  it('respects a custom threshold', () => {
    const state = makeCampaignState({ lastSessionTimestamp: hoursAgo(3) });
    expect(isNewSessionStart(state, 2)).toBe(true);
    expect(isNewSessionStart(state, 4)).toBe(false);
  });
});


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
// 3. postSessionRecap() — data assembly
// ---------------------------------------------------------------------------

describe('postSessionRecap()', () => {
  beforeEach(() => {
    ChatMessage._reset();
  });

  it('posts an empty recap card when no messages match the session', async () => {
    global.game.messages = { contents: [] };
    const state = makeCampaignState();
    await postSessionRecap(state);
    expect(ChatMessage._created).toHaveLength(1);
    expect(ChatMessage._created[0].content).toContain('sf-recap-session-card');
    expect(ChatMessage._created[0].content).toContain('No narrated moves');
  });

  it('formats move cards with name and outcome', async () => {
    global.game.messages = {
      contents: [
        makeNarratorCard({ moveId: 'face_danger', outcome: 'strong_hit', narrationText: 'You dodge the blast with ease.' }),
      ],
    };
    const state = makeCampaignState();
    await postSessionRecap(state);
    const card = ChatMessage._created[0];
    expect(card.content).toContain('Face Danger');
    expect(card.content).toContain('Strong Hit');
  });

  it('extracts the first sentence from narration text', async () => {
    global.game.messages = {
      contents: [
        makeNarratorCard({
          narrationText: 'You dodge the blast with ease. The corridor is clear.',
          outcome: 'strong_hit',
          moveId: 'face_danger',
        }),
      ],
    };
    const state = makeCampaignState();
    await postSessionRecap(state);
    const card = ChatMessage._created[0];
    expect(card.content).toContain('You dodge the blast with ease');
    expect(card.content).not.toContain('The corridor is clear');
  });

  it('counts strong hits in the summary', async () => {
    global.game.messages = {
      contents: [
        makeNarratorCard({ outcome: 'strong_hit', moveId: 'face_danger' }),
        makeNarratorCard({ outcome: 'strong_hit', moveId: 'strike' }),
        makeNarratorCard({ outcome: 'miss',        moveId: 'clash' }),
      ],
    };
    const state = makeCampaignState();
    await postSessionRecap(state);
    const card = ChatMessage._created[0];
    expect(card.content).toContain('2 strong hits');
    expect(card.content).toContain('3 moves resolved');
  });

  it('notes match rolls when present', async () => {
    global.game.messages = {
      contents: [
        makeNarratorCard({ outcome: 'strong_hit', moveId: 'face_danger', isMatch: true }),
      ],
    };
    const state = makeCampaignState();
    await postSessionRecap(state);
    const card = ChatMessage._created[0];
    expect(card.content).toContain('match');
  });

  it('filters by sessionId when provided', async () => {
    global.game.messages = {
      contents: [
        makeNarratorCard({ sessionId: 'session-a', moveId: 'face_danger', outcome: 'strong_hit' }),
        makeNarratorCard({ sessionId: 'session-b', moveId: 'strike',      outcome: 'miss' }),
      ],
    };
    const state = makeCampaignState({ currentSessionId: 'session-a' });
    await postSessionRecap(state, 'session-a');
    const card = ChatMessage._created[0];
    expect(card.content).toContain('Face Danger');
    expect(card.content).not.toContain('Strike');
  });

  it('stamps recapCard and recapType flags on the posted card', async () => {
    global.game.messages = {
      contents: [makeNarratorCard()],
    };
    const state = makeCampaignState();
    await postSessionRecap(state);
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

  it('returns cached text when chronicle length is unchanged', async () => {
    const state = makeCampaignState({
      campaignRecapCache: {
        text:            'Previously, in the void...',
        generatedAt:     new Date().toISOString(),
        chronicleLength: 0,
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
        chronicleLength: 0,
      },
    });
    const result = await getCampaignRecap(state, { forceRefresh: true });
    // No API key → returns '' not the cached text
    expect(result).toBe('');
  });

  it('ignores cache when chronicle has grown (chronicleLength mismatch)', async () => {
    const state = makeCampaignState({
      campaignRecapCache: {
        text:            'Stale cache',
        generatedAt:     new Date().toISOString(),
        chronicleLength: 5,
      },
      characterIds: [],
    });
    // chronicle length is 0 (no character journal) — different from cached 5
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

  it('_getChronicleLength returns the entry count when chronicle is populated', async () => {
    const actor = makeTestActor({ id: 'pc-1', name: 'Kira' });
    game.actors._set('pc-1', actor);
    const installed = installChronicleJournal('Kira', [
      { id: 'e1', timestamp: '2026-01-01T00:00:00Z', text: 'Set out from the station.' },
      { id: 'e2', timestamp: '2026-01-02T00:00:00Z', text: 'Found the derelict.' },
      { id: 'e3', timestamp: '2026-01-03T00:00:00Z', text: 'Lost the trail.' },
    ]);

    // No API key → getCampaignRecap returns '' even when chronicle is
    // populated, but the chronicleLength mismatch should bypass the cached
    // 'Stale cache' string. This shape of test would have caught the bug:
    // the broken helper returned 0, so the cache was treated as fresh.
    const state = makeCampaignState({
      characterIds: ['pc-1'],
      campaignRecapCache: {
        text:            'Stale cache',
        generatedAt:     new Date().toISOString(),
        chronicleLength: 0,   // pre-fix the helper would return 0 too — match
      },
    });
    const result = await getCampaignRecap(state);
    // With the bug, chronicleLength would equal cache.chronicleLength (both 0)
    // and the test would receive 'Stale cache' verbatim. With the fix, the
    // chronicle has 3 entries → mismatch → no API key → '' (not the stale text).
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
        json: async () => ({ content: [{ type: 'text', text: 'recap ok' }] }),
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
        json: async () => ({ content: [{ type: 'text', text: 'recap ok' }] }),
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
// 5. buildCampaignRecapUserMessage()
// ---------------------------------------------------------------------------

describe('buildCampaignRecapUserMessage()', () => {
  it('includes all chronicle entries in the user message', () => {
    const entries = [
      '[Session 1 — Jan 1]\nWe set out from the station.',
      '[Session 2 — Jan 8]\nWe found the derelict.',
    ];
    const msg = buildCampaignRecapUserMessage(entries);
    expect(msg).toContain('We set out from the station');
    expect(msg).toContain('We found the derelict');
  });

  it('contains the recap instructions', () => {
    const msg = buildCampaignRecapUserMessage(['One entry.']);
    expect(msg).toContain('3–5 paragraphs');
    expect(msg).toContain('vows sworn');
    expect(msg).toContain('second person');
  });

  it('includes the campaign chronicle header', () => {
    const msg = buildCampaignRecapUserMessage(['entry']);
    expect(msg).toContain('CAMPAIGN CHRONICLE');
  });
});

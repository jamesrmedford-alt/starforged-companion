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

// tests/unit/sceneInterrogation.test.js
// Coverage for scene interrogation feature:
//   isSceneQuery()               — src/index.js (exported for testing)
//   buildSceneUserMessage()      — src/narration/narratorPrompt.js
//   getRecentNarrationContext()  — src/narration/narrator.js

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isSceneQuery } from '../../src/index.js';
import { buildSceneUserMessage } from '../../src/narration/narratorPrompt.js';
import { getRecentNarrationContext } from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides = {}) {
  return {
    content: overrides.content ?? '',
    type:    overrides.type    ?? 'base',
    flags:   overrides.flags   ?? {},
    author:  overrides.author  ?? { isGM: false },
    user:    overrides.user    ?? null,
  };
}

// ---------------------------------------------------------------------------
// 1. isSceneQuery()
// ---------------------------------------------------------------------------

describe('isSceneQuery()', () => {
  it('returns true for "@scene what do I see?"', () => {
    const msg = makeMessage({ content: '@scene what do I see?' });
    expect(isSceneQuery(msg)).toBe(true);
  });

  it('returns true for "@Scene" — case-insensitive prefix', () => {
    const msg = makeMessage({ content: '@Scene Is anyone watching?' });
    expect(isSceneQuery(msg)).toBe(true);
  });

  it('returns true for "@SCENE" in all caps', () => {
    const msg = makeMessage({ content: '@SCENE what does the hull look like?' });
    expect(isSceneQuery(msg)).toBe(true);
  });

  it('returns false for plain player narration', () => {
    const msg = makeMessage({ content: 'I face the danger and strike.' });
    expect(isSceneQuery(msg)).toBe(false);
  });

  it('returns false for messages already flagged as sceneResponse', () => {
    const msg = makeMessage({
      content: '@scene anything',
      flags:   { [MODULE_ID]: { sceneResponse: true } },
    });
    expect(isSceneQuery(msg)).toBe(false);
  });

  it('returns true for GM @scene messages', () => {
    const msg = makeMessage({
      content: '@scene what lurks here?',
      author:  { isGM: true },
    });
    expect(isSceneQuery(msg)).toBe(true);
  });

  it('returns false for "@" messages that are not "@scene"', () => {
    const msg = makeMessage({ content: '@other command' });
    expect(isSceneQuery(msg)).toBe(false);
  });

  it('returns false for empty content', () => {
    const msg = makeMessage({ content: '' });
    expect(isSceneQuery(msg)).toBe(false);
  });

  it('resolves author via game.users fallback when message.author is null', () => {
    const originalUsers = game.users;
    game.users = { get: () => ({ isGM: false }) };
    const msg = makeMessage({ content: '@scene anything', author: null, user: 'u1' });
    expect(isSceneQuery(msg)).toBe(true);
    game.users = originalUsers;
  });

  it('treats message as non-GM when author is missing and no user found', () => {
    const originalUsers = game.users;
    game.users = { get: () => null };
    const msg = makeMessage({ content: '@scene anything', author: null, user: null });
    expect(isSceneQuery(msg)).toBe(true);
    game.users = originalUsers;
  });
});

// ---------------------------------------------------------------------------
// 2. buildSceneUserMessage()
// ---------------------------------------------------------------------------

describe('buildSceneUserMessage()', () => {
  it('includes the player question in the output', () => {
    const out = buildSceneUserMessage('What does the anomaly look like?', '', 2);
    expect(out).toContain('What does the anomaly look like?');
  });

  it('strips leading/trailing whitespace from the question', () => {
    const out = buildSceneUserMessage('  What lurks here?  ', '', 2);
    expect(out).toContain('"What lurks here?"');
  });

  it('includes the constraint instruction', () => {
    const out = buildSceneUserMessage('Anything?', '', 2);
    expect(out).toContain('Do not introduce new plot elements');
  });

  it('includes sentence count in instruction', () => {
    const out = buildSceneUserMessage('Anything?', '', 3);
    expect(out).toContain('3–4 sentences');
  });

  it('includes recent context when provided', () => {
    const ctx = 'The station groaned under the stellar wind.';
    const out = buildSceneUserMessage('What do I see?', ctx, 2);
    expect(out).toContain('RECENT SCENE');
    expect(out).toContain(ctx);
  });

  it('omits the RECENT SCENE section when context is empty', () => {
    const out = buildSceneUserMessage('What do I see?', '', 2);
    expect(out).not.toContain('RECENT SCENE');
  });

  it('omits the RECENT SCENE section when context is whitespace only', () => {
    const out = buildSceneUserMessage('What do I see?', '   ', 2);
    expect(out).not.toContain('RECENT SCENE');
  });

  it('includes PLAYER QUESTION heading', () => {
    const out = buildSceneUserMessage('Anything?', '', 2);
    expect(out).toContain('PLAYER QUESTION');
  });

  it('returns a non-empty string', () => {
    const out = buildSceneUserMessage('question', '', 2);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. getRecentNarrationContext()
// ---------------------------------------------------------------------------

describe('getRecentNarrationContext()', () => {
  const SESSION_A = 'session-a';
  const SESSION_B = 'session-b';

  function makeNarrationMessage(narrationText, sessionId) {
    return {
      flags: {
        [MODULE_ID]: {
          narratorCard:  true,
          narrationText,
          sessionId,
        },
      },
    };
  }

  beforeEach(() => {
    game.messages = { contents: [] };
  });

  afterEach(() => {
    delete game.messages;
  });

  it('returns empty string when no messages exist', () => {
    const result = getRecentNarrationContext(SESSION_A);
    expect(result).toBe('');
  });

  it('returns narration text from matching session', () => {
    game.messages.contents = [
      makeNarrationMessage('First narration.', SESSION_A),
    ];
    const result = getRecentNarrationContext(SESSION_A);
    expect(result).toBe('First narration.');
  });

  it('excludes cards from other sessions', () => {
    game.messages.contents = [
      makeNarrationMessage('Session A narration.', SESSION_A),
      makeNarrationMessage('Session B narration.', SESSION_B),
    ];
    const result = getRecentNarrationContext(SESSION_A);
    expect(result).toBe('Session A narration.');
    expect(result).not.toContain('Session B');
  });

  it('limits results to the specified count', () => {
    game.messages.contents = [
      makeNarrationMessage('First.', SESSION_A),
      makeNarrationMessage('Second.', SESSION_A),
      makeNarrationMessage('Third.', SESSION_A),
      makeNarrationMessage('Fourth.', SESSION_A),
    ];
    const result = getRecentNarrationContext(SESSION_A, 2);
    expect(result).toContain('Third.');
    expect(result).toContain('Fourth.');
    expect(result).not.toContain('First.');
    expect(result).not.toContain('Second.');
  });

  it('joins multiple cards with double newline', () => {
    game.messages.contents = [
      makeNarrationMessage('One.', SESSION_A),
      makeNarrationMessage('Two.', SESSION_A),
    ];
    const result = getRecentNarrationContext(SESSION_A);
    expect(result).toBe('One.\n\nTwo.');
  });

  it('filters out messages with missing narrationText', () => {
    game.messages.contents = [
      { flags: { [MODULE_ID]: { narratorCard: true, narrationText: null, sessionId: SESSION_A } } },
      makeNarrationMessage('Valid.', SESSION_A),
    ];
    const result = getRecentNarrationContext(SESSION_A);
    expect(result).toBe('Valid.');
  });

  it('returns empty string when game.messages is undefined', () => {
    delete game.messages;
    const result = getRecentNarrationContext(SESSION_A);
    expect(result).toBe('');
  });

  it('returns empty string for a session with no narration cards', () => {
    game.messages.contents = [
      { flags: { [MODULE_ID]: { narratorCard: false, narrationText: 'x', sessionId: SESSION_A } } },
    ];
    const result = getRecentNarrationContext(SESSION_A);
    expect(result).toBe('');
  });
});

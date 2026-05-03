/**
 * STARFORGED COMPANION
 * tests/unit/isPlayerNarration.test.js
 *
 * Unit tests for the chat-message filter functions in src/index.js:
 * isPlayerNarration, isSceneQuery, isRecapCommand.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isPlayerNarration,
  isSceneQuery,
  isRecapCommand,
} from '../../src/index.js';

const MODULE_ID = 'starforged-companion';


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMessage(overrides = {}) {
  return {
    type:    'ic',
    content: 'I walk to the edge of the cliff and look down.',
    author:  { isGM: false, id: 'player-1' },
    flags:   {},
    ...overrides,
  };
}

beforeEach(() => {
  // Default: recapGmOnly true (matches the getRecapGmOnly() default).
  game.settings._store.set(`${MODULE_ID}.recapGmOnly`, true);
});


// ─────────────────────────────────────────────────────────────────────────────
// isPlayerNarration()
// ─────────────────────────────────────────────────────────────────────────────

describe('isPlayerNarration()', () => {
  it('returns false for GM messages', () => {
    const msg = makeMessage({ author: { isGM: true } });
    expect(isPlayerNarration(msg)).toBe(false);
  });

  it('returns false for OOC messages (type "ooc")', () => {
    const msg = makeMessage({ type: 'ooc' });
    expect(isPlayerNarration(msg)).toBe(false);
  });

  it('returns false for roll messages (type "roll")', () => {
    const msg = makeMessage({ type: 'roll' });
    expect(isPlayerNarration(msg)).toBe(false);
  });

  it('returns false for messages starting with "@"', () => {
    const msg = makeMessage({ content: '@scene what do I see here?' });
    expect(isPlayerNarration(msg)).toBe(false);
  });

  it('returns false for messages starting with "!"', () => {
    const msg = makeMessage({ content: '!recap please summarise' });
    expect(isPlayerNarration(msg)).toBe(false);
  });

  it('returns false for messages starting with "\\"', () => {
    const msg = makeMessage({ content: '\\This is escaped narration.' });
    expect(isPlayerNarration(msg)).toBe(false);
  });

  it('returns false for messages with moveResolution flag', () => {
    const msg = makeMessage({ flags: { [MODULE_ID]: { moveResolution: true } } });
    expect(isPlayerNarration(msg)).toBe(false);
  });

  it('returns false for messages with narrationCard flag', () => {
    const msg = makeMessage({ flags: { [MODULE_ID]: { narrationCard: true } } });
    expect(isPlayerNarration(msg)).toBe(false);
  });

  it('returns false for messages with sceneResponse flag', () => {
    const msg = makeMessage({ flags: { [MODULE_ID]: { sceneResponse: true } } });
    expect(isPlayerNarration(msg)).toBe(false);
  });

  it('returns false for messages with xcardCard flag', () => {
    const msg = makeMessage({ flags: { [MODULE_ID]: { xcardCard: true } } });
    expect(isPlayerNarration(msg)).toBe(false);
  });

  it('returns false for messages with recapCard flag', () => {
    const msg = makeMessage({ flags: { [MODULE_ID]: { recapCard: true } } });
    expect(isPlayerNarration(msg)).toBe(false);
  });

  it('returns false for messages shorter than 10 characters', () => {
    const msg = makeMessage({ content: 'short' });
    expect(isPlayerNarration(msg)).toBe(false);
  });

  it('returns true for normal player narration', () => {
    const msg = makeMessage({
      content: 'I draw my blade and step toward the alien.',
    });
    expect(isPlayerNarration(msg)).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// isSceneQuery()
// ─────────────────────────────────────────────────────────────────────────────

describe('isSceneQuery()', () => {
  it('returns true for "@scene what do I see?" from non-GM', () => {
    const msg = makeMessage({
      content: '@scene what do I see?',
      author:  { isGM: false },
    });
    expect(isSceneQuery(msg)).toBe(true);
  });

  it('returns false for "@scene" from GM', () => {
    const msg = makeMessage({
      content: '@scene what do I see?',
      author:  { isGM: true },
    });
    expect(isSceneQuery(msg)).toBe(false);
  });

  it('returns false for messages without @scene prefix', () => {
    const msg = makeMessage({ content: 'I look around the chamber.' });
    expect(isSceneQuery(msg)).toBe(false);
  });

  it('returns false for messages with sceneResponse flag', () => {
    const msg = makeMessage({
      content: '@scene what do I see?',
      flags:   { [MODULE_ID]: { sceneResponse: true } },
    });
    expect(isSceneQuery(msg)).toBe(false);
  });

  it('case-insensitive match on @scene prefix', () => {
    const msg = makeMessage({
      content: '@SCENE describe the room',
      author:  { isGM: false },
    });
    expect(isSceneQuery(msg)).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// isRecapCommand()
// ─────────────────────────────────────────────────────────────────────────────

describe('isRecapCommand()', () => {
  it('returns true for "!recap" from GM when recapGmOnly is true', () => {
    game.settings._store.set(`${MODULE_ID}.recapGmOnly`, true);
    const msg = makeMessage({
      content: '!recap',
      author:  { isGM: true },
    });
    expect(isRecapCommand(msg)).toBe(true);
  });

  it('returns false for "!recap" from non-GM when recapGmOnly is true', () => {
    game.settings._store.set(`${MODULE_ID}.recapGmOnly`, true);
    const msg = makeMessage({
      content: '!recap',
      author:  { isGM: false },
    });
    expect(isRecapCommand(msg)).toBe(false);
  });

  it('returns true for "!recap" from non-GM when recapGmOnly is false', () => {
    game.settings._store.set(`${MODULE_ID}.recapGmOnly`, false);
    const msg = makeMessage({
      content: '!recap',
      author:  { isGM: false },
    });
    expect(isRecapCommand(msg)).toBe(true);
  });

  it('returns false for messages not starting with "!recap"', () => {
    const msg = makeMessage({
      content: 'I recap the events of last session.',
      author:  { isGM: true },
    });
    expect(isRecapCommand(msg)).toBe(false);
  });

  it('returns false for messages with recapCard flag', () => {
    game.settings._store.set(`${MODULE_ID}.recapGmOnly`, true);
    const msg = makeMessage({
      content: '!recap',
      author:  { isGM: true },
      flags:   { [MODULE_ID]: { recapCard: true } },
    });
    expect(isRecapCommand(msg)).toBe(false);
  });
});

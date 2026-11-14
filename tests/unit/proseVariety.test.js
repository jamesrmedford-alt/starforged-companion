/**
 * STARFORGED COMPANION
 * tests/unit/proseVariety.test.js
 *
 * Issue #354 P2-20, P2-22, P2-27 (the alpha 23 playtest, part 2) — the pure
 * half: a length is a word budget, the comparisons recent narrations made are
 * pulled out to be listed, and each beat is given a shape the beat before it
 * did not have.
 */

import { describe, it, expect } from 'vitest';
import {
  lengthBudget, lengthPhrase, sentenceRule,
  extractComparisons, recentImages, IMAGES_LISTED_MAX,
  BEAT_SHAPES, pickBeatShape,
} from '../../src/narration/proseVariety.js';

describe('P2-20 — a length is a word budget with a sentence cap', () => {
  it('Length 3 is about 65 words, never more than 85, in at most 5 sentences', () => {
    expect(lengthBudget(3)).toMatchObject({ steps: 3, words: 65, maxWords: 85, maxSentences: 5, sentenceWords: 30, audio: false });
    expect(lengthPhrase(3)).toBe('about 65 words — never more than 85 — in at most 5 sentences');
  });

  it('the budget grows with the setting, and Length 1 is a single short passage', () => {
    expect(lengthBudget(1)).toMatchObject({ words: 20, maxWords: 30, maxSentences: 2 });
    expect(lengthBudget(6)).toMatchObject({ words: 130, maxWords: 170, maxSentences: 9 });
    for (let n = 1; n < 6; n += 1) expect(lengthBudget(n + 1).words).toBeGreaterThan(lengthBudget(n).words);
    expect(lengthPhrase(1)).toContain('in at most 2 sentences');
  });

  it('a missing or junk setting is Length 3', () => {
    expect(lengthBudget(undefined).steps).toBe(3);
    expect(lengthBudget('abc').steps).toBe(3);
    expect(lengthBudget(0).steps).toBe(3);
  });

  it('read aloud, the sentences are shorter — the budget is the same', () => {
    expect(lengthBudget(3, { audio: true })).toMatchObject({ words: 65, maxWords: 85, sentenceWords: 18, audio: true });
    expect(sentenceRule(3, { audio: true })).toMatch(/read aloud/);
    expect(sentenceRule(3, { audio: true })).toMatch(/none over about 18 words/);
    expect(sentenceRule(3)).toMatch(/none over about 30 words/);
    expect(sentenceRule(3)).not.toMatch(/read aloud/);
    expect(sentenceRule(3)).toMatch(/Never stack clauses/);
  });
});

describe('P2-22 / P2-27 — the comparisons a narration made', () => {
  // The playtest's own.
  const PROSE = [
    'The escort takes Isaac\'s offer the way a tide takes a pebble.',
    'Its voice tests the name as though it were a coin of unfamiliar mint, and Archer exhales like a swimmer surfacing.',
    'The pulse lands on the board before her voice does.',
  ].join(' ');

  it('pulls out "the way a…", "as though…" and "like a…" comparisons, in order', () => {
    expect(extractComparisons(PROSE)).toEqual([
      'the way a tide takes a pebble',
      'as though it were a coin of unfamiliar mint',
      'like a swimmer surfacing',
    ]);
  });

  it('stops at the end of the clause and clips a long one', () => {
    const [one] = extractComparisons('It moved like a customs officer who has already stamped the passport in his head and is only waiting for the queue to notice, and then it stopped.');
    expect(one.startsWith('like a customs officer who has already stamped')).toBe(true);
    expect(one.endsWith('…')).toBe(true);
    expect(one.split(' ').length).toBe(12);
    // A clause ends at its full stop: the next sentence is no part of it.
    expect(extractComparisons('He nods like a man caught out. She waits.')).toEqual(['like a man caught out']);
  });

  it('plain prose has none, and neither has "like the others"', () => {
    expect(extractComparisons('Karthik thumbs the key. The channel opens. "Savela, respond."')).toEqual([]);
    expect(extractComparisons('She is like the others.')).toEqual([]);
    expect(extractComparisons('')).toEqual([]);
    expect(extractComparisons(null)).toEqual([]);
  });

  it('markup and emphasis marks are not part of an image', () => {
    expect(extractComparisons('<npc>"It hums *like a hive* at dusk,"</npc> she says.')).toEqual(['like a hive at dusk']);
  });

  it('recentImages: the newest narration first, each image once, capped', () => {
    const usher = 'It waits the way an usher waits for a latecomer.';
    const images = recentImages([
      'The hull ticks like a clock running down.',
      usher,
      'Nothing here.',
      `${usher} And again it settles, as if the question had weight.`,
    ]);
    expect(images).toEqual([
      'the way an usher waits for a latecomer',
      'as if the question had weight',
      'like a clock running down',
    ]);
    const many = Array.from({ length: 30 }, (_, i) => `It leans in like a creditor number ${i} at the door.`);
    expect(recentImages(many, { cards: 30 })).toHaveLength(IMAGES_LISTED_MAX);
  });

  it('recentImages reads only the last few narrations, and tolerates junk', () => {
    const old = 'It circled like a gull over a trawler.';
    const texts = [old, 'One.', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.'];
    expect(recentImages(texts)).toEqual([]);
    expect(recentImages(texts, { cards: 7 })).toEqual(['like a gull over a trawler']);
    expect(recentImages(null)).toEqual([]);
    expect(recentImages([null, 5, ''])).toEqual([]);
  });
});

describe('P2-27 — a shape for each beat', () => {
  it('two beats in a row never share a shape, whatever the session', () => {
    for (const seed of ['sess-1', 'sess-2', 'another', null, '']) {
      for (let i = 0; i < 40; i += 1) {
        expect(pickBeatShape({ beatIndex: i, seed }).id, `${seed} beat ${i}`).not.toBe(pickBeatShape({ beatIndex: i + 1, seed }).id);
      }
    }
  });

  it('every shape comes round before any repeats', () => {
    const ids = Array.from({ length: BEAT_SHAPES.length }, (_, i) => pickBeatShape({ beatIndex: i, seed: 'sess-1' }).id);
    expect(new Set(ids).size).toBe(BEAT_SHAPES.length);
  });

  it('the same beat of the same session always gets the same shape (nothing is stored)', () => {
    expect(pickBeatShape({ beatIndex: 7, seed: 'sess-9' })).toBe(pickBeatShape({ beatIndex: 7, seed: 'sess-9' }));
    expect(pickBeatShape().hint).toBeTruthy();
    expect(pickBeatShape({ beatIndex: -3, seed: 'x' })).toBe(pickBeatShape({ beatIndex: 0, seed: 'x' }));
  });

  it('each shape is a hint the narrator can read', () => {
    for (const shape of BEAT_SHAPES) {
      expect(shape.id).toMatch(/^[a-z]+$/);
      expect(shape.hint.length).toBeGreaterThan(20);
    }
  });
});

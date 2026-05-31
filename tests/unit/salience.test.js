// tests/unit/salience.test.js
// Pure-logic coverage for src/world/salience.js — the per-channel capture gate.
// No Foundry mechanics; getSalienceThreshold reads the global game.settings stub.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SALIENCE_TIERS,
  DEFAULT_THRESHOLD,
  SALIENCE_SETTING_KEYS,
  normalizeSalience,
  passesSalience,
  getSalienceThreshold,
} from '../../src/world/salience.js';

const MODULE_ID = 'starforged-companion';


describe('normalizeSalience', () => {
  it('accepts each known tier', () => {
    for (const tier of SALIENCE_TIERS) {
      expect(normalizeSalience(tier)).toBe(tier);
    }
  });

  it('lowercases and trims', () => {
    expect(normalizeSalience('  Significant ')).toBe('significant');
    expect(normalizeSalience('DEFINING')).toBe('defining');
  });

  it('returns null for unknown strings, non-strings, and blanks', () => {
    expect(normalizeSalience('epic')).toBeNull();
    expect(normalizeSalience('')).toBeNull();
    expect(normalizeSalience(undefined)).toBeNull();
    expect(normalizeSalience(null)).toBeNull();
    expect(normalizeSalience(3)).toBeNull();
    expect(normalizeSalience({})).toBeNull();
  });
});


describe('passesSalience', () => {
  it('passes when the item tier equals the threshold (inclusive floor)', () => {
    expect(passesSalience('significant', 'significant')).toBe(true);
  });

  it('passes when the item tier is above the threshold', () => {
    expect(passesSalience('defining', 'significant')).toBe(true);
  });

  it('drops when the item tier is below the threshold', () => {
    expect(passesSalience('scene', 'significant')).toBe(false);
    expect(passesSalience('notable', 'significant')).toBe(false);
    expect(passesSalience('trivial', 'defining')).toBe(false);
  });

  it('fails open when the item salience is absent or unrecognised', () => {
    expect(passesSalience(undefined, 'significant')).toBe(true);
    expect(passesSalience(null, 'defining')).toBe(true);
    expect(passesSalience('bogus', 'defining')).toBe(true);
    expect(passesSalience(42, 'defining')).toBe(true);
  });

  it('defaults an invalid or absent threshold to "significant"', () => {
    expect(passesSalience('notable', undefined)).toBe(false);
    expect(passesSalience('notable', 'nonsense')).toBe(false);
    expect(passesSalience('significant', undefined)).toBe(true);
  });

  it('a "trivial" floor records everything (no filtering)', () => {
    for (const tier of SALIENCE_TIERS) {
      expect(passesSalience(tier, 'trivial')).toBe(true);
    }
  });
});


describe('getSalienceThreshold', () => {
  beforeEach(() => {
    game.settings._store.clear();
  });

  it('maps each channel to its setting key', () => {
    expect(SALIENCE_SETTING_KEYS).toEqual({
      lore:      'loreSalienceThreshold',
      threats:   'threatSalienceThreshold',
      chronicle: 'chronicleSalienceThreshold',
    });
  });

  it('reads the configured tier for a channel', () => {
    game.settings._store.set(`${MODULE_ID}.loreSalienceThreshold`, 'notable');
    expect(getSalienceThreshold('lore')).toBe('notable');
  });

  it('falls back to the default when the setting is unset', () => {
    expect(getSalienceThreshold('threats')).toBe(DEFAULT_THRESHOLD);
  });

  it('falls back to the default when the stored value is invalid', () => {
    game.settings._store.set(`${MODULE_ID}.chronicleSalienceThreshold`, 'epic');
    expect(getSalienceThreshold('chronicle')).toBe(DEFAULT_THRESHOLD);
  });

  it('returns the default for an unknown channel', () => {
    expect(getSalienceThreshold('bogus')).toBe(DEFAULT_THRESHOLD);
  });
});

// tests/unit/i18n.test.js
// Phase 2 — foundry-ironsworn localisation wrapper.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  localizeStat,
  localizeMeter,
  localizeDebility,
  localizeMove,
  _resetI18nWarnGuard,
} from '../../src/system/i18n.js';

describe('Phase 2 — i18n wrapper', () => {
  let originalI18n;

  beforeEach(() => {
    _resetI18nWarnGuard();
    originalI18n = global.game.i18n;
  });

  afterEach(() => {
    global.game.i18n = originalI18n;
  });

  it('localizeStat returns English fallback when game.i18n is unavailable', () => {
    global.game.i18n = undefined;
    expect(localizeStat('edge')).toBe('Edge');
    expect(localizeStat('heart')).toBe('Heart');
    expect(localizeStat('wits')).toBe('Wits');
  });

  it('localizeStat returns localised string when i18n.localize resolves it', () => {
    global.game.i18n = {
      localize: (key) => key === 'IRONSWORN.Edge' ? 'Tranchant' : key,
    };
    expect(localizeStat('edge')).toBe('Tranchant');
  });

  it('localizeStat falls back to English when i18n.localize echoes the key (missing translation)', () => {
    global.game.i18n = { localize: (key) => key };
    expect(localizeStat('edge')).toBe('Edge');
  });

  it('localizeMeter resolves all four meter slugs', () => {
    global.game.i18n = undefined;
    expect(localizeMeter('health')).toBe('Health');
    expect(localizeMeter('spirit')).toBe('Spirit');
    expect(localizeMeter('supply')).toBe('Supply');
    expect(localizeMeter('momentum')).toBe('Momentum');
  });

  it('localizeDebility resolves common slugs', () => {
    global.game.i18n = undefined;
    expect(localizeDebility('wounded')).toBe('Wounded');
    expect(localizeDebility('battered')).toBe('Battered');
    expect(localizeDebility('permanentlyharmed')).toBe('Permanently Harmed');
  });

  it('localizeMove resolves a Starforged move slug', () => {
    global.game.i18n = undefined;
    expect(localizeMove('pay_the_price')).toBe('Pay the Price');
    expect(localizeMove('face_danger')).toBe('Face Danger');
  });

  it('returns the slug for unknown keys (does not throw)', () => {
    expect(localizeStat('nonexistent')).toBe('nonexistent');
    const warns = getCapturedWarns();
    expect(warns.some(w => /unknown stat slug "nonexistent"/.test(w))).toBe(true);
  });
});

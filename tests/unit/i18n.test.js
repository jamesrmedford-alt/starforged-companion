// tests/unit/i18n.test.js
// Phase 2 — foundry-ironsworn localisation wrapper.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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

// Issue #342 Z70 (I18N-DEBILITY-KEYS-UNRESOLVED): the key maps claim to be
// "verified against vendor/foundry-ironsworn/system/lang/en.json", and the
// stat and meter keys are; every debility key was IRONSWORN.<Name>, which no
// language file of the vendored system ships (it names them
// IRONSWORN.IMPACT.* / IRONSWORN.DEBILITY.*), so localizeDebility always fell
// back to English — "marked Wounded" beside the system's own French sheet.
// This check fails the day a vendor bump renames a key.
// Read from the vendored submodule: skipped where it isn't checked out (as the
// other vendored-data checks are), so the rest of this file still runs.
const VENDOR_LANG = 'vendor/foundry-ironsworn/system/lang';
const vendored = existsSync(`${VENDOR_LANG}/en.json`);

describe.skipIf(!vendored)('the key maps name strings the vendored system ships', () => {
  const flat = (obj, prefix = '', out = {}) => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object') flat(v, key, out); else out[key] = v;
    }
    return out;
  };
  const lang = (code) => flat(JSON.parse(readFileSync(`${VENDOR_LANG}/${code}.json`, 'utf8')));
  /** The `{ key: "IRONSWORN.…" }` entries of one of i18n.js's tables. */
  const tableKeys = (name) => {
    const src = readFileSync('src/system/i18n.js', 'utf8');
    const block = src.split(`const ${name} = {`)[1]?.split('\n};')[0] ?? '';
    return [...block.matchAll(/(\w+):\s*\{\s*key:\s*"([^"]+)"/g)].map(m => ({ slug: m[1], key: m[2] }));
  };
  const en = vendored ? lang('en') : {};
  let originalI18n;
  beforeEach(() => { _resetI18nWarnGuard(); originalI18n = global.game.i18n; });
  afterEach(() => { global.game.i18n = originalI18n; });

  it('control: the stat and meter keys name strings the system ships', () => {
    const keys = [...tableKeys('STAT_KEYS'), ...tableKeys('METER_KEYS')];
    expect(keys.length).toBe(9);
    expect(keys.filter(({ key }) => typeof en[key] !== 'string')).toEqual([]);
    expect(lang('fr')['IRONSWORN.Edge']).toBe('Vivacité');
  });

  it('every debility key names a string the system ships', () => {
    const keys = tableKeys('DEBILITY_KEYS');
    expect(keys.length).toBe(13);
    expect(keys.filter(({ key }) => typeof en[key] !== 'string').map(k => k.key)).toEqual([]);
  });

  it('a debility follows Foundry\'s language — the system\'s own word for it', () => {
    const fr = lang('fr');
    global.game.i18n = { localize: (key) => fr[key] ?? key };
    expect(localizeDebility('wounded')).toBe('blessé');
    expect(localizeDebility('battered')).toBe(fr['IRONSWORN.IMPACT.Battered']);
    expect(localizeDebility('permanentlyharmed')).toBe(fr['IRONSWORN.IMPACT.Permanentlyharmed']);
    global.game.i18n = { localize: (key) => en[key] ?? key };
    expect(localizeDebility('wounded')).toBe('wounded');   // the system's own (lowercase) string
  });
});

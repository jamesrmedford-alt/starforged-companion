/**
 * UI-7 I18N-DEBILITY-KEYS-UNRESOLVED (eleventh audit, ui).
 *
 * src/system/i18n.js maps the module's slugs to foundry-ironsworn's
 * localisation keys — "KEY MAPS (verified against
 * vendor/foundry-ironsworn/system/lang/en.json keys …)" — so labels follow
 * Foundry's language ("free localisation in cs/de/es/fr/pl"). Its stat and
 * meter keys exist (`IRONSWORN.Edge`, `IRONSWORN.Health`). Its debility keys
 * do not: `IRONSWORN.Wounded`, `IRONSWORN.Battered`, … are in no language
 * file of the vendored system, which names them `IRONSWORN.DEBILITY.*`
 * (conditions, banes, burdens) and `IRONSWORN.IMPACT.*`. So
 * `localizeDebility` can never localise: the suffer card's "marked Wounded"
 * stays English at a French, Spanish, Polish or Czech table, where the
 * system's own sheet says "blessé", "herido", "zraniony", "zraněný/á".
 *
 * Correct: every debility key names a string the system ships (the same
 * check the stat and meter keys pass).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const VENDOR_LANG = 'vendor/foundry-ironsworn/system/lang';
function flat(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flat(v, key, out); else out[key] = v;
  }
  return out;
}
const lang = (code) => flat(JSON.parse(readFileSync(`${VENDOR_LANG}/${code}.json`, 'utf8')));

/** The `{ key: "IRONSWORN.…" }` entries of one of i18n.js's tables. */
function tableKeys(name) {
  const src = readFileSync('src/system/i18n.js', 'utf8');
  const block = src.split(`const ${name} = {`)[1]?.split('\n};')[0] ?? '';
  return [...block.matchAll(/(\w+):\s*\{\s*key:\s*"([^"]+)"/g)].map(m => ({ slug: m[1], key: m[2] }));
}

describe('UI-7: i18n.js keys against the vendored system\'s language files', () => {
  const en = lang('en');

  it('control: the stat and meter keys name strings the system ships', () => {
    const keys = [...tableKeys('STAT_KEYS'), ...tableKeys('METER_KEYS')];
    expect(keys.length).toBe(9);
    expect(keys.filter(({ key }) => typeof en[key] !== 'string')).toEqual([]);
    expect(lang('fr')['IRONSWORN.Edge']).toBe('Vivacité');
  });

  it('control: the system does ship the debilities — under DEBILITY / IMPACT', () => {
    expect(en['IRONSWORN.DEBILITY.Wounded']).toBe('wounded');
    expect(lang('fr')['IRONSWORN.DEBILITY.Wounded']).toBe('blessé');
    expect(en['IRONSWORN.IMPACT.Battered']).toBe('battered');
  });

  it('every debility key names a string the system ships', () => {
    const keys = tableKeys('DEBILITY_KEYS');
    expect(keys.length).toBe(13);
    expect(keys.filter(({ key }) => typeof en[key] !== 'string').map(k => k.key)).toEqual([]);
  });
});

// STARFORGED COMPANION
// tests/unit/settingsReferenceCoverage.test.js
//
// The help's Settings Reference documents every setting Foundry's Configure
// Settings dialog shows (issue #331 X60).
//
// The page opens with the "Configure Settings → Starforged Companion" table —
// the settings registered `config: true`, which Foundry lists in its own
// dialog. Two had no row: "Combat Tracker Integration" (world, default on —
// opens a Foundry combat tracker on Enter the Fray) appeared nowhere in the
// help but a Changelog bullet, and "Auto-apply asset consequence riders" was
// the known RIDERS-SETTING-UNDOCUMENTED. The sweep is mechanical — every
// `config: true` setting in the source must have a row — the converse of
// issue #322 V06 (every documented setting is reachable).

import { describe, it, expect } from 'vitest';
import { PAGES } from '../../src/help/helpJournal.js';
import { productionSources } from '../helpers/sourceScan.js';

/** The registered display names of every `config: true` setting (what Foundry's Configure Settings lists). */
function configTrueNames() {
  const names = [];
  for (const { file, code } of productionSources()) {
    for (const m of code.matchAll(/settings\.register\(\s*MODULE_ID,\s*[^,]+,\s*\{[\s\S]*?\n\s*\}\);/g)) {
      if (!/config:\s*true/.test(m[0])) continue;
      const name = m[0].match(/name:\s*["'`]([^"'`]+)/)?.[1];
      names.push(name ?? `(unnamed, ${file})`);
    }
  }
  return names;
}

const reference = () => (PAGES.find(p => p.name === 'Settings Reference')?.text?.content ?? '').replace(/&[a-z#0-9]+;/gi, ' ');
/** The Configure Settings table — the page's first table, before the Companion Settings panel's. */
const configureTable = () => reference().split('Companion Settings Panel')[0];

describe('the Settings Reference documents every Configure Settings entry (issue #331 X60)', () => {
  it('control: the sweep finds the registry\'s Configure Settings entries', () => {
    const names = configTrueNames();
    for (const n of ['Combat Tracker Integration', 'Auto-apply asset consequence riders', 'Layout', 'Push-to-Talk', 'Auto-Seed Starship Details']) {
      expect(names, n).toContain(n);
    }
    expect(names.length).toBeGreaterThanOrEqual(14);
  });

  it('every config: true setting has a row in the Configure Settings table', () => {
    const table = configureTable();
    expect(configTrueNames().filter(n => !table.includes(`<strong>${n}</strong>`))).toEqual([]);
  });

  it('the two rows it lacked give the default and the scope', () => {
    const table = configureTable();
    for (const n of ['Combat Tracker Integration', 'Auto-apply asset consequence riders']) {
      const row = table.split('<tr>').find(r => r.includes(`<strong>${n}</strong>`)) ?? '';
      expect(row, n).toMatch(/Default: on\./);
      expect(row, n).toMatch(/<td>World<\/td>/);
    }
  });
});

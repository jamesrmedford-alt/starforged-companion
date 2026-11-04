/**
 * PROBE — UI-05 CONFIG-SETTING-UNDOCUMENTED (DOC-DRIFT)
 * (src/moves/combatTracker.js:319–328 registerCombatTrackerSettings —
 *  "Combat Tracker Integration", config: true, world, default on;
 *  src/index.js:435–439 "Auto-apply asset consequence riders" — the known
 *  RIDERS-SETTING-UNDOCUMENTED; src/help/helpJournal.js Settings Reference)
 *
 * What the user does: a GM opens the help's Settings Reference — whose first
 * table is "Configure Settings → Starforged Companion", the settings that
 * appear in Foundry's own Configure Settings dialog — to learn what each
 * switch does and its default, or to find the switch that opens a Foundry
 * combat tracker on Enter the Fray.
 *
 * What happens: fourteen settings are registered `config: true`; the table
 * documents twelve. "Combat Tracker Integration" (world, default on: "Open a
 * Foundry combat tracker when Enter the Fray fires. Position and range badges
 * replace the initiative display") appears nowhere in the help but a
 * Changelog bullet; "Auto-apply asset consequence riders" is the known
 * RIDERS-SETTING-UNDOCUMENTED bullet (known-issues.md, issue #315 section).
 * The Settings Reference is the help's contract for the registry (#322 V06
 * made every documented setting reachable; this is the converse).
 *
 * What should happen: every setting Foundry's Configure Settings shows has a
 * row in the Settings Reference's Configure Settings table, with its default.
 *
 * Control: the twelve documented ones are found by their registered names.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/ui/settingsReferenceCoverage.probe.js
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PAGES } from '../../../src/help/helpJournal.js';

const REGISTERING_FILES = ['src/index.js', 'src/moves/combatTracker.js', 'src/ui/layoutMode.js', 'src/ui/settingsPanel.js', 'src/private-channel/index.js', 'src/ui/companionToolbar.js'];

/** The registered display names of every `config: true` setting (what Foundry's Configure Settings lists). */
function configTrueNames() {
  const names = [];
  for (const file of REGISTERING_FILES) {
    const src = readFileSync(file, 'utf8');
    const re = /register\(MODULE_ID,\s*[^,]+,\s*\{[\s\S]*?\n\s*\}\);/g;
    let m;
    while ((m = re.exec(src))) {
      if (!/config:\s*true/.test(m[0])) continue;
      const name = m[0].match(/name:\s*["']([^"']+)/)?.[1];
      if (name) names.push(name);
    }
  }
  return names;
}

const reference = () => (PAGES.find(p => p.name === 'Settings Reference')?.text?.content ?? '').replace(/&[a-z#0-9]+;/gi, ' ');

describe('UI-05 the Settings Reference documents every Configure Settings entry', () => {
  it('control: the registry has the fourteen Configure Settings entries and the help names twelve of them', () => {
    const names = configTrueNames();
    expect(names).toContain('Combat Tracker Integration');
    expect(names).toContain('Layout');
    expect(names.length).toBeGreaterThanOrEqual(14);
    const ref = reference();
    for (const n of ['OpenRouter Image Model', 'Push-to-Talk', 'Speech Input Language', 'Layout', 'Generate Sector Background Art', 'Auto-Seed Starship Details']) {
      expect(ref, n).toContain(n);
    }
  });

  it('every config: true setting has a row in the Configure Settings table', () => {
    const ref = reference();
    const table = ref.split('Companion Settings Panel')[0];   // the Configure Settings table comes first
    const missing = configTrueNames().filter(n => !table.includes(n));
    // FAILS today: ["Auto-apply asset consequence riders" (known RIDERS-SETTING-UNDOCUMENTED), "Combat Tracker Integration"].
    expect(missing).toEqual([]);
  });
});

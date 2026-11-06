// STARFORGED COMPANION
// tests/unit/settingsReferenceBatchMode.test.js
//
// Batch Mode registers two settings a user changes — `batchMode.enabled`
// (world, default off; the toolbar's switch) and `batchMode.draft` (client;
// the Round window's unsent text). CLAUDE.md → "Help file and changelog
// maintenance": "Add new settings to the 'Settings Reference' page table".
// The Settings Reference named neither: their table — in the Settings
// Reference's own Setting / Description / Scope shape — had been appended to
// the end of the Batch Mode page instead, where its row said "(see the Batch
// Mode page)" (issue #342 Z69, SETTINGS-REFERENCE-BATCH-MODE-MISSING). Both
// are `config: false`, so settingsReferenceCoverage.test.js (the Configure
// Settings sweep) never saw them.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PAGES } from '../../src/help/helpJournal.js';

const page = (name) => PAGES.find(p => p.name === name)?.text?.content ?? '';
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ');
const rowOf = (html, label) => html.split('<tr>').find(r => r.startsWith(`<td><strong>${label}</strong></td>`)) ?? '';

describe('the Settings Reference lists the Batch Mode settings (issue #342 Z69)', () => {
  it('control: the two settings are registered, world and client, the switch default off', () => {
    const src = readFileSync('src/batch/driver.js', 'utf8');
    const block = (key) => src.split(`game.settings.register(MODULE_ID, ${key}, {`)[1]?.split('});')[0] ?? '';
    expect(block('BATCH_ENABLED_SETTING')).toMatch(/name:\s*"Batch Mode"[\s\S]*scope:\s*"world"[\s\S]*default:\s*false/);
    expect(block('BATCH_DRAFT_SETTING')).toMatch(/name:\s*"Batch Mode draft"[\s\S]*scope:\s*"client"/);
  });

  it('the Settings Reference has a row for the Batch Mode switch and the draft, with their scopes', () => {
    const sr = page('Settings Reference');
    const on = rowOf(sr, 'Batch Mode');
    const draft = rowOf(sr, 'Batch Mode draft');
    expect(on).not.toBe('');
    expect(draft).not.toBe('');
    expect(plain(on)).toMatch(/Default: off\..*World/);
    expect(plain(draft)).toMatch(/Client/);
    // Its own section, saying where the switch is (not Configure Settings).
    expect(sr).toMatch(/<h2>Batch Mode \(Toolbar → Batch Mode\)<\/h2><p>Not in Configure Settings: a GM switches Batch Mode with the toolbar&rsquo;s <strong>Batch Mode<\/strong> button\.<\/p>/);
  });

  it('the Batch Mode page points at the Settings Reference instead of holding the table', () => {
    const bm = page('Batch Mode');
    expect(bm).not.toMatch(/<th>Setting<\/th><th>Description<\/th><th>Scope<\/th>/);
    expect(plain(bm)).toMatch(/two settings .* are listed in the Settings Reference/);
  });
});

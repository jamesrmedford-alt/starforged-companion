/**
 * UI-6 SETTINGS-REFERENCE-BATCH-MODE-MISSING (eleventh audit, ui).
 *
 * Batch Mode registers two settings a user changes — `batchMode.enabled`
 * (world, default off; the toolbar's switch) and `batchMode.draft` (client;
 * the Round window's unsent text). CLAUDE.md → "Help file and changelog
 * maintenance": "Add new settings to the 'Settings Reference' page table".
 * The help's Settings Reference names neither; their table — headed
 * "Batch Mode (toolbar)", "Not in Configure Settings: …", in the Settings
 * Reference's Setting / Description / Scope shape — was appended to the end
 * of the Batch Mode page instead, where its own row says "(see the Batch
 * Mode page)". The commit that wrote it (a9a4bfa) says "Help v1.7.37: … the
 * Settings Reference … rows".
 *
 * Correct: the Settings Reference lists the Batch Mode switch and the draft,
 * with their scopes and the switch's default.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PAGES } from '../../../src/help/helpJournal.js';

const page = (name) => PAGES.find(p => p.name === name)?.text?.content ?? '';
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ');

describe('UI-6: the Settings Reference and the Batch Mode settings', () => {
  it('control: the two settings are registered, world and client, the switch default off', () => {
    const src = readFileSync('src/batch/driver.js', 'utf8');
    const block = (key) => src.split(`game.settings.register(MODULE_ID, ${key}, {`)[1]?.split('});')[0] ?? '';
    expect(block('BATCH_ENABLED_SETTING')).toMatch(/name:\s*"Batch Mode"[\s\S]*scope:\s*"world"[\s\S]*default:\s*false/);
    expect(block('BATCH_DRAFT_SETTING')).toMatch(/name:\s*"Batch Mode draft"[\s\S]*scope:\s*"client"/);
  });

  it('control: their table sits at the end of the Batch Mode page, pointing at "the Batch Mode page"', () => {
    const bm = page('Batch Mode');
    const table = bm.split('<h3>Batch Mode (toolbar)</h3>')[1] ?? '';
    expect(table).toMatch(/<th>Setting<\/th><th>Description<\/th><th>Scope<\/th>/);
    expect(plain(table)).toMatch(/\(see the Batch Mode page\)/);
  });

  it('the Settings Reference has a row for the Batch Mode switch and the draft', () => {
    const sr = page('Settings Reference');
    expect(sr.includes('<strong>Batch Mode</strong>')).toBe(true);
    expect(sr.includes('<strong>Batch Mode draft</strong>')).toBe(true);
  });
});

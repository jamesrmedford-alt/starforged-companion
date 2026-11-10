/**
 * UI-3 SIDECAR-REQUIRED-SETTING-DEAD (twelfth audit, ui area).
 *
 * Companion Settings → Mischief → Fact Continuity has a "Require a sidecar on
 * every narrator response" box (src/ui/settingsPanel.js:1257-1262), saved by
 * Save Fact Continuity Settings (:1983, :1998) into the world setting
 * `factContinuity.sidecarRequired`. Its registered hint (:549-556) and the
 * help's Settings Reference ("Require a sidecar — When off, missing sidecars
 * are tolerated silently") say what turning it off does. Nothing reads it:
 * `getFactContinuitySidecarRequired` (:701) is called only by the panel's own
 * _prepareContext (:1004), to draw the box. The narrator's sidecar parse
 * (src/narration/narrator.js:4171-4182) warns on a reply with no sidecar
 * whatever the box says — "the sidecar is MANDATORY in every mode". The
 * dead-code scan cannot see it: the panel reads the key it writes.
 *
 * Scenario: a GM unticks the box and saves; the narrator's next reply has no
 * sidecar fence.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { StubElement } from '../../helpers/cardDom.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const KEY = 'factContinuity.sidecarRequired';
const NO_SIDECAR_WARNING = /carried no sidecar fence/;

let table;
let savedDocument;

beforeAll(async () => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
  table = await simulateTable({ users: [USERS.GM] });
}, 60_000);
afterAll(() => { table?.teardown(); globalThis.document = savedDocument; });

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    'factContinuity.consistencyCheck': false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1 },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  // The narrator answers in plain prose — no sidecar fence.
  table.claude.respond(() => 'The cargo bay is dim; crates sweat in the cold.');
});

/** The GM saves the Fact Continuity settings from the panel with the box ticked or not. */
async function saveFromPanel(sidecarRequired) {
  const c = table.client('gm-1');
  const { SettingsPanelApp } = await c.import('../../src/ui/settingsPanel.js');
  await c.run(async () => {
    const panel = Object.assign(new SettingsPanelApp(), { render() {} });
    await SettingsPanelApp.DEFAULT_OPTIONS.actions.switchTab.call(panel, {}, { dataset: { tab: 'mischief' } });
    panel.element = await panel._renderHTML(await panel._prepareContext({}), {});
    const box = panel.element.querySelector(`[name="${KEY}"]`);
    if (!box) throw new Error('the panel has no Require-a-sidecar box');
    box.checked = sidecarRequired;
    await SettingsPanelApp.DEFAULT_OPTIONS.actions.saveFactContinuitySettings.call(panel, {}, {});
  });
  await table.settle();
}

/** The GM asks @scene; the warnings logged while it is answered. */
async function warningsWhileNarrating() {
  const warn = vi.spyOn(console, 'warn');
  try {
    await table.client('gm-1').chat('@scene What does the cargo bay look like?');
    await table.settle();
    await table.drain();
    return warn.mock.calls.map(args => args.map(String).join(' '));
  } finally {
    warn.mockRestore();
  }
}

describe('UI-3: the "Require a sidecar" box changes what the narrator does', () => {
  it('control: ticked (the default), a reply with no sidecar is warned about', async () => {
    await saveFromPanel(true);
    expect(table.world.getSetting(KEY)).toBe(true);
    const warnings = await warningsWhileNarrating();
    expect(table.claude.calls.length).toBeGreaterThan(0);
    expect(warnings.some(w => NO_SIDECAR_WARNING.test(w))).toBe(true);
  }, 60_000);

  it('unticked and saved, a missing sidecar should be tolerated silently (as the hint and the help say)', async () => {
    await saveFromPanel(false);
    // Setup sound: the panel saved the GM's choice.
    expect(table.world.getSetting(KEY)).toBe(false);
    const warnings = await warningsWhileNarrating();
    expect(table.claude.calls.length).toBeGreaterThan(0);
    expect(warnings.filter(w => NO_SIDECAR_WARNING.test(w))).toEqual([]);
  }, 60_000);

  it('a production module other than the panel reads the setting (rules/reachability.md §1)', () => {
    const root = path.resolve(__dirname, '../../../src');
    const readers = [];
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) { if (ent.name !== 'integration') walk(p); continue; }
        if (!p.endsWith('.js') || p.endsWith(path.join('ui', 'settingsPanel.js'))) continue;
        const src = fs.readFileSync(p, 'utf8');
        if (/getFactContinuitySidecarRequired|factContinuity\.sidecarRequired/.test(src) && !p.endsWith('helpJournal.js')) {
          readers.push(path.relative(root, p));
        }
      }
    };
    walk(root);
    expect(readers.length).toBeGreaterThan(0);
  });
});

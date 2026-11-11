/**
 * STARFORGED COMPANION
 * tests/unit/sidecarRequiredSettingRetired.test.js
 *
 * Issue #345 AA65 (SIDECAR-REQUIRED-SETTING-DEAD) — Companion Settings →
 * Mischief → Fact Continuity had a "Require a sidecar on every narrator
 * response" box, saved by Save Fact Continuity Settings into the world setting
 * `factContinuity.sidecarRequired`. Its hint and the help's Settings Reference
 * row said "When off, missing sidecars are tolerated silently". Nothing read
 * it but the panel drawing its own box (so the dead-code scan saw a reader):
 * the narrator's sidecar parse warns on a reply with no sidecar fence whatever
 * the box said.
 *
 * Retired rather than wired (rules/reachability.md §1–§2): the only behaviour
 * it could gate is that warning, which NARR-SIDECAR-SILENT made unconditional
 * on purpose — a reply with no sidecar loses that turn's scene-frame update
 * and required emissions, and decisions.md "No silent failures" has a genuine
 * failure warn. Whether there is a sidecar at all is "Enable fact continuity"
 * (the master switch); the narrator is told the sidecar is mandatory in every
 * mode. The setting, its getter, the panel's box and save, and the help row
 * are gone (issue #330 D6's precedent: a stored value stays, unread).
 *
 * Adapted from the probe: its "unticked, the warning is silenced" and "a
 * production reader exists" asserted the wiring fix; they now assert the
 * retirement. Its control — a reply with no sidecar is warned about — is kept,
 * through the real panel save and an @scene narration on a booted table.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { StubElement } from '../helpers/cardDom.js';
import { productionSources } from '../helpers/sourceScan.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { PAGES } from '../../src/help/helpJournal.js';

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

/** The GM opens the Mischief tab's Fact Continuity section, sets `boxes`, and saves. */
async function saveFromPanel(boxes = {}) {
  const c = table.client('gm-1');
  const { SettingsPanelApp } = await c.import('../../src/ui/settingsPanel.js');
  const drawn = await c.run(async () => {
    const panel = Object.assign(new SettingsPanelApp(), { render() {} });
    await SettingsPanelApp.DEFAULT_OPTIONS.actions.switchTab.call(panel, {}, { dataset: { tab: 'mischief' } });
    panel.element = await panel._renderHTML(await panel._prepareContext({}), {});
    const shown = {
      sidecarBox: !!panel.element.querySelector(`[name="${KEY}"]`),
      ledgerBox:  !!panel.element.querySelector('[name="factContinuity.ledgerInContext"]'),
    };
    for (const [name, checked] of Object.entries(boxes)) {
      const box = panel.element.querySelector(`[name="${name}"]`);
      if (!box) throw new Error(`the panel has no ${name} box`);
      box.checked = checked;
    }
    await SettingsPanelApp.DEFAULT_OPTIONS.actions.saveFactContinuitySettings.call(panel, {}, {});
    return shown;
  });
  await table.settle();
  return drawn;
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

describe('issue #345 AA65 — the "Require a sidecar" setting is retired', () => {
  it('the Fact Continuity section draws no "Require a sidecar" box, and its save writes no such setting', async () => {
    const drawn = await saveFromPanel();
    expect(drawn).toEqual({ sidecarBox: false, ledgerBox: true });
    expect(table.world.getSetting(KEY)).toBeUndefined();
    expect(table.client('gm-1').run(() => game.settings.settings.has(`${MODULE_ID}.${KEY}`))).toBe(false);
  }, 60_000);

  it('a narrator reply with no sidecar is warned about — the turn\'s frame update is lost, whatever the panel holds', async () => {
    await saveFromPanel({ 'factContinuity.ledgerInContext': true });
    const warnings = await warningsWhileNarrating();
    expect(table.claude.calls.length).toBeGreaterThan(0);
    expect(warnings.filter(w => NO_SIDECAR_WARNING.test(w))).toHaveLength(1);
  }, 60_000);

  it('the help\'s Settings Reference has no "Require a sidecar" row, and no production module names the setting', () => {
    const reference = PAGES.find(p => p.name === 'Settings Reference')?.text?.content ?? '';
    expect(reference).toMatch(/<strong>Inject the active-scene ledger<\/strong>/);   // control: the section's other rows
    expect(reference).not.toMatch(/Require a sidecar/);

    // Code only: the retirement's own comment in the registry names the key.
    const naming = productionSources()
      .filter(({ code }) => /getFactContinuitySidecarRequired|FC_SIDECAR_REQUIRED|factContinuity\.sidecarRequired/.test(code))
      .map(({ file }) => file);
    expect(naming).toEqual([]);
  });

  it('control: the section\'s other boxes still save — the ledger box unticked is stored off', async () => {
    await saveFromPanel({ 'factContinuity.ledgerInContext': false });
    expect(table.world.getSetting('factContinuity.ledgerInContext')).toBe(false);
  }, 60_000);
});

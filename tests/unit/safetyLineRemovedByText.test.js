/**
 * Issue #347 AB12 (SAFETY-LINE-REMOVED-BY-INDEX) — the Safety pane's ✕
 * removes the Line its row shows.
 *
 * It removed the Line at the row's POSITION in the list as stored at the
 * press: each row carried `data-index="${i}"` and #onRemoveLine wrote
 * `getGlobalLines().filter((_, i) => i !== idx)`. The row keeps what it was
 * drawn with until the panel re-renders, and the panel re-renders only at the
 * end of its own action (after the Lines write AND the campaignState safety
 * sync have both round-tripped) — it has no hook for another client's edit.
 * So whenever the stored list moved under a drawn row, the ✕ deleted a
 * different hard limit than the one beside it, with no confirmation and no
 * undo:
 *
 *   A. one GM, a second press on the same ✕ before the re-render: the first
 *      press's Lines write has landed, so index i named the NEXT Line, and it
 *      went too.
 *   B. two GMs with the pane open: after one removed a Line, the other's ✕
 *      beside "L2" removed L3 — L2 stayed, L3 (nobody chose it) was gone from
 *      the world setting and from campaignState.safety.lines, which every
 *      narration reads as the table's hard limits.
 *
 * Each ✕ now carries its row's text (`data-item`) and removes that item from
 * the list as stored at the press; an item already gone removes nothing.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { holdWrites } from '../helpers/faults.js';
import { parseHTML } from '../helpers/cardDom.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const L1 = 'No harm to children.';
const L2 = 'No sexual violence.';
const L3 = 'No torture shown on screen.';

const WORLD = { settings: {
  chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
  globalSafetyLines: [L1, L2, L3],
  campaignState: { ...CampaignStateSchema },
} };

let table = null;
afterEach(async () => { await table?.teardown(); table = null; });

const storedLines = () => table.world.getSetting('globalSafetyLines');
const narratorLines = () => table.world.campaignState()?.safety?.lines;

/**
 * The Safety pane as the real panel renders it for this client, now: one
 * entry per row of `action`'s list — the text the row shows and the dataset
 * its ✕ carries. This is "the DOM the GM is looking at"; it stays as it is
 * until the panel re-renders.
 */
async function renderedRows(userId, action = 'removeLine') {
  const c = table.client(userId);
  const { SettingsPanelApp } = await c.import('../../src/ui/settingsPanel.js');
  const prev = globalThis.document;
  globalThis.document = { createElement: () => {
    let html = '';
    return {
      set innerHTML(v) { html = String(v); },
      get innerHTML() { return html; },
      get firstElementChild() { return parseHTML(html).firstElementChild; },
    };
  } };
  try {
    const root = await c.run(async () => {
      const app = new SettingsPanelApp();
      return app._renderHTML(await app._prepareContext({}), {});
    });
    return root.querySelectorAll(`[data-action="${action}"]`).map(btn => ({
      text:    btn.closest('.safety-item').querySelector('.safety-item-text').textContent.trim(),
      dataset: { ...btn.dataset },
    }));
  } finally {
    globalThis.document = prev;
  }
}
const renderedLineRows = (userId) => renderedRows(userId, 'removeLine');

/**
 * Press the ✕ of a rendered row: the panel's own remove action, with the
 * dataset that row's button was drawn with. Returns the button pressed.
 */
async function pressRemove(userId, row, action = 'removeLine', app = { element: parseHTML('<div></div>'), render() {} }) {
  const c = table.client(userId);
  const { SettingsPanelApp } = await c.import('../../src/ui/settingsPanel.js');
  const target = parseHTML('<button></button>').firstElementChild;
  for (const [k, v] of Object.entries(row.dataset)) target.dataset[k] = v;
  await c.run(() => SettingsPanelApp.DEFAULT_OPTIONS.actions[action].call(app, null, target));
  return target;
}

describe('Safety pane — the ✕ beside a Line removes that Line', () => {
  it('control: one press on a freshly rendered pane removes the Line its row shows', async () => {
    table = await simulateTable({ users: [USERS.GM], world: WORLD });
    await table.settle();
    const rows = await renderedLineRows('gm-1');
    expect(rows.map(r => r.text)).toEqual([L1, L2, L3]);

    await pressRemove('gm-1', rows.find(r => r.text === L2));
    await table.settle();

    expect(storedLines()).toEqual([L1, L3]);
    expect(narratorLines()).toEqual([L1, L3]);
  }, 60_000);

  it('A. a second press on the same ✕ before the pane re-renders removes nothing more', async () => {
    table = await simulateTable({ users: [USERS.GM], world: WORLD });
    await table.settle();
    const rows = await renderedLineRows('gm-1');
    const rowL1 = rows.find(r => r.text === L1);

    // First press: its Lines write lands; its campaignState safety sync is
    // still on its way to the server, so the pane has not re-rendered.
    const held = holdWrites(table, (w) => w.kind === 'setting' && w.key === `${MODULE_ID}.campaignState` && w.client === 'gm-1');
    const first = pressRemove('gm-1', rowL1);
    await held.arrived;
    expect(storedLines()).toEqual([L2, L3]);          // L1 is gone, as pressed

    // Second press on the very same row (a double-click on a slow server).
    const second = pressRemove('gm-1', rowL1);
    held.release();
    await Promise.all([first, second]);
    await table.settle();

    expect(storedLines()).toEqual([L2, L3]);          // only the Line the row showed
    expect(narratorLines()).toEqual([L2, L3]);
  }, 60_000);

  it('B. a co-GM\'s ✕ beside "L2", pressed after the other GM removed L1, removes L2 — not L3', async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.GM2], world: WORLD });
    await table.settle();

    // Both GMs have the Safety pane open on the same three Lines.
    const gusRows = await renderedLineRows('gm-2');
    expect(gusRows.map(r => r.text)).toEqual([L1, L2, L3]);

    // Gina removes L1. Nothing re-renders Gus's pane (the panel has no hook
    // for another client's Lines edit), so his rows are still these.
    const ginaRows = await renderedLineRows('gm-1');
    await pressRemove('gm-1', ginaRows.find(r => r.text === L1));
    await table.settle();
    expect(storedLines()).toEqual([L2, L3]);

    // Gus presses the ✕ beside "No sexual violence." (L2).
    await pressRemove('gm-2', gusRows.find(r => r.text === L2));
    await table.settle();

    expect(storedLines()).toEqual([L3]);              // L2 removed; L3 — nobody's choice — still a hard limit
    expect(narratorLines()).toEqual([L3]);
  }, 60_000);

  it('a co-GM\'s stale ✕ beside a Veil removes that Veil', async () => {
    const V1 = 'Children as plot-significant characters.';
    const V2 = 'Body horror kept off screen.';
    const V3 = 'Drug use only implied.';
    table = await simulateTable({ users: [USERS.GM, USERS.GM2], world: { settings: {
      ...WORLD.settings, globalSafetyVeils: [V1, V2, V3],
    } } });
    await table.settle();
    const gusRows = await renderedRows('gm-2', 'removeVeil');
    expect(gusRows.map(r => r.text)).toEqual([V1, V2, V3]);

    const ginaRows = await renderedRows('gm-1', 'removeVeil');
    await pressRemove('gm-1', ginaRows.find(r => r.text === V1), 'removeVeil');
    await table.settle();
    await pressRemove('gm-2', gusRows.find(r => r.text === V2), 'removeVeil');
    await table.settle();

    expect(table.world.getSetting('globalSafetyVeils')).toEqual([V3]);
    expect(table.world.campaignState()?.safety?.veils).toEqual([V3]);
  }, 60_000);

  it('a player\'s ✕ beside a Private Line, on a pane drawn before their last removal, removes that Line', async () => {
    const P1 = 'spiders';
    const P2 = 'needles';
    const P3 = 'drowning';
    table = await simulateTable({ users: [USERS.GM, USERS.P1], world: WORLD });
    await table.client('pl-1').setSetting('privateLines', [P1, P2, P3]);
    await table.settle();
    const rows = await renderedRows('pl-1', 'removePrivateLine');
    expect(rows.map(r => r.text)).toEqual([P1, P2, P3]);

    await pressRemove('pl-1', rows.find(r => r.text === P1), 'removePrivateLine');
    await table.settle();
    await pressRemove('pl-1', rows.find(r => r.text === P2), 'removePrivateLine');   // the same, undrawn pane
    await table.settle();

    expect(table.client('pl-1').getSetting('privateLines')).toEqual([P3]);
  }, 60_000);

  it('the pressed ✕ is disabled while its write is out, and a press on a Line already gone writes nothing and redraws the pane', async () => {
    table = await simulateTable({ users: [USERS.GM], world: WORLD });
    await table.settle();
    const rows = await renderedLineRows('gm-1');

    const held = holdWrites(table, (w) => w.kind === 'setting' && w.key === `${MODULE_ID}.globalSafetyLines`);
    const c = table.client('gm-1');
    const { SettingsPanelApp } = await c.import('../../src/ui/settingsPanel.js');
    let renders = 0;
    const app = { element: parseHTML('<div></div>'), render() { renders += 1; } };
    const target = parseHTML('<button></button>').firstElementChild;
    target.dataset.item = rows[0].dataset.item;
    const press = c.run(() => SettingsPanelApp.DEFAULT_OPTIONS.actions.removeLine.call(app, null, target));
    await Promise.race([held.arrived, press]);
    let disabledWhileOut, second;
    try {
      disabledWhileOut = target.disabled;
      // A second press on the disabled ✕ does nothing (a browser would not even dispatch it).
      second = c.run(() => SettingsPanelApp.DEFAULT_OPTIONS.actions.removeLine.call(app, null, target));
    } finally {
      held.release();
    }
    await Promise.all([press, second]);
    expect(disabledWhileOut, 'disabled while the Lines write is out').toBe(true);
    await table.settle();
    expect(target.disabled).toBe(false);
    expect(storedLines()).toEqual([L2, L3]);
    expect(renders).toBe(1);

    // The same row pressed again from a stale pane: L1 is gone, so nothing is written.
    const writes = [];
    table.interceptWrites(async (w) => { if (w.kind === 'setting') writes.push(w.key); return undefined; });
    await pressRemove('gm-1', rows[0], 'removeLine', app);
    await table.settle();
    expect(writes).toEqual([]);
    expect(storedLines()).toEqual([L2, L3]);
    expect(renders, 'the stale pane is redrawn').toBe(2);
  }, 60_000);
});

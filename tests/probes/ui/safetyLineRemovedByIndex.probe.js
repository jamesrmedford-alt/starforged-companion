/**
 * PROBE (thirteenth audit, area: ui) — UI-2
 *
 * The Safety pane's ✕ removes a Line by its POSITION in the list as stored at
 * the moment of the press, not the Line the pressed row shows.
 *
 * settingsPanel.js renders each Line / Veil / Private Line with
 * `data-index="${i}"` (#renderSafetyPane) and #onRemoveLine writes
 * `getGlobalLines().filter((_, i) => i !== idx)`. The row keeps its index
 * until the panel re-renders, and the panel re-renders only at the end of its
 * own action (after the Lines write AND the campaignState safety sync have
 * both round-tripped) — it has no hook for another client's edit. So whenever
 * the stored list has moved under a rendered row, the ✕ deletes a different
 * hard limit than the one beside it, with no confirmation and no undo:
 *
 *   A. one GM, a second press on the same ✕ before the re-render (the two
 *      world writes are the wait — ~2 round trips on a hosted server): the
 *      first press's Lines write has landed, so index i now names the NEXT
 *      Line, and it goes too.
 *   B. two GMs with the pane open: after one removes a Line, the other's ✕
 *      beside "L2" removes L3 — L2 stays, L3 (nobody chose it) is gone from
 *      the world setting and from campaignState.safety.lines, which every
 *      narration reads as the table's hard limits.
 *
 * Expected (asserted): a press removes the Line its row shows, and only that.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { holdWrites } from '../../helpers/faults.js';
import { parseHTML } from '../../helpers/cardDom.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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
 * entry per Global Line row — the text the row shows and the `data-index` its
 * ✕ carries. This is "the DOM the GM is looking at"; it stays as it is until
 * the panel re-renders.
 */
async function renderedLineRows(userId) {
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
    return root.querySelectorAll('[data-action="removeLine"]').map(btn => ({
      text:  btn.closest('.safety-item').querySelector('.safety-item-text').textContent.trim(),
      index: btn.dataset.index,
    }));
  } finally {
    globalThis.document = prev;
  }
}

/** Press the ✕ of a rendered row: the panel's own removeLine action, with that row's data-index. */
async function pressRemove(userId, row) {
  const c = table.client(userId);
  const { SettingsPanelApp } = await c.import('../../src/ui/settingsPanel.js');
  const app = { element: parseHTML('<div></div>'), render() {} };
  const target = parseHTML('<button></button>').firstElementChild;
  target.dataset.index = String(row.index);
  return c.run(() => SettingsPanelApp.DEFAULT_OPTIONS.actions.removeLine.call(app, null, target));
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
});

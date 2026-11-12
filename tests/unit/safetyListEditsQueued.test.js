/**
 * Issue #347 SAFETY-LIST-EDITS-ONE-ROUND-TRIP (AB12's residual) — two edits
 * of a Safety list inside one round trip both land.
 *
 * Each Add and each ✕ read the list as this client had it and wrote the whole
 * list back. Two edits inside one round trip — two ✕ on different Lines, or
 * two Adds — each read the list as it was before either, so the second write
 * put back the Line the first had removed (a hard limit the GM had just taken
 * off came back), or dropped the Line the first had added (a hard limit the
 * GM had just set was gone). This client's Safety-list edits now run one at a
 * time, each reading its list once the edit ahead of it has landed (bounded:
 * a write never answered is waited on for at most 30 s).
 *
 * And a GM page whose connection dropped writes no Lines or Veils until it
 * reloads (issue #347 AB19-STALE-CACHE-WRITES): its copy may lack a co-GM's
 * edit made meanwhile, and a ✕ there wrote the list back without it.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { holdWrites } from '../helpers/faults.js';
import { parseHTML } from '../helpers/cardDom.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const L1 = 'No harm to children.';
const L2 = 'No sexual violence.';
const L3 = 'No torture shown on screen.';
const L4 = 'No animal cruelty.';

const WORLD = { settings: {
  chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
  globalSafetyLines: [L1, L2, L3],
  campaignState: { ...CampaignStateSchema },
} };

let table = null;
afterEach(async () => { await table?.teardown(); table = null; });

const storedLines = () => table.world.getSetting('globalSafetyLines');
const narratorLines = () => table.world.campaignState()?.safety?.lines;
const linesWrite = (w) => w.kind === 'setting' && w.key === `${MODULE_ID}.globalSafetyLines`;
const noPanel = () => ({ element: parseHTML('<div><input name="newLine" value=""><input name="newVeil" value=""></div>'), render() {} });

/** Press a Safety pane action on `userId`'s client, as the panel's own handler: its error, if it is refused. */
async function press(userId, action, { item = null, panel = noPanel() } = {}) {
  const c = table.client(userId);
  const { SettingsPanelApp } = await c.import('../../src/ui/settingsPanel.js');
  const target = parseHTML('<button></button>').firstElementChild;
  if (item !== null) target.dataset.item = item;
  return c.run(() => SettingsPanelApp.DEFAULT_OPTIONS.actions[action].call(panel, null, target)).catch(err => err);
}

/** The panel with its Add box holding `text`. */
function panelTyping(name, text) {
  const element = parseHTML(`<div><input name="${name}" value=""></div>`);
  element.querySelector(`[name="${name}"]`).value = text;
  return { element, render() {} };
}

describe('two Safety-list edits inside one round trip both land', () => {
  it('two ✕ on different Lines: both are removed', async () => {
    table = await simulateTable({ users: [USERS.GM], world: WORLD });
    await table.settle();

    const held = holdWrites(table, linesWrite);          // the first ✕'s write is out
    const first = press('gm-1', 'removeLine', { item: L1 });
    await held.arrived;
    const second = press('gm-1', 'removeLine', { item: L2 });
    await table.settle();
    held.release();
    await Promise.all([first, second]);
    await table.settle();

    expect(storedLines()).toEqual([L3]);
    expect(narratorLines()).toEqual([L3]);
  }, 60_000);

  it('two Adds: both Lines are kept', async () => {
    table = await simulateTable({ users: [USERS.GM], world: WORLD });
    await table.settle();

    const held = holdWrites(table, linesWrite);
    const first = press('gm-1', 'addLine', { panel: panelTyping('newLine', L4) });
    await held.arrived;
    const second = press('gm-1', 'addLine', { panel: panelTyping('newLine', 'No graphic gore.') });
    await table.settle();
    held.release();
    await Promise.all([first, second]);
    await table.settle();

    expect(storedLines()).toEqual([L1, L2, L3, L4, 'No graphic gore.']);
    expect(narratorLines()).toEqual([L1, L2, L3, L4, 'No graphic gore.']);
  }, 60_000);

  it('an Add and a ✕ on Veils: both land', async () => {
    const V1 = 'Children as plot-significant characters.';
    const V2 = 'Body horror kept off screen.';
    table = await simulateTable({ users: [USERS.GM], world: { settings: { ...WORLD.settings, globalSafetyVeils: [V1] } } });
    await table.settle();

    const held = holdWrites(table, (w) => w.kind === 'setting' && w.key === `${MODULE_ID}.globalSafetyVeils`);
    const first = press('gm-1', 'addVeil', { panel: panelTyping('newVeil', V2) });
    await held.arrived;
    const second = press('gm-1', 'removeVeil', { item: V1 });
    await table.settle();
    held.release();
    await Promise.all([first, second]);
    await table.settle();

    expect(table.world.getSetting('globalSafetyVeils')).toEqual([V2]);
    expect(table.world.campaignState()?.safety?.veils).toEqual([V2]);
  }, 60_000);

  it('control: an edit refused by the world is reported, and the next edit still runs', async () => {
    silenceConsoleErrors();
    table = await simulateTable({ users: [USERS.GM], world: WORLD });
    await table.settle();

    const held = holdWrites(table, linesWrite);
    const first = press('gm-1', 'removeLine', { item: L1 });
    await held.arrived;
    const second = press('gm-1', 'removeLine', { item: L2 });
    held.fail();
    const [refused, landed] = await Promise.all([first, second]);
    await table.settle();

    expect(refused).toBeInstanceOf(Error);
    expect(landed).toBeUndefined();
    expect(storedLines()).toEqual([L1, L3]);              // the first refused, the second landed
    expect(table.client('gm-1').notifications.filter(n => /Safety list change was not saved/.test(n.message))).toHaveLength(1);
  }, 60_000);
});

describe("a GM page whose connection dropped writes no Lines until it reloads (issue #347 AB19-STALE-CACHE-WRITES)", () => {
  it("its ✕ is refused, so a Line a co-GM added meanwhile is kept", async () => {
    silenceConsoleErrors();
    table = await simulateTable({ users: [USERS.GM, USERS.GM2], world: WORLD });
    await table.settle();

    await table.leave('gm-1');
    await press('gm-2', 'addLine', { panel: panelTyping('newLine', L4) });   // gm-1's copy never hears it
    await table.settle();
    await table.join('gm-1');
    expect(storedLines()).toEqual([L1, L2, L3, L4]);

    expect(await press('gm-1', 'removeLine', { item: L1 })).toBeInstanceOf(Error);
    await table.settle();

    expect(storedLines(), "nothing written from gm-1's stale copy").toEqual([L1, L2, L3, L4]);
    expect(table.client('gm-1').notifications.some(n => /Safety list change was not saved — this browser lost its connection/.test(n.message))).toBe(true);

    await table.reload('gm-1');
    await press('gm-1', 'removeLine', { item: L1 });
    await table.settle();
    expect(storedLines()).toEqual([L2, L3, L4]);
  }, 60_000);
});

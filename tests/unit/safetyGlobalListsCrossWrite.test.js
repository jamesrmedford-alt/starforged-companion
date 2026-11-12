/**
 * STARFORGED COMPANION
 * tests/unit/safetyGlobalListsCrossWrite.test.js
 *
 * SAFETY-GLOBAL-LISTS-CROSS-WRITE (issue #345 AA35's sibling) — a co-GM's
 * stale safety sync no longer takes a Line out of the narrator's copy.
 *
 * Every GM writes the global Lines and Veils from the world settings into
 * campaignState.safety (syncSafetyToCampaignState) at `ready` and on each
 * Safety edit. Gus's sync, built before Gina's new Line reached his page,
 * landed after hers and carried the old Lines: the narrator, which reads
 * campaignState.safety, lost the hard limit until the next sync. The
 * canonical GM now puts the copy back whenever a campaignState write, or a
 * list's own setting landing, leaves it apart from the settings.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { holdWrites } from '../helpers/faults.js';
import { parseHTML } from '../helpers/cardDom.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const L1 = 'No harm to children.';
const L2 = 'No torture shown on screen.';
const V1 = 'Body horror kept off screen.';

const WORLD = { settings: {
  chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
  globalSafetyLines: [L1], globalSafetyVeils: [],
  campaignState: { ...CampaignStateSchema },
} };

let table = null;
afterEach(async () => { await table?.teardown(); table = null; });

const narratorLines = () => table.world.campaignState()?.safety?.lines;
const narratorVeils = () => table.world.campaignState()?.safety?.veils;

function panelTyping(name, text) {
  const element = parseHTML(`<div><input name="${name}" value=""></div>`);
  element.querySelector(`[name="${name}"]`).value = text;
  return { element, render() {} };
}

async function press(userId, action, panel) {
  const c = table.client(userId);
  const { SettingsPanelApp } = await c.import('../../src/ui/settingsPanel.js');
  const target = parseHTML('<button></button>').firstElementChild;
  return c.run(() => SettingsPanelApp.DEFAULT_OPTIONS.actions[action].call(panel, null, target)).catch(err => err);
}

describe('SAFETY-GLOBAL-LISTS-CROSS-WRITE — the narrator\'s copy of the Lines follows the settings', () => {
  it('Gus\'s sync, built before Gina\'s new Line, lands after it: the Line is put back', async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.GM2], world: WORLD });
    await table.settle();
    expect(narratorLines()).toEqual([L1]);                       // control: synced at ready

    // Gus adds a Veil: his Veils setting lands, his campaignState sync is held.
    const held = holdWrites(table, (w) => w.kind === 'setting' && w.key === `${MODULE_ID}.campaignState` && w.client === 'gm-2');
    const gus = press('gm-2', 'addVeil', panelTyping('newVeil', V1));
    await held.arrived;
    // Gina adds a Line meanwhile; her sync lands.
    await press('gm-1', 'addLine', panelTyping('newLine', L2));
    await table.settle();
    expect(narratorLines()).toEqual([L1, L2]);

    held.release();                                              // Gus's write, with the old Lines, lands last
    await gus;
    await table.settle();

    expect(table.world.getSetting('globalSafetyLines')).toEqual([L1, L2]);
    expect(narratorLines()).toEqual([L1, L2]);                   // was: [L1] — Gina's Line gone from every prompt
    expect(narratorVeils()).toEqual([V1]);
  }, 60_000);

  it('control: a campaignState write that leaves the lists right re-writes nothing', async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.GM2], world: WORLD });
    await table.settle();
    const writes = [];
    table.interceptWrites((w) => {
      if (w.kind === 'setting' && w.key === `${MODULE_ID}.campaignState`) writes.push(w.client);
      return undefined;
    });
    await table.client('gm-2').run(async () => {
      const cs = game.settings.get(MODULE_ID, 'campaignState');
      await game.settings.set(MODULE_ID, 'campaignState', { ...cs, sessionNumber: 3 });
    });
    await table.settle();
    expect(writes).toEqual(['gm-2']);
    expect(narratorLines()).toEqual([L1]);
  }, 60_000);
});

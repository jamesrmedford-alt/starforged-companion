/**
 * STARFORGED COMPANION
 * tests/unit/entityPanelAssetTrack.test.js
 *
 * ENTITY-PANEL-ASSET-TRACK-STALE (issue #345 AA20's residual). A command
 * vehicle's integrity is its STARSHIP asset's Integrity track — an embedded
 * asset Item on the starship Actor (AA20; the record's `integrity` is its
 * mirror). The Entities panel reads it (registry withSheetNotes →
 * readCommandVehicleIntegrity), but its hooks followed Actors and journals
 * only: marking the track on the sheet fires `updateItem`, so the open panel
 * kept showing the old integrity until something else re-rendered it.
 *
 * Now an `updateItem` that changes a recorded ship's STARSHIP asset track
 * re-renders the open panel (local only — hookGates.test.js lists the hook).
 */

/* global makeTestActor */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { StubElement } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
let EntityPanelApp, registerEntityPanelHooks;
let savedDocument;

beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  ({ EntityPanelApp, registerEntityPanelHooks } = await import('../../src/ui/entityPanel.js'));
  registerEntityPanelHooks();
}, 60_000);

/** An embedded asset Item whose updates fire updateItem, as every client hears them. */
function assetItem(parent, { id, name, category, track }) {
  const item = { id, type: 'asset', name, parent, system: { category, track: { ...track } } };
  item.update = async (changes) => {
    const diff = {};
    for (const [path, val] of Object.entries(changes)) {
      const parts = path.split('.');
      let target = item; let d = diff;
      for (const p of parts.slice(0, -1)) { target = (target[p] ??= {}); d = (d[p] ??= {}); }
      target[parts.at(-1)] = val; d[parts.at(-1)] = val;
    }
    Hooks.call('updateItem', item, diff, {}, 'pl-1');
    return item;
  };
  return item;
}

/** The players' command vehicle: a recorded starship carrying the STARSHIP asset, and a module asset beside it. */
function commandVehicle() {
  const actor = makeTestActor({
    id: 'ship-1', type: 'starship', name: 'Wayfinder', system: { debility: { battered: false, cursed: false } },
    flags: { [MODULE_ID]: { ship: { _id: 'ship-1', name: 'Wayfinder', type: 'command_vehicle', isCommandVehicle: true,
      integrity: 5, integrityMax: 5, integritySheetReconciled: true } } },
  });
  const starship = assetItem(actor, { id: 'it-starship', name: 'Starship', category: 'Command Vehicle',
    track: { enabled: true, name: 'Integrity', value: 5, min: 0, max: 5 } });
  const cannons = assetItem(actor, { id: 'it-cannons', name: 'Heavy Cannons', category: 'Module',
    track: { enabled: false, name: '', value: 0, min: 0, max: 0 } });
  actor.items = { contents: [starship, cannons], get: (id) => [starship, cannons].find(i => i.id === id) ?? null };
  game.actors._set(actor.id, actor);
  return { actor, starship, cannons };
}

/** The open panel, rendering as ApplicationV2 does onto a stub element. */
async function openPanel() {
  const panel = EntityPanelApp.open();
  let renders = 0;
  panel.render = async function renderLikeFoundry() {
    renders += 1;
    const context = await this._prepareContext({});
    const result = await this._renderHTML(context, {});
    if (!this.element) this.element = new StubElement('div');
    this._replaceHTML(result, this.element, {});
    this.rendered = true;
    return this;
  };
  return { panel, renders: () => renders };
}

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };

beforeEach(() => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
  game.actors._reset();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: ['ship-1'], currentSessionId: 's1' });
});

afterEach(() => {
  globalThis.document = savedDocument;
  game.actors._reset();
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

describe('ENTITY-PANEL-ASSET-TRACK-STALE — the panel follows the STARSHIP asset\'s Integrity track', () => {
  it('marking the Integrity track on the sheet re-renders the open panel, which shows the new value', async () => {
    const { starship } = commandVehicle();
    const { panel, renders } = await openPanel();
    await EntityPanelApp.DEFAULT_OPTIONS.actions.switchTopTab?.call(panel, {}, { dataset: { tab: 'ships' } });
    await panel.render();
    const shown = () => panel.element.textContent.replace(/\s+/g, ' ');
    expect(shown()).toContain('Integrity 5');   // control: the list reads the track

    const before = renders();
    await starship.update({ 'system.track.value': 3 });   // the player marks two boxes on the sheet
    await settle();

    expect(renders()).toBeGreaterThan(before);
    expect(shown()).toContain('Integrity 3');
  });

  it('control: another asset\'s change, or an Item off a non-entity Actor, re-renders nothing', async () => {
    const { cannons } = commandVehicle();
    const pc = makeTestActor({ id: 'pc-kira', type: 'character', name: 'Kira' });
    const vehicle = assetItem(pc, { id: 'it-bike', name: 'Hoverbike', category: 'Support Vehicle',
      track: { enabled: true, name: 'Integrity', value: 3, min: 0, max: 3 } });
    pc.items = { contents: [vehicle] };
    game.actors._set(pc.id, pc);
    const { panel, renders } = await openPanel();
    await panel.render();
    const before = renders();

    await cannons.update({ 'system.track.value': 1 });
    await vehicle.update({ 'system.track.value': 2 });
    await settle();
    expect(renders()).toBe(before);
  });
});

/**
 * STARFORGED COMPANION
 * tests/unit/entityPanel.test.js
 *
 * Issue #300 F12 — the open Entity Panel refreshes for Actor-hosted entities.
 * Five of the seven entity types live on Actors (connection, ship, settlement,
 * planet, location), but the panel subscribed only to JournalEntry /
 * JournalEntryPage hooks: an entity Actor created, renamed or deleted while
 * the panel was open left the list — and a deleted entity's detail view —
 * stale until something else re-rendered it.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { EntityPanelApp, openEntityPanel, registerEntityPanelHooks } from '../../src/ui/entityPanel.js';

const MODULE_ID = 'starforged-companion';

function actorWithFlags(id, type, moduleFlags) {
  const flags = moduleFlags ? { [MODULE_ID]: moduleFlags } : {};
  return { id, name: id, type, flags, getFlag: (mod, key) => flags[mod]?.[key] };
}
const shipActor  = (id, name = id) => ({ ...actorWithFlags(id, 'starship', { ship: { name } }), name });
const plainActor = (id) => actorWithFlags(id, 'character', null);

let actors;
let panel;

beforeAll(() => {
  registerEntityPanelHooks();
});

beforeEach(() => {
  actors = [];
  game.actors = {
    get: (id) => actors.find(a => a.id === id) ?? null,
    [Symbol.iterator]: () => actors[Symbol.iterator](),
  };
  game.settings._store.set(`${MODULE_ID}.campaignState`, {});
  panel = EntityPanelApp.open();
  panel.rendered = true;
  vi.spyOn(panel, 'render');   // installed after open(): counts only hook-driven renders
});

const listedNames = async () =>
  (await panel._prepareContext({})).sections.flatMap(s => s.entities.map(e => e.name));

describe('Entity Panel — Actor-hosted entities', () => {
  it('creating an entity Actor re-renders the open panel, which lists it; a plain Actor does not', async () => {
    const ship = shipActor('ship-1', 'Wayfinder');
    actors.push(ship);
    Hooks.call('createActor', ship, {}, 'gm-1');
    expect(panel.render).toHaveBeenCalledTimes(1);
    expect(await listedNames()).toEqual(['Wayfinder']);

    Hooks.call('createActor', plainActor('pc-1'), {}, 'gm-1');
    expect(panel.render).toHaveBeenCalledTimes(1);
  });

  it('a rename, a record edit or a ship impact re-renders; an unrelated Actor update does not', () => {
    const ship = shipActor('ship-1');
    Hooks.call('updateActor', ship, { _id: 'ship-1', name: 'Wayfinder II' }, {}, 'gm-1');
    Hooks.call('updateActor', ship, { _id: 'ship-1', flags: { [MODULE_ID]: { ship: { portraitId: 'art-1' } } } }, {}, 'gm-1');
    Hooks.call('updateActor', ship, { _id: 'ship-1', system: { debility: { battered: true } } }, {}, 'gm-1');
    expect(panel.render).toHaveBeenCalledTimes(3);

    Hooks.call('updateActor', ship, { _id: 'ship-1', system: { supply: 3 } }, {}, 'gm-1');
    Hooks.call('updateActor', plainActor('pc-1'), { _id: 'pc-1', name: 'Kira' }, {}, 'gm-1');
    Hooks.call('updateActor', plainActor('pc-1'), { _id: 'pc-1', flags: { [MODULE_ID]: { momentumCache: 4 } } }, {}, 'gm-1');
    expect(panel.render).toHaveBeenCalledTimes(3);
  });

  it('removing an entity record from an Actor re-renders, so the entry leaves the list', () => {
    const former = plainActor('npc-1');   // the record flag is already gone when the hook fires
    Hooks.call('updateActor', former, { _id: 'npc-1', flags: { [MODULE_ID]: { '-=connection': null } } }, {}, 'gm-1');
    expect(panel.render).toHaveBeenCalledTimes(1);
  });

  it('deleting the selected entity Actor clears the selection and re-renders the list', async () => {
    const ship = shipActor('ship-1', 'Wayfinder');
    actors.push(ship);
    await EntityPanelApp.DEFAULT_OPTIONS.actions.selectEntity.call(panel, {}, { dataset: { journalId: 'ship-1' } });
    expect((await panel._prepareContext({})).view).toBe('detail');
    panel.render.mockClear();

    actors.length = 0;   // Foundry has removed it from the collection
    Hooks.call('deleteActor', ship, {}, 'gm-1');
    expect(panel.render).toHaveBeenCalledTimes(1);
    expect((await panel._prepareContext({})).view).toBe('list');
  });

  it('deleting an entity Actor re-renders the list; deleting a plain Actor does not', () => {
    Hooks.call('deleteActor', shipActor('ship-2'), {}, 'gm-1');
    expect(panel.render).toHaveBeenCalledTimes(1);
    Hooks.call('deleteActor', plainActor('pc-1'), {}, 'gm-1');
    expect(panel.render).toHaveBeenCalledTimes(1);
  });

  it('stays quiet while the panel is closed', () => {
    panel.rendered = false;
    const ship = shipActor('ship-3');
    Hooks.call('createActor', ship, {}, 'gm-1');
    Hooks.call('updateActor', ship, { _id: 'ship-3', name: 'Renamed' }, {}, 'gm-1');
    Hooks.call('deleteActor', ship, {}, 'gm-1');
    expect(panel.render).not.toHaveBeenCalled();
  });
});

// PANEL-OPEN-ID-DEAD (found while fixing issue #300 F12): openEntityPanel
// took a journalId that it wrote to a public property the panel never read,
// and no caller passed one — the parameter is gone (no speculative surface).
describe('openEntityPanel', () => {
  it('opens the one Entity Panel on its list', async () => {
    const app = openEntityPanel();
    expect(app).toBe(EntityPanelApp.open());
    expect((await app._prepareContext({})).view).toBe('list');
    expect(openEntityPanel).toHaveLength(0);
  });
});

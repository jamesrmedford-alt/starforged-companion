// STARFORGED COMPANION
// tests/unit/entityPanelFollowsState.test.js
//
// An open Entities panel follows the campaignState it shows (issue #331 X56).
//
// The panel reads two campaignState fields — `currentLocationId` (a
// settlement's "Set as current location" toggle) and `dismissedEntities` (the
// Dismissed tab) — but listened only to journal and Actor hooks, never to the
// campaignState setting hook every client hears when that write lands. A GM's
// `!at Bleakhold` or a draft card's Dismiss elsewhere left the open panel
// stale until one of its own buttons re-rendered it, and the toggle is read
// live at the press: the stale "Set as current location" CLEARED the place
// the GM meant to set. Like the Session, Progress Tracks and Clocks panels
// (issue #322 V12), the panel now re-renders when what it showed changed —
// local-only, no shared write — and an unrelated write re-renders nothing.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { EntityPanelApp, registerEntityPanelHooks } from '../../src/ui/entityPanel.js';
import { SessionPanelApp } from '../../src/ui/sessionPanel.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

function settlementActor(id, name) {
  const flags = { [MODULE_ID]: { settlement: { name, population: 'Few' } } };
  return { id, name, type: 'location', flags, getFlag: (mod, key) => flags[mod]?.[key] };
}

let actors;
let panel;
let savedActors;

beforeAll(() => { registerEntityPanelHooks(); });

beforeEach(() => {
  savedActors = game.actors;
  actors = [settlementActor('settle-1', 'Bleakhold')];
  game.actors = {
    get: (id) => actors.find(a => a.id === id) ?? null,
    [Symbol.iterator]: () => actors[Symbol.iterator](),
  };
  game.settings._store.set(KEY, { currentLocationId: null, dismissedEntities: ['the hooded figure'] });
  panel = EntityPanelApp.open();
  panel.rendered = true;
  vi.spyOn(panel, 'render');   // after open(): counts only hook-driven renders
});

afterEach(() => {
  game.settings._store.delete(KEY);
  game.actors = savedActors;
});

/** The world write of a campaignState field lands: the store changes and the setting hook fires, as on every client. */
function worldWrites(patch) {
  game.settings._store.set(KEY, { ...game.settings.get(MODULE_ID, 'campaignState'), ...patch });
  Hooks.call('updateSetting', { key: KEY }, { value: '…' }, {}, 'gm-1');
}

describe('an open Entities panel follows the campaignState it shows (issue #331 X56)', () => {
  it('control: the Session panel re-renders on the campaignState hook', () => {
    const session = SessionPanelApp.open();
    session.rendered = true;
    const spy = vi.spyOn(session, 'render');
    worldWrites({ sessionActive: true });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('control: an entity Actor record update still re-renders the Entities panel', () => {
    Hooks.call('updateActor', actors[0], { _id: 'settle-1', flags: { [MODULE_ID]: { settlement: { population: 'Many' } } } }, {}, 'gm-1');
    expect(panel.render).toHaveBeenCalledTimes(1);
  });

  it('the detail view re-renders when `!at` elsewhere makes its place the current location', async () => {
    await EntityPanelApp.DEFAULT_OPTIONS.actions.selectEntity.call(panel, {}, { dataset: { journalId: 'settle-1' } });
    expect((await panel._prepareContext({})).isCurrentLocation).toBe(false);   // "Set as current location" is showing
    panel.render.mockClear();

    worldWrites({ currentLocationId: 'settle-1', currentLocationType: 'settlement' });

    expect(panel.render).toHaveBeenCalledTimes(1);
    expect((await panel._prepareContext({})).isCurrentLocation).toBe(true);    // the re-render shows it current
  });

  it('the Dismissed tab re-renders when a draft card Dismiss elsewhere adds a name', async () => {
    await EntityPanelApp.DEFAULT_OPTIONS.actions.switchTopTab.call(panel, {}, { dataset: { tab: 'dismissed' } });
    expect((await panel._prepareContext({})).dismissedEntities).toEqual(['the hooded figure']);
    panel.render.mockClear();

    worldWrites({ dismissedEntities: ['the hooded figure', 'the dockmaster'] });

    expect(panel.render).toHaveBeenCalledTimes(1);
  });

  it('a campaignState write that changes neither field re-renders nothing', async () => {
    await panel._prepareContext({});
    panel.render.mockClear();
    worldWrites({ sessionActive: true, momentumNote: 'unrelated' });
    Hooks.call('updateSetting', { key: `${MODULE_ID}.someOtherSetting` }, { value: '…' }, {}, 'gm-1');
    expect(panel.render).not.toHaveBeenCalled();
  });
});

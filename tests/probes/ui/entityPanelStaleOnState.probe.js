/**
 * PROBE — UI-01 ENTITY-PANEL-STALE-ON-STATE (UX / WRONG-DETAIL)
 * (src/ui/entityPanel.js EntityPanelApp.registerHooks, lines 1074–1142;
 *  _prepareContext lines 227–253)
 *
 * What the user does: a player (or the GM) has the Entities panel open on a
 * settlement's detail view — its "Set as current location" button — while
 * the GM types `!at Bleakhold` in chat (index.js handleAtCommand writes
 * campaignState.currentLocationId); or has the panel's Dismissed tab open
 * while the GM presses Dismiss on a New Entities Detected draft card
 * (handleDraftDismiss writes campaignState.dismissedEntities).
 *
 * What happens: the panel reads currentLocationId and dismissedEntities from
 * campaignState in _prepareContext, but registerHooks subscribes only to
 * journal and Actor document hooks — never to the `updateSetting` /
 * `createSetting` hook that the campaignState write fires on every client.
 * So the open panel keeps showing "Set as current location" for a place the
 * world already holds as current (and the Dismissed tab keeps a name that was
 * just dismissed off the list) until one of the panel's own buttons re-renders
 * it. Worse than cosmetic: the button is a toggle read live at the click
 * (#onSetCurrentLocation: `isAlreadyCurrent` → clears), so the GM who presses
 * the stale "Set as current location" CLEARS the current location they meant
 * to set.
 *
 * What should happen: like the Session panel (sessionPanel.js open():
 * `Hooks.on("updateSetting", onSettingChanged)`) and the Progress Tracks and
 * Clocks panels (issue #322 V12 CLOCKS-PANEL-STALE — "each re-renders on the
 * campaignState hook when its clocks changed"), an open Entities panel
 * re-renders when the campaignState fields it displays change — local-only,
 * no shared write.
 *
 * Controls: the Session panel re-renders on the same hook (passes today);
 * an Actor-record update still re-renders the Entities panel (#300 F12).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/ui/entityPanelStaleOnState.probe.js
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { EntityPanelApp, registerEntityPanelHooks } from '../../../src/ui/entityPanel.js';
import { SessionPanelApp } from '../../../src/ui/sessionPanel.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

function settlementActor(id, name) {
  const flags = { [MODULE_ID]: { settlement: { name, population: 'Few' } } };
  return { id, name, type: 'location', flags, getFlag: (mod, key) => flags[mod]?.[key] };
}

let actors;
let panel;

beforeAll(() => { registerEntityPanelHooks(); });

beforeEach(() => {
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
});

/** The world write of a campaignState field lands: the store changes and the setting hook fires, as on every client. */
function worldWrites(patch) {
  game.settings._store.set(KEY, { ...game.settings.get(MODULE_ID, 'campaignState'), ...patch });
  Hooks.call('updateSetting', { key: KEY }, { value: '…' }, {}, 'gm-1');
}

describe('UI-01 an open Entities panel follows the campaignState it displays', () => {
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
    panel.render.mockClear();
    expect((await panel._prepareContext({})).isCurrentLocation).toBe(false);   // "Set as current location" is showing

    worldWrites({ currentLocationId: 'settle-1', currentLocationType: 'settlement' });

    // FAILS today: 0 — the panel never subscribes to updateSetting, so the
    // button still reads "Set as current location" for the place the world
    // holds as current, and a press on it now clears the location.
    expect(panel.render).toHaveBeenCalledTimes(1);
  });

  it('the Dismissed tab re-renders when a draft card Dismiss elsewhere adds a name', async () => {
    await EntityPanelApp.DEFAULT_OPTIONS.actions.switchTopTab.call(panel, {}, { dataset: { tab: 'dismissed' } });
    panel.render.mockClear();
    expect((await panel._prepareContext({})).dismissedEntities).toEqual(['the hooded figure']);

    worldWrites({ dismissedEntities: ['the hooded figure', 'the dockmaster'] });

    // FAILS today: 0 — the tab keeps listing one name until a panel button is pressed.
    expect(panel.render).toHaveBeenCalledTimes(1);
  });
});

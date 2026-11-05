/**
 * PROBE — SECTORS-01 SITE-PINS-NOT-POSITION-ANCHORS (tenth audit, area sectors)
 *
 * What the user does: the crew finishes an expedition to a charted derelict
 * (or the GM types `!at Derelict Starship`, or presses "Set as current
 * location" on the site). Later the GM drags the ship's token onto the
 * derelict's pin on the sector map — the pin the reveal charted with the
 * site's real name.
 *
 * What happens: (a) the arrival writes a position record naming the site
 * (`nearestLocationId`, "docked at Derelict Starship" — issue #326 W65), but
 * `syncCommandVehicleTokenToPosition` returns before looking for a pin
 * unless the record names a SETTLEMENT (src/sectors/sectorSceneHooks.js
 * `if (!position?.nearestSettlementId) return null`), so the token stays on
 * the settlement it left — the map lies. (b) The drop on the site pin is
 * not a Set a Course (`nearestSettlementNote` reads settlement pins only),
 * so it is a position note; `computeTokenPositionRecord` looks for a
 * settlement pin within three cells, finds none (site slots sit five or
 * more cells off the cluster) and records "deep space" — the narrator is
 * told the ship drifts in deep space while the map shows it on the derelict
 * and CURRENT LOCATION still names the settlement. Same guard in
 * `restoreShipPositionAfterXCard` (narrator.js: the token follows a
 * restored settlement or planet position only) and through every caller
 * of the sync (`maybeUpdateShipPositionFromName`, the Entities panel's
 * `moveShipToLocation`, the narrator sidecar's `applyShipPositionChanges`).
 *
 * What should happen: a charted site's pin is a position anchor like a
 * settlement's — the pin carries the site's location Actor id
 * (`flags.actorId`, sceneBuilder.js), the id W65's record names. The
 * decision "Ship position: a sector-map token is authoritative when
 * present" (decisions.md 2026-06-12) exists so "the narrator and the map
 * could [not] both be confidently wrong in different directions"; the
 * site-flow doc says a charted site is "the CURRENT LOCATION … the moment
 * the crew actually goes there". An UNDISCOVERED site's pin must stay out
 * of it ("Unexplored Site": its name is not yet the table's).
 *
 * Control: a settlement pin anchors both ways today; an undiscovered site's
 * pin records honest deep space and leaks no name.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sectors/sitePinsNotPositionAnchors.probe.js
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeTokenPositionRecord,
  syncCommandVehicleTokenToPosition,
} from '../../../src/sectors/sectorSceneHooks.js';
import { formatShipPositionLine } from '../../../src/factContinuity/shipPosition.js';

const MODULE_ID = 'starforged-companion';
const GRID = 100;

// The pins createSectorScene writes (sceneBuilder.js): a settlement pin and a
// site pin, with the flags it stamps on each.
function settlementNote(id, actorId, gridX, gridY, name) {
  return {
    id, x: gridX * GRID, y: gridY * GRID, text: name,
    flags: { [MODULE_ID]: { sectorNote: true, settlementId: id, actorId, locationType: 'orbital' } },
  };
}
function siteNote(siteId, actorId, gridX, gridY, { discovered, name }) {
  return {
    id: `note-${siteId}`, x: gridX * GRID, y: gridY * GRID,
    text: discovered ? name : 'Unexplored Site',
    flags: { [MODULE_ID]: { sectorNote: true, siteNote: true, siteId, actorId, siteType: 'derelict', discovered } },
  };
}
function makeScene({ notes, token = null }) {
  return {
    id: 'scene-1', grid: { size: GRID },
    flags: { [MODULE_ID]: { sectorScene: true, sectorId: 'sec-1' } },
    notes: { contents: notes },
    tokens: { contents: token ? [token] : [] },
  };
}
function makeToken(x, y) {
  return {
    id: 'tok-ship', x, y,
    flags: { [MODULE_ID]: { commandVehicle: true } },
    update: vi.fn(async function (patch) { Object.assign(this, patch); }),
  };
}

// Bleakhold at grid (3, 2) — the cluster; the derelict at SITE_SLOTS[0], grid (14, 1).
const BLEAKHOLD = settlementNote('gen-A', 'actor-bleak', 3, 2, 'Bleakhold');
const SITE_XY   = { x: 14 * GRID, y: 1 * GRID };
const state     = { sectors: [{ id: 'sec-1', name: 'Outlands Mark' }], activeSectorId: 'sec-1', locationIds: ['actor-site'], settlementIds: ['actor-bleak'] };

let prevScenes;
beforeEach(() => {
  prevScenes = global.game.scenes;
  game.actors._reset();
  game.actors._set('actor-site', makeTestActor({
    id: 'actor-site', type: 'location', name: 'Derelict Starship',
    flags: { [MODULE_ID]: { entityType: 'location', location: { _id: 'rec-site', name: 'Derelict Starship', type: 'derelict', sectorId: 'sec-1' } } },
  }));
  game.actors._set('actor-bleak', makeTestActor({
    id: 'actor-bleak', type: 'location', name: 'Bleakhold',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: 'Bleakhold', sectorId: 'sec-1' } } },
  }));
});
afterEach(() => { global.game.scenes = prevScenes; });

describe('SECTORS-01 (a) the ship token dropped on a charted site pin', () => {
  it('records the site as the position, as the map shows it', () => {
    const scene = makeScene({ notes: [BLEAKHOLD, siteNote('site-1', 'actor-site', 14, 1, { discovered: true, name: 'Derelict Starship' })] });

    const p = computeTokenPositionRecord(scene, SITE_XY.x, SITE_XY.y);

    expect(p.nearestSettlementId).toBeNull();
    // Expected: the charted site's location Actor (the id its pin carries, the
    // id a W65 record names). Actual: no location at all, freeText "deep space".
    expect(p.nearestLocationId).toBe('actor-site');
    expect.soft(p.freeText).toBe('Derelict Starship');
    expect.soft(formatShipPositionLine(p, state, 'Wayfinder')).toBe('SHIP POSITION: Wayfinder near Derelict Starship (Outlands Mark)');
  });

  it('control: an undiscovered site pin stays honest deep space and leaks no name', () => {
    const scene = makeScene({ notes: [BLEAKHOLD, siteNote('site-1', 'actor-site', 14, 1, { discovered: false, name: 'Derelict Starship' })] });
    const p = computeTokenPositionRecord(scene, SITE_XY.x, SITE_XY.y);
    expect(p.nearestSettlementId).toBeNull();
    expect(p.nearestLocationId ?? null).toBeNull();
    expect(p.freeText).toBe('deep space');
    expect(JSON.stringify(p)).not.toContain('Derelict Starship');
  });

  it('control: a token parked beside the settlement pin reads near it', () => {
    const scene = makeScene({ notes: [BLEAKHOLD] });
    const p = computeTokenPositionRecord(scene, BLEAKHOLD.x + GRID, BLEAKHOLD.y);
    expect(p.nearestSettlementId).toBe('actor-bleak');
    expect(p.freeText).toBe('Bleakhold');
  });
});

describe('SECTORS-01 (b) the map follows an arrival at a charted site', () => {
  const sitePosition = {
    sectorId: 'sec-1', nearestSettlementId: null, nearestPlanetId: null,
    nearestLocationId: 'actor-site', freeText: 'Derelict Starship',
    updatedAt: 1, updatedBy: 'expedition',   // a Finish an Expedition arrival ("docked at")
  };

  it('moves the command-vehicle token onto the site pin', async () => {
    const token = makeToken(BLEAKHOLD.x, BLEAKHOLD.y);
    const scene = makeScene({ notes: [BLEAKHOLD, siteNote('site-1', 'actor-site', 14, 1, { discovered: true, name: 'Derelict Starship' })], token });
    global.game.scenes = { contents: [scene] };

    const moved = await syncCommandVehicleTokenToPosition(sitePosition, state);

    // Expected: the token snaps to the derelict's pin (the fiction→token sync
    // the settlement arrival gets). Actual: null — the sync returns before it
    // looks for a pin, and the token sits on Bleakhold.
    expect(moved).toBe(token);
    expect(token.update).toHaveBeenCalledWith({ x: SITE_XY.x, y: SITE_XY.y }, { sfcPositionSync: true });
  });

  it('control: a settlement arrival moves the token onto the settlement pin', async () => {
    const token = makeToken(SITE_XY.x, SITE_XY.y);
    const scene = makeScene({ notes: [BLEAKHOLD, siteNote('site-1', 'actor-site', 14, 1, { discovered: true, name: 'Derelict Starship' })], token });
    global.game.scenes = { contents: [scene] };

    const moved = await syncCommandVehicleTokenToPosition(
      { ...sitePosition, nearestSettlementId: 'actor-bleak', nearestLocationId: null, freeText: '', updatedBy: 'set_a_course' }, state,
    );
    expect(moved).toBe(token);
    expect(token.update).toHaveBeenCalledWith({ x: BLEAKHOLD.x, y: BLEAKHOLD.y }, { sfcPositionSync: true });
  });
});

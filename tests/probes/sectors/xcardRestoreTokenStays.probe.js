/**
 * SECT-2 — the X-Card puts the ship's record back, but leaves its token on the
 * removed narration's destination.
 *
 * The ship sits in deep space on the sector map: its token was parked there,
 * and the token is the position statement (decisions.md "Ship position: a
 * sector-map token is authoritative when present") — the record is
 * `token_placement`, "deep space". A narration moves the ship to Krell's Den
 * (the REQUIRED ship/position emission): the record names the settlement and
 * the fiction→token sync puts the token on Krell's pin. The table X-Cards that
 * narration. restoreShipPositionAfterXCard writes the deep-space record back
 * (issue #325 W07) and calls the sync, which moves a token only to a pin — so
 * the token stays on Krell's Den: the map keeps showing the removed beat's
 * destination while the narrator is told "deep space", and the next nudge of
 * the token re-records "near Krell's Den" (the token is authoritative). The
 * same happens to a ship the removed narration moved from no position at all.
 *
 * An X-Card reaches every store the removed beat wrote (decisions.md [W05–W07]);
 * the token's place on the map is one — the beat moved it.
 *
 * Production wiring: the narrator's sidecar apply (applyNarratorSidecar) and
 * the X-Card's suppressScene, as tests/unit/xcardShipPosition.test.js drives
 * them; the scene is the shape createSectorScene writes.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { applyNarratorSidecar, postNarrationCard } from '../../../src/narration/narrator.js';
import { suppressScene } from '../../../src/context/safety.js';
import { computeTokenPositionRecord } from '../../../src/sectors/sectorSceneHooks.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const GRID = 100;

const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const shipPosition = () => game.actors.get('actor-ship').flags[MODULE_ID].ship.position;
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };

// Krell's Den at grid (6, 6); Firstlight at grid (2, 2); the ship parked in
// deep space at grid (12, 8) — more than three cells from either pin.
const KRELL_XY = { x: 6 * GRID, y: 6 * GRID };
const FIRST_XY = { x: 2 * GRID, y: 2 * GRID };
const DEEP_XY  = { x: 12 * GRID, y: 8 * GRID };

function settlement(id, name) {
  game.actors._set(id, makeTestActor({
    id, name, type: 'location',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${id}`, name, sectorId: 'sec-1' } } },
  }));
}
function settlementPin(id, actorId, xy, name) {
  return { id, x: xy.x, y: xy.y, text: name,
    flags: { [MODULE_ID]: { sectorNote: true, settlementId: id, actorId, locationType: 'orbital' } } };
}

let token;
let scene;
let prevScenes;

/** A move narration as the narrator makes one: the sidecar applied with its id, then its card. */
async function narrate(narrationId, prose, sidecar) {
  const raw = `${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``;
  const text = applyNarratorSidecar(raw, stored(), { narrationId });
  await postNarrationCard(text, { moveId: 'set_a_course', outcome: 'strong_hit', _id: `res-${narrationId}` },
    stored(), { playerText: 'We burn for the outpost.', playerName: 'Kira', narrationId });
}

const TO_KRELL = {
  newTruths:    [],
  stateChanges: [{ subject: 'ship', attribute: 'position', value: "Krell's Den" }],
};

beforeEach(() => {
  prevScenes = global.game.scenes;
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];

  settlement('act-first', 'Firstlight');
  settlement('act-krell', "Krell's Den");
  token = {
    id: 'tok-ship', x: DEEP_XY.x, y: DEEP_XY.y,
    flags: { [MODULE_ID]: { commandVehicle: true } },
    update: vi.fn(async function (patch) { Object.assign(this, patch); }),
  };
  scene = {
    id: 'scene-1', grid: { size: GRID },
    flags: { [MODULE_ID]: { sectorScene: true, sectorId: 'sec-1' } },
    notes: { contents: [settlementPin('gen-first', 'act-first', FIRST_XY, 'Firstlight'), settlementPin('gen-krell', 'act-krell', KRELL_XY, "Krell's Den")] },
    tokens: { contents: [token] },
  };
  global.game.scenes = { contents: [scene], get: (id) => (id === 'scene-1' ? scene : null) };

  game.settings._store.set(KEY, {
    currentSessionId: 'sess-7', sessionNumber: 3, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    sectors: [{ id: 'sec-1', name: 'Outlands Mark' }], activeSectorId: 'sec-1',
    shipIds: ['actor-ship'], settlementIds: ['act-first', 'act-krell'],
    xCardActive: false, xCardPlays: 0,
  });
});
afterEach(() => { global.game.scenes = prevScenes; });

function shipAt(position) {
  game.actors._set('actor-ship', makeTestActor({
    id: 'actor-ship', type: 'starship', name: 'Wayfinder',
    flags: { [MODULE_ID]: { entityType: 'ship', ship: {
      _id: 'rec-ship', name: 'Wayfinder', isCommandVehicle: true,
      ...(position ? { position } : {}),
    } } },
  }));
}

describe('SECT-2: the X-Card takes the ship token off the removed narration\'s destination', () => {
  it('a ship parked in deep space: after the X-Card the token is back where it was, not on Krell\'s Den', async () => {
    // The token's own place is the record: deep space (the production record).
    const parked = computeTokenPositionRecord(scene, DEEP_XY.x, DEEP_XY.y);
    expect(parked.freeText).toBe('deep space');
    shipAt(parked);

    await narrate('nar-krell', "The Wayfinder noses into Krell's Den.", TO_KRELL);
    await vi.waitFor(() => expect(shipPosition().nearestSettlementId).toBe('act-krell'));
    // The narration moved the token onto Krell's pin (the setup is real).
    await vi.waitFor(() => expect({ x: token.x, y: token.y }).toEqual(KRELL_XY));
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    // The record is put back (W07 — passes)…
    expect(shipPosition()).toMatchObject({ freeText: 'deep space', nearestSettlementId: null, narrationId: null });
    // …but the token still sits on the removed destination's pin.
    expect({ x: token.x, y: token.y }).toEqual(DEEP_XY);   // actual: { x: 600, y: 600 } — Krell's Den
  });

  it('a ship the removed narration moved from no position: the token does not stay on the removed destination', async () => {
    shipAt(null);
    await narrate('nar-krell', "The Wayfinder noses into Krell's Den.", TO_KRELL);
    await vi.waitFor(() => expect({ x: token.x, y: token.y }).toEqual(KRELL_XY));
    syncChat();

    await suppressScene({}, { local: true });
    expect(shipPosition().nearestSettlementId).toBeNull();   // the record is emptied (passes)
    expect({ x: token.x, y: token.y }).not.toEqual(KRELL_XY);   // actual: still on Krell's Den
  });

  it('control: a ship that was docked at Firstlight goes back there, token and all', async () => {
    shipAt({ sectorId: 'sec-1', nearestSettlementId: 'act-first', nearestPlanetId: null, nearestLocationId: null,
      freeText: '', updatedAt: 1, updatedBy: 'set_a_course', narrationId: null, previous: null });
    token.x = FIRST_XY.x; token.y = FIRST_XY.y;

    await narrate('nar-krell', "The Wayfinder noses into Krell's Den.", TO_KRELL);
    await vi.waitFor(() => expect({ x: token.x, y: token.y }).toEqual(KRELL_XY));
    syncChat();

    await suppressScene({}, { local: true });
    expect(shipPosition().nearestSettlementId).toBe('act-first');
    expect({ x: token.x, y: token.y }).toEqual(FIRST_XY);
  });
});

/**
 * STARFORGED COMPANION
 * tests/unit/shipPositionFlagMerge.test.js
 *
 * SHIP-POSITION-FLAG-MERGE (issue #338's open items). The command vehicle's
 * position is written through `updateShip` → `setFlag`, and Foundry's
 * `setFlag` is an update that MERGES the new object into the stored one key by
 * key (the issue #321 U40 shape): a key the new record leaves out keeps its
 * old value. A narrator-sidecar move records `narrationId` and `previous`
 * (issue #325 W07); the records `!at`, Set a Course, an expedition's arrival,
 * the Entities panel and a token move write (`inferShipPosition`,
 * `inferShipPositionFromEntityId`, `emptyPosition`, `computeTokenPositionRecord`)
 * carried neither, so the sidecar move's survived them — and an X-Card on
 * that narration then "restored" the ship to where it was before the
 * narration, reverting the GM's later move. The unit stubs' `setFlag`
 * replaces, so no test saw it; this one merges, as Foundry does.
 *
 * Every position record is now written with `narrationId: null, previous:
 * null` unless a narration set them, and the X-Card's restore writes both too.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard, restoreShipPositionAfterXCard } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { maybeUpdateShipPositionFromName } from '../../src/index.js';
import { handleCommandVehicleTokenReposition, computeTokenPositionRecord } from '../../src/sectors/sectorSceneHooks.js';
import { emptyPosition, inferShipPosition, inferShipPositionFromEntityId } from '../../src/factContinuity/shipPosition.js';
import { updateShip } from '../../src/entities/ship.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-8';
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };
const ship = () => game.actors.get('actor-ship');
const position = () => ship().flags[MODULE_ID].ship.position;

/** Foundry's update merge (mergeObject): plain objects merge key by key; anything else replaces. */
function mergeLikeFoundry(target, source) {
  for (const [key, value] of Object.entries(source)) {
    const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);
    if (plain(value) && plain(target[key])) mergeLikeFoundry(target[key], value);
    else target[key] = plain(value) || Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : value;
  }
  return target;
}

function settlement(id, name) {
  game.actors._set(id, makeTestActor({
    id, name, type: 'location',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${id}`, name } } },
  }));
}

beforeEach(() => {
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
  settlement('act-bleak', 'Bleakhold');
  const cv = makeTestActor({
    id: 'actor-ship', type: 'starship', name: 'Wayfinder',
    flags: { [MODULE_ID]: { entityType: 'ship', ship: {
      _id: 'rec-ship', name: 'Wayfinder', isCommandVehicle: true,
      // A record written before this fix: no narrationId / previous keys.
      position: { nearestSettlementId: 'act-first', nearestPlanetId: null, sectorId: null, freeText: '', updatedBy: 'at_command' },
    } } },
  });
  // setFlag merges, as Foundry's does.
  cv.setFlag = async (mod, key, val) => {
    cv.flags[mod] ??= {};
    const current = cv.flags[mod][key];
    if (current && typeof current === 'object' && val && typeof val === 'object') mergeLikeFoundry(current, val);
    else cv.flags[mod][key] = JSON.parse(JSON.stringify(val));
  };
  game.actors._set('actor-ship', cv);
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 8, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    shipIds: ['actor-ship'], settlementIds: ['act-first', 'act-krell', 'act-bleak'],
    xCardActive: false, xCardPlays: 0,
  });
});

/** A narration that moves the ship to Krell's Den (the REQUIRED ship/position emission), then its card. */
async function narrateToKrell(narrationId = 'nar-krell') {
  const sidecar = { newTruths: [], stateChanges: [{ subject: 'ship', attribute: 'position', value: "Krell's Den" }] };
  const text = applyNarratorSidecar(`The Wayfinder noses into Krell's Den.\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``, stored(), { narrationId });
  await postNarrationCard(text, { moveId: 'set_a_course', outcome: 'strong_hit', _id: `res-${narrationId}` },
    stored(), { playerText: 'We burn for the outpost.', playerName: 'Kira', narrationId });
  await vi.waitFor(() => expect(position().nearestSettlementId).toBe('act-krell'));
  expect(position()).toMatchObject({ narrationId, previous: expect.objectContaining({ nearestSettlementId: 'act-first' }) });
}
const playXCard = async () => { syncChat(); expect(await suppressScene({}, { local: true })).toBe(true); };

describe('SHIP-POSITION-FLAG-MERGE — a later move clears the narration a sidecar move recorded', () => {
  it('control: the merging stub keeps a key the new record leaves out (Foundry\'s setFlag)', async () => {
    await ship().setFlag(MODULE_ID, 'probe', { a: 1, b: 2 });
    await ship().setFlag(MODULE_ID, 'probe', { a: 3 });
    expect(ship().flags[MODULE_ID].probe).toEqual({ a: 3, b: 2 });
  });

  it('every position record names no narration and no earlier position', () => {
    const cs = stored();
    expect(emptyPosition()).toMatchObject({ narrationId: null, previous: null });
    expect(inferShipPosition('Bleakhold', cs, { source: 'at_command' })).toMatchObject({ nearestSettlementId: 'act-bleak', narrationId: null, previous: null });
    expect(inferShipPosition('somewhere in the drift', cs)).toMatchObject({ narrationId: null, previous: null });
    expect(inferShipPositionFromEntityId('act-bleak', cs, { source: 'expedition' })).toMatchObject({ narrationId: null, previous: null });
    const scene = { grid: { size: 100 }, flags: { [MODULE_ID]: { sectorScene: true, sectorId: 'sec-1' } }, notes: { contents: [] } };
    expect(computeTokenPositionRecord(scene, 0, 0)).toMatchObject({ narrationId: null, previous: null });
  });

  it.each([
    ['`!at Bleakhold`',                         () => maybeUpdateShipPositionFromName('Bleakhold', stored(), 'at_command')],
    ['a Set a Course arrival',                   () => maybeUpdateShipPositionFromName('Bleakhold', stored(), 'set_a_course')],
    ['an expedition arrival / the Entities panel', () => maybeUpdateShipPositionFromName('Bleakhold', stored(), 'expedition', { entityId: 'act-bleak' })],
  ])('after %s, the X-Card on the earlier narration leaves the ship where the GM put it', async (_label, move) => {
    await narrateToKrell();
    await move();
    expect(position()).toMatchObject({ nearestSettlementId: 'act-bleak', narrationId: null, previous: null });

    await playXCard();
    expect(stored().xCardedNarrationIds).toEqual(['nar-krell']);
    expect(position().nearestSettlementId, 'the GM\'s later move stands').toBe('act-bleak');
  });

  it('after a token move on the sector map, the X-Card leaves the token\'s position', async () => {
    await narrateToKrell();
    const scene = { id: 'scene-1', grid: { size: 100 }, flags: { [MODULE_ID]: { sectorScene: true, sectorId: 'sec-1' } }, notes: { contents: [] } };
    const token = { id: 'tok-ship', x: 900, y: 900, parent: scene, flags: { [MODULE_ID]: { commandVehicle: true } } };
    await handleCommandVehicleTokenReposition(token, { x: 900, y: 900 }, {}, 'gm-1');
    expect(position()).toMatchObject({ freeText: 'deep space', updatedBy: 'token_placement', narrationId: null, previous: null });

    await playXCard();
    expect(position()).toMatchObject({ freeText: 'deep space', updatedBy: 'token_placement' });
    expect(position().nearestSettlementId).toBeNull();
  });

  it('the X-Card\'s restore writes no narration either: the record it puts back is not the removed one\'s', async () => {
    await narrateToKrell();
    await playXCard();
    expect(position().nearestSettlementId).toBe('act-first');
    expect(position(), 'the restored position, merged over the removed one').toMatchObject({ narrationId: null, previous: null });
  });

  it('a ship\'s first position record carries no narration either', async () => {
    delete ship().flags[MODULE_ID].ship.position;
    await updateShip('actor-ship', { position: inferShipPosition('Bleakhold', stored(), { source: 'at_command' }) });
    expect(position()).toMatchObject({ nearestSettlementId: 'act-bleak', narrationId: null, previous: null });
  });

  it('control: restoreShipPositionAfterXCard leaves a position no removed narration wrote', async () => {
    await maybeUpdateShipPositionFromName('Bleakhold', stored(), 'at_command');
    expect(await restoreShipPositionAfterXCard(['nar-other'], stored())).toBe(false);
    expect(position().nearestSettlementId).toBe('act-bleak');
  });
});

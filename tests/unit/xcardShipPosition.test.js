/**
 * The X-Card undoes the ship move its narration made (issue #325 W07).
 *
 * A narration that moves the command vehicle carries the REQUIRED
 * { "subject": "ship", "attribute": "position", "value": "Krell's Den" }
 * (appendSidecarInstruction). The X-Card takes the narration out of narrator
 * memory (issue #321 U07): its card flagged, its truths retracted, its state
 * and frame removed. The ship-position change was routed around the ledgers
 * to the ship record (updateShip, and the sector token) with no narration id,
 * and nothing on the X-Card path touched it: after a resume every prompt's
 * never-dropped SHIP POSITION line still named the removed destination.
 * The position record now carries the narration's id and the position before
 * it; the X-Card restores that one (suppressScene's finish →
 * restoreShipPositionAfterXCard).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { applyNarratorSidecar, postNarrationCard } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';

const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const shipPosition = () => game.actors.get('actor-ship').flags[MODULE_ID].ship.position;
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };

function settlement(id, name) {
  game.actors._set(id, makeTestActor({
    id, name, type: 'location',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${id}`, name } } },
  }));
}

/** A move narration as the narrator makes one: the sidecar applied with its id, then its card. */
async function narrate(narrationId, prose, sidecar) {
  const raw = `${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``;
  const text = applyNarratorSidecar(raw, stored(), { narrationId });
  await postNarrationCard(text, { moveId: 'set_a_course', outcome: 'strong_hit', _id: `res-${narrationId}` },
    stored(), { playerText: 'We burn for the outpost.', playerName: 'Kira', narrationId });
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
  game.actors._set('actor-ship', makeTestActor({
    id: 'actor-ship', type: 'starship', name: 'Wayfinder',
    flags: { [MODULE_ID]: { entityType: 'ship', ship: {
      _id: 'rec-ship', name: 'Wayfinder', isCommandVehicle: true,
      position: { nearestSettlementId: 'act-first', nearestPlanetId: null, sectorId: null, freeText: '', updatedBy: 'at_command' },
    } } },
  }));
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 3, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    shipIds: ['actor-ship'], settlementIds: ['act-first', 'act-krell'],
    xCardActive: false, xCardPlays: 0,
  });
});

const TO_KRELL = {
  newTruths:    [{ subject: "Krell's Den", fact: 'Sells captives to the highest bidder' }],
  stateChanges: [{ subject: 'ship', attribute: 'position', value: "Krell's Den" }],
  sceneFrame:   { location: "Krell's Den", present: [], situation: 'Docking among the slavers' },
};

describe('the X-Card undoes the ship move its narration made', () => {
  it('control: the narration moves the ship (the REQUIRED ship/position emission lands on the ship record)', async () => {
    await narrate('nar-krell', "The Wayfinder noses into Krell's Den.", TO_KRELL);
    await vi.waitFor(() => expect(shipPosition().nearestSettlementId).toBe('act-krell'));
  });

  it('after the X-Card on that narration, the ship is no longer at the removed destination', async () => {
    await narrate('nar-krell', "The Wayfinder noses into Krell's Den.", TO_KRELL);
    await vi.waitFor(() => expect(shipPosition().nearestSettlementId).toBe('act-krell'));
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    // The ledger side of the narration is gone (U07)…
    expect(stored().xCardedNarrationIds).toEqual(['nar-krell']);
    expect(stored().sceneFrame).toBeNull();

    // …and so is the ship move: back at Firstlight.
    expect(shipPosition().nearestSettlementId).not.toBe('act-krell');
    expect(shipPosition().nearestSettlementId).toBe('act-first');
  });

  it("after the X-Card, the next prompt's SHIP POSITION line does not name the removed destination", async () => {
    await narrate('nar-krell', "The Wayfinder noses into Krell's Den.", TO_KRELL);
    await vi.waitFor(() => expect(shipPosition().nearestSettlementId).toBe('act-krell'));
    syncChat();
    await suppressScene({}, { local: true });

    expect(buildLedgerBlock(stored(), {}).shipPosition).not.toMatch(/Krell/);
  });

  it('a ship the removed narration moved from nowhere recorded is left with no position, not the removed one', async () => {
    const ship = game.actors.get('actor-ship');
    delete ship.flags[MODULE_ID].ship.position;
    await narrate('nar-krell', "The Wayfinder noses into Krell's Den.", TO_KRELL);
    await vi.waitFor(() => expect(shipPosition().nearestSettlementId).toBe('act-krell'));
    syncChat();
    await suppressScene({}, { local: true });

    expect(shipPosition().nearestSettlementId).toBeNull();
    expect(shipPosition().narrationId).toBeUndefined();
  });

  it('control: an X-Card on a later narration leaves the ship where an earlier one moved it', async () => {
    await narrate('nar-krell', "The Wayfinder noses into Krell's Den.", TO_KRELL);
    await vi.waitFor(() => expect(shipPosition().nearestSettlementId).toBe('act-krell'));
    await ChatMessage.create({ content: 'We wait in the hold.', flags: {} });
    await narrate('nar-hold', 'The hold is quiet.', { newTruths: [], stateChanges: [] });
    syncChat();
    await suppressScene({}, { local: true });

    expect(stored().xCardedNarrationIds).toEqual(['nar-hold']);
    expect(shipPosition().nearestSettlementId).toBe('act-krell');
  });
});

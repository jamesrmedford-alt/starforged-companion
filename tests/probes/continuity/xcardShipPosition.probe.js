/**
 * PROBE — FC-02 XCARD-SHIP-POSITION
 * (src/narration/narrator.js applySidecarSideData → applyShipPositionChanges;
 *  src/factContinuity/ledgers.js retractNarrations; src/context/safety.js suppressScene)
 *
 * What the user does: a narration moves the command vehicle — its sidecar
 * carries the REQUIRED { "subject": "ship", "attribute": "position", "value":
 * "Krell's Den" } (appendSidecarInstruction) — and a player plays the X-Card
 * on that narration.
 *
 * What happens: the X-Card takes the narration out of narrator memory (issue
 * #321 U07, the maintainer's full exclusion): its card is flagged, its truths
 * retracted, its state and frame removed. But the ship-position change was
 * routed AROUND the ledgers to the ship record (updateShip — and the sector
 * token, syncCommandVehicleTokenToPosition) with no narration id, and nothing
 * on the X-Card path touches it. After a GM resumes, every prompt still says
 * "SHIP POSITION: … near Krell's Den" (a never-dropped tier), so the removed
 * beat's destination comes straight back.
 *
 * What should happen: what the X-carded narration's sidecar wrote is undone
 * everywhere it was written — the ship is back where it was before that
 * narration (rules/narrator-memory.md 6b; decisions.md issue #321 U07: "a
 * ledger fact or summary line the removed narration wrote would bring the
 * beat back").
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { applyNarratorSidecar, postNarrationCard } from '../../../src/narration/narrator.js';
import { suppressScene } from '../../../src/context/safety.js';
import { buildLedgerBlock } from '../../../src/narration/narratorPrompt.js';

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

    // …but today the ship record still says Krell's Den: nearestSettlementId 'act-krell'.
    expect(shipPosition().nearestSettlementId).not.toBe('act-krell');
    expect(shipPosition().nearestSettlementId).toBe('act-first');
  });

  it("after the X-Card, the next prompt's SHIP POSITION line does not name the removed destination", async () => {
    await narrate('nar-krell', "The Wayfinder noses into Krell's Den.", TO_KRELL);
    await vi.waitFor(() => expect(shipPosition().nearestSettlementId).toBe('act-krell'));
    syncChat();
    await suppressScene({}, { local: true });

    // Today: "SHIP POSITION: Wayfinder near Krell's Den" — never dropped from the ledger block.
    expect(buildLedgerBlock(stored(), {}).shipPosition).not.toMatch(/Krell/);
  });
});

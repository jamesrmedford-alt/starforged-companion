/**
 * STARFORGED COMPANION
 * tests/unit/shipSeedReadsAMultiWordNameWhole.test.js
 *
 * Issue #364 SHIP-SEED-PLACE-NAME-PREFIX-OF-SHIP (found while fixing issue
 * #364 SHIP-SEED-NONSPATIAL-HIT-FIRST; pre-existing).
 *
 * A ship-position seed — where a narration's sidecar says the ship is, an
 * arrival's destination — is matched whole, then word by word
 * (shipPosition.matchSeedAgainstIndex), and since SHIP-SEED-NONSPATIAL-HIT-
 * FIRST the scan reads on past names that are not places to the first place
 * named. Word by word, a ship or a person whose name begins (or holds) a
 * one-word place's name was read as that place: with a ship "Bleakhold
 * Runner" and a settlement Bleakhold, "alongside the Bleakhold Runner" put the
 * ship at Bleakhold; and "orbiting Kaan Deep" — a location whose name holds
 * the planet Kaan's — put it at Kaan.
 *
 * Now the seed's multi-word names — any entity whose whole name of two or
 * more words the seed holds as whole words — are found before the word scan:
 * a non-place's words are taken out of the scan, and a place's name written
 * as a name is a hit where it stands, in the scan's own leftmost order. So
 * "alongside the Bleakhold Runner" names no place (free text, as issue #321
 * U43 keeps a phrase naming no place), "alongside the Bleakhold Runner at
 * Kaan" is Kaan's, and "orbiting Kaan Deep" is Kaan Deep's. A place's name in
 * prose case ("the derelict starship") is no hit, as its lowercase words were
 * none: its words are asked as before.
 *
 * Production wiring: a narration's REQUIRED ship/position sidecar entry →
 * applyNarratorSidecar → the ship record's position → the narrator's SHIP
 * POSITION line (as tests/unit/shipSeedReadsOnToThePlace.test.js).
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { applyNarratorSidecar } from '../../src/narration/narrator.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';
import { matchSeedAgainstIndex } from '../../src/factContinuity/shipPosition.js';
import { buildNameIndex } from '../../src/context/relevanceResolver.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const ent = (name, journalId, entityType) => ({ _id: `rec-${journalId}`, journalId, name, entityType, sectorId: 'sec-1' });
const roster = [
  ent('Bleakhold Runner', 'sh-runner', 'ship'),
  ent('Vigil Kade', 'npc-kade', 'connection'),
  ent('Bleakhold', 'set-bleak', 'settlement'),
  ent('Vigil', 'set-vigil', 'settlement'),
  ent('Kaan', 'pl-kaan', 'planet'),
  ent('Kaan Deep', 'loc-deep', 'location'),
  ent('The Vault of Tears', 'loc-vault', 'location'),
  ent('Derelict Starship', 'loc-derelict', 'location'),
  ent('Relay 734', 'loc-relay', 'location'),
];
const hit = (seed) => matchSeedAgainstIndex(buildNameIndex(roster, []), seed)?.journalId ?? null;

describe('issue #364 SHIP-SEED-PLACE-NAME-PREFIX-OF-SHIP — matchSeedAgainstIndex reads a multi-word name whole before its words', () => {
  it('a ship whose name begins with a place\'s names no place', () => {
    // It was Bleakhold: the word scan read "Bleakhold" alone.
    expect(hit('alongside the Bleakhold Runner')).toBeNull();
    expect(hit("in the Bleakhold Runner's wake")).toBeNull();
    expect(hit('alongside the bleakhold runner')).toBeNull();
  });

  it('a ship or a person named before the place: the place is the hit', () => {
    expect(hit('alongside the Bleakhold Runner at Kaan')).toBe('pl-kaan');
    expect(hit('beside Vigil Kade, out from Bleakhold')).toBe('set-bleak');
  });

  it('a place whose name holds another place\'s is that place', () => {
    // It was Kaan: the word scan read "Kaan" alone.
    expect(hit('orbiting Kaan Deep')).toBe('loc-deep');
    expect(hit("in Kaan Deep's shadow, alongside the Bleakhold Runner")).toBe('loc-deep');
  });

  it('controls: a one-word place, a multi-word place, the scan\'s leftmost order', () => {
    expect(hit('docked at Bleakhold')).toBe('set-bleak');
    expect(hit('Bleakhold')).toBe('set-bleak');
    expect(hit('the Vault of Tears')).toBe('loc-vault');
    expect(hit('holding off the Vault of Tears')).toBe('loc-vault');
    expect(hit('past Kaan toward the Vault of Tears')).toBe('pl-kaan');
    expect(hit('Bleakhold Runner')).toBeNull();
    expect(hit('Vigil Kade')).toBeNull();
  });

  it('controls: a place\'s name in prose case is no hit, its words asked as before', () => {
    expect(hit('beside the derelict starship off Kaan')).toBe('pl-kaan');
    expect(hit('holding off relay 734')).toBe('loc-relay');
    expect(hit('holding off Relay 734')).toBe('loc-relay');
  });
});

describe('issue #364 SHIP-SEED-PLACE-NAME-PREFIX-OF-SHIP — a narration that puts the ship "alongside the Bleakhold Runner"', () => {
  const stored = () => game.settings.get(MODULE_ID, 'campaignState');
  const shipPosition = () => game.actors.get('actor-ship').flags[MODULE_ID].ship.position;

  /** A narration's sidecar, applied as the narrator applies one. */
  function narrate(narrationId, prose, position) {
    const sidecar = { newTruths: [], stateChanges: [{ subject: 'ship', attribute: 'position', value: position, from: 'result' }] };
    applyNarratorSidecar(`${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``, stored(), { narrationId, mode: 'move_resolution', ground: { line: '', decided: '', rolled: true } });   // a rolled move's result: it binds, and moves the ship (overhaul 2 §6.3; issue #388 #2)
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

    for (const [id, name] of [['act-first', 'Firstlight'], ['act-bleak', 'Bleakhold'], ['act-vigil', 'Vigil']]) {
      game.actors._set(id, makeTestActor({
        id, name, type: 'location',
        flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${id}`, name } } },
      }));
    }
    game.actors._set('actor-runner', makeTestActor({
      id: 'actor-runner', type: 'starship', name: 'Bleakhold Runner',
      flags: { [MODULE_ID]: { entityType: 'ship', ship: { _id: 'rec-runner', name: 'Bleakhold Runner', isCommandVehicle: false } } },
    }));
    game.actors._set('actor-ship', makeTestActor({
      id: 'actor-ship', type: 'starship', name: 'Wayfinder',
      flags: { [MODULE_ID]: { entityType: 'ship', ship: {
        _id: 'rec-ship', name: 'Wayfinder', isCommandVehicle: true,
        position: { nearestSettlementId: 'act-first', nearestPlanetId: null, sectorId: null, freeText: '', updatedBy: 'at_command' },
      } } },
    }));
    game.settings._store.set(KEY, {
      currentSessionId: 'sess-7', sessionNumber: 3, currentSceneId: 'sc-1',
      sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
      shipIds: ['actor-ship', 'actor-runner'], settlementIds: ['act-first', 'act-bleak', 'act-vigil'],
      xCardActive: false, xCardPlays: 0,
    });
  });

  it('names no place: the position is the narrated phrase, not Bleakhold', async () => {
    narrate('nar-runner', 'The Wayfinder holds station alongside the Bleakhold Runner.', 'alongside the Bleakhold Runner');

    // It was Bleakhold: the ship's record and the SHIP POSITION line said so.
    await vi.waitFor(() => expect(shipPosition().narrationId).toBe('nar-runner'));
    expect(shipPosition().nearestSettlementId ?? null).toBeNull();
    expect(shipPosition().freeText).toBe('alongside the Bleakhold Runner');
    expect(buildLedgerBlock(stored(), {}).shipPosition).not.toMatch(/near Bleakhold/);
  });

  it('"alongside the Bleakhold Runner at Vigil" is a position at Vigil', async () => {
    narrate('nar-vigil', 'The Wayfinder docks at Vigil, alongside the Bleakhold Runner.', 'alongside the Bleakhold Runner at Vigil');

    await vi.waitFor(() => expect(shipPosition().nearestSettlementId).toBe('act-vigil'));
    expect(shipPosition().freeText).toBe('');
    expect(buildLedgerBlock(stored(), {}).shipPosition).toMatch(/Wayfinder near Vigil/);
  });

  it('control: "docked at Bleakhold" is Bleakhold', async () => {
    narrate('nar-bleak', 'The Wayfinder docks at Bleakhold.', 'docked at Bleakhold');

    await vi.waitFor(() => expect(shipPosition().nearestSettlementId).toBe('act-bleak'));
    expect(shipPosition().freeText).toBe('');
  });
});

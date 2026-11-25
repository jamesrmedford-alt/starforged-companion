/**
 * STARFORGED COMPANION
 * tests/unit/shipSeedReadsOnToThePlace.test.js
 *
 * Issue #364 SHIP-SEED-NONSPATIAL-HIT-FIRST (left open by issue #364
 * SHIP-SEED-NUMERIC-PART; decided by the maintainer: read on to the first
 * place named).
 *
 * A ship-position seed — where a narration's sidecar says the ship is, an
 * arrival's destination — is matched whole, then word by word in two passes
 * (capitalised words, then words with no capital to write), each word
 * through the name resolver (shipPosition.matchSeedAgainstIndex). The scan
 * returned the first name it found, and inferShipPosition keeps the narrated
 * phrase as free text when that name is not a place — a person, a ship, a
 * faction, a creature (issue #321 U43: "alongside the Covenant flagship"
 * became "The Covenant"). So "alongside Kael's tug at Bleakhold", with a
 * connection Kael Dros and a settlement Bleakhold, recorded no place: the
 * ship's position was free text, and the narrator was not told it was near
 * Bleakhold.
 *
 * Decided: the position reads on past names that are not places to the first
 * name that is one (a settlement, a planet, a location), in the scan's own
 * order. A phrase that names no place is still kept as free text, as U43
 * decided. A seed that is a non-place's whole name has nothing past it: it
 * names no place.
 *
 * The record for a place found past another name is that place's record, as
 * when the place is named first: a settlement's and a planet's free text
 * empty, a location's its name. The narrated phrase is not kept beside the
 * place — the SHIP POSITION line prints a settlement's or a planet's name and
 * never their free text, and a settlement with free text is how a token's
 * pre-U53 placement is told apart (isLegacyTokenPlacement).
 *
 * Production wiring: a narration's REQUIRED ship/position sidecar entry →
 * applyNarratorSidecar → the ship record's position → the narrator's SHIP
 * POSITION line (as tests/unit/shipSeedNamePartWithNoCapitalForm.test.js).
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { applyNarratorSidecar } from '../../src/narration/narrator.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';
import { inferShipPosition, formatShipPositionLine, matchSeedAgainstIndex } from '../../src/factContinuity/shipPosition.js';
import { buildNameIndex } from '../../src/context/relevanceResolver.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const ent = (name, journalId, entityType) => ({ _id: `rec-${journalId}`, journalId, name, entityType, sectorId: 'sec-1' });
const roster = [
  ent('Kael Dros', 'npc-kael', 'connection'),
  ent('Unit 7', 'npc-7', 'connection'),
  ent('The Covenant', 'f-cov', 'faction'),
  ent('Iron Resolve', 'sh-iron', 'ship'),
  ent('Bleakhold', 'set-bleak', 'settlement'),
  ent('Relay 734', 'loc-relay', 'location'),
  ent('Kaan', 'pl-kaan', 'planet'),
  ent('Outpost 12', 'loc-12', 'location'),
];
const hit = (seed) => matchSeedAgainstIndex(buildNameIndex(roster, []), seed)?.journalId ?? null;

describe('issue #364 SHIP-SEED-NONSPATIAL-HIT-FIRST — matchSeedAgainstIndex reads on past names that are not places', () => {
  it('a person named before the place: the place is the hit', () => {
    // It was the connection Kael Dros: no place, and the phrase was kept as free text.
    expect(hit("alongside Kael's tug at Bleakhold")).toBe('set-bleak');
    expect(hit("in Kael's wake, holding off Relay 734")).toBe('loc-relay');
  });

  it('a ship or a faction named before the place: the place is the hit', () => {
    expect(hit('alongside Iron Resolve in orbit of Kaan')).toBe('pl-kaan');
    expect(hit('shadowing the Covenant flagship toward Bleakhold')).toBe('set-bleak');
  });

  it('in the scan\'s own order: past a non-place in either pass, a capitalised place before a number', () => {
    // "Unit" and "7" are Unit 7's — a connection in both passes — then "734" is the relay's.
    expect(hit('two hours behind Unit 7, holding off 734')).toBe('loc-relay');
    // A capitalised place is asked before any number: "12" may be a quantity (SHIP-SEED-NUMERIC-PART).
    expect(hit('12 hours behind Kael, out from Kaan')).toBe('pl-kaan');
    // The first place, leftmost, when two are named.
    expect(hit("alongside Kael's tug between Kaan and Bleakhold")).toBe('pl-kaan');
  });

  it('a phrase that names no place gives no hit — the scan returns places only (U43\'s cases keep their phrase: below)', () => {
    expect(hit('alongside the Covenant flagship')).toBeNull();
    expect(hit('alongside the Covenant flagship Iron Resolve')).toBeNull();
    expect(hit('beside Iron Resolve')).toBeNull();
    expect(hit("in Kael's wake")).toBeNull();
  });

  it('a seed that is a non-place\'s whole name has nothing past it: no hit', () => {
    expect(hit('Kael Dros')).toBeNull();
    expect(hit("Kael's")).toBeNull();
    expect(hit('Iron Resolve')).toBeNull();
  });

  it('control: a phrase whose first name is a place is unchanged', () => {
    expect(hit("at Bleakhold, alongside Kael's tug")).toBe('set-bleak');
    expect(hit('Bleakhold')).toBe('set-bleak');
    expect(hit('holding off 734')).toBe('loc-relay');
  });
});

describe('issue #364 SHIP-SEED-NONSPATIAL-HIT-FIRST — inferShipPosition: the place found past another name, as when it is named first', () => {
  const state = {
    connections: [{ _id: 'npc-kael', journalId: 'npc-kael', name: 'Kael Dros' }],
    ships:       [{ _id: 'sh-iron', journalId: 'sh-iron', name: 'Iron Resolve' }],
    factions:    [{ _id: 'f-cov', journalId: 'f-cov', name: 'The Covenant' }],
    settlements: [{ _id: 'set-bleak', journalId: 'set-bleak', name: 'Bleakhold', sectorId: 'sec-1' }],
    locations:   [{ _id: 'loc-relay', journalId: 'loc-relay', name: 'Relay 734', sectorId: 'sec-1' }],
    planets:     [{ _id: 'pl-kaan', journalId: 'pl-kaan', name: 'Kaan', settlementIds: [], sectorId: 'sec-1' }],
    sectors:     [{ id: 'sec-1', name: 'Outlands' }],
    activeSectorId: 'sec-1',
  };
  const infer = (seed) => {
    const rest = { ...inferShipPosition(seed, state, { source: 'narrator_sidecar' }) };
    delete rest.updatedAt;
    return rest;
  };

  it('a settlement: its record, free text empty — the same record as "at Bleakhold"', () => {
    const p = infer("alongside Kael's tug at Bleakhold");
    expect(p).toMatchObject({ nearestSettlementId: 'set-bleak', sectorId: 'sec-1', freeText: '' });
    expect(p).toEqual(infer('at Bleakhold'));
    expect(formatShipPositionLine(p, state, 'Wayfinder')).toBe('SHIP POSITION: Wayfinder near Bleakhold (Outlands)');
  });

  it('a location: its record, its name as the free text, as the location case keeps it', () => {
    const p = infer("in Kael's wake, holding off Relay 734");
    expect(p).toMatchObject({ nearestLocationId: 'loc-relay', freeText: 'Relay 734' });
    expect(p).toEqual(infer('holding off Relay 734'));
  });

  it('a planet: its record, free text empty', () => {
    const p = infer('alongside Iron Resolve in orbit of Kaan');
    expect(p).toMatchObject({ nearestPlanetId: 'pl-kaan', nearestSettlementId: null, freeText: '' });
    expect(formatShipPositionLine(p, state, 'Wayfinder')).toBe('SHIP POSITION: Wayfinder in orbit of Kaan (Outlands)');
  });

  it('control: no place named — the narrated phrase is the position, as U43 decided', () => {
    const p = infer('alongside the Covenant flagship');
    expect(p).toMatchObject({ nearestSettlementId: null, nearestPlanetId: null, nearestLocationId: null, freeText: 'alongside the Covenant flagship' });
    expect(infer('Kael Dros').freeText).toBe('Kael Dros');
  });
});

describe('issue #364 SHIP-SEED-NONSPATIAL-HIT-FIRST — a narration that puts the ship "alongside Kael\'s tug at Bleakhold" moves it to Bleakhold', () => {
  const stored = () => game.settings.get(MODULE_ID, 'campaignState');
  const shipPosition = () => game.actors.get('actor-ship').flags[MODULE_ID].ship.position;

  /** A narration's sidecar, applied as the narrator applies one. */
  function narrate(narrationId, prose, position) {
    const sidecar = { newTruths: [], stateChanges: [{ subject: 'ship', attribute: 'position', value: position }] };
    applyNarratorSidecar(`${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``, stored(), { narrationId, mode: 'move_resolution' });   // a move's narration: a beat of play moves the ship (overhaul 2 §6.3)
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

    for (const [id, name] of [['act-first', 'Firstlight'], ['act-bleak', 'Bleakhold']]) {
      game.actors._set(id, makeTestActor({
        id, name, type: 'location',
        flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${id}`, name } } },
      }));
    }
    game.actors._set('act-kael', makeTestActor({
      id: 'act-kael', name: 'Kael Dros', type: 'character',
      flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-kael', name: 'Kael Dros' } } },
    }));
    game.actors._set('act-cov', makeTestActor({
      id: 'act-cov', name: 'The Covenant', type: 'character',
      flags: { [MODULE_ID]: { entityType: 'faction', faction: { _id: 'rec-cov', name: 'The Covenant' } } },
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
      shipIds: ['actor-ship'], settlementIds: ['act-first', 'act-bleak'], connectionIds: ['act-kael'], factionIds: ['act-cov'],
      xCardActive: false, xCardPlays: 0,
    });
  });

  it('the ship record names Bleakhold, and the next prompt\'s SHIP POSITION line says so', async () => {
    narrate('nar-tug', "The Wayfinder slides in alongside Kael's tug at Bleakhold.", "alongside Kael's tug at Bleakhold");

    // It was the free text "alongside Kael's tug at Bleakhold": no place, and the narrator was not told where.
    await vi.waitFor(() => expect(shipPosition().nearestSettlementId).toBe('act-bleak'));
    expect(shipPosition().freeText).toBe('');
    expect(shipPosition().narrationId).toBe('nar-tug');
    expect(buildLedgerBlock(stored(), {}).shipPosition).toMatch(/Wayfinder near Bleakhold/);
  });

  it('control: "alongside the Covenant flagship" names no place — the position is the narrated phrase', async () => {
    narrate('nar-cov', 'The Wayfinder holds station alongside the Covenant flagship.', 'alongside the Covenant flagship');

    await vi.waitFor(() => expect(shipPosition().freeText).toBe('alongside the Covenant flagship'));
    expect(shipPosition().nearestSettlementId ?? null).toBeNull();
  });

  it('control: a phrase whose first name is the place moved the ship there already', async () => {
    narrate('nar-at', "The Wayfinder docks at Bleakhold, alongside Kael's tug.", "at Bleakhold, alongside Kael's tug");

    await vi.waitFor(() => expect(shipPosition().nearestSettlementId).toBe('act-bleak'));
    expect(shipPosition().freeText).toBe('');
  });
});

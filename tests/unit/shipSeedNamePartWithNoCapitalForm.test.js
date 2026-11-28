/**
 * STARFORGED COMPANION
 * tests/unit/shipSeedNamePartWithNoCapitalForm.test.js
 *
 * Issue #364 SHIP-SEED-NUMERIC-PART (left open by issue #364
 * ONE-WORD-NAME-NO-CAPITAL-FORM and NAME-PART-NO-CAPITAL-FORM-UNRESOLVED —
 * the same rule, in the ship position's own word scan).
 *
 * A ship-position seed — where a narration says the ship is, an arrival's
 * destination — is matched whole, then word by word: each word through the
 * name resolver (shipPosition.matchSeedAgainstIndex → resolveEntityName). The
 * scan looks up only a word that starts with a capital, so that a lowercase
 * word ("a derelict station") never names a place. A word with no capital to
 * write — the "734" of Relay 734, a name in a script without case — is no
 * lowercase word, but it failed the scan's own test before the resolver was
 * asked: "holding off 734" was free text, the ship's position named no
 * place, and the sector token stayed where it was — though the resolver
 * itself resolves such a part.
 *
 * The scan now asks the shared rule (relevanceResolver.hasCapitalForm). A
 * lowercase cased word is still never looked up. The words with no capital
 * to write are asked after the capitalised ones: a number may be a quantity
 * ("12 hours out from Kaan"), so a seed that named a place before names the
 * same place now.
 *
 * Production wiring: a narration's REQUIRED ship/position sidecar entry →
 * applyNarratorSidecar → the ship record's position → the narrator's SHIP
 * POSITION line (as tests/unit/xcardShipPosition.test.js).
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { applyAsTheTable } from '../helpers/tableFacts.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';
import { inferShipPosition, formatShipPositionLine, matchSeedAgainstIndex } from '../../src/factContinuity/shipPosition.js';
import { buildNameIndex } from '../../src/context/relevanceResolver.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const ent = (name, journalId, entityType) => ({ _id: `rec-${journalId}`, journalId, name, entityType, sectorId: 'sec-1' });
const roster = [
  ent('Relay 734', 'loc-relay', 'location'),
  ent('コロニー ヤマト', 'set-yamato', 'settlement'),
  ent('Bleakhold Station', 'set-bleak', 'settlement'),
  ent('Haven', 'set-haven', 'settlement'),
  ent('Kaan', 'pl-kaan', 'planet'),
];
const hit = (seed, entities = roster) => matchSeedAgainstIndex(buildNameIndex(entities, []), seed)?.journalId ?? null;

describe('issue #364 SHIP-SEED-NUMERIC-PART — matchSeedAgainstIndex: a seed naming a place by a part with no capital to write', () => {
  it('a part that starts with a digit names its place among the seed\'s other words', () => {
    expect(hit('holding off 734')).toBe('loc-relay');
    expect(hit('in the shadow of 734, engines cold')).toBe('loc-relay');
    expect(hit("drifting in 734's debris field")).toBe('loc-relay');
  });

  it('a part in a script without letter case does too', () => {
    expect(hit('on approach to ヤマト')).toBe('set-yamato');
    expect(hit('コロニー, the outer docks')).toBe('set-yamato');
  });

  it('control: the part alone, and the capitalised part of a cased name, resolved already', () => {
    expect(hit('734')).toBe('loc-relay');
    expect(hit("734's")).toBe('loc-relay');
    expect(hit('holding off Relay')).toBe('loc-relay');
    expect(hit('holding off Relay 734')).toBe('loc-relay');
  });

  it('control: a lowercase cased word is never looked up — not as a name part, not as a one-word name', () => {
    expect(hit('a derelict station')).toBeNull();
    expect(hit('holding off the relay')).toBeNull();
    expect(hit('a safe haven in the dark')).toBeNull();
    // The capitalised place past the lowercase words is the hit, never "station".
    expect(hit('a derelict station above Kaan')).toBe('pl-kaan');
    expect(hit('a safe Haven')).toBe('set-haven');
  });

  it('control: a number no place is called by names nothing, and the scan reads on', () => {
    expect(hit('12 hours out')).toBeNull();
    expect(hit('12 hours out from Kaan')).toBe('pl-kaan');
  });

  it('control: a number two places share is nobody\'s — no guessing', () => {
    const shared = [...roster, ent('Bay 734', 'loc-bay', 'location')];
    expect(hit('holding off 734', shared)).toBeNull();
    expect(hit('holding off Relay 734', shared)).toBe('loc-relay');
  });

  it('control: a seed that named a place by a capitalised word names the same place — a number in it may be a quantity', () => {
    const numbered = [...roster, ent('Outpost 12', 'loc-12', 'location'), ent('Unit 7', 'npc-7', 'connection')];
    // Leftmost first across every word, the number was Outpost 12's and the ship was put there.
    expect(hit('12 hours out from Kaan', numbered)).toBe('pl-kaan');
    // …and "7" was the connection Unit 7's — no spatial anchor, so the position named no place.
    expect(hit('7 hours out from Bleakhold Station', numbered)).toBe('set-bleak');
    expect(hit('holding off 734, sunward of Kaan', numbered)).toBe('pl-kaan');
  });

  it('with no capitalised word that names anything, the number is the place\'s', () => {
    const numbered = [...roster, ent('Outpost 12', 'loc-12', 'location')];
    expect(hit('12 hours out', numbered)).toBe('loc-12');
    expect(hit('Holding off 734', numbered)).toBe('loc-relay');
  });
});

describe('issue #364 SHIP-SEED-NUMERIC-PART — inferShipPosition: the position names the place', () => {
  const state = {
    locations:   [{ _id: 'loc-relay', journalId: 'loc-relay', name: 'Relay 734', sectorId: 'sec-1' }],
    settlements: [{ _id: 'set-bleak', journalId: 'set-bleak', name: 'Bleakhold Station' }],
    sectors:     [{ id: 'sec-1', name: 'Outlands' }],
    activeSectorId: 'sec-1',
  };

  it('"holding off 734" is a position near Relay 734, not free text', () => {
    const p = inferShipPosition('holding off 734', state, { source: 'narrator_sidecar' });
    expect(p.nearestLocationId).toBe('loc-relay');
    expect(formatShipPositionLine(p, state, 'Wayfinder')).toBe('SHIP POSITION: Wayfinder near Relay 734 (Outlands)');
  });

  it('control: "a derelict station" is still free text — the lowercase word names no place', () => {
    const p = inferShipPosition('a derelict station', state, { source: 'narrator_sidecar' });
    expect(p.nearestSettlementId ?? null).toBeNull();
    expect(p.nearestLocationId ?? null).toBeNull();
    expect(p.freeText).toBe('a derelict station');
  });
});

describe('issue #364 SHIP-SEED-NUMERIC-PART — a narration that puts the ship "off 734" moves it to Relay 734', () => {
  const stored = () => game.settings.get(MODULE_ID, 'campaignState');
  const shipPosition = () => game.actors.get('actor-ship').flags[MODULE_ID].ship.position;

  /** A narration's sidecar, applied as the narrator applies one. */
  function narrate(narrationId, prose, position) {
    const sidecar = { newTruths: [], stateChanges: [{ subject: 'ship', attribute: 'position', value: position, from: 'line' }] };
    applyAsTheTable(`${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``, stored(), { narrationId, mode: 'move_resolution' });   // the table's line took her there: it binds, and moves the ship (D17; a `result` tag binds nothing — issue #402, D1)
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

    game.actors._set('act-first', makeTestActor({
      id: 'act-first', name: 'Firstlight', type: 'location',
      flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-first', name: 'Firstlight' } } },
    }));
    game.actors._set('act-relay', makeTestActor({
      id: 'act-relay', name: 'Relay 734', type: 'location',
      flags: { [MODULE_ID]: { entityType: 'location', location: { _id: 'rec-relay', name: 'Relay 734', type: 'station', status: 'visited' } } },
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
      shipIds: ['actor-ship'], settlementIds: ['act-first'], locationIds: ['act-relay'],
      xCardActive: false, xCardPlays: 0,
    });
  });

  it('the ship record names the relay, and the next prompt\'s SHIP POSITION line says so', async () => {
    narrate('nar-relay', 'The Wayfinder cuts thrust and holds off 734.', 'holding off 734');

    // It was the free text "holding off 734": no place, and the token stayed.
    await vi.waitFor(() => expect(shipPosition().nearestLocationId).toBe('act-relay'));
    expect(shipPosition().nearestSettlementId ?? null).toBeNull();
    expect(buildLedgerBlock(stored(), {}).shipPosition).toMatch(/Wayfinder near Relay 734/);
  });

  it('control: a narration that names it by its capitalised part moved it already', async () => {
    narrate('nar-relay', 'The Wayfinder holds off the Relay.', 'holding off the Relay');
    await vi.waitFor(() => expect(shipPosition().nearestLocationId).toBe('act-relay'));
  });

  it('control: "holding off the relay" — a lowercase word — names no place: the position is the narrated phrase', async () => {
    narrate('nar-relay', 'The Wayfinder holds off the relay.', 'holding off the relay');
    await vi.waitFor(() => expect(shipPosition().freeText).toBe('holding off the relay'));
    expect(shipPosition().nearestLocationId ?? null).toBeNull();
  });
});

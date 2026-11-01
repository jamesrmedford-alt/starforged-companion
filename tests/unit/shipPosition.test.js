/**
 * STARFORGED COMPANION
 * tests/unit/shipPosition.test.js
 *
 * Pure-function coverage for the ship-position helper (fact-continuity §20).
 * The actual Foundry-side writes (updateShip, Token placement, hook
 * registration) are exercised in Quench; this file only locks down
 * inferShipPosition's resolution rules and the line formatter.
 */

import { describe, it, expect } from 'vitest';
import {
  inferShipPosition,
  inferShipPositionFromEntityId,
  formatShipPositionLine,
  emptyPosition,
} from '../../src/factContinuity/shipPosition.js';

// ────────────────────────────────────────────────────────────────────
// Fixture helpers
// ────────────────────────────────────────────────────────────────────

function makeCampaignState({
  settlements = [],
  planets     = [],
  locations   = [],
  sectors     = [],
  activeSectorId = null,
} = {}) {
  return {
    settlements,
    planets,
    locations,
    sectors,
    activeSectorId,
  };
}

const sec = (id, name, region = 'outlands') => ({ id, name, region });
const settlement = (id, name, sectorId = null) => ({ _id: id, journalId: id, name, sectorId });
const planet     = (id, name, settlementIds = [], sectorId = null) => ({
  _id: id, journalId: id, name, settlementIds, sectorId,
});
const location   = (id, name, sectorId = null) => ({ _id: id, journalId: id, name, sectorId });


// ────────────────────────────────────────────────────────────────────
// emptyPosition
// ────────────────────────────────────────────────────────────────────

describe('emptyPosition', () => {
  it('returns a clean record with all id slots null', () => {
    const p = emptyPosition();
    expect(p.sectorId).toBeNull();
    expect(p.nearestPlanetId).toBeNull();
    expect(p.nearestSettlementId).toBeNull();
    expect(p.freeText).toBe('');
    expect(p.updatedAt).toBeNull();
    expect(p.updatedBy).toBeNull();
  });
});


// ────────────────────────────────────────────────────────────────────
// inferShipPosition
// ────────────────────────────────────────────────────────────────────

describe('inferShipPosition', () => {
  it('matches a settlement by name and resolves its planet + sector', () => {
    const state = makeCampaignState({
      settlements: [settlement('s1', 'Bleakhold Station')],
      planets:     [planet('p1', 'Bleakhold', ['s1'])],
      sectors:     [sec('sec1', 'Outlands Mark')],
      activeSectorId: 'sec1',
    });
    const out = inferShipPosition('Bleakhold Station', state, { source: 'at_command' });
    expect(out.nearestSettlementId).toBe('s1');
    expect(out.nearestPlanetId).toBe('p1');
    expect(out.sectorId).toBe('sec1');
    expect(out.updatedBy).toBe('at_command');
    expect(typeof out.updatedAt).toBe('string');
  });

  it('falls back to the active sector when the settlement carries no sectorId', () => {
    // Pre-PR #100 settlements (and freshly seeded ones) may not carry a
    // sectorId — the active sector is used as the implicit fallback.
    const state = makeCampaignState({
      settlements: [settlement('s1', 'Outpost')],
      sectors:     [sec('secActive', 'Active')],
      activeSectorId: 'secActive',
    });
    const out = inferShipPosition('Outpost', state);
    expect(out.nearestSettlementId).toBe('s1');
    expect(out.sectorId).toBe('secActive');
  });

  it('prefers the settlement\'s own sectorId when set', () => {
    const state = makeCampaignState({
      settlements: [{ ...settlement('s1', 'Outpost'), sectorId: 'secExplicit' }],
      sectors:     [sec('secExplicit', 'Explicit'), sec('secActive', 'Active')],
      activeSectorId: 'secActive',
    });
    const out = inferShipPosition('Outpost', state);
    expect(out.sectorId).toBe('secExplicit');
  });

  it('matches a planet directly when no settlement matches', () => {
    const state = makeCampaignState({
      planets: [planet('p1', 'Tartarus')],
      sectors: [sec('sec1', 'Sec1')],
      activeSectorId: 'sec1',
    });
    const out = inferShipPosition('Tartarus', state);
    expect(out.nearestPlanetId).toBe('p1');
    expect(out.nearestSettlementId).toBeNull();
    expect(out.sectorId).toBe('sec1');
  });

  it('matches a location and captures its sector and name', () => {
    const state = makeCampaignState({
      locations: [location('loc1', 'Derelict Bound', 'secX')],
      sectors:   [sec('secX', 'Sec X')],
    });
    const out = inferShipPosition('Derelict Bound', state);
    expect(out.sectorId).toBe('secX');
    expect(out.freeText).toBe('Derelict Bound');
    expect(out.nearestSettlementId).toBeNull();
    expect(out.nearestPlanetId).toBeNull();
  });

  it('captures the seed as free text when no entity matches', () => {
    const state = makeCampaignState({});
    const out = inferShipPosition('drifting through the Black', state);
    expect(out.freeText).toBe('drifting through the Black');
    expect(out.sectorId).toBeNull();
    expect(out.nearestPlanetId).toBeNull();
    expect(out.nearestSettlementId).toBeNull();
  });

  it('matches case-insensitively', () => {
    const state = makeCampaignState({
      settlements: [settlement('s1', 'Bleakhold Station')],
    });
    const out = inferShipPosition('bleakhold station', state);
    expect(out.nearestSettlementId).toBe('s1');
  });

  it('matches on first-word fallback', () => {
    // The relevance resolver's name index also keys by first word so
    // partial mentions ("Bleakhold" alone) resolve to the full record.
    const state = makeCampaignState({
      settlements: [settlement('s1', 'Bleakhold Station')],
    });
    const out = inferShipPosition('Bleakhold', state);
    expect(out.nearestSettlementId).toBe('s1');
  });

  it('returns empty record with the seed echoed when state is empty', () => {
    const out = inferShipPosition('nowhere', null);
    expect(out.freeText).toBe('nowhere');
    expect(out.sectorId).toBeNull();
  });

  it('returns empty position with no fields set when seed is blank', () => {
    const out = inferShipPosition('', makeCampaignState({}));
    expect(out.freeText).toBe('');
    expect(out.updatedAt).toBeTruthy();      // the stamp still fires
  });

  it('normalises unknown source to "manual"', () => {
    const out = inferShipPosition('x', makeCampaignState({}), { source: 'garbage' });
    expect(out.updatedBy).toBe('manual');
  });

  it('accepts each documented source value', () => {
    for (const source of ['at_command', 'set_a_course', 'narrator_sidecar', 'scene_token', 'manual']) {
      const out = inferShipPosition('x', makeCampaignState({}), { source });
      expect(out.updatedBy).toBe(source);
    }
  });
});


// ────────────────────────────────────────────────────────────────────
// formatShipPositionLine
// ────────────────────────────────────────────────────────────────────

describe('formatShipPositionLine', () => {
  it('renders a full settlement + planet + sector line', () => {
    const state = makeCampaignState({
      settlements: [settlement('s1', 'Bleakhold Station')],
      planets:     [planet('p1', 'Bleakhold', ['s1'])],
      sectors:     [sec('sec1', 'Outlands Mark')],
    });
    const position = {
      nearestSettlementId: 's1',
      nearestPlanetId:     'p1',
      sectorId:            'sec1',
      freeText:            '',
    };
    const line = formatShipPositionLine(position, state, 'Pioneer\'s Pride');
    expect(line).toContain('SHIP POSITION');
    expect(line).toContain('Pioneer');
    expect(line).toContain('near Bleakhold Station');
    expect(line).toContain('Bleakhold');
    expect(line).toContain('Outlands Mark');
  });

  it('renders "in orbit of" when only the planet is known', () => {
    const state = makeCampaignState({
      planets: [planet('p1', 'Tartarus')],
      sectors: [sec('sec1', 'Sec 1')],
    });
    const line = formatShipPositionLine(
      { nearestPlanetId: 'p1', sectorId: 'sec1', freeText: '' },
      state,
      'Solace',
    );
    expect(line).toContain('in orbit of Tartarus');
    expect(line).toContain('Sec 1');
  });

  it('renders the freeText when no ids resolve', () => {
    const line = formatShipPositionLine(
      { freeText: 'drifting in the dark', sectorId: null, nearestPlanetId: null, nearestSettlementId: null },
      makeCampaignState({}),
      'Solace',
    );
    expect(line).toContain('drifting in the dark');
  });

  it('returns "" when the position carries no information', () => {
    const line = formatShipPositionLine(emptyPosition(), makeCampaignState({}), 'Solace');
    expect(line).toBe('');
  });

  it('returns "" when position is null / undefined', () => {
    expect(formatShipPositionLine(null, makeCampaignState({}), 'x')).toBe('');
    expect(formatShipPositionLine(undefined, makeCampaignState({}), 'x')).toBe('');
  });

  it('falls back to "Command vehicle" when no ship name is given', () => {
    const state = makeCampaignState({
      planets: [planet('p1', 'Tartarus')],
    });
    const line = formatShipPositionLine(
      { nearestPlanetId: 'p1', sectorId: null, nearestSettlementId: null, freeText: '' },
      state,
      '',
    );
    expect(line).toMatch(/Command vehicle\b/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Finding L — docked vs in-transit status signal
// ────────────────────────────────────────────────────────────────────

describe('formatShipPositionLine — mobility status (Finding L)', () => {
  const state = makeCampaignState({
    settlements: [settlement('s1', 'Bleakhold Station')],
    planets:     [planet('p1', 'Bleakhold', ['s1'])],
    sectors:     [sec('sec1', 'Outlands Mark')],
  });
  const pos = {
    nearestSettlementId: 's1',
    nearestPlanetId:     'p1',
    sectorId:            'sec1',
    freeText:            '',
  };

  it('scene_token source → "docked at" phrasing', () => {
    const line = formatShipPositionLine({ ...pos, updatedBy: 'scene_token' }, state, 'Vanguard');
    expect(line).toContain('docked at Bleakhold Station');
    expect(line).not.toContain('near ');
    expect(line).not.toContain('in transit');
  });

  it('at_command source → "docked at" phrasing', () => {
    const line = formatShipPositionLine({ ...pos, updatedBy: 'at_command' }, state, 'Vanguard');
    expect(line).toContain('docked at Bleakhold Station');
  });

  it('expedition source → "docked at" phrasing', () => {
    const line = formatShipPositionLine({ ...pos, updatedBy: 'expedition' }, state, 'Vanguard');
    expect(line).toContain('docked at Bleakhold Station');
  });

  // SHIP-TRANSIT-LINE regression — the position is only written after a
  // non-miss (arrival confirmed: resolver text, token snap), so set_a_course
  // must read as arrived, not "in transit to" the place the ship is docked at.
  it('set_a_course source → "docked at" phrasing (arrival, not transit)', () => {
    const line = formatShipPositionLine({ ...pos, updatedBy: 'set_a_course' }, state, 'Vanguard');
    expect(line).toContain('docked at Bleakhold Station');
    expect(line).not.toContain('near ');
    expect(line).not.toContain('in transit');
  });

  it('set_a_course with planet-only → "in orbit of {planet}"', () => {
    const planetState = makeCampaignState({
      planets: [planet('p2', 'Tartarus')],
      sectors: [sec('sec1', 'Outlands Mark')],
    });
    const line = formatShipPositionLine(
      { nearestPlanetId: 'p2', sectorId: 'sec1', nearestSettlementId: null, freeText: '', updatedBy: 'set_a_course' },
      planetState,
      'Vanguard',
    );
    expect(line).toContain('in orbit of Tartarus');
    expect(line).not.toContain('in transit');
  });

  it('set_a_course with freeText → bare freeText (no transit claim)', () => {
    const line = formatShipPositionLine(
      { nearestSettlementId: null, nearestPlanetId: null, sectorId: null, freeText: 'the void', updatedBy: 'set_a_course' },
      makeCampaignState({}),
      'Vanguard',
    );
    expect(line).toContain('the void');
    expect(line).not.toContain('in transit');
  });

  it('narrator_sidecar source → neutral "near" phrasing (no status claim)', () => {
    const line = formatShipPositionLine({ ...pos, updatedBy: 'narrator_sidecar' }, state, 'Vanguard');
    expect(line).toContain('near Bleakhold Station');
  });

  it('manual source → neutral "near" phrasing', () => {
    const line = formatShipPositionLine({ ...pos, updatedBy: 'manual' }, state, 'Vanguard');
    expect(line).toContain('near Bleakhold Station');
  });

  it('null updatedBy → neutral "near" phrasing (existing records)', () => {
    const line = formatShipPositionLine({ ...pos, updatedBy: null }, state, 'Vanguard');
    expect(line).toContain('near Bleakhold Station');
  });
});

// ────────────────────────────────────────────────────────────────────
// Seed-name matching robustness (Cluster C / F5 gap 3)
// ────────────────────────────────────────────────────────────────────

describe('inferShipPosition — tolerant seed matching', () => {
  const cs = () => makeCampaignState({
    settlements: [settlement('s-lyra', 'Lyra', 'sec-1'), settlement('s-sep', 'Sepulcher', 'sec-1')],
    locations:   [location('l-vault', 'Vault of Tears', 'sec-1')],
    sectors:     [sec('sec-1', 'Igneous Spine')],
    activeSectorId: 'sec-1',
  });

  it('resolves a possessive phrase to the settlement ("Lyra\'s orbital graveyard")', () => {
    const p = inferShipPosition("Lyra's orbital graveyard", cs(), { source: 'narrator_sidecar' });
    expect(p.nearestSettlementId).toBe('s-lyra');
    expect(p.freeText).toBe('');
  });

  it('resolves an article-wrapped multiword name via the word scan ("the Vault of Tears")', () => {
    const p = inferShipPosition('the Vault of Tears', cs(), { source: 'narrator_sidecar' });
    expect(p.sectorId).toBe('sec-1');
    expect(p.freeText).toBe('Vault of Tears');   // location-kind keeps the name as freeText
  });

  it('prefers the exact full-name match over the word scan', () => {
    const state = makeCampaignState({
      settlements: [
        settlement('s-port', 'Lyra Station'),
        settlement('s-lyra', 'Lyra'),
      ],
    });
    const p = inferShipPosition('Lyra Station', state, { source: 'at_command' });
    expect(p.nearestSettlementId).toBe('s-port');
  });

  it('skips sub-4-character words so articles cannot false-positive', () => {
    const state = makeCampaignState({ settlements: [settlement('s-ash', 'Ash')] });
    const p = inferShipPosition('drifting in the ash fields', state, { source: 'narrator_sidecar' });
    // "ash" (3 chars) is skipped by the word scan — falls through to freeText.
    expect(p.nearestSettlementId).toBeNull();
    expect(p.freeText).toBe('drifting in the ash fields');
  });

  it('accepts the new "expedition" provenance source', () => {
    const p = inferShipPosition('Lyra', cs(), { source: 'expedition' });
    expect(p.updatedBy).toBe('expedition');
  });
});

// Issue #321 U43: the word scan looked up every lowercased word in the name
// index, whose keys include each multi-word name's first and last word — so a
// common noun matched a recorded place's name part — and a non-spatial hit
// replaced the narrated phrase with the entity's bare name.
describe('inferShipPosition — the word scan resolves names, not common nouns', () => {
  const cs = () => ({
    settlements: [{ _id: 's-bleak', journalId: 's-bleak', name: 'Bleakhold Station', sectorId: 'sec-1' }],
    planets:     [{ _id: 'p-kaan',  journalId: 'p-kaan',  name: 'Kaan', settlementIds: [], sectorId: 'sec-1' }],
    factions:    [{ _id: 'f-cov',   journalId: 'f-cov',   name: 'The Covenant' }],
    ships:       [{ _id: 'sh-iron', journalId: 'sh-iron', name: 'Iron Resolve' }],
    sectors:     [{ id: 'sec-1', name: 'Igneous Spine' }],
    activeSectorId: 'sec-1',
  });

  it('a common noun in an unrecorded destination does not dock the ship at a recorded place', () => {
    const pos = inferShipPosition('a derelict station above Kaan', cs(), { source: 'narrator_sidecar' });
    expect(pos.nearestSettlementId).toBeNull();
    expect(pos.nearestPlanetId).toBe('p-kaan');
  });

  it('a phrase whose only name-like word is lowercase stays free text', () => {
    const pos = inferShipPosition('holding beside the station', cs(), { source: 'narrator_sidecar' });
    expect(pos.nearestSettlementId).toBeNull();
    expect(pos.freeText).toBe('holding beside the station');
  });

  it('a capitalised name part in a phrase still resolves (control)', () => {
    const pos = inferShipPosition("holding off Bleakhold's docking ring", cs(), { source: 'narrator_sidecar' });
    expect(pos.nearestSettlementId).toBe('s-bleak');
  });

  it('a whole seed that is a deliberate short name resolves in any case (control)', () => {
    expect(inferShipPosition('bleakhold', cs(), { source: 'at_command' }).nearestSettlementId).toBe('s-bleak');
  });

  it('keeps the narrated phrase when the only match is not a place', () => {
    const state = cs();
    const pos   = inferShipPosition('alongside the Covenant flagship Iron Resolve', state, { source: 'narrator_sidecar' });
    expect(pos.freeText).toBe('alongside the Covenant flagship Iron Resolve');
    expect(formatShipPositionLine(pos, state, "Pioneer's Pride")).toContain('flagship');

    const beside = inferShipPosition('beside Iron Resolve', state, { source: 'narrator_sidecar' });
    expect(beside.freeText).toBe('beside Iron Resolve');
    expect(beside.nearestSettlementId).toBeNull();
  });
});


// ────────────────────────────────────────────────────────────────────
// Document-backed resolution (v1.7.10 finding #5)
//
// Production campaignState carries only the `*Ids` arrays — the record
// arrays the fixtures above pass never exist in a live world. These
// tests pin the registry-backed path: ids resolve through game.actors
// (settlement/planet/location are Actor-hosted post-migration), so the
// name index and the line formatter work against real storage.
// ────────────────────────────────────────────────────────────────────

describe('document-backed resolution (production storage shape)', () => {
  const MID = 'starforged-companion';

  function hostSettlementActor(id, record) {
    const actor = makeTestActor({
      id, type: 'location', name: record.name,
      flags: { [MID]: { entityType: 'settlement', settlement: record } },
    });
    global.game.actors._set(id, actor);
    return actor;
  }

  beforeEach(() => { global.game.actors._reset(); });

  it('inferShipPosition resolves a settlement through game.actors with only settlementIds in state', () => {
    hostSettlementActor('actor-astra', { _id: 'rec-astra', name: 'Astra', sectorId: 'sec-fc' });
    const state = {
      settlementIds: ['actor-astra'],
      sectors: [sec('sec-fc', 'Ferrous Chasm')],
    };
    const p = inferShipPosition('Astra', state, { source: 'at_command' });
    // nearestSettlementId is the HOST DOCUMENT id — the id space updateShip,
    // the scene-pin actorId flag, and the registry getters share.
    expect(p.nearestSettlementId).toBe('actor-astra');
    expect(p.sectorId).toBe('sec-fc');
    expect(p.freeText).toBe('');
  });

  it('formatShipPositionLine resolves the settlement name through the registry', () => {
    hostSettlementActor('actor-astra', { _id: 'rec-astra', name: 'Astra', sectorId: 'sec-fc' });
    const state = {
      settlementIds: ['actor-astra'],
      sectors: [sec('sec-fc', 'Ferrous Chasm')],
    };
    const line = formatShipPositionLine(
      { nearestSettlementId: 'actor-astra', nearestPlanetId: null, sectorId: 'sec-fc', freeText: '' },
      state,
      'Kobayashi 8',
    );
    expect(line).toBe('SHIP POSITION: Kobayashi 8 near Astra (Ferrous Chasm)');
  });

  it('options.entities injection bypasses both storage paths', () => {
    const p = inferShipPosition('Vault', {}, {
      source: 'manual',
      entities: [{ _id: 'v1', journalId: 'doc-v1', name: 'Vault of Tears', entityType: 'settlement' }],
    });
    expect(p.nearestSettlementId).toBe('doc-v1');
  });

  it('in-state record arrays still resolve (legacy fixture shape)', () => {
    const state = makeCampaignState({ settlements: [settlement('s-leg', 'Legacyport')] });
    const p = inferShipPosition('Legacyport', state, { source: 'manual' });
    expect(p.nearestSettlementId).toBe('s-leg');
  });
});

// Issue #321 U52: a token dropped on a sector pin names its destination by the
// pin's settlement Actor; the arrival records THAT settlement — a rename leaves
// the label behind, and a namesake in another sector matches the name first.
describe('inferShipPositionFromEntityId — arrival by the destination\'s id', () => {
  const MID = 'starforged-companion';

  function hostActor(id, typeKey, record) {
    const actor = makeTestActor({
      id, type: 'location', name: record.name,
      flags: { [MID]: { entityType: typeKey, [typeKey]: record } },
    });
    global.game.actors._set(id, actor);
    return actor;
  }

  beforeEach(() => { global.game.actors._reset(); });

  it('records the settlement the id names, in its own sector — not a namesake the name finds first', () => {
    hostActor('actor-old', 'settlement', { _id: 'rec-old', name: 'Bleakhold', sectorId: 'sec-old' });
    hostActor('actor-new', 'settlement', { _id: 'rec-new', name: 'Bleakhold', sectorId: 'sec-new' });
    const state = { settlementIds: ['actor-old', 'actor-new'], activeSectorId: 'sec-new',
      sectors: [sec('sec-old', 'Old Reach'), sec('sec-new', 'New Reach')] };

    expect(inferShipPosition('Bleakhold', state).nearestSettlementId).toBe('actor-old');   // the name's first match

    const p = inferShipPositionFromEntityId('actor-new', state, { source: 'scene_token' });
    expect(p).toMatchObject({
      nearestSettlementId: 'actor-new', sectorId: 'sec-new', nearestPlanetId: null,
      freeText: '', updatedBy: 'scene_token',
    });
    expect(p.updatedAt).toBeTruthy();
  });

  it('resolves the planet a settlement belongs to, as the name path does', () => {
    hostActor('actor-set', 'settlement', { _id: 'rec-set', name: 'Bleakhold', sectorId: 'sec-1' });
    hostActor('actor-pl', 'planet', { _id: 'rec-pl', name: 'Vorn Prime', settlementIds: ['rec-set'], sectorId: 'sec-1' });
    const state = { settlementIds: ['actor-set'], planetIds: ['actor-pl'] };
    expect(inferShipPositionFromEntityId('actor-set', state).nearestPlanetId).toBe('actor-pl');
  });

  it('a planet or a location id records that place; anything else is null (the name decides)', () => {
    hostActor('actor-pl', 'planet', { _id: 'rec-pl', name: 'Vorn Prime', sectorId: 'sec-1' });
    hostActor('actor-loc', 'location', { _id: 'rec-loc', name: 'The Shroud', sectorId: 'sec-1' });
    expect(inferShipPositionFromEntityId('actor-pl', {})).toMatchObject({ nearestPlanetId: 'actor-pl', sectorId: 'sec-1' });
    expect(inferShipPositionFromEntityId('actor-loc', {})).toMatchObject({ freeText: 'The Shroud', sectorId: 'sec-1', nearestSettlementId: null });
    expect(inferShipPositionFromEntityId('actor-missing', {})).toBeNull();
    expect(inferShipPositionFromEntityId(null, {})).toBeNull();
    expect(inferShipPositionFromEntityId('actor-pl', {}, { source: 'nonsense' }).updatedBy).toBe('manual');
  });
});

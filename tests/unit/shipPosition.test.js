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

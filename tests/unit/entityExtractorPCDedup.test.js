/**
 * STARFORGED COMPANION
 * tests/unit/entityExtractorPCDedup.test.js
 *
 * Regression coverage for "narrator keeps proposing my co-op partner's
 * PC as a new connection." The entity extractor's dedup gate
 * (entityExistsAnyType) iterated only the module's own entity registries
 * — connection / settlement / faction / etc. — and never cross-checked
 * foundry-ironsworn `character`-type Actors. Mentioning Player B's PC
 * by name therefore returned `exists: false` and routed straight into a
 * new-connection draft.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { entityExistsAnyType } from '../../src/entities/entityExtractor.js';

beforeEach(() => {
  // Restore game.actors if a prior test cleared it (the
  // "tolerates a missing game.actors" case nulls it out by design).
  if (!global.game.actors || typeof global.game.actors._reset !== 'function') {
    const map = new Map();
    global.game.actors = Object.assign(map, {
      _reset: () => map.clear(),
      _set:   (id, doc) => map.set(id, doc),
      get:    id => map.get(id),
      filter: fn => Array.from(map.values()).filter(fn),
      find:   fn => Array.from(map.values()).find(fn),
      contents: Array.from(map.values()),
      [Symbol.iterator]: () => map.values(),
    });
  }
  global.game.actors._reset();
});

describe('entityExistsAnyType — player character dedup', () => {
  it('returns true when the name matches a character-type Actor', () => {
    global.game.actors._set('pc-1', {
      id:   'pc-1',
      type: 'character',
      name: 'Iaa Chen',
    });
    expect(entityExistsAnyType('Iaa Chen', {})).toBe(true);
  });

  it('is case- and honorific-insensitive — "Dr. Chen" matches stored "Iaa Chen" by surname is NOT expected; "Dr. Iaa Chen" matches "Iaa Chen"', () => {
    global.game.actors._set('pc-1', {
      id:   'pc-1',
      type: 'character',
      name: 'Iaa Chen',
    });
    // Whole-name match, case- and honorific-insensitive via the
    // extractor's normalizeEntityName.
    expect(entityExistsAnyType('iaa chen',     {})).toBe(true);
    expect(entityExistsAnyType('Dr. Iaa Chen', {})).toBe(true);
  });

  it('returns false when there are no PCs and no campaignState entities', () => {
    expect(entityExistsAnyType('Random Stranger', {})).toBe(false);
  });

  it('tolerates a missing game.actors collection (test environments)', () => {
    global.game.actors = undefined;
    expect(() => entityExistsAnyType('Anyone', {})).not.toThrow();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// F14 — entity detector "what's known" set must walk all canonical Foundry
// surfaces, not just the module's own bookkeeping ID lists. Two specific
// playtest cases:
//   1. The PC's command vehicle (a starship Actor) was re-proposed as a
//      new Ship draft because shipIds didn't include the vendor-seeded
//      Actor.
//   2. The active sector name was re-proposed as a new Location draft
//      because Sector Creator writes campaignState.sectors[] but doesn't
//      touch locationIds.
// ─────────────────────────────────────────────────────────────────────────────

describe('entityExistsAnyType — canonical Foundry surfaces (F14)', () => {
  it('matches a starship-type Actor even when shipIds is empty', () => {
    global.game.actors._set('ship-1', {
      id:   'ship-1',
      type: 'starship',
      name: 'Kobayashi V',
    });
    // shipIds is intentionally empty — bookkeeping list was the F14 gap.
    expect(entityExistsAnyType('Kobayashi V', { shipIds: [] })).toBe(true);
  });

  it('matches a location-type Actor even when settlementIds/locationIds are empty', () => {
    global.game.actors._set('loc-1', {
      id:   'loc-1',
      type: 'location',
      name: 'Hearth',
    });
    expect(entityExistsAnyType('Hearth', { settlementIds: [], locationIds: [] })).toBe(true);
  });

  it('matches the active sector name (campaignState.sectors[].name)', () => {
    const cs = {
      sectors: [{ id: 's-1', name: 'Delphian Anvil' }],
      activeSectorId: 's-1',
    };
    expect(entityExistsAnyType('Delphian Anvil', cs)).toBe(true);
  });

  it('matches a peer sector (not just the active one)', () => {
    const cs = {
      sectors: [
        { id: 's-1', name: 'Delphian Anvil' },
        { id: 's-2', name: 'Sulaco Arch' },
      ],
      activeSectorId: 's-1',
    };
    expect(entityExistsAnyType('Sulaco Arch', cs)).toBe(true);
  });

  it('is case- and honorific-insensitive for Actor-matched names', () => {
    global.game.actors._set('ship-1', {
      id:   'ship-1',
      type: 'starship',
      name: 'Kobayashi V',
    });
    expect(entityExistsAnyType('KOBAYASHI V', {})).toBe(true);
    expect(entityExistsAnyType('kobayashi v', {})).toBe(true);
  });

  it('returns false for a starship-shaped name that has no matching Actor or sector', () => {
    expect(entityExistsAnyType('Some Other Ship', { sectors: [], shipIds: [] })).toBe(false);
  });
});

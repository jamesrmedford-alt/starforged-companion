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

  it('does NOT match non-character Actors that happen to share a name', () => {
    // A starship called "Chen" shouldn't prevent a connection named
    // "Chen" — the dedup is character-name-specific.
    global.game.actors._set('ship-1', {
      id:   'ship-1',
      type: 'starship',
      name: 'Chen',
    });
    expect(entityExistsAnyType('Chen', {})).toBe(false);
  });

  it('returns false when there are no PCs and no campaignState entities', () => {
    expect(entityExistsAnyType('Random Stranger', {})).toBe(false);
  });

  it('tolerates a missing game.actors collection (test environments)', () => {
    global.game.actors = undefined;
    expect(() => entityExistsAnyType('Anyone', {})).not.toThrow();
  });
});

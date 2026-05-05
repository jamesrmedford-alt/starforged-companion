// tests/unit/canonicalMoveBlock.test.js
// Phase 6 — buildCanonicalMoveBlock injects pack text when present.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildCanonicalMoveBlock } from '../../src/moves/interpreter.js';
import { _clearPackCache, IS_PACKS } from '../../src/system/ironswornPacks.js';

describe('Phase 6 — buildCanonicalMoveBlock', () => {
  let originalPacks;

  beforeEach(() => {
    _clearPackCache();
    originalPacks = global.game.packs;
  });

  afterEach(() => {
    global.game.packs = originalPacks;
  });

  it('returns "" when slug is empty', async () => {
    expect(await buildCanonicalMoveBlock('')).toBe('');
    expect(await buildCanonicalMoveBlock(null)).toBe('');
  });

  it('returns "" when no pack is registered', async () => {
    global.game.packs = { get: () => null };
    expect(await buildCanonicalMoveBlock('pay_the_price')).toBe('');
  });

  it('wraps the canonical description in <canonical_move> tags when found', async () => {
    const move = {
      _id: 'm1',
      name: 'Pay the Price',
      flags: { 'foundry-ironsworn': { dfid: 'starforged/moves/fate/pay_the_price' } },
      system: { description: 'Roll on the table or choose.' },
    };
    const entries = [move];
    entries.find = (fn) => Array.prototype.find.call(entries, fn);
    entries.size = 1;
    global.game.packs = {
      get: (id) => id === IS_PACKS.STARFORGED_MOVES
        ? { index: entries, getDocument: async (id) => entries.find(e => e._id === id) }
        : null,
    };
    const block = await buildCanonicalMoveBlock('pay_the_price');
    expect(block).toContain('<canonical_move>');
    expect(block).toContain('Roll on the table or choose.');
    expect(block).toContain('</canonical_move>');
  });

  it('returns "" when the matched move has no description', async () => {
    const move = { _id: 'm1', name: 'Face Danger', system: {} };
    const entries = [move];
    entries.find = (fn) => Array.prototype.find.call(entries, fn);
    entries.size = 1;
    global.game.packs = {
      get: () => ({
        index: entries,
        getDocument: async (id) => entries.find(e => e._id === id),
      }),
    };
    expect(await buildCanonicalMoveBlock('face_danger')).toBe('');
  });
});

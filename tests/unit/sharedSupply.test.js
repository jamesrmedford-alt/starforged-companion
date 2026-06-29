/**
 * STARFORGED COMPANION
 * tests/unit/sharedSupply.test.js
 *
 * Pure-logic coverage for the crew-shared supply sync (#co-op supply rule).
 * computeSupplySyncUpdates is the core of the updateActor hook — it decides
 * which other player characters need their supply brought into lockstep.
 */

import { describe, it, expect } from 'vitest';
import { computeSupplySyncUpdates } from '../../src/multiplayer/sharedSupply.js';

const MODULE_ID = 'starforged-companion';

function pc(id, supply) {
  return { id, type: 'character', flags: {}, system: { supply: { value: supply } } };
}
function npcCard(id, supply) {
  return { id, type: 'character', flags: { [MODULE_ID]: { entityType: 'connection' } }, system: { supply: { value: supply } } };
}

describe('computeSupplySyncUpdates', () => {
  it('returns [] in solo play (only the source PC)', () => {
    const a = pc('a', 3);
    expect(computeSupplySyncUpdates(a, [a])).toEqual([]);
  });

  it('targets other PCs whose supply differs, set to the source value', () => {
    const a = pc('a', 3);
    const b = pc('b', 5);
    const out = computeSupplySyncUpdates(a, [a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].actor).toBe(b);
    expect(out[0].value).toBe(3);
  });

  it('skips PCs already in lockstep', () => {
    const a = pc('a', 2);
    const inSync = pc('b', 2);
    const behind = pc('c', 5);
    const out = computeSupplySyncUpdates(a, [a, inSync, behind]);
    expect(out).toHaveLength(1);
    expect(out[0].actor).toBe(behind);
  });

  it('never targets the source actor itself', () => {
    const a = pc('a', 4);
    expect(computeSupplySyncUpdates(a, [a])).toEqual([]);
  });

  it('ignores NPC cards (character-type actors flagged as entities)', () => {
    const a = pc('a', 3);
    const npc = npcCard('npc', 5);   // would differ, but is not a PC
    expect(computeSupplySyncUpdates(a, [a, npc])).toEqual([]);
  });

  it('returns [] when the source supply is unreadable', () => {
    const a = { id: 'a', type: 'character', flags: {}, system: {} };
    const b = pc('b', 5);
    expect(computeSupplySyncUpdates(a, [a, b])).toEqual([]);
  });

  it('returns [] when every PC is already in lockstep', () => {
    expect(computeSupplySyncUpdates(pc('a', 4), [pc('a', 4), pc('b', 4)])).toEqual([]);
  });
});

/**
 * STARFORGED COMPANION
 * tests/unit/swearVow.test.js
 *
 * Unit tests for the ⚔ Swear this vow planner (Cluster B — F2/F3/F4).
 * The pure planner decides what a click does; the executor's Foundry IO is
 * covered live by the Quench inciting-incident batch.
 */

import { describe, it, expect } from 'vitest';
import { buildSwearVowPlan } from '../../src/session/swearVow.js';

const META = {
  vow:    { statement: 'I will reach Vance before his life support fails', rank: 'dangerous', raw: '' },
  clock:  { label: "Vance's life support", segments: 6 },
  target: { name: 'Vance', description: 'Estranged mentor, wounded aboard his shuttle.' },
};

const CTX = { isGM: true, hasActor: true, targetExists: false, alreadySworn: false };

describe('buildSwearVowPlan', () => {
  it('plans vow + clock + target creation for a GM with a PC', () => {
    const plan = buildSwearVowPlan(META, CTX);
    expect(plan.ok).toBe(true);
    expect(plan.vow).toEqual({
      name:  'I will reach Vance before his life support fails',
      rank:  'dangerous',
      clock: { max: 6 },
    });
    expect(plan.createTarget).toBe(true);
    expect(plan.targetNotice).toBeUndefined();
  });

  it('omits the clock when the narrator suggested none', () => {
    const plan = buildSwearVowPlan({ ...META, clock: null }, CTX);
    expect(plan.ok).toBe(true);
    expect(plan.vow.clock).toBeNull();
  });

  it('skips target creation with a notice when the name already exists', () => {
    const plan = buildSwearVowPlan(META, { ...CTX, targetExists: true });
    expect(plan.ok).toBe(true);
    expect(plan.createTarget).toBe(false);
    expect(plan.targetNotice).toMatch(/already established/);
  });

  it('skips target creation with a GM notice for non-GM clickers (world-write gate)', () => {
    const plan = buildSwearVowPlan(META, { ...CTX, isGM: false });
    expect(plan.ok).toBe(true);              // the vow itself still lands
    expect(plan.createTarget).toBe(false);
    expect(plan.targetNotice).toMatch(/Ask your GM/);
  });

  it('plans no target work when the narrator named none', () => {
    const plan = buildSwearVowPlan({ ...META, target: null }, CTX);
    expect(plan.ok).toBe(true);
    expect(plan.createTarget).toBe(false);
    expect(plan.targetNotice).toBeUndefined();
  });

  it('refuses when the vow has already been sworn', () => {
    const plan = buildSwearVowPlan(META, { ...CTX, alreadySworn: true });
    expect(plan).toMatchObject({ ok: false, reason: 'already_sworn' });
  });

  it('refuses when the card carries no vow', () => {
    expect(buildSwearVowPlan(null, CTX)).toMatchObject({ ok: false, reason: 'no_vow' });
    expect(buildSwearVowPlan({ vow: null }, CTX)).toMatchObject({ ok: false, reason: 'no_vow' });
  });

  it('refuses when no player character exists', () => {
    const plan = buildSwearVowPlan(META, { ...CTX, hasActor: false });
    expect(plan).toMatchObject({ ok: false, reason: 'no_character' });
  });
});

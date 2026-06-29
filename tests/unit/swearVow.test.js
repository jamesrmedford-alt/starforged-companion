/**
 * STARFORGED COMPANION
 * tests/unit/swearVow.test.js
 *
 * Unit tests for the ⚔ Swear this vow planner (Cluster B — F2/F3/F4).
 * The pure planner decides what a click does; the executor's Foundry IO is
 * covered live by the Quench inciting-incident batch.
 */

import { describe, it, expect } from 'vitest';
import { buildSwearVowPlan, computeSharedVowSyncUpdates } from '../../src/session/swearVow.js';

const MODULE_ID = 'starforged-companion';

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

  it('queues a GM-actionable target draft for non-GM clickers instead of a dead advisory (finding C)', () => {
    const plan = buildSwearVowPlan(META, { ...CTX, isGM: false });
    expect(plan.ok).toBe(true);              // the vow itself still lands
    expect(plan.createTarget).toBe(false);   // world-write stays GM-only
    expect(plan.queueTargetDraft).toBe(true);
    expect(plan.targetNotice).toMatch(/queued as a connection for your GM/);
  });

  it('does not queue a draft when the target already exists', () => {
    const plan = buildSwearVowPlan(META, { ...CTX, isGM: false, targetExists: true });
    expect(plan.queueTargetDraft).toBeFalsy();
    expect(plan.targetNotice).toMatch(/already established/);
  });

  it('does not queue a draft for a GM (it creates directly)', () => {
    const plan = buildSwearVowPlan(META, { ...CTX, isGM: true });
    expect(plan.queueTargetDraft).toBeFalsy();
    expect(plan.createTarget).toBe(true);
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

// The inciting vow is the crew's shared founding vow: created on every PC and
// kept in lockstep. computeSharedVowSyncUpdates is the pure core of the
// updateItem sync hook — it decides which sibling copies need to catch up.
function vowItem(id, vowId, current, { shared = true, clockTicks } = {}) {
  const flags  = shared ? { sharedVow: true, vowId } : { vowId };
  const system = { current };
  if (clockTicks !== undefined) system.clockTicks = clockTicks;
  return { id, type: 'progress', flags: { [MODULE_ID]: flags }, system };
}

describe('computeSharedVowSyncUpdates', () => {
  it('returns [] when the source item is not a shared vow', () => {
    const src = vowItem('i1', 'm1', 8, { shared: false });
    expect(computeSharedVowSyncUpdates(src, [{ items: [src] }])).toEqual([]);
  });

  it('targets sibling shared vows (same vowId) whose progress is behind', () => {
    const src    = vowItem('i1', 'm1', 8);
    const behind = vowItem('i2', 'm1', 4);   // a different PC's copy, behind
    const synced = vowItem('i3', 'm1', 8);   // already in lockstep
    const other  = vowItem('i4', 'm2', 0);   // an unrelated vow
    const actors = [{ items: [src] }, { items: [behind, synced] }, { items: [other] }];

    const out = computeSharedVowSyncUpdates(src, actors);
    expect(out).toHaveLength(1);
    expect(out[0].item).toBe(behind);
    expect(out[0].update).toEqual({ 'system.current': 8 });
  });

  it('never targets the source item itself', () => {
    const src = vowItem('i1', 'm1', 8);
    expect(computeSharedVowSyncUpdates(src, [{ items: [src] }])).toEqual([]);
  });

  it('returns [] when every sibling is already in lockstep', () => {
    const src = vowItem('i1', 'm1', 12);
    const sib = vowItem('i2', 'm1', 12);
    expect(computeSharedVowSyncUpdates(src, [{ items: [src, sib] }])).toEqual([]);
  });

  it('syncs the attached clock ticks alongside progress', () => {
    const src = vowItem('i1', 'm1', 8, { clockTicks: 3 });
    const sib = vowItem('i2', 'm1', 8, { clockTicks: 0 });   // progress equal, clock behind
    const out = computeSharedVowSyncUpdates(src, [{ items: [src, sib] }]);
    expect(out).toHaveLength(1);
    expect(out[0].update).toEqual({ 'system.current': 8, 'system.clockTicks': 3 });
  });
});

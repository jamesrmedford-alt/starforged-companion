/**
 * SKEL — PLAN-RETIRE-LEAVES-CLOCK
 *
 * Scenario: a decided threat plan holds an escalation clock ("the escort —
 * escalation", `planId` on the clock, `clockId` on the plan). The GM presses
 * **Retire** on the plan in the World Journal panel's Secrets section
 * ("Take it out of play — the narrator no longer sees it"; it is also the
 * documented way to drop a decided duplicate, known-issues P2-30).
 *
 * Correct: the plan's clock leaves play with it, as it does when the plan's
 * story ends through a narration's `resolved` reveal (secrets.js
 * paceAfterReveal retires it): no more Pay the Price turns it, and it holds
 * no plan-clock slot (MAX_PLAN_CLOCKS).
 *
 * Today: retireSkeleton writes the plan's status only. The clock stays
 * active with its `planId`: every Pay the Price advances it on the table's
 * "The clock turns" card, its filling fires a trigger vignette with no plan
 * behind it (planForClock finds no active plan), and — full or not — it keeps
 * counting toward MAX_PLAN_CLOCKS, so after four the next decided threat gets
 * no clock at all.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, moveResolution, narrateMoveOn,
} from '../../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../../src/moves/resolver.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const clockOf = (id) => (stored().clocks ?? []).find(c => c._id === id);
const planOf = (id) => plansOf(table).find(p => p.id === id);

/** A decided threat plan with its escalation clock, filed as a narration files one. */
async function decidedThreat(subject = 'the escort') {
  table.replies = (call) => {
    const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
    return { prose: `${subject} detaches from the dark.`, sidecar: { newTruths: [], stateChanges: [],
      ...(ref ? { plans: [{ id: ref, subject, truth: `What ${subject} really is.`,
        escalation: ['It asks again, closer', 'It seals the corridor'], clues: ['A pulse that counts down'] }] } : {}) } };
  };
  const before = new Set(plansOf(table).map(p => p.id));
  await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
  return plansOf(table).find(p => p.kind === 'threat' && !before.has(p.id));
}

describe('SKEL PLAN-RETIRE-LEAVES-CLOCK — a plan the GM retires takes its clock out of play', () => {
  it('control: a plan a narration resolves has its clock retired', async () => {
    const plan = await decidedThreat();
    expect(clockOf(plan.clockId)).toMatchObject({ active: true, planId: plan.id });
    table.replies = () => ({ prose: 'The escort goes dark for good.', sidecar: { newTruths: [], stateChanges: [],
      reveals: [{ id: plan.id, resolved: true }] } });
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' }));
    expect(planOf(plan.id).status).toBe('resolved');
    expect(clockOf(plan.clockId).active).toBe(false);
  }, 60_000);

  it('the GM\'s Retire stops the plan\'s clock: Pay the Price no longer turns it', async () => {
    const plan = await decidedThreat();
    const { retireSkeleton } = await gmOf(table).import('../../src/world/secrets.js');
    const retired = await onGm(table, () => retireSkeleton(plan.id));
    expect(retired?.status).toBe('retired');

    const { advanceClocksOnPayThePrice } = await gmOf(table).import('../../src/clocks/payThePriceClocks.js');
    const advanced = await onGm(table, () => advanceClocksOnPayThePrice());
    // Correct: the retired plan's clock is not among the clocks a price turns.
    expect(advanced.map(c => c.name)).not.toContain('the escort — escalation');
    expect(clockOf(plan.clockId)?.active === true && clockOf(plan.clockId).filled > 0,
      'the retired plan\'s clock still runs').toBe(false);
  }, 60_000);

  it('retired plans\' clocks hold no plan-clock slot: a fifth threat still gets its clock', async () => {
    const { retireSkeleton } = await gmOf(table).import('../../src/world/secrets.js');
    for (const name of ['the escort', 'the warden', 'the broker', 'the pilot']) {
      const plan = await decidedThreat(name);
      expect(plan?.clockId, `${name}'s clock`).toBeTruthy();
      await onGm(table, () => retireSkeleton(plan.id));
    }
    const fifth = await decidedThreat('the cutter');
    expect(fifth.truth).toBeTruthy();
    // Correct: nothing planned is running a clock, so the new threat is paced.
    expect(fifth.clockId, 'the fifth decided threat\'s escalation clock').toBeTruthy();
    expect(narrationCallsOf(table).length).toBeGreaterThan(0);
  }, 120_000);
});

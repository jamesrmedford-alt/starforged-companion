/**
 * STARFORGED COMPANION
 * tests/unit/retiredPlanClockLeavesPlay.test.js
 *
 * Issue #362 AC10 (PLAN-RETIRE-LEAVES-CLOCK): a decided threat plan holds an
 * escalation clock (`planId` on the clock, `clockId` on the plan). The GM's
 * Retire wrote the plan's status alone: the clock kept running — every Pay the
 * Price turned it, its filling fired a vignette with no plan behind it — and,
 * full or not, it counted toward MAX_PLAN_CLOCKS, so after four retired plans
 * no decided threat got a clock again. A plan that leaves play now takes its
 * clock with it, as a narration's `resolved` reveal already did, and only the
 * clocks of active plans hold a slot. A waiting plan retired as another
 * (`sameAs`) takes a countdown it held with it too.
 *
 * From the fourteenth audit's probe (skel/retiredPlanClockKeepsRunning).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, moveResolution, narrateMoveOn,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const clockOf = (id) => (stored().clocks ?? []).find(c => c._id === id);
const planOf = (id) => plansOf(table).find(p => p.id === id);
const secrets = () => gmOf(table).import('../../src/world/secrets.js');

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

describe('issue #362 AC10 — a plan that leaves play takes its clock out of play', () => {
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
    const { retireSkeleton } = await secrets();
    expect((await onGm(table, () => retireSkeleton(plan.id)))?.status).toBe('retired');
    expect(clockOf(plan.clockId), 'kept on the list for the record').toMatchObject({ active: false, planId: plan.id });

    const { advanceClocksOnPayThePrice } = await gmOf(table).import('../../src/clocks/payThePriceClocks.js');
    const advanced = await onGm(table, () => advanceClocksOnPayThePrice());
    expect(advanced.map(c => c._id)).not.toContain(plan.clockId);
    expect(clockOf(plan.clockId).filled).toBe(0);
  }, 60_000);

  it('retired plans\' clocks hold no plan-clock slot: a fifth decided threat still gets its clock', async () => {
    const { retireSkeleton } = await secrets();
    for (const name of ['the escort', 'the warden', 'the broker', 'the pilot']) {
      const plan = await decidedThreat(name);
      expect(plan?.clockId, `${name}'s clock`).toBeTruthy();
      await onGm(table, () => retireSkeleton(plan.id));
    }
    const fifth = await decidedThreat('the cutter');
    expect(fifth.truth).toBeTruthy();
    expect(fifth.clockId, 'the fifth decided threat\'s escalation clock').toBeTruthy();
  }, 120_000);

  it('a clock whose plan is gone holds no slot either (only an active plan\'s running clock counts)', async () => {
    for (const name of ['the escort', 'the warden', 'the broker', 'the pilot']) {
      expect((await decidedThreat(name))?.clockId, `${name}'s clock`).toBeTruthy();
    }
    // The GM deletes one plan's page in the journal: its clock is left on the list, running.
    const journal = gmOf(table).run(() => game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'secrets'));
    const page = journal.pages.contents.find(p => p.flags?.[MODULE_ID]?.secretEntry?.subject?.name === 'the broker');
    const brokerClockId = page.flags[MODULE_ID].secretEntry.clockId;
    await page.delete();
    expect(clockOf(brokerClockId)).toMatchObject({ active: true });
    const fifth = await decidedThreat('the cutter');
    expect(fifth.clockId, 'the fifth decided threat\'s escalation clock').toBeTruthy();
  }, 120_000);

  it('control: four live plan clocks still fill the slots — a fifth decided threat waits', async () => {
    for (const name of ['the escort', 'the warden', 'the broker', 'the pilot']) {
      expect((await decidedThreat(name))?.clockId, `${name}'s clock`).toBeTruthy();
    }
    const fifth = await decidedThreat('the cutter');
    expect(fifth.truth).toBeTruthy();
    expect(fifth.clockId).toBeNull();
  }, 120_000);

  it('a waiting plan the narrator says is another (sameAs) is retired with the countdown it held', async () => {
    const { createSkeleton } = await secrets();
    const warden = await onGm(table, () => createSkeleton({
      kind: 'threat', subject: { type: 'name', id: null, name: 'the Warden' }, truth: 'The Warden runs the station.',
      sceneId: 'sc-earlier', sessionId: 's-1',
    }, { byGm: true }));
    // A narration brings in "the escort" with a countdown about it: its plan waits, holding the countdown's clock.
    table.replies = () => ({ prose: 'The escort begins to count.', sidecar: { newTruths: [], stateChanges: [],
      newThreats: [{ name: 'the escort' }], countdown: { label: 'the escort\'s count', about: 'the escort' } } });
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    const waiting = plansOf(table).find(p => p.subject.name === 'the escort');
    expect(waiting).toMatchObject({ truth: '', status: 'active' });
    expect(clockOf(waiting.clockId)).toMatchObject({ active: true, name: 'the escort\'s count' });

    // The next narration says the escort is the Warden.
    table.replies = () => ({ prose: 'The escort\'s voice is the Warden\'s.', sidecar: { newTruths: [], stateChanges: [],
      plans: [{ id: waiting.id, sameAs: warden.id, subject: 'the escort' }] } });
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    expect(planOf(waiting.id).status).toBe('retired');
    expect(planOf(warden.id).aliases).toContain('the escort');
    expect(clockOf(waiting.clockId).active, 'the retired plan\'s countdown no longer runs').toBe(false);
  }, 60_000);
});

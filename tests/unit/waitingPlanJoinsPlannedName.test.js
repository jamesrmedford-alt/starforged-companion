/**
 * STARFORGED COMPANION
 * tests/unit/waitingPlanJoinsPlannedName.test.js
 *
 * Issue #362 AC36 WAITING-PLAN-DECIDED-ONTO-PLANNED-NAME (an incomplete fix
 * of issue #354 P2-30, "one plan a subject"). "The escort" has a decided
 * threat plan. A later price reveals a new enemy and its narration decides
 * nothing, so the request is filed with its rolls alone — a waiting plan
 * called "the new enemy this price reveals". The next narration, asked to
 * decide it by its id, answers with the name its prose uses: `plans: [{ id,
 * subject: "the escort", truth }]`. Only the request path checked the name
 * (`activePlanAbout`); a plan decided by id was checked for `sameAs` alone,
 * and applyPlanToSkeleton renamed the waiting plan "the escort" and decided
 * it — two active plans for one enemy, two truths, two clocks turning on every
 * price. A decision that names a subject already planned now joins that plan
 * on the by-id path too, as the same answer does on the request path.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, moveResolution, narrateMoveOn,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';
import { isPlanRequestLabel } from '../../src/world/skeletons.js';

const FIRST_TRUTH  = 'A Keeper drone collecting names.';
const SECOND_TRUTH = 'A decoy the Pale Choir flies to draw fire.';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const activeThreats = () => plansOf(table).filter(p => p.status === 'active' && p.kind === 'threat');
const runningPlanClocks = () => (stored().clocks ?? []).filter(c => c.planId && c.active !== false);
const liveTruths = () => (stored().sceneTruths ?? []).filter(t => !t.retracted).map(t => t.fact);
const newEnemyPrice = () => moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') });

/** Answer the price's request (by its ref) with this decision, when the narration is asked for one. */
const answeringRequest = (decision) => (call) => {
  const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
  return { prose: 'Something detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
    ...(ref && decision ? { plans: [{ id: ref, ...decision }] } : {}) } };
};

/** The next narration decides the waiting plan `id`, as asked, with this answer (and any reveals). */
const decidingWaiting = (id, decision, extra = {}) => (call) => ({ prose: 'The escort swings back across the bow.',
  sidecar: { newTruths: [], stateChanges: [], ...(call.system.includes(`- id ${id}:`) ? { plans: [{ id, ...decision }], ...extra } : {}) } });

async function escortPlanned() {
  table.replies = answeringRequest({ subject: 'the escort', truth: FIRST_TRUTH, escalation: ['It asks again, closer', 'It seals the corridor'] });
  await narrateMoveOn(table, newEnemyPrice());
  return activeThreats()[0];
}

/** A price reveals a new enemy and its narration decides nothing: the request waits under its placeholder. */
async function enemyWaiting(escort) {
  table.replies = answeringRequest(null);
  await narrateMoveOn(table, newEnemyPrice());
  return activeThreats().find(p => p.id !== escort.id);
}

describe('issue #362 AC36 — one plan a subject, whichever beat decides it', () => {
  it('control: the same answer given to the request itself joins the escort\'s plan', async () => {
    const escort = await escortPlanned();
    table.replies = answeringRequest({ subject: 'the escort', truth: SECOND_TRUTH, escalation: ['It rams'] });
    await narrateMoveOn(table, newEnemyPrice());
    expect(activeThreats()).toHaveLength(1);
    expect(activeThreats()[0]).toMatchObject({ id: escort.id, truth: FIRST_TRUTH });
    expect(runningPlanClocks()).toHaveLength(1);
  }, 60_000);

  it('a waiting plan decided, a beat later, as "the escort" joins the escort\'s plan too — one plan, one clock', async () => {
    const escort = await escortPlanned();
    const waiting = await enemyWaiting(escort);
    expect(waiting, 'the request is filed undecided').toMatchObject({ truth: '', subject: { name: 'the new enemy this price reveals' } });

    table.replies = decidingWaiting(waiting.id, { subject: 'the escort', truth: SECOND_TRUTH, escalation: ['It rams'] });
    await narrateMoveOn(table, moveResolution());

    const aboutEscort = activeThreats().filter(p => p.subject.name === 'the escort');
    expect(aboutEscort.map(p => p.truth), 'active threat plans named "the escort"').toEqual([FIRST_TRUTH]);
    expect(runningPlanClocks().map(c => c.planId)).toEqual([escort.id]);
    expect(plansOf(table).find(p => p.id === waiting.id).status).toBe('retired');
    // The placeholder it waited under is no name of the escort's.
    expect(plansOf(table).find(p => p.id === escort.id).aliases ?? []).not.toContain('the new enemy this price reveals');
  }, 60_000);

  it('a waiting plan the prose had named is the escort\'s by that name too', async () => {
    const escort = await escortPlanned();
    table.replies = () => ({ prose: 'A second presence slides out of the shadow.', sidecar: { newTruths: [], stateChanges: [], newThreats: ['the second presence'] } });
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    const waiting = activeThreats().find(p => p.subject.name === 'the second presence');
    expect(waiting).toBeTruthy();

    table.replies = decidingWaiting(waiting.id, { subject: 'The Escort', truth: SECOND_TRUTH });
    await narrateMoveOn(table, moveResolution());
    expect(activeThreats().map(p => p.id)).toEqual([escort.id]);
    expect(plansOf(table).find(p => p.id === escort.id).aliases).toContain('the second presence');
  }, 60_000);

  it('a truth revealed in the beat that joins it is no scene fact of the retired plan', async () => {
    const escort = await escortPlanned();
    const waiting = await enemyWaiting(escort);
    table.replies = decidingWaiting(waiting.id, { subject: 'the escort', truth: SECOND_TRUTH },
      { reveals: [{ id: waiting.id, revealed: ['truth'] }] });
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' }));
    expect(activeThreats().map(p => p.id)).toEqual([escort.id]);
    expect(liveTruths()).not.toContain(SECOND_TRUTH);
  }, 60_000);

  it('control: a waiting plan decided under a name no plan has is decided as it is', async () => {
    const escort = await escortPlanned();
    const waiting = await enemyWaiting(escort);
    table.replies = decidingWaiting(waiting.id, { subject: 'the Choir hunter', truth: SECOND_TRUTH });
    await narrateMoveOn(table, moveResolution());
    expect(plansOf(table).find(p => p.id === waiting.id)).toMatchObject({ status: 'active', truth: SECOND_TRUTH, subject: { name: 'the Choir hunter' } });
    expect(activeThreats()).toHaveLength(2);
  }, 60_000);
});

describe('isPlanRequestLabel — a request\'s placeholder is no name', () => {
  it('knows the placeholders a request is filed under, articles and case aside', () => {
    expect(isPlanRequestLabel('the new enemy this price reveals')).toBe(true);
    expect(isPlanRequestLabel('The discovery this move makes')).toBe(true);
    expect(isPlanRequestLabel('the chaos this move confronts')).toBe(true);
    expect(isPlanRequestLabel('the escort')).toBe(false);
  });
});

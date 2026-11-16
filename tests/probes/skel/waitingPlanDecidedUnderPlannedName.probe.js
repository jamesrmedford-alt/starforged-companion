/**
 * SKEL — WAITING-PLAN-DECIDED-ONTO-PLANNED-NAME  (INCOMPLETE-FIX of issue #354 P2-30)
 *
 * Scenario: "the escort" already has a decided threat plan. A later price
 * reveals a new enemy and its narration decides nothing, so the request is
 * filed with its rolls alone — a waiting plan named "the new enemy this price
 * reveals" (the documented fallback). The next narration is asked to decide
 * it (DECIDE NOW, by its id) and answers with the name its prose uses:
 * `plans: [{ id, subject: "the escort", truth: … }]` — the enemy was the
 * escort all along.
 *
 * Correct (P2-30, "one plan a subject": "a plan that names a subject already
 * planned is merged into that plan"): the decision joins the escort's plan,
 * as the very same answer does when it is given to the request in the
 * narration that revealed the enemy (control below). One active plan about
 * the escort; one escalation clock.
 *
 * Today: only the request path checks the name (secrets.js applyPlanSideData:
 * `activePlanAbout(plan.subject, req.kind)`). A plan decided by id is only
 * checked for `sameAs`; applyPlanToSkeleton then renames the waiting plan to
 * "the escort" and decides it — two active threat plans for one enemy, each
 * free to hold a different truth, and two clocks both named
 * "the escort — escalation" turning on every Pay the Price.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, moveResolution, narrateMoveOn,
} from '../../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../../src/moves/resolver.js';

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
const newEnemyPrice = () => moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') });

/** Answer the price's request (by its ref) with this decision, when the narration is asked for one. */
const answeringRequest = (decision) => (call) => {
  const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
  return { prose: 'Something detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
    ...(ref && decision ? { plans: [{ id: ref, ...decision }] } : {}) } };
};

async function escortPlanned() {
  table.replies = answeringRequest({ subject: 'the escort', truth: FIRST_TRUTH, escalation: ['It asks again, closer', 'It seals the corridor'] });
  await narrateMoveOn(table, newEnemyPrice());
  return activeThreats()[0];
}

describe('SKEL WAITING-PLAN-DECIDED-ONTO-PLANNED-NAME — one plan a subject, whichever beat decides it', () => {
  it('control: the same answer given to the request itself joins the escort\'s plan', async () => {
    const escort = await escortPlanned();
    table.replies = answeringRequest({ subject: 'the escort', truth: SECOND_TRUTH, escalation: ['It rams'] });
    await narrateMoveOn(table, newEnemyPrice());
    expect(activeThreats()).toHaveLength(1);
    expect(activeThreats()[0]).toMatchObject({ id: escort.id, truth: FIRST_TRUTH });
    expect(runningPlanClocks()).toHaveLength(1);
  }, 60_000);

  it('a waiting plan decided, a beat later, as "the escort" joins the escort\'s plan too', async () => {
    const escort = await escortPlanned();
    // The price reveals a new enemy; this narration decides nothing: filed with its rolls alone.
    table.replies = answeringRequest(null);
    await narrateMoveOn(table, newEnemyPrice());
    const waiting = activeThreats().find(p => p.id !== escort.id);
    expect(waiting, 'the request is filed undecided').toMatchObject({ truth: '', subject: { name: 'the new enemy this price reveals' } });

    // The next narration is asked to decide it, and names it as its prose does.
    table.replies = (call) => ({ prose: 'The escort swings back across the bow.', sidecar: { newTruths: [], stateChanges: [],
      ...(call.system.includes(`- id ${waiting.id}:`)
        ? { plans: [{ id: waiting.id, subject: 'the escort', truth: SECOND_TRUTH, escalation: ['It rams'] }] } : {}) } });
    await narrateMoveOn(table, moveResolution());

    // Correct: still one active plan about the escort, holding the truth it had, and one clock.
    const aboutEscort = activeThreats().filter(p => p.subject.name === 'the escort');
    expect(aboutEscort.map(p => p.truth), 'active threat plans named "the escort"').toEqual([FIRST_TRUTH]);
    expect(runningPlanClocks().map(c => c.name)).toEqual(['the escort — escalation']);
  }, 60_000);
});

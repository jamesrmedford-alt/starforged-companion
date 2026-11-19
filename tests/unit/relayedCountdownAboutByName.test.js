/**
 * STARFORGED COMPANION
 * tests/unit/relayedCountdownAboutByName.test.js
 *
 * Issue #364 RELAYED-COUNTDOWN-ABOUT-BY-ID. Issue #362 D2 keeps a relayed
 * fact block's `countdown` — a narration on a player's own key may start one
 * — and `applyCountdown` resolved its `about` by plan id first. Plan ids are
 * public (a clock's `planId`, a rolls card's `skeletonId`), and a narration on
 * a player's own key is shown no plan, so an `about` that is a plan's id is
 * hand-made: it hung a new clock on a plan that had none, which every Pay the
 * Price then turned towards that plan's next step or its answer.
 *
 * On the relay path `about` is now a name only: what the fiction calls the
 * subject still finds its plan; a plan's id finds nothing, and the countdown
 * is about nothing planned — its own mystery, as any other. A GM's own
 * narration, which is shown the plans with their ids, still names one by id.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrateMoveOn, moveResolution,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';

const TRUTH = 'SENTINEL-TRUTH: a Keeper drone collecting names.';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const clocks = () => (stored().clocks ?? []).filter(c => c.active !== false);
const planOf = (id) => plansOf(table).find(p => p.id === id);

/** A decided threat with no escalation steps, so no clock of its own. */
async function clocklessThreat() {
  table.replies = (call) => {
    const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
    return { prose: 'An escort detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
      ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: TRUTH, clues: ['A pulse that counts down'] }] } : {}) } };
  };
  await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
  const plan = plansOf(table).find(p => p.kind === 'threat');
  expect(plan, 'setup: the escort is planned, decided').toMatchObject({ truth: TRUTH, clockId: null });
  expect(clocks(), 'setup: it has no clock').toEqual([]);
  table.replies = () => ({ prose: 'The escort drifts closer.', sidecar: { newTruths: [], stateChanges: [] } });
  return plan;
}

/** A `narrator.sidecar` relay Pat's client sends, as a hand-made one would. */
async function relayCountdown(countdown) {
  const { requestGmAction } = await table.client('pl-1').import('../../src/multiplayer/gmRelay.js');
  await table.client('pl-1').run(() => requestGmAction('narrator.sidecar', {
    sceneId: 'sc-1', narrationId: 'n-pl-1-relay', sidecar: { newTruths: [], stateChanges: [], countdown },
  }));
  await table.settle();
  await table.drain();
}

describe('issue #364 RELAYED-COUNTDOWN-ABOUT-BY-ID — a relayed countdown names no plan by its id', () => {
  it('a relay whose countdown is "about" a plan\'s id hangs no clock on that plan', async () => {
    const plan = await clocklessThreat();
    await relayCountdown({ label: 'The count', about: plan.id, segments: 4 });

    expect(planOf(plan.id).clockId ?? null, 'the escort\'s plan has no clock still').toBeNull();
    expect(clocks().filter(c => c.planId === plan.id)).toEqual([]);
    // The countdown itself stands (D2), about nothing planned: its own mystery, named by its label.
    const [clock] = clocks();
    expect(clock).toMatchObject({ name: 'The count' });
    const mystery = planOf(clock.planId);
    expect(mystery).toMatchObject({ kind: 'mystery', question: 'What happens when The count runs out?', subject: { name: 'The count' } });
    expect(JSON.stringify(mystery)).not.toContain(plan.id);
  }, 40_000);

  it('control: a relayed countdown about the subject by its name still belongs to that subject\'s plan', async () => {
    const plan = await clocklessThreat();
    await relayCountdown({ label: 'The count', about: 'the escort', segments: 4 });

    const [clock] = clocks();
    expect(clock).toMatchObject({ name: 'The count', planId: plan.id });
    expect(planOf(plan.id).clockId).toBe(clock._id);
    expect(plansOf(table).filter(p => p.kind === 'mystery')).toEqual([]);
  }, 40_000);

  it('control: the GM\'s own narration, shown the plan with its id, names it by id', async () => {
    const plan = await clocklessThreat();
    table.replies = () => ({ prose: 'The escort begins to count.', sidecar: { newTruths: [], stateChanges: [],
      countdown: { label: 'The count', about: plan.id, segments: 4 } } });
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));

    const [clock] = clocks();
    expect(clock).toMatchObject({ name: 'The count', planId: plan.id });
    expect(planOf(plan.id).clockId).toBe(clock._id);
  }, 40_000);
});

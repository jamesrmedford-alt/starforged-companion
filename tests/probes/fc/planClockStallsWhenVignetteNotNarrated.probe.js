/**
 * FC-06 · PLAN-CLOCK-STALLS-WHEN-TRIGGER-NOT-NARRATED  (LOCK / STALL)
 *
 * Scenario: a decided threat plan paces its escalation with a 4-segment
 * tension clock (decisions.md → "The narrative skeleton, Phase 3": "When the
 * clock fills, its trigger vignette plays the plan's next step — marked
 * played by code … — and the clock goes back to empty for the step after").
 * Pay the Price fills the clock, and the trigger vignette is not narrated:
 * the X-Card is active (every narrator path stands down while a move still
 * resolves and pays its price), or the Claude call fails.
 *
 * Correct: the plan's escalation is still paced afterwards — either the step
 * is marked played and the clock emptied for the next one, or the clock is
 * left able to trigger again. One missed vignette must not end the pacing.
 *
 * Today: the step is marked and the clock reset only inside the narration's
 * own sidecar apply (narrateClockAdvancement → applyNarratorSidecar's forced
 * `reveals` → secrets.applyPlanSideData → paceAfterReveal). A vignette that
 * returns null before that leaves the clock full with the step unplayed —
 * and a full tension clock is never advanced again
 * (clocks.advanceTensionClocksForPayThePrice: `(c.filled ?? 0) < c.segments`),
 * so nothing ever fires for it. The plan keeps the dead clock
 * (`planClock(record)` finds it, so ensureThreatClock makes no other) and it
 * holds one of the four plan-clock slots (MAX_PLAN_CLOCKS) for good.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { claudeFault } from '../../helpers/faults.js';
import {
  MODULE_ID, NARRATION_MODEL, resetSkeletonTable, gmOf, plansOf, onGm, narrateMoveOn, moveResolution, playXCard, patSpeaks,
} from '../../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../../src/moves/resolver.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const planOf = (id) => plansOf(table).find(p => p.id === id);
const clockOf = (plan) => (stored().clocks ?? []).find(c => c._id === plan.clockId);
const isNarration = (call) => call.model === NARRATION_MODEL;

/** A decided threat plan with its escalation clock, filed as a narration files one. */
async function decidedThreat() {
  table.replies = (call) => {
    const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
    return { prose: 'An escort detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
      ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: 'A Keeper drone collecting names.',
        escalation: ['It asks again, closer', 'It seals the corridor'], clues: ['A pulse that counts down'] }] } : {}) } };
  };
  await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
  table.replies = () => ({ prose: 'The escort drifts closer and asks again.', sidecar: { newTruths: [], stateChanges: [] } });
  return plansOf(table).find(p => p.kind === 'threat');
}

/** Pay the Price until the plan's clock is full, then run its trigger vignette as the clock code does. */
async function fillAndTrigger(plan) {
  const clocks = await gmOf(table).import('../../src/clocks/clocks.js');
  const { narrateClockAdvancement } = await gmOf(table).import('../../src/narration/narrator.js');
  let last = null;
  for (let i = 0; i < 4; i += 1) {
    const advanced = await onGm(table, () => clocks.advanceTensionClocksForPayThePrice());
    last = advanced.find(c => c._id === plan.clockId) ?? last;
  }
  expect(last, 'the price filled the plan\'s clock').toMatchObject({ filled: 4, segments: 4, triggered: true });
  return onGm(table, () => narrateClockAdvancement({
    clock: { ...last, type: 'tension' },
    campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
  }));
}

/** Whether the plan's escalation is still paced: its step was played and the clock emptied, or the clock can fill again. */
async function stillPaced(plan) {
  const clocks = await gmOf(table).import('../../src/clocks/clocks.js');
  const stepPlayed = planOf(plan.id).escalation[0].done === true;
  const clock = clockOf(plan);
  const emptied = !!clock && clock.active !== false && clock.filled < clock.segments;
  if (stepPlayed && emptied) return true;
  // …or a later price can still make it fire.
  const advanced = await onGm(table, () => clocks.advanceTensionClocksForPayThePrice());
  return advanced.some(c => c._id === plan.clockId);
}

describe('FC-06 — a plan\'s clock goes on pacing its escalation after a trigger vignette that was not narrated', () => {
  it('control: narrated, the step is marked played and the clock is emptied for the next step', async () => {
    const plan = await decidedThreat();
    expect(clockOf(plan)).toMatchObject({ type: 'tension', segments: 4, filled: 0, planId: plan.id });
    expect(await fillAndTrigger(plan)).toBeTruthy();
    expect(planOf(plan.id).escalation.map(e => e.done)).toEqual([true, false]);
    expect(clockOf(plan)).toMatchObject({ filled: 0, active: true });
    expect(await stillPaced(plan)).toBe(true);
  }, 60_000);

  it('the Claude call for the trigger vignette fails: the plan is still paced afterwards', async () => {
    const plan = await decidedThreat();
    table.script.when(isNarration, claudeFault.serverError(), { times: 3 });
    const saved = console.error;
    console.error = () => {};   // narrateClockAdvancement logs the failed call
    try {
      expect(await fillAndTrigger(plan)).toBeNull();
    } finally {
      console.error = saved;
    }
    expect(await stillPaced(plan), 'its step played and the clock emptied, or the clock can fire again').toBe(true);
  }, 60_000);

  it('the clock fills while the X-Card is active: the plan is still paced once a GM resumes', async () => {
    const plan = await decidedThreat();
    // A later beat is what the table X-cards: the plan and its clock, made two beats ago, stand.
    await patSpeaks(table);
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    await playXCard(table);
    expect(stored().xCardActive).toBe(true);
    expect(planOf(plan.id), 'the plan stands').toMatchObject({ status: 'active' });
    expect(clockOf(plan), 'and its clock').toMatchObject({ filled: 0, active: true });
    expect(await fillAndTrigger(plan)).toBeNull();   // every narrator path stands down

    const { clearXCard } = await gmOf(table).import('../../src/context/safety.js');
    await onGm(table, () => clearXCard());
    expect(stored().xCardActive).toBe(false);
    expect(await stillPaced(plan), 'its step played and the clock emptied, or the clock can fire again').toBe(true);
  }, 60_000);
});

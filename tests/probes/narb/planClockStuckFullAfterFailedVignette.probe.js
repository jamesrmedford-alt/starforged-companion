/* global expectConsoleError -- tests/setup.js */
/**
 * NARB-07 · PLAN-CLOCK-STUCK-FULL-AFTER-FAILED-VIGNETTE
 *
 * Scenario: a decided threat's escalation is paced by its tension clock
 * (decisions.md "Threat ↔ clock": "when the clock fills, its trigger vignette
 * plays the plan's next step — marked played by code … and the clock goes back
 * to empty for the step after"). A Pay the Price fills the clock, and the
 * trigger vignette's one Claude call fails (a 500 / 529 / timeout — or the
 * X-Card is in play, narration is switched off for the moment, the reply has
 * no prose).
 *
 * Correct: the plan's escalation is still paced — a later price gives its next
 * step another chance (the clock runs again), or the step is recorded.
 *
 * Today: narrateClockAdvancement marks the step and resets the clock only
 * through the vignette's own sidecar apply (`reveals: pacedReveals`), so a
 * vignette that is never written leaves the clock full with the step unplayed.
 * A full tension clock is never advanced again
 * (advanceTensionClocksForPayThePrice takes `filled < segments` only), and only
 * a clock that has just filled fires a vignette — so nothing ever plays the
 * step by code again, and the dead clock keeps one of the four plan-clock
 * slots (MAX_PLAN_CLOCKS) for good.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { claudeFault } from '../../helpers/faults.js';
import {
  MODULE_ID, NARRATION_MODEL, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, moveResolution, narrateMoveOn,
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
const isTriggerVignette = (c) => c.model === NARRATION_MODEL && /has TRIGGERED/.test(c.userText ?? '');
const plain = () => ({ prose: 'The corridor holds its breath.', sidecar: { newTruths: [], stateChanges: [] } });

/** A decided threat with two escalation steps and the tension clock that paces it, one segment short of full. */
async function threatOneSegmentFromItsStep() {
  table.replies = (call) => {
    const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
    return { prose: 'An escort detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
      ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: 'A Keeper drone collecting names.',
        escalation: ['It asks again, closer', 'It seals the corridor'], clues: ['A pulse that counts down'] }] } : {}) } };
  };
  await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
  const plan = plansOf(table).find(p => p.kind === 'threat');
  const clocks = await gmOf(table).import('../../src/clocks/clocks.js');
  await onGm(table, () => clocks.adjustClockSegments(plan.clockId, 3));
  table.replies = plain;
  return plan;
}

async function payThePrice() {
  const { advanceClocksOnPayThePrice } = await gmOf(table).import('../../src/clocks/payThePriceClocks.js');
  await onGm(table, () => advanceClocksOnPayThePrice());
}

describe('NARB-07 — a plan\'s clock still paces its next step after a trigger vignette that could not be written', () => {
  it('control: the price that fills the clock plays the step, and the clock runs again from empty', async () => {
    const plan = await threatOneSegmentFromItsStep();
    await payThePrice();
    expect(narrationCallsOf(table).filter(isTriggerVignette)).toHaveLength(1);
    expect(planOf(plan.id).escalation[0].done).toBe(true);
    expect(clockOf(plan.clockId)).toMatchObject({ active: true, filled: 0 });
    // Its vignette stands: the clock's own reset is not read as a rewind of the trigger.
    const [vignette] = table.cards(f => f.clockVignetteCard === true);
    expect(vignette?.flags?.[MODULE_ID]?.burnSuperseded ?? false).toBe(false);
  }, 60_000);

  it('the vignette\'s call fails: later prices still bring the step', async () => {
    expectConsoleError(/narrateClockAdvancement failed/);   // the failed call is logged, as it should be
    const plan = await threatOneSegmentFromItsStep();
    table.script.when(isTriggerVignette, claudeFault.serverError());
    await payThePrice();                                  // fills the clock; its vignette fails
    expect(narrationCallsOf(table).filter(isTriggerVignette)).toHaveLength(1);
    expect(table.cards(f => f.clockVignetteCard === true)).toHaveLength(0);
    // The table plays on: three more prices, the narrator answering again.
    for (let i = 0; i < 3; i += 1) await payThePrice();
    const clock = clockOf(plan.clockId);
    const step  = planOf(plan.id).escalation[0];
    const retried = narrationCallsOf(table).filter(isTriggerVignette).length > 1;
    // Not wedged: the step was played (or recorded), or its clock is running toward another try.
    const wedged = !step.done && !retried && clock.active !== false && clock.filled >= clock.segments;
    expect(wedged, `clock ${clock.filled}/${clock.segments}, step played: ${step.done}, vignette tried again: ${retried}`).toBe(false);
  }, 60_000);
});

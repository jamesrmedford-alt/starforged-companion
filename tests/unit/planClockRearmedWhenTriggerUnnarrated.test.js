/* global expectConsoleError -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/planClockRearmedWhenTriggerUnnarrated.test.js
 *
 * Issue #362 AC08 (PLAN-CLOCK-STUCK-FULL): a decided threat's escalation is
 * paced by a tension clock (decisions.md Phase 3: "When the clock fills, its
 * trigger vignette plays the plan's next step — marked played by code … — and
 * the clock goes back to empty for the step after"). The step was marked and
 * the clock reset only by the vignette's own sidecar apply, so a vignette that
 * was not written — the X-Card active, the call failed — left the clock full
 * for good: a full tension clock is turned by no price, the step never played,
 * and the clock kept a plan-clock slot. Such a clock now goes back one segment
 * short of full: the step is still owed, and the next price plays it.
 *
 * From the fourteenth audit's probes (fc/planClockStallsWhenVignetteNotNarrated,
 * narb/planClockStuckFullAfterFailedVignette), on a simulated table.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { claudeFault } from '../helpers/faults.js';
import {
  MODULE_ID, NARRATION_MODEL, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, narrateMoveOn, moveResolution,
  playXCard, patSpeaks,
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
const isTriggerVignette = (c) => c.model === NARRATION_MODEL && /has TRIGGERED/.test(c.userText ?? '');
const plain = () => ({ prose: 'The escort drifts closer and asks again.', sidecar: { newTruths: [], stateChanges: [] } });

/** A decided threat with two escalation steps and the tension clock that paces it, `filled` segments in. */
async function decidedThreat(filled = 3) {
  table.replies = (call) => {
    const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
    return { prose: 'An escort detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
      ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: 'A Keeper drone collecting names.',
        escalation: ['It asks again, closer', 'It seals the corridor'], clues: ['A pulse that counts down'] }] } : {}) } };
  };
  await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
  const plan = plansOf(table).find(p => p.kind === 'threat');
  expect(clockOf(plan.clockId)).toMatchObject({ type: 'tension', segments: 4, filled: 0, planId: plan.id });
  if (filled) {
    const clocks = await gmOf(table).import('../../src/clocks/clocks.js');
    await onGm(table, () => clocks.adjustClockSegments(plan.clockId, filled));
  }
  table.replies = plain;
  return plan;
}

async function payThePrice() {
  const { advanceClocksOnPayThePrice } = await gmOf(table).import('../../src/clocks/payThePriceClocks.js');
  return onGm(table, () => advanceClocksOnPayThePrice());
}

describe('issue #362 AC08 — a plan clock whose trigger vignette was not written is re-armed', () => {
  it('control: the price that fills the clock plays the step, and the clock runs again from empty', async () => {
    const plan = await decidedThreat();
    await payThePrice();
    expect(narrationCallsOf(table).filter(isTriggerVignette)).toHaveLength(1);
    expect(planOf(plan.id).escalation.map(e => e.done)).toEqual([true, false]);
    expect(clockOf(plan.clockId)).toMatchObject({ active: true, filled: 0 });
    // Its vignette stands: the clock's own reset is not read as a rewind of the trigger.
    const [vignette] = table.cards(f => f.clockVignetteCard === true);
    expect(vignette?.flags?.[MODULE_ID]?.burnSuperseded ?? false).toBe(false);
  }, 60_000);

  it('the vignette\'s call fails: the clock goes back one short of full, and the next price plays the step', async () => {
    expectConsoleError(/narrateClockAdvancement failed/);
    const plan = await decidedThreat();
    table.script.when(isTriggerVignette, claudeFault.serverError());
    const advanced = await payThePrice();
    expect(advanced.find(c => c._id === plan.clockId)).toMatchObject({ filled: 4, triggered: true });
    expect(table.cards(f => f.clockVignetteCard === true)).toHaveLength(0);
    expect(planOf(plan.id).escalation[0].done, 'nothing was narrated: the step is still owed').toBe(false);
    expect(clockOf(plan.clockId), 're-armed, not stuck full').toMatchObject({ active: true, filled: 3 });

    // The table plays on: the next price fills it again, and the narrator, answering now, plays the step.
    const again = await payThePrice();
    expect(again.find(c => c._id === plan.clockId)).toMatchObject({ filled: 4, triggered: true });
    expect(narrationCallsOf(table).filter(isTriggerVignette)).toHaveLength(2);
    expect(narrationCallsOf(table).filter(isTriggerVignette).at(-1).userText).toContain('"It asks again, closer"');
    expect(planOf(plan.id).escalation.map(e => e.done)).toEqual([true, false]);
    expect(clockOf(plan.clockId)).toMatchObject({ active: true, filled: 0 });
  }, 60_000);

  it('the clock fills while the X-Card is active: re-armed, and paced again once a GM resumes', async () => {
    const plan = await decidedThreat();
    // A later beat is what the table X-cards: the plan and its clock, made two beats ago, stand.
    await patSpeaks(table);
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    await playXCard(table);
    expect(stored().xCardActive).toBe(true);
    expect(planOf(plan.id)).toMatchObject({ status: 'active' });

    await payThePrice();   // every narrator path stands down
    expect(narrationCallsOf(table).filter(isTriggerVignette)).toHaveLength(0);
    expect(clockOf(plan.clockId)).toMatchObject({ active: true, filled: 3 });
    expect(planOf(plan.id).escalation[0].done).toBe(false);

    const { clearXCard } = await gmOf(table).import('../../src/context/safety.js');
    await onGm(table, () => clearXCard());
    await payThePrice();
    expect(planOf(plan.id).escalation[0].done, 'played once the narrator is back').toBe(true);
    expect(clockOf(plan.clockId)).toMatchObject({ active: true, filled: 0 });
  }, 60_000);

  it('an advance that does not fill it is not a trigger: a failed vignette leaves the clock where the price put it', async () => {
    expectConsoleError(/narrateClockAdvancement failed/);
    const plan = await decidedThreat(1);
    table.script.when((c) => c.model === NARRATION_MODEL, claudeFault.serverError());
    const { narrateClockAdvancement } = await gmOf(table).import('../../src/narration/narrator.js');
    expect(await onGm(table, () => narrateClockAdvancement({
      clock: { _id: plan.clockId, name: 'the escort — escalation', type: 'tension', filled: 1, segments: 4, triggered: false },
      campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
    }))).toBeNull();
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 1 });
  }, 60_000);

  it('control: an ordinary tension clock no plan holds stays full when its vignette fails', async () => {
    expectConsoleError(/narrateClockAdvancement failed/);
    const clocks = await gmOf(table).import('../../src/clocks/clocks.js');
    const reactor = await onGm(table, () => clocks.createClock({ name: 'Reactor breach', type: 'tension', segments: 4 }));
    await onGm(table, () => clocks.adjustClockSegments(reactor._id, 3));
    table.script.when(isTriggerVignette, claudeFault.serverError());
    await payThePrice();
    expect(clockOf(reactor._id)).toMatchObject({ filled: 4, active: true });
  }, 60_000);
});

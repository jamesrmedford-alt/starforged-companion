/**
 * SKEL — BURN-KEEPS-PLAN-CLOCK-TRIGGER  (INCOMPLETE-FIX: known-issues
 * SKELETON-CLOCK-RESET-REWIND records a milder outcome than the code gives)
 *
 * Scenario: a miss's Pay the Price turns the tension clocks. It fills the
 * escort's escalation clock (a hidden plan's) and an ordinary tension clock.
 * Each fires its trigger vignette; the plan clock's vignette plays the plan's
 * next escalation step, marks it played and puts the clock back to empty for
 * the step after. Then the roller burns momentum (a Batch Mode round asks
 * before its narration, after the price is paid; free-flow with "Ask before
 * paying and narrating" off): the price is reverted.
 *
 * Correct (issue #338 D8, and what SKELETON-CLOCK-RESET-REWIND itself says —
 * the burn "takes the step back (the superseded vignette's plan writes are
 * undone)"): the trigger the price caused did not happen. The plan clock's
 * vignette is superseded like the ordinary clock's, and the plan's step is no
 * longer marked played.
 *
 * Today: the supersede is keyed on the clocks the rewind takes out of full
 * (clocks.js revertTensionClocksForBurn → `untriggered`). The plan clock was
 * already put back to empty by its own vignette, so the rewind skips it
 * (`filled <= 0`): its vignette stays live fiction with binding facts, the
 * plan's step stays played, and the reversal card still says its clock was
 * "rewound".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, moveResolution, narrateMoveOn,
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
const vignetteOf = (clockId) => table.cards(f => f.clockVignetteCard === true && f.clockId === clockId).at(-1);
const flagsOf = (card) => table.world.message(card._id ?? card.id).flags[MODULE_ID];

async function decidedThreat() {
  table.replies = (call) => {
    const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
    return { prose: 'An escort detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
      ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: 'A Keeper drone collecting names.',
        escalation: ['It asks again, closer', 'It seals the corridor'] }] } : {}) } };
  };
  await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
  return plansOf(table).find(p => p.kind === 'threat');
}

/** A price fills the plan's clock and an ordinary one, both vignettes play, then the price is burned away. */
async function priceFillsBothThenIsBurned() {
  const plan = await decidedThreat();
  const clocks = await gmOf(table).import('../../src/clocks/clocks.js');
  const reactor = await onGm(table, () => clocks.createClock({ name: 'Reactor breach', type: 'tension', segments: 4 }));
  // Three earlier prices on each.
  await onGm(table, () => clocks.adjustClockSegments(plan.clockId, 3));
  await onGm(table, () => clocks.adjustClockSegments(reactor._id, 3));

  // The miss's Pay the Price: both clocks fill and their trigger vignettes play.
  table.replies = () => ({ prose: 'It happens.', sidecar: { newTruths: [], stateChanges: [] } });
  const { advanceClocksOnPayThePrice } = await gmOf(table).import('../../src/clocks/payThePriceClocks.js');
  const advanced = await onGm(table, () => advanceClocksOnPayThePrice());
  expect(advanced.filter(c => c.triggered).map(c => c.name).sort()).toEqual(['Reactor breach', 'the escort — escalation']);

  // Before the burn: the plan clock's vignette played the step, live, and the clock paces the next one.
  expect(planOf(plan.id).escalation.map(e => e.done)).toEqual([true, false]);
  expect(clockOf(plan.clockId)).toMatchObject({ filled: 0, active: true });
  expect(flagsOf(vignetteOf(plan.clockId)).burnSuperseded, 'live before the burn').not.toBe(true);
  expect(vignetteOf(reactor._id), 'the ordinary clock\'s vignette').toBeTruthy();

  // The roller burns momentum: the price is reverted.
  const { revertPayThePrice } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
  await onGm(table, () => revertPayThePrice({ clocksAdvanced: advanced, sufferMeterDeltas: [] },
    game.actors.get('pc-kira'), { kind: 'burn', resolutionId: 'res-burned' }));
  return { plan, reactor };
}

describe('SKEL BURN-KEEPS-PLAN-CLOCK-TRIGGER — a burned price takes back the plan step its clock played', () => {
  it('control: the ordinary clock the price filled is rewound and its vignette superseded (issue #338 D8)', async () => {
    const { reactor } = await priceFillsBothThenIsBurned();
    expect(clockOf(reactor._id).filled).toBe(3);
    expect(flagsOf(vignetteOf(reactor._id)).burnSuperseded).toBe(true);
  }, 90_000);

  it('the plan clock\'s trigger is undone with the price too: its vignette superseded, its step not played', async () => {
    const { plan } = await priceFillsBothThenIsBurned();
    expect(flagsOf(vignetteOf(plan.clockId)).burnSuperseded, 'the plan clock\'s vignette is superseded').toBe(true);
    expect(planOf(plan.id).escalation.map(e => e.done), 'the step the burned price played is taken back').toEqual([false, false]);
  }, 90_000);
});

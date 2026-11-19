/**
 * STARFORGED COMPANION
 * tests/unit/planClockFirstOfTwoTriggersBurned.test.js
 *
 * Issue #364 PLAN-CLOCK-TWO-TRIGGERS-FIRST-BURN (left open by
 * PLAN-CLOCK-BURN-AFTER-LATER-PRICE): a hidden plan's clock fills on a miss's
 * Pay the Price and its trigger vignette plays a step; the clock fills again
 * and a second vignette plays the step after — and only then does the first
 * roller burn momentum. The burn looked for its trigger on the clock, whose
 * pacing stamp was by then the later trigger's: it found nothing, and the
 * first vignette stayed on the table as live fiction, its facts binding,
 * beside a reversal card saying the price did not happen.
 *
 * The price's receipt names its own trigger vignette, and that vignette is
 * struck by that id whatever the clock says. The clock is left as the later
 * trigger — and any price after it — left it: the later trigger happened.
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
const vignettesOf = (clockId) => table.cards(f => f.clockVignetteCard === true && f.clockId === clockId);
const flagsOf = (card) => table.world.message(card._id ?? card.id).flags[MODULE_ID];
const truthsBy = (narrationId) => (stored().sceneTruths ?? []).filter(t => t.narrationId === narrationId);

async function decidedThreat(steps = ['It asks again, closer', 'It seals the corridor', 'It calls the Choir']) {
  table.replies = (call) => {
    const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
    return { prose: 'An escort detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
      ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: 'A Keeper drone collecting names.', escalation: steps }] } : {}) } };
  };
  await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
  // Each trigger vignette states a fact of its own, for the ledger to hold.
  let n = 0;
  table.replies = () => {
    n += 1;
    return { prose: `It happens, the ${n === 1 ? 'first' : 'next'} time.`,
      sidecar: { newTruths: [{ subject: 'the escort', fact: `made its move number ${n}` }], stateChanges: [] } };
  };
  return plansOf(table).find(p => p.kind === 'threat');
}

async function setFilled(clockId, n) {
  const clocks = await gmOf(table).import('../../src/clocks/clocks.js');
  const now = clockOf(clockId)?.filled ?? 0;
  await onGm(table, () => clocks.adjustClockSegments(clockId, n - now));
}

async function payThePrice() {
  const { advanceClocksOnPayThePrice } = await gmOf(table).import('../../src/clocks/payThePriceClocks.js');
  return onGm(table, () => advanceClocksOnPayThePrice());
}

async function burnThePrice(advanced) {
  const { revertPayThePrice } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
  await onGm(table, () => revertPayThePrice({ clocksAdvanced: advanced, sufferMeterDeltas: [] },
    game.actors.get('pc-kira'), { kind: 'burn', resolutionId: 'res-burned' }));
}

/** The clock triggers twice: two prices, two vignettes, the first two steps played. */
async function twoTriggers() {
  const plan = await decidedThreat();
  await setFilled(plan.clockId, 3);
  const first = await payThePrice();
  const firstVignette = vignettesOf(plan.clockId).at(-1);
  await setFilled(plan.clockId, 3);
  const second = await payThePrice();
  const secondVignette = vignettesOf(plan.clockId).at(-1);
  expect(secondVignette._id ?? secondVignette.id).not.toBe(firstVignette._id ?? firstVignette.id);
  expect(planOf(plan.id).escalation.map(e => e.done)).toEqual([true, true, false]);
  const firstId  = first.find(c => c._id === plan.clockId).vignetteNarrationId;
  const secondId = second.find(c => c._id === plan.clockId).vignetteNarrationId;
  expect(clockOf(plan.clockId), 'paced by the later trigger').toMatchObject({ filled: 0, active: true, pacedBy: secondId });
  return { plan, first, second, firstVignette, secondVignette, firstId, secondId };
}

describe('issue #364 PLAN-CLOCK-TWO-TRIGGERS-FIRST-BURN — the first of two triggers of one plan clock is burned', () => {
  it('the first price\'s vignette is struck by the id its receipt names, and its facts leave the ledger', async () => {
    const { plan, first, firstVignette, firstId } = await twoTriggers();
    expect(truthsBy(firstId).some(t => !t.retracted), 'the first vignette stated a fact').toBe(true);

    await burnThePrice(first);
    const f = flagsOf(firstVignette);
    expect(f.narrationId).toBe(firstId);
    expect(f.burnSuperseded, 'the burned price\'s trigger did not happen: its vignette is struck').toBe(true);
    expect(f.supersededFor, 'naming the upgrade that struck it').toBe('res-burned');
    expect(table.world.message(firstVignette._id ?? firstVignette.id).content).toContain('sf-narration-superseded');
    expect(truthsBy(firstId).every(t => t.retracted), 'what it stated binds no later narration').toBe(true);
    expect(clockOf(plan.clockId)).toBeTruthy();
  }, 90_000);

  it('the later trigger stands: its vignette, its facts, its step — and the clock is left as it paced it', async () => {
    const { plan, first, secondVignette, secondId } = await twoTriggers();

    await burnThePrice(first);
    expect(flagsOf(secondVignette).burnSuperseded ?? false, 'the later trigger happened').toBe(false);
    expect(truthsBy(secondId).some(t => !t.retracted), 'its facts stand').toBe(true);
    expect(planOf(plan.id).escalation[1].done, 'the step it played stands').toBe(true);
    const clock = clockOf(plan.clockId);
    expect(clock, 'no segment is given back: the later trigger emptied the clock').toMatchObject({ filled: 0, active: true });
    expect(clock.pacedBy, 'and its stamp stays the later trigger\'s, for a burn of the later price').toBe(secondId);
  }, 90_000);

  it('a price paid after the second trigger: the clock keeps the segment it turned', async () => {
    const { plan, first, firstVignette, secondVignette, secondId } = await twoTriggers();
    const third = await payThePrice();
    expect(third.find(c => c._id === plan.clockId)).toMatchObject({ filled: 1, triggered: false });

    await burnThePrice(first);
    expect(flagsOf(firstVignette).burnSuperseded).toBe(true);
    expect(flagsOf(secondVignette).burnSuperseded ?? false).toBe(false);
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 1, active: true, pacedBy: secondId });
  }, 90_000);

  it('the GMs\' Retry of that rewind strikes the same vignette', async () => {
    const { plan, first, firstVignette, secondVignette, secondId } = await twoTriggers();
    const entry = first.find(c => c._id === plan.clockId);

    const { retryUpgradeStep } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
    const res = await onGm(table, () => retryUpgradeStep({ effect: 'tensionClocks', kind: 'burn', resolutionId: 'res-burned',
      clocks: [{ _id: entry._id, name: entry.name, triggered: true, vignetteNarrationId: entry.vignetteNarrationId }] }));
    expect(res.ok).toBe(true);
    expect(flagsOf(firstVignette).burnSuperseded).toBe(true);
    expect(flagsOf(secondVignette).burnSuperseded ?? false).toBe(false);
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 0, active: true, pacedBy: secondId });
  }, 90_000);

  it('burning the later price afterwards still takes its own trigger back', async () => {
    const { plan, first, second, firstVignette, secondVignette } = await twoTriggers();
    await burnThePrice(first);
    await burnThePrice(second);
    expect(flagsOf(firstVignette).burnSuperseded).toBe(true);
    expect(flagsOf(secondVignette).burnSuperseded).toBe(true);
    const clock = clockOf(plan.clockId);
    expect(clock, 'the later price\'s trigger is owed again').toMatchObject({ filled: 3, active: true });
    expect(clock.pacedBy).toBeUndefined();
  }, 90_000);

  it('a receipt naming a vignette that was never written strikes nothing', async () => {
    const { plan, first, firstVignette, secondVignette, secondId } = await twoTriggers();
    const unwritten = first.map(c => (c._id === plan.clockId ? { ...c, vignetteNarrationId: 'narr-never-written' } : c));

    await burnThePrice(unwritten);
    expect(flagsOf(firstVignette).burnSuperseded ?? false).toBe(false);
    expect(flagsOf(secondVignette).burnSuperseded ?? false).toBe(false);
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 0, active: true, pacedBy: secondId });
  }, 90_000);
});

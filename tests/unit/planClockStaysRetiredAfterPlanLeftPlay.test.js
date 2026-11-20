/**
 * STARFORGED COMPANION
 * tests/unit/planClockStaysRetiredAfterPlanLeftPlay.test.js
 *
 * Issue #364 RETIRED-PLAN-CLOCK-XCARD-REACTIVATES (read from the code while
 * fixing PLAN-TRIGGER-XCARD-AFTER-LATER-PRICE, reproduced here): a hidden
 * plan's clock that a narration retired by playing the plan's last step keeps
 * that narration's pacing stamp (`pacedBy`). When the plan then leaves play by
 * another act — a GM's Retire, its page deleted, a later narration ending its
 * story — nothing clears the stamp: the clock is already retired, and every
 * "the plan left, retire its clock" path looks only at running clocks. Taking
 * the stamped narration back afterwards (the X-Card, a Burn Momentum / Improve
 * Result supersede, the burn of the price whose trigger it was) matched the
 * stamp and ran the clock again one short of full: a clock of a plan no longer
 * in play, turned by every price, firing a trigger with nothing behind it.
 *
 * The un-pacing now asks whether the clock's plan is in play once the
 * narration is taken back, and leaves a clock whose plan is gone or closed as
 * it is. The legitimate reactivations stand: the plan still in play with the
 * step owed again, and a plan the removed narration itself closed.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, moveResolution, narrateMoveOn, playXCard, patSpeaks,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';
import * as pacing from '../../src/clocks/planClockPacing.js';

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
const plain = () => ({ prose: 'It happens.', sidecar: { newTruths: [], stateChanges: [] } });
const lastNarrationId = () => table.cards(f => f.narratorCard === true && f.narrationId).at(-1).flags[MODULE_ID].narrationId;

/** A decided threat with ONE escalation step: playing it retires the plan's clock. */
async function oneStepThreat() {
  table.replies = (call) => {
    const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
    return { prose: 'An escort detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
      ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: 'A Keeper drone collecting names.', escalation: ['It seals the corridor'] }] } : {}) } };
  };
  await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
  table.replies = plain;
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

/** The price whose trigger vignette plays the plan's last step: the clock is retired, stamped with the vignette. */
async function lastStepPlayedByTrigger() {
  const plan = await oneStepThreat();
  await setFilled(plan.clockId, 3);
  await patSpeaks(table);   // the X-Card's beat begins here
  const price = await payThePrice();
  const vignetteId = price.find(c => c._id === plan.clockId).vignetteNarrationId;
  expect(planOf(plan.id).escalation.map(e => e.done)).toEqual([true]);
  expect(clockOf(plan.clockId), 'retired after the last step, stamped').toMatchObject({ active: false, pacedBy: vignetteId });
  return { plan, price, vignetteId };
}

/** A move narration whose beat does `reveal` to the plan. */
async function narrationReveals(plan, reveal) {
  table.replies = () => ({ prose: 'The corridor seals.', sidecar: { newTruths: [], stateChanges: [], reveals: [{ id: plan.id, ...reveal }] } });
  await narrateMoveOn(table, moveResolution());
  table.replies = plain;
  return lastNarrationId();
}

async function gmRetires(plan) {
  const { retireSkeleton } = await gmOf(table).import('../../src/world/secrets.js');
  await onGm(table, () => retireSkeleton(plan.id));
  expect(planOf(plan.id).status).toBe('retired');
}

describe('issue #364 RETIRED-PLAN-CLOCK-XCARD-REACTIVATES — a clock whose plan left play is not run again', () => {
  it('the X-Card on the vignette that played the last step, after a GM retired the plan: the clock stays retired', async () => {
    const { plan } = await lastStepPlayedByTrigger();
    await gmRetires(plan);

    await playXCard(table);
    expect(flagsOf(vignettesOf(plan.clockId).at(-1)).xCarded, 'the vignette is the narration removed').toBe(true);
    expect(planOf(plan.id).status, 'the plan is still out of play').toBe('retired');
    expect(clockOf(plan.clockId), 'and so is its clock').toMatchObject({ active: false });
  }, 90_000);

  it('the X-Card after the plan\'s page was deleted: the clock stays retired', async () => {
    const { plan } = await lastStepPlayedByTrigger();
    await onGm(table, async () => {
      const journal = game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'secrets');
      const page = journal.pages.contents.find(p => p.flags?.[MODULE_ID]?.secretEntry?.id === plan.id);
      await page.delete();
    });
    expect(planOf(plan.id)).toBeUndefined();

    await playXCard(table);
    expect(flagsOf(vignettesOf(plan.clockId).at(-1)).xCarded).toBe(true);
    expect(clockOf(plan.clockId)).toMatchObject({ active: false });
  }, 90_000);

  it('a superseded move narration that played the last step, after a GM retired the plan: the clock stays retired', async () => {
    const plan = await oneStepThreat();
    await setFilled(plan.clockId, 2);
    const narrationId = await narrationReveals(plan, { advanced: 'e1' });
    expect(clockOf(plan.clockId)).toMatchObject({ active: false, pacedBy: narrationId });
    await gmRetires(plan);

    const { retractSupersededNarrations } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
    await onGm(table, () => retractSupersededNarrations([narrationId], { label: 'burn' }));
    expect(planOf(plan.id).status).toBe('retired');
    expect(clockOf(plan.clockId)).toMatchObject({ active: false });
  }, 90_000);

  it('a superseded narration that played the last step, after a later narration ended the plan\'s story: the clock stays retired', async () => {
    const plan = await oneStepThreat();
    await setFilled(plan.clockId, 2);
    const played = await narrationReveals(plan, { advanced: 'e1' });
    await narrationReveals(plan, { resolved: true });
    expect(planOf(plan.id).status).toBe('resolved');
    expect(clockOf(plan.clockId), 'still stamped by the narration that played the step').toMatchObject({ active: false, pacedBy: played });

    const { retractSupersededNarrations } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
    await onGm(table, () => retractSupersededNarrations([played], { label: 'burn' }));
    expect(planOf(plan.id).status, 'the later narration\'s ending stands').toBe('resolved');
    expect(clockOf(plan.clockId)).toMatchObject({ active: false });
  }, 90_000);

  it('the burn of the price whose trigger played the last step, after a GM retired the plan: the vignette is struck, the clock stays retired', async () => {
    const { plan, price } = await lastStepPlayedByTrigger();
    const vignette = vignettesOf(plan.clockId).at(-1);
    await gmRetires(plan);

    const { revertPayThePrice } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
    const reverted = await onGm(table, () => revertPayThePrice({ clocksAdvanced: price.filter(c => c._id === plan.clockId), sufferMeterDeltas: [] },
      game.actors.get('pc-kira'), { kind: 'burn', resolutionId: 'res-burned' }));
    expect(flagsOf(vignette).burnSuperseded, 'the burned price\'s trigger did not happen').toBe(true);
    expect(clockOf(plan.clockId)).toMatchObject({ active: false });
    const name = clockOf(plan.clockId).name;
    expect(reverted).toEqual([`${name} clock stays retired — only this price's TRIGGERED scene is taken back`]);
    expect(table.world.message(vignette._id ?? vignette.id).content).not.toMatch(/clock rewound/);
  }, 90_000);
});

describe('the reactivations that stand', () => {
  it('the X-Card on the vignette that played the last step, the plan still in play: the clock runs again, one short of full', async () => {
    const { plan } = await lastStepPlayedByTrigger();

    await playXCard(table);
    expect(planOf(plan.id).escalation.map(e => e.done), 'the step is owed again').toEqual([false]);
    const clock = clockOf(plan.clockId);
    expect(clock).toMatchObject({ active: true, filled: 3 });
    expect(clock.pacedBy).toBeUndefined();
  }, 90_000);

  it('the X-Card on a narration that itself ended the plan\'s story: the plan and its clock are both back', async () => {
    const plan = await oneStepThreat();
    await setFilled(plan.clockId, 2);
    await patSpeaks(table);
    const narrationId = await narrationReveals(plan, { resolved: true });
    expect(planOf(plan.id).status).toBe('resolved');
    expect(clockOf(plan.clockId)).toMatchObject({ active: false, pacedBy: narrationId });

    await playXCard(table);
    expect(planOf(plan.id).status, 'the ending is taken back').toBe('active');
    expect(clockOf(plan.clockId), 'and the clock paces the plan again').toMatchObject({ active: true, filled: 2 });
  }, 90_000);

  it('the burn of the price whose trigger played the last step, the plan still in play: the clock is put back', async () => {
    const { plan, price } = await lastStepPlayedByTrigger();

    const { revertPayThePrice } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
    const reverted = await onGm(table, () => revertPayThePrice({ clocksAdvanced: price.filter(c => c._id === plan.clockId), sufferMeterDeltas: [] },
      game.actors.get('pc-kira'), { kind: 'burn', resolutionId: 'res-burned' }));
    expect(clockOf(plan.clockId)).toMatchObject({ active: true, filled: 3 });
    expect(planOf(plan.id).escalation.map(e => e.done)).toEqual([false]);
    expect(reverted[0]).toMatch(/clock put back to 3\/4/);
  }, 90_000);
});

describe('planClockPacing planInPlayFor — whether the plan a clock paces is in play', () => {
  const clock = { _id: 'c1', planId: 'plan-a', segments: 4, filled: 4, active: false, pacedBy: 'narr-1' };

  it('by the plan the clock is stamped with, or the plan that links the clock', () => {
    expect(pacing.planInPlayFor(clock, { planIds: new Set(['plan-a']), clockIds: new Set() })).toBe(true);
    expect(pacing.planInPlayFor({ ...clock, planId: undefined }, { planIds: new Set(), clockIds: new Set(['c1']) })).toBe(true);
    expect(pacing.planInPlayFor(clock, { planIds: new Set(['plan-b']), clockIds: new Set(['c2']) })).toBe(false);
    expect(pacing.planInPlayFor(clock, { planIds: new Set(), clockIds: new Set() })).toBe(false);
  });

  it('not known (the plans could not be read): as before, the clock counts as its plan\'s', () => {
    expect(pacing.planInPlayFor(clock, null)).toBe(true);
    expect(pacing.planInPlayFor(clock, undefined)).toBe(true);
  });
});

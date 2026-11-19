/**
 * STARFORGED COMPANION
 * tests/unit/planClockXCardAfterLaterPrice.test.js
 *
 * Issue #364 PLAN-TRIGGER-XCARD-AFTER-LATER-PRICE (left open by
 * PLAN-CLOCK-BURN-AFTER-LATER-PRICE): a hidden plan's clock fills, its
 * trigger vignette plays the plan's next step and empties the clock — and
 * another price is paid before the table plays the X-Card on that vignette.
 * The X-Card put the step back unplayed, but re-armed the clock only while it
 * stood as the pacing left it (empty): one segment on, the clock was left
 * where it was, three prices away from a step the table had just removed.
 *
 * The clock's pacing stamp (`pacedBy`) stays on a clock later prices turn, and
 * names the narration exactly: a clock paced by a removed narration is put
 * back to the fill it had before that narration, plus the segments turned
 * since, at most one short of full — the X-Card's pause write and a Burn
 * Momentum / Improve Result supersede alike.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, moveResolution, narrateMoveOn, playXCard, patSpeaks,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';
import { pacedByOneOf, standingPacedBy, unpacedClock } from '../../src/clocks/planClockPacing.js';

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

async function decidedThreat(steps = ['It asks again, closer', 'It seals the corridor', 'It calls the Choir']) {
  table.replies = (call) => {
    const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
    return { prose: 'An escort detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
      ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: 'A Keeper drone collecting names.', escalation: steps }] } : {}) } };
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

/** A move narration whose beat plays the plan's first step (its sidecar says so). */
async function narrationPlaysFirstStep(plan) {
  table.replies = () => ({ prose: 'The escort asks again, closer.', sidecar: { newTruths: [], stateChanges: [],
    reveals: [{ id: plan.id, advanced: 'e1' }] } });
  await narrateMoveOn(table, moveResolution());
  table.replies = plain;
  return table.cards(f => f.narratorCard === true && f.narrationId).at(-1).flags[MODULE_ID].narrationId;
}

describe('issue #364 PLAN-TRIGGER-XCARD-AFTER-LATER-PRICE — the X-Card re-arms a plan clock a later price has turned', () => {
  it('the X-Card on a trigger vignette, after another price turned the emptied clock: the step is back and the clock one short of full', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 3);
    await patSpeaks(table);   // the X-Card's beat begins here
    const first = await payThePrice();
    const vignetteId = first.find(c => c._id === plan.clockId).vignetteNarrationId;
    expect(planOf(plan.id).escalation.map(e => e.done)).toEqual([true, false, false]);
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 0, active: true, pacedBy: vignetteId });
    // Another player's miss pays its price before anyone plays the X-Card.
    await payThePrice();
    expect(clockOf(plan.clockId), 'turned on, its stamp kept').toMatchObject({ filled: 1, active: true, pacedBy: vignetteId });

    await playXCard(table);
    expect(flagsOf(vignettesOf(plan.clockId).at(-1)).xCarded, 'the vignette is the narration removed').toBe(true);
    expect(planOf(plan.id).escalation.map(e => e.done), 'the X-Card put the step back').toEqual([false, false, false]);
    const clock = clockOf(plan.clockId);
    expect(clock, 'and the clock with it: the next price plays the step').toMatchObject({ filled: 3, active: true });
    expect(clock.pacedBy).toBeUndefined();
    expect(clock.pacedFrom).toBeUndefined();
  }, 90_000);

  it('the X-Card on a move narration that played a step: the clock goes back to its fill from before, plus the segment a later price turned', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 1);
    await patSpeaks(table);
    const narrationId = await narrationPlaysFirstStep(plan);
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 0, active: true, pacedBy: narrationId, pacedFrom: 1 });
    await payThePrice();
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 1, active: true });

    await playXCard(table);
    expect(planOf(plan.id).escalation[0].done).toBe(false);
    const clock = clockOf(plan.clockId);
    expect(clock, 'one segment before the narration, one turned since').toMatchObject({ filled: 2, active: true });
    expect(clock.pacedBy).toBeUndefined();
  }, 90_000);

  it('a superseded move narration that played a step, after a later price turned the clock: the same', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 1);
    const narrationId = await narrationPlaysFirstStep(plan);
    await payThePrice();
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 1, active: true, pacedBy: narrationId });

    const { retractSupersededNarrations } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
    await onGm(table, () => retractSupersededNarrations([narrationId], { label: 'burn' }));
    expect(planOf(plan.id).escalation[0].done).toBe(false);
    const clock = clockOf(plan.clockId);
    expect(clock).toMatchObject({ filled: 2, active: true });
    expect(clock.pacedBy).toBeUndefined();
  }, 90_000);

  it('a clock another narration paced is left as it is', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 1);
    const narrationId = await narrationPlaysFirstStep(plan);
    await payThePrice();

    const { restoreClocksPacedBy } = await gmOf(table).import('../../src/clocks/clocks.js');
    expect(await onGm(table, () => restoreClocksPacedBy(['narr-someone-else']))).toEqual([]);
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 1, active: true, pacedBy: narrationId, pacedFrom: 1 });
  }, 90_000);
});

describe('planClockPacing — the pacing a removed narration did, undone wherever the clock stands', () => {
  const paced = { _id: 'c1', segments: 4, filled: 0, active: true, pacedBy: 'narr-1', pacedFrom: 4 };

  it('pacedByOneOf matches the stamp whatever the clock\'s fill', () => {
    expect(pacedByOneOf(paced, ['narr-1'])).toBe(true);
    expect(pacedByOneOf({ ...paced, filled: 2 }, ['narr-0', 'narr-1'])).toBe(true);
    expect(pacedByOneOf({ ...paced, filled: 2 }, ['narr-2'])).toBe(false);
    expect(pacedByOneOf({ _id: 'c2', segments: 4, filled: 0, active: true }, ['narr-1'])).toBe(false);
    expect(pacedByOneOf(paced, [])).toBe(false);
    expect(pacedByOneOf(null, ['narr-1'])).toBe(false);
    // standingPacedBy still answers for a receipt that names no vignette.
    expect(standingPacedBy({ ...paced, filled: 2 })).toBeNull();
    expect(standingPacedBy(paced)).toBe('narr-1');
  });

  it('unpacedClock: a trigger vignette\'s clock goes one short of full however far it was turned', () => {
    expect(unpacedClock(paced)).toMatchObject({ filled: 3, active: true });
    expect(unpacedClock({ ...paced, filled: 2 })).toMatchObject({ filled: 3, active: true });
    expect(unpacedClock({ ...paced, filled: 2 }).pacedBy).toBeUndefined();
  });

  it('unpacedClock: a clock emptied part-way keeps the segments turned since, at most one short of full', () => {
    expect(unpacedClock({ ...paced, pacedFrom: 1, filled: 0 })).toMatchObject({ filled: 1 });
    expect(unpacedClock({ ...paced, pacedFrom: 1, filled: 1 })).toMatchObject({ filled: 2 });
    expect(unpacedClock({ ...paced, pacedFrom: 2, filled: 3 })).toMatchObject({ filled: 3 });
  });

  it('unpacedClock: a clock retired after a last step kept its fill — nothing is added to it', () => {
    expect(unpacedClock({ ...paced, active: false, filled: 2, pacedFrom: 2 })).toMatchObject({ filled: 2, active: true });
    expect(unpacedClock({ ...paced, active: false, filled: 4, pacedFrom: 4 })).toMatchObject({ filled: 3, active: true });
  });
});

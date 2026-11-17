/**
 * STARFORGED COMPANION
 * tests/unit/sceneChallengeClockNotPacedByPlan.test.js
 *
 * Issue #362 AC09 (SCENE-CHALLENGE-CLOCK-REWOUND-BY-PLAN-STEP): a countdown
 * the prose started is a real tension clock held by a hidden plan, and the
 * GMs may play the standoff as a scene challenge — the countdown is then the
 * challenge's tension clock (decisions.md "The standoff ↔ scene challenge").
 * The plan's pacing (secrets.js paceAfterReveal: "back to empty while a step
 * is left, retired when none is") treated it as the plan's own escalation
 * clock: the miss whose narration played the plan's step on the fill wound it
 * back to empty, so the challenge's time never ran out. A clock an open scene
 * challenge holds is the challenge's — "the scene ends when either fills"
 * (progressTracks.js) — and the pacing leaves it alone.
 *
 * From the fourteenth audit's probe (narb/sceneChallengeClockRewoundByPlanStep).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, moveResolution, narrateMoveOn,
} from '../helpers/skeletonTable.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const clockOf = (id) => (stored().clocks ?? []).find(c => c._id === id);
const planOf = (id) => plansOf(table).find(p => p.id === id);
const reply = (sidecar, prose = 'The corridor holds its breath.') => () => ({ prose, sidecar: { newTruths: [], stateChanges: [], ...sidecar } });

/** A countdown the prose started, its mystery decided with steps; `asChallenge`: the GM begins the scene challenge on it. */
async function countdownPlan({ asChallenge = true } = {}) {
  table.replies = reply({ countdown: { label: 'Archer\'s count', about: 'Archer' } });
  await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
  const plan = plansOf(table).find(p => p.kind === 'mystery');
  table.replies = reply({ plans: [{ id: plan.id, truth: 'At zero Archer vents the corridor.',
    escalation: ['The count reaches five', 'The count reaches one'], clues: ['His hand rests on the vent control'] }] });
  await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
  expect(planOf(plan.id).escalation).toHaveLength(2);
  let trackId = null;
  if (asChallenge) {
    const offer = table.cards(f => !!f.sceneChallengeOffer).at(-1);
    const { applySceneChallengeOffer } = await gmOf(table).import('../../src/moves/sceneChallengeOffer.js');
    const begun = await onGm(table, () => applySceneChallengeOffer({ messageId: offer._id ?? offer.id }, { requesterIsGM: true, requesterId: 'gm-1' }));
    trackId = begun.trackId;
    expect(trackId).toBeTruthy();
  }
  return { plan, clockId: plan.clockId, trackId };
}

async function fillClock(clockId, segments) {
  const clocks = await gmOf(table).import('../../src/clocks/clocks.js');
  await onGm(table, () => clocks.adjustClockSegments(clockId, segments));
}

describe('issue #362 AC09 — a scene challenge\'s tension clock is not wound back by its plan\'s pacing', () => {
  it('control: a miss whose narration plays no step leaves the filled clock full', async () => {
    const { clockId } = await countdownPlan();
    await fillClock(clockId, 4);
    table.replies = reply({});
    await narrateMoveOn(table, moveResolution());
    expect(clockOf(clockId)).toMatchObject({ filled: 4, segments: 4, active: true });
  }, 60_000);

  it('control: a countdown no challenge holds is paced by its plan — back to empty for the next step', async () => {
    const { plan, clockId } = await countdownPlan({ asChallenge: false });
    await fillClock(clockId, 4);
    table.replies = reply({ reveals: [{ id: plan.id, advanced: 'e1' }] });
    await narrateMoveOn(table, moveResolution());
    expect(planOf(plan.id).escalation[0].done).toBe(true);
    expect(clockOf(clockId)).toMatchObject({ filled: 0, active: true });
  }, 60_000);

  it('the miss that fills the clock, narrated as the plan\'s next step, leaves it full — the challenge\'s time is up', async () => {
    const { plan, clockId } = await countdownPlan();
    await fillClock(clockId, 4);
    table.replies = reply({ reveals: [{ id: plan.id, advanced: 'e1' }] }, 'Archer says "five" and does not blink.');
    await narrateMoveOn(table, moveResolution());
    expect(planOf(plan.id).escalation[0].done, 'the step is played').toBe(true);
    expect(clockOf(clockId)).toMatchObject({ active: true, filled: 4 });
  }, 60_000);

  it('a price from outside the challenge that fills it: its trigger vignette plays the step, and the clock stays full', async () => {
    const { plan, clockId } = await countdownPlan();
    await fillClock(clockId, 3);
    table.replies = reply({}, 'The count runs out.');
    const { advanceClocksOnPayThePrice } = await gmOf(table).import('../../src/clocks/payThePriceClocks.js');
    const advanced = await onGm(table, () => advanceClocksOnPayThePrice());
    expect(advanced.find(c => c._id === clockId)).toMatchObject({ triggered: true });
    expect(planOf(plan.id).escalation[0].done, 'the vignette played the step').toBe(true);
    expect(clockOf(clockId), 'not rewound for the step after').toMatchObject({ active: true, filled: 4 });
  }, 60_000);

  it('the plan\'s story ending while the challenge is open does not retire the challenge\'s clock', async () => {
    const { plan, clockId } = await countdownPlan();
    table.replies = reply({ reveals: [{ id: plan.id, resolved: true }] });
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' }));
    expect(planOf(plan.id).status).toBe('resolved');
    expect(clockOf(clockId)).toMatchObject({ active: true });
  }, 60_000);
});

/**
 * NARB-04 · SCENE-CHALLENGE-CLOCK-REWOUND-BY-PLAN-STEP
 *
 * Scenario: the prose starts a countdown ("Archer's count"). It becomes a real
 * tension clock held by a hidden plan (a new mystery, later decided — with
 * escalation steps, as DECIDE NOW asks of every plan), and the GM takes the
 * offer to play the standoff as a scene challenge: the countdown is the
 * challenge's tension clock (decisions.md "The standoff ↔ scene challenge").
 * The crew's misses fill the clock (scoreSceneChallenge → adjustClockSegments).
 * On the miss that fills its last segment the narrator, as UNREVEALED tells it
 * ("a miss plays its next escalation step"), plays the plan's next step and
 * records `reveals: [{ id, advanced }]`.
 *
 * Correct: the scene challenge's tension clock stays full — time is up, the
 * scene must be finished (Starforged: Scene Challenges; progressTracks.js "the
 * scene ends when either fills").
 *
 * Today: the narration's sidecar apply (narrator.js applySidecarSideData →
 * secrets.js applyPlanSideData → paceAfterReveal) treats the countdown like an
 * escalation clock and winds it back to empty "for the step after" — so every
 * beat that plays one of the plan's steps hands the challenge a fresh clock.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, moveResolution, narrateMoveOn,
} from '../../helpers/skeletonTable.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const clockOf = (id) => (stored().clocks ?? []).find(c => c._id === id);
const reply = (sidecar, prose = 'The corridor holds its breath.') => () => ({ prose, sidecar: { newTruths: [], stateChanges: [], ...sidecar } });

/** A countdown the prose started, its mystery decided (with steps), played as a scene challenge. */
async function standoffUnderACountdown() {
  table.replies = reply({ countdown: { label: 'Archer\'s count', about: 'Archer' } });
  await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
  const plan = plansOf(table).find(p => p.kind === 'mystery');
  const clockId = plan.clockId;
  // The next narration decides it, as DECIDE NOW asks: a truth and escalation steps.
  table.replies = reply({ plans: [{ id: plan.id, truth: 'At zero Archer vents the corridor.',
    escalation: ['The count reaches five', 'The count reaches one'], clues: ['His hand rests on the vent control'] }] });
  await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
  // The GM begins the scene challenge from the offer: the countdown is its tension clock.
  const offer = table.cards(f => !!f.sceneChallengeOffer).at(-1);
  const { applySceneChallengeOffer } = await gmOf(table).import('../../src/moves/sceneChallengeOffer.js');
  const begun = await onGm(table, () => applySceneChallengeOffer({ messageId: offer._id ?? offer.id }, { requesterIsGM: true, requesterId: 'gm-1' }));
  return { plan, clockId, trackId: begun.trackId };
}

/** A scene-challenge miss fills the challenge's clock by `segments`, as index.js applyOutcomeEffects does. */
async function missFillsTheClock(clockId, segments) {
  const clocks = await gmOf(table).import('../../src/clocks/clocks.js');
  await onGm(table, () => clocks.adjustClockSegments(clockId, segments));
}

describe('NARB-04 — a scene challenge\'s tension clock is not wound back by its plan\'s pacing', () => {
  it('control: a miss whose narration plays no step leaves the filled clock full', async () => {
    const { plan, clockId, trackId } = await standoffUnderACountdown();
    expect(trackId).toBeTruthy();
    expect(plansOf(table).find(p => p.id === plan.id).escalation).toHaveLength(2);
    await missFillsTheClock(clockId, 4);
    table.replies = reply({});
    await narrateMoveOn(table, moveResolution());
    expect(clockOf(clockId)).toMatchObject({ filled: 4, segments: 4 });
  }, 60_000);

  it('the miss that fills the clock, narrated as the plan\'s next step, leaves it full — time is up', async () => {
    const { plan, clockId } = await standoffUnderACountdown();
    await missFillsTheClock(clockId, 4);
    expect(clockOf(clockId)).toMatchObject({ filled: 4, segments: 4 });
    // The miss's narration plays the plan's next escalation step and records it.
    table.replies = reply({ reveals: [{ id: plan.id, advanced: 'e1' }] }, 'Archer says "five" and does not blink.');
    await narrateMoveOn(table, moveResolution());
    expect(plansOf(table).find(p => p.id === plan.id).escalation[0].done).toBe(true);
    expect(clockOf(clockId)).toMatchObject({ active: true, filled: 4 });
  }, 60_000);
});

/**
 * NARB-05 · PLAN-CLOCK-ADVANCE-VIGNETTE-WITHOUT-ITS-PLAN
 *
 * Scenario: a significant threat ("the Choir") has a decided hidden plan and
 * the campaign clock that paces it ("the Choir — escalation", secrets.js
 * ensureThreatClock). At Begin a Session the clock rolls and advances a
 * segment without filling — five of its six advances — and its vignette is
 * narrated (narrateClockAdvancement: "describe how this pressure or looming
 * threat grows by a notch"). The new session's scene frame does not name the
 * Choir, and the plan was made in an earlier scene.
 *
 * Correct: a vignette of a plan's own clock is about that plan
 * (buildNarratorExtras `planIds` — "the plans this beat is about whatever its
 * text: a clock vignette's"): the plan is in play under UNREVEALED, so the
 * beat is written from what the Choir really is and does next.
 *
 * Today: narrateClockAdvancement looks the plan up only for a clock that has
 * FILLED (`clock.triggered && … planForClock(…)`), so an advance that does not
 * fill pins nothing: the narrator is asked how "the Choir — escalation" grows
 * with the Choir's plan not in play — and, with a world snapshot, under the
 * rule that a plan UNREVEALED does not name must not be drawn on.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm,
} from '../../helpers/skeletonTable.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  // No snapshot: UNREVEALED prints the plans in play itself, so the prompt
  // holds a plan's id only when the beat's selection put it there.
  restore = await resetSkeletonTable(table, { worldSnapshot: false }, {
    sceneFrame: { location: 'the galley', present: ['Kira'], situation: 'Coffee before the jump' },
  });
});
afterEach(() => restore?.());

const lastCall = () => narrationCallsOf(table).at(-1);

/** A decided threat plan from an earlier scene, with the campaign clock that paces it. */
async function plannedThreatWithClock() {
  const secrets = await gmOf(table).import('../../src/world/secrets.js');
  const clocks  = await gmOf(table).import('../../src/clocks/clocks.js');
  const plan = await onGm(table, () => secrets.createSkeleton({
    kind: 'threat', subject: { type: 'name', id: null, name: 'the Choir' },
    truth: 'The Choir is one mind wearing a hundred hulls.', wants: 'To add the crew\'s ship to itself.',
    escalation: [{ text: 'A Choir hull shadows the ship' }, { text: 'It hails them in a crewmate\'s voice' }],
    sceneId: 'sc-earlier', sessionId: 's-0', createdFrom: { trigger: 'significant_threat' },
  }, { byGm: true }));
  const clock = await onGm(table, () => clocks.createClock({ name: 'the Choir — escalation', type: 'campaign', segments: 6, planId: plan.id }));
  await onGm(table, () => secrets.updateSkeleton(plan.id, r => ({ ...r, clockId: clock._id }), { byGm: true }));
  expect(plansOf(table).find(p => p.id === plan.id).clockId).toBe(clock._id);
  return { plan, clock };
}

async function narrateAdvance(clock, { filled, triggered }) {
  const { narrateClockAdvancement } = await gmOf(table).import('../../src/narration/narrator.js');
  table.replies = () => ({ prose: 'Something out there keeps pace.', sidecar: { newTruths: [], stateChanges: [] } });
  return onGm(table, () => narrateClockAdvancement({
    clock: { _id: clock._id, name: clock.name, type: 'campaign', filled, segments: 6, triggered },
    campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
  }));
}

describe('NARB-05 — a vignette of a plan\'s clock is written with its plan in play', () => {
  it('control: when the clock fills, the plan is under UNREVEALED and its next step is named', async () => {
    const { plan, clock } = await plannedThreatWithClock();
    expect(await narrateAdvance(clock, { filled: 6, triggered: true })).toBeTruthy();
    expect(lastCall().system).toContain('## UNREVEALED — FOR THE NARRATOR ONLY');
    expect(lastCall().system).toContain(`(id ${plan.id})`);
    expect(lastCall().userText).toContain('its next escalation step — "A Choir hull shadows the ship"');
  }, 40_000);

  it('an advance that does not fill it is narrated with the plan under UNREVEALED too', async () => {
    const { plan, clock } = await plannedThreatWithClock();
    expect(await narrateAdvance(clock, { filled: 2, triggered: false })).toBeTruthy();
    expect(lastCall().userText).toContain('"the Choir — escalation"');
    expect(lastCall().userText).toContain('has advanced to 2/6');
    // The beat is about the Choir's plan: it is in play for this narration.
    expect(lastCall().system).toContain(`(id ${plan.id})`);
    expect(lastCall().system).toContain('The Choir is one mind wearing a hundred hulls.');
  }, 40_000);
});

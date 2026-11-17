/**
 * STARFORGED COMPANION
 * tests/unit/planClockAdvanceVignetteHasItsPlan.test.js
 *
 * Issue #362 AC38 (PLAN-CLOCK-ADVANCE-VIGNETTE-WITHOUT-ITS-PLAN): a hidden
 * plan's own clock advances without filling — five of a campaign clock's six
 * advances at Begin a Session, `!clock advance` — and its vignette is
 * narrated ("how this pressure or looming threat grows by a notch"). The plan
 * was looked up only for a clock that had filled, so the narrator was asked
 * how "the Choir — escalation" grows with the Choir's plan not in play. A
 * vignette of a plan's clock is about that plan (buildNarratorExtras
 * `planIds`): it is pinned for every advance; a step is played only on a fill.
 *
 * From the fourteenth audit's probe (narb/planClockAdvanceVignetteWithoutItsPlan).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm,
} from '../helpers/skeletonTable.js';

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
const planOf = (id) => plansOf(table).find(p => p.id === id);

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
  expect(planOf(plan.id).clockId).toBe(clock._id);
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

describe('issue #362 AC38 — a vignette of a plan\'s clock is written with its plan in play', () => {
  it('control: when the clock fills, the plan is under UNREVEALED and its next step is named and played', async () => {
    const { plan, clock } = await plannedThreatWithClock();
    expect(await narrateAdvance(clock, { filled: 6, triggered: true })).toBeTruthy();
    expect(lastCall().system).toContain('## UNREVEALED — FOR THE NARRATOR ONLY');
    expect(lastCall().system).toContain(`(id ${plan.id})`);
    expect(lastCall().userText).toContain('its next escalation step — "A Choir hull shadows the ship"');
    expect(planOf(plan.id).escalation[0].done).toBe(true);
  }, 40_000);

  it('an advance that does not fill it is narrated with the plan under UNREVEALED too — and plays no step', async () => {
    const { plan, clock } = await plannedThreatWithClock();
    expect(await narrateAdvance(clock, { filled: 2, triggered: false })).toBeTruthy();
    expect(lastCall().userText).toContain('has advanced to 2/6');
    expect(lastCall().userText).not.toContain('next escalation step');
    expect(lastCall().system, 'the beat is about the Choir\'s plan').toContain(`(id ${plan.id})`);
    expect(lastCall().system).toContain('The Choir is one mind wearing a hundred hulls.');
    expect(planOf(plan.id).escalation.map(e => e.done), 'nothing is played on an advance').toEqual([false, false]);
  }, 40_000);

  it('control: a clock no plan holds pins nothing', async () => {
    await plannedThreatWithClock();
    const clocks = await gmOf(table).import('../../src/clocks/clocks.js');
    const other = await onGm(table, () => clocks.createClock({ name: 'Reactor breach', type: 'tension', segments: 4 }));
    expect(await narrateAdvance(other, { filled: 1, triggered: false })).toBeTruthy();
    expect(lastCall().system).not.toContain('The Choir is one mind wearing a hundred hulls.');
  }, 40_000);
});

/**
 * STARFORGED COMPANION
 * tests/unit/planStepTakenBackUnderLaterRewrite.test.js
 *
 * Issue #364 PLAN-STEP-REWRITTEN-BEFORE-BURN (read from the code while fixing
 * PLAN-CLOCK-BURN-AFTER-LATER-PRICE; reproduced here): a plan clock's trigger
 * vignette plays the plan's next escalation step. Another narration then
 * writes the plan — a clue shown — and only after that is the vignette taken
 * back (its price burned; the X-Card after a GM's edit). The undo restored a
 * plan's earlier version only while its newest version was the removed
 * narration's, so with another write on top it did nothing: the vignette was
 * struck and the clock re-armed, but the step stayed played — the next
 * trigger skipped it.
 *
 * A played step now carries the narration that played it (`playedBy`), and
 * taking that narration back un-plays the step by that mark in every version
 * of the plan that survives — the later narration's own writes stand.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, NARRATION_MODEL, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, moveResolution, narrateMoveOn,
  playXCard, patSpeaks,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';
import { normaliseSkeleton, applyRevealToSkeleton, applyPlanToSkeleton } from '../../src/world/skeletons.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const clockOf = (id) => (stored().clocks ?? []).find(c => c._id === id);
const planOf = (id) => plansOf(table).find(p => p.id === id);
const played = (id) => planOf(id).escalation.map(e => e.done);
const vignettesOf = (clockId) => table.cards(f => f.clockVignetteCard === true && f.clockId === clockId);
const flagsOf = (card) => table.world.message(card._id ?? card.id).flags[MODULE_ID];
const isTriggerVignette = (c) => c.model === NARRATION_MODEL && /has TRIGGERED/.test(c.userText ?? '');
const plain = () => ({ prose: 'It happens.', sidecar: { newTruths: [], stateChanges: [] } });

async function decidedThreat(steps = ['It asks again, closer', 'It seals the corridor', 'It calls the Choir']) {
  table.replies = (call) => {
    const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
    return { prose: 'An escort detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
      ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: 'A Keeper drone collecting names.', escalation: steps,
        clues: ['A name scratched on its hull'] }] } : {}) } };
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

async function burnThePrice(advanced) {
  const { revertPayThePrice } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
  await onGm(table, () => revertPayThePrice({ clocksAdvanced: advanced, sufferMeterDeltas: [] },
    game.actors.get('pc-kira'), { kind: 'burn', resolutionId: 'res-burned' }));
}

/** Another narration shows the plan's clue: a write of the plan that is not the vignette's. */
async function aClueIsShown(plan) {
  table.replies = () => ({ prose: 'A name is scratched on its hull.', sidecar: { newTruths: [], stateChanges: [],
    reveals: [{ id: plan.id, revealed: ['c1'] }] } });
  await narrateMoveOn(table, moveResolution());
  table.replies = plain;
  expect(planOf(plan.id).clues[0].revealed).toBe(true);
  return table.cards(f => f.narratorCard === true && f.narrationId).at(-1).flags[MODULE_ID].narrationId;
}

describe('issue #364 PLAN-STEP-REWRITTEN-BEFORE-BURN — a step is taken back with the narration that played it, whatever was written since', () => {
  it('a played step carries the narration that played it', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 3);
    const first = await payThePrice();
    const vignetteId = first.find(c => c._id === plan.clockId).vignetteNarrationId;
    const steps = planOf(plan.id).escalation;
    expect(steps[0]).toMatchObject({ done: true, playedBy: vignetteId });
    expect(steps[1].done).toBe(false);
    expect(steps[1].playedBy).toBeUndefined();
  }, 90_000);

  it('a clue shown between a trigger vignette and the burn of its price: the step is taken back, the clue stays shown', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 3);
    const first = await payThePrice();
    expect(played(plan.id)).toEqual([true, false, false]);
    const clueNarration = await aClueIsShown(plan);

    await burnThePrice(first);
    expect(flagsOf(vignettesOf(plan.clockId).at(-1)).burnSuperseded, 'the vignette is struck').toBe(true);
    expect(clockOf(plan.clockId), 'the clock re-armed').toMatchObject({ filled: 3, active: true });
    expect(played(plan.id), 'and the step it played is owed again').toEqual([false, false, false]);
    const record = planOf(plan.id);
    expect(record.escalation[0].playedBy).toBeUndefined();
    expect(record.clues[0].revealed, 'the later narration\'s own write stands').toBe(true);
    expect(record.narrationId, 'and the plan is still that narration\'s version').toBe(clueNarration);

    // The next price that fills the clock plays the step that was taken back.
    await payThePrice();
    expect(narrationCallsOf(table).filter(isTriggerVignette).at(-1).userText).toContain('"It asks again, closer"');
    expect(played(plan.id)).toEqual([true, false, false]);
  }, 90_000);

  it('the X-Card on that later narration afterwards does not bring the step back played', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 3);
    const first = await payThePrice();
    await patSpeaks(table);   // the X-Card's beat begins here
    await aClueIsShown(plan);
    await burnThePrice(first);
    expect(played(plan.id)).toEqual([false, false, false]);

    await playXCard(table);
    const record = planOf(plan.id);
    expect(record.clues[0].revealed, 'the clue narration is removed').toBe(false);
    expect(record.escalation.map(e => e.done), 'the version it goes back to no longer holds the burned step').toEqual([false, false, false]);
  }, 90_000);

  it('the first of two triggers burned: its step is taken back from under the later vignette\'s version, the later step stands', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 3);
    const first = await payThePrice();
    await setFilled(plan.clockId, 3);
    await payThePrice();
    expect(played(plan.id)).toEqual([true, true, false]);

    await burnThePrice(first);
    expect(played(plan.id)).toEqual([false, true, false]);
    expect(clockOf(plan.clockId), 'the later trigger\'s pacing stands').toMatchObject({ filled: 0, active: true });
    // The step taken back is the next one the clock paces.
    await setFilled(plan.clockId, 3);
    await payThePrice();
    expect(narrationCallsOf(table).filter(isTriggerVignette).at(-1).userText).toContain('"It asks again, closer"');
    expect(played(plan.id)).toEqual([true, true, false]);
  }, 90_000);

  it('the later trigger played the last step and retired the clock: with a step owed again the clock runs again, empty', async () => {
    const plan = await decidedThreat(['It asks again, closer', 'It seals the corridor']);
    await setFilled(plan.clockId, 3);
    const first = await payThePrice();
    await setFilled(plan.clockId, 3);
    const second = await payThePrice();
    const secondId = second.find(c => c._id === plan.clockId).vignetteNarrationId;
    expect(played(plan.id)).toEqual([true, true]);
    expect(clockOf(plan.clockId), 'its last step played: retired').toMatchObject({ active: false, pacedBy: secondId });

    await burnThePrice(first);
    expect(played(plan.id)).toEqual([false, true]);
    expect(clockOf(plan.clockId), 'a step is owed: the clock paces it').toMatchObject({ active: true, filled: 0, pacedBy: secondId });

    await setFilled(plan.clockId, 3);
    await payThePrice();
    expect(narrationCallsOf(table).filter(isTriggerVignette).at(-1).userText).toContain('"It asks again, closer"');
    expect(played(plan.id)).toEqual([true, true]);
    expect(clockOf(plan.clockId).active, 'and retires once it is played').toBe(false);
  }, 90_000);

  it('the X-Card on a trigger vignette after a GM edited the plan: the step is back, the GM\'s edit stands', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 3);
    await patSpeaks(table);
    await payThePrice();
    expect(played(plan.id)).toEqual([true, false, false]);
    const { editSkeleton } = await gmOf(table).import('../../src/world/secrets.js');
    await onGm(table, () => editSkeleton(plan.id, { wants: 'Every name aboard.',
      escalation: ['It asks again, closer', 'It seals the corridor', 'It calls the Choir'] }));
    expect(planOf(plan.id)).toMatchObject({ wants: 'Every name aboard.', narrationId: null });
    expect(played(plan.id), 'a step kept word for word keeps that it was played').toEqual([true, false, false]);

    await playXCard(table);
    expect(flagsOf(vignettesOf(plan.clockId).at(-1)).xCarded).toBe(true);
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 3, active: true });
    expect(played(plan.id), 'the removed vignette\'s step is owed again').toEqual([false, false, false]);
    expect(planOf(plan.id).wants, 'the plan is still the GM\'s').toBe('Every name aboard.');
  }, 90_000);
});

describe('skeletons — the mark on a played step', () => {
  const base = () => normaliseSkeleton({ id: 'sk-1', kind: 'threat', subject: { type: 'name', id: null, name: 'the escort' },
    truth: 'A drone.', escalation: ['It asks', 'It seals', 'It calls'] });

  it('applyRevealToSkeleton marks the step it plays with the narration, and leaves an earlier mark alone', () => {
    const once = applyRevealToSkeleton(base(), { revealed: [], advanced: 'e1', resolved: false }, { narrationId: 'nar-1' });
    expect(once.escalation[0]).toEqual({ id: 'e1', text: 'It asks', done: true, playedBy: 'nar-1' });
    const again = applyRevealToSkeleton(once, { revealed: [], advanced: 'e1', resolved: false }, { narrationId: 'nar-2' });
    expect(again.escalation[0].playedBy, 'played once: the first narration\'s').toBe('nar-1');
    const unstamped = applyRevealToSkeleton(base(), { revealed: [], advanced: 'e2', resolved: false });
    expect(unstamped.escalation[1]).toEqual({ id: 'e2', text: 'It seals', done: true });
  });

  it('normaliseSkeleton keeps the mark on a played step only', () => {
    const record = normaliseSkeleton({ ...base(), escalation: [
      { id: 'e1', text: 'It asks', done: true, playedBy: 'nar-1' },
      { id: 'e2', text: 'It seals', done: false, playedBy: 'nar-2' },
      { id: 'e3', text: 'It calls', done: true, playedBy: 42 },
    ] });
    expect(record.escalation).toEqual([
      { id: 'e1', text: 'It asks', done: true, playedBy: 'nar-1' },
      { id: 'e2', text: 'It seals', done: false },
      { id: 'e3', text: 'It calls', done: true },
    ]);
  });

  it('applyPlanToSkeleton keeps the mark of a step repeated word for word', () => {
    const once = applyRevealToSkeleton(base(), { revealed: [], advanced: 'e1', resolved: false }, { narrationId: 'nar-1' });
    const relisted = applyPlanToSkeleton(once, { subject: '', truth: '', wants: '', knows: '', rerolled: '', sameAs: '',
      escalation: ['It waits', 'It asks'], clues: [], resolutions: [] });
    expect(relisted.escalation).toEqual([
      { id: 'e1', text: 'It waits', done: false },
      { id: 'e2', text: 'It asks', done: true, playedBy: 'nar-1' },
    ]);
  });

  it('the undo names the plan a step was taken back from under another version, with its clock', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 3);
    const first = await payThePrice();
    const vignetteId = first.find(c => c._id === plan.clockId).vignetteNarrationId;
    await aClueIsShown(plan);

    const { undoNarrationEntries } = await gmOf(table).import('../../src/world/worldJournal.js');
    const none = await onGm(table, () => undoNarrationEntries(['nar-someone-else'], { categories: ['secrets'] }));
    expect(none.stepsTakenBack, 'nothing of theirs: nothing written').toEqual([]);
    expect(played(plan.id)).toEqual([true, false, false]);
    const undone = await onGm(table, () => undoNarrationEntries([vignetteId], { categories: ['secrets'] }));
    expect(undone.stepsTakenBack).toEqual([{ id: plan.id, clockId: plan.clockId }]);
    expect(undone.restored, 'no version was put back: the later one stands').toBe(0);
    expect(played(plan.id)).toEqual([false, false, false]);
  }, 90_000);
});

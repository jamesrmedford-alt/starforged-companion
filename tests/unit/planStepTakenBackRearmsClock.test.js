/* global expectConsoleError -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/planStepTakenBackRearmsClock.test.js
 *
 * Issue #362 AC33 (BURN-KEEPS-PLAN-CLOCK-TRIGGER): a miss's Pay the Price
 * fills a hidden plan's clock; its trigger vignette plays the plan's next
 * step and paces the clock (back to empty, or retired after a last step).
 * The roller then burns momentum: the price is reverted. The supersede was
 * keyed on the clocks the rewind takes out of full, and the plan clock — empty
 * by then — was skipped: its vignette stayed live fiction, the step stayed
 * played, and the reversal card said the clock was rewound
 * (SKELETON-CLOCK-RESET-REWIND recorded the step as taken back). A plan
 * clock's pacing now carries the narration that paced it (`pacedBy`): the
 * burn supersedes that vignette — the step taken back — and puts the clock
 * back one short of full, the state before the price.
 *
 * Folded in (the coverage's FC D7 / NARA "the X-Card restores the plan, not
 * its clock"): the X-Card on that vignette put the step back unplayed but left
 * the clock empty — or retired, after a last step, so the step was never paced
 * again. Taking the narration back now re-arms its clock too; a burn's
 * supersede of a move narration that played a step does the same.
 *
 * From the fourteenth audit's probe (skel/burnAfterPlanClockResetKeepsStep).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { claudeFault } from '../helpers/faults.js';
import {
  MODULE_ID, NARRATION_MODEL, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, moveResolution, narrateMoveOn,
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
const vignettesOf = (clockId) => table.cards(f => f.clockVignetteCard === true && f.clockId === clockId);
const flagsOf = (card) => table.world.message(card._id ?? card.id).flags[MODULE_ID];
const isTriggerVignette = (c) => c.model === NARRATION_MODEL && /has TRIGGERED/.test(c.userText ?? '');
const plain = () => ({ prose: 'It happens.', sidecar: { newTruths: [], stateChanges: [] } });

async function decidedThreat(steps = ['It asks again, closer', 'It seals the corridor']) {
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

async function burnThePrice(advanced) {
  const { revertPayThePrice } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
  await onGm(table, () => revertPayThePrice({ clocksAdvanced: advanced, sufferMeterDeltas: [] },
    game.actors.get('pc-kira'), { kind: 'burn', resolutionId: 'res-burned' }));
}

describe('issue #362 AC33 — a burned price takes back the plan step its clock played', () => {
  it('control: the ordinary clock the price filled is rewound and its vignette superseded (issue #338 D8)', async () => {
    await decidedThreat();
    const clocks = await gmOf(table).import('../../src/clocks/clocks.js');
    const reactor = await onGm(table, () => clocks.createClock({ name: 'Reactor breach', type: 'tension', segments: 4 }));
    await setFilled(reactor._id, 3);
    const advanced = await payThePrice();
    await burnThePrice(advanced);
    expect(clockOf(reactor._id).filled).toBe(3);
    expect(flagsOf(vignettesOf(reactor._id).at(-1)).burnSuperseded).toBe(true);
  }, 90_000);

  it('the plan clock\'s trigger is undone with the price: its vignette superseded, the step not played, the clock one short of full', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 3);
    const advanced = await payThePrice();
    expect(planOf(plan.id).escalation.map(e => e.done)).toEqual([true, false]);
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 0, active: true });

    await burnThePrice(advanced);
    expect(flagsOf(vignettesOf(plan.clockId).at(-1)).burnSuperseded, 'the plan clock\'s vignette is superseded').toBe(true);
    expect(planOf(plan.id).escalation.map(e => e.done), 'the step the burned price played is taken back').toEqual([false, false]);
    const clock = clockOf(plan.clockId);
    expect(clock).toMatchObject({ filled: 3, active: true });
    expect(clock.pacedBy).toBeUndefined();
  }, 90_000);

  it('a last step its vignette played retired the clock: the burn runs it again, one short of full, the step owed', async () => {
    const plan = await decidedThreat(['It seals the corridor']);
    await setFilled(plan.clockId, 3);
    const advanced = await payThePrice();
    expect(planOf(plan.id).escalation[0].done).toBe(true);
    expect(clockOf(plan.clockId).active, 'its last step played: the clock retired').toBe(false);

    await burnThePrice(advanced);
    expect(planOf(plan.id).escalation[0].done).toBe(false);
    expect(clockOf(plan.clockId)).toMatchObject({ active: true, filled: 3 });
  }, 90_000);

  it('a price whose vignette was not written (re-armed) is burned: the clock stays one short of full, and an earlier trigger\'s vignette stands', async () => {
    expectConsoleError(/narrateClockAdvancement failed/);
    const plan = await decidedThreat(['It asks again, closer', 'It seals the corridor', 'It calls the Choir']);
    // An earlier trigger, narrated: e1 played, the clock paced.
    await setFilled(plan.clockId, 3);
    await payThePrice();
    const earlier = vignettesOf(plan.clockId).at(-1);
    expect(planOf(plan.id).escalation.map(e => e.done)).toEqual([true, false, false]);
    // Three prices later, the next fill: its vignette fails, and the clock is re-armed.
    await setFilled(plan.clockId, 3);
    table.script.when(isTriggerVignette, claudeFault.serverError());
    const advanced = await payThePrice();
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 3, active: true });

    await burnThePrice(advanced);
    expect(clockOf(plan.clockId), 'the state before that price — not a segment further').toMatchObject({ filled: 3, active: true });
    expect(flagsOf(earlier).burnSuperseded ?? false, 'the earlier trigger happened: its vignette is not struck').toBe(false);
    expect(planOf(plan.id).escalation.map(e => e.done)).toEqual([true, false, false]);
  }, 90_000);
});

describe('issue #362 AC33 — taking back a narration that paced a plan\'s clock re-arms it (the X-Card, a supersede)', () => {
  it('the X-Card on a trigger vignette that played a step: the step is back, and the clock one short of full, not left empty', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 3);
    await patSpeaks(table);   // the X-Card's beat begins here
    await payThePrice();
    expect(planOf(plan.id).escalation.map(e => e.done)).toEqual([true, false]);
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 0, active: true });

    await playXCard(table);
    expect(flagsOf(vignettesOf(plan.clockId).at(-1)).xCarded).toBe(true);
    expect(planOf(plan.id).escalation.map(e => e.done), 'the X-Card put the step back').toEqual([false, false]);
    expect(clockOf(plan.clockId), 'and the clock with it').toMatchObject({ filled: 3, active: true });
  }, 90_000);

  it('the X-Card on the vignette of a last step: the retired clock runs again, and the next price plays the step', async () => {
    const plan = await decidedThreat(['It seals the corridor']);
    await setFilled(plan.clockId, 3);
    await patSpeaks(table);
    await payThePrice();
    expect(clockOf(plan.clockId).active).toBe(false);

    await playXCard(table);
    expect(planOf(plan.id).escalation[0].done).toBe(false);
    expect(clockOf(plan.clockId), 'never paced again, before').toMatchObject({ active: true, filled: 3 });

    const { clearXCard } = await gmOf(table).import('../../src/context/safety.js');
    await onGm(table, () => clearXCard());
    await payThePrice();
    expect(narrationCallsOf(table).filter(isTriggerVignette).at(-1).userText).toContain('"It seals the corridor"');
    expect(planOf(plan.id).escalation[0].done).toBe(true);
  }, 90_000);

  it('a superseded move narration that played a step: the step is back, the clock at its fill from before', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 2);
    table.replies = () => ({ prose: 'The escort asks again, closer.', sidecar: { newTruths: [], stateChanges: [],
      reveals: [{ id: plan.id, advanced: 'e1' }] } });
    await narrateMoveOn(table, moveResolution());
    const narrationId = table.cards(f => f.narratorCard === true && f.narrationId).at(-1).flags[MODULE_ID].narrationId;
    expect(planOf(plan.id).escalation[0].done).toBe(true);
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 0, active: true });

    const { retractSupersededNarrations } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
    await onGm(table, () => retractSupersededNarrations([narrationId], { label: 'burn' }));
    expect(planOf(plan.id).escalation[0].done).toBe(false);
    expect(clockOf(plan.clockId), 'the clock as it was before that narration paced it').toMatchObject({ filled: 2, active: true });
  }, 90_000);
});

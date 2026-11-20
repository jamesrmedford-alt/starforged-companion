/**
 * STARFORGED COMPANION
 * tests/unit/reversalCardSaysWhatEachClockDid.test.js
 *
 * Issue #364 PLAN-CLOCK-REWOUND-WORDING (left open by
 * PLAN-CLOCK-TWO-TRIGGERS-FIRST-BURN): the Burn / Improve reversal card said
 * "‹clock› clock rewound" of every clock on the reverted price's receipt —
 * also of a hidden plan's clock the burn deliberately left exactly as a later
 * trigger paced it (only the price's own TRIGGERED scene is struck), of one it
 * put back UP to one short of full, and of one it did nothing to.
 *
 * Each clock's line now says what the rewind really did to it, and a clock it
 * changed nothing on has no line. No line names what stands behind a plan's
 * clock (issue #362 D3).
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
const vignettesOf = (clockId) => table.cards(f => f.clockVignetteCard === true && f.clockId === clockId);
const flagsOf = (card) => table.world.message(card._id ?? card.id).flags[MODULE_ID];
const reversalCards = () => table.cards(f => f.burnReversal === true || f.improveReversal === true);
const lastReversal = () => reversalCards().at(-1)?.content ?? '';

async function decidedThreat() {
  table.replies = (call) => {
    const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
    return { prose: 'An escort detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
      ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: 'A Keeper drone collecting names.',
        escalation: ['It asks again, closer', 'It seals the corridor', 'It calls the Choir'] }] } : {}) } };
  };
  await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
  table.replies = () => ({ prose: 'It happens.', sidecar: { newTruths: [], stateChanges: [] } });
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

async function revertThePrice(advanced, kind = 'burn') {
  const { revertPayThePrice } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
  return onGm(table, () => revertPayThePrice({ clocksAdvanced: advanced, sufferMeterDeltas: [] },
    game.actors.get('pc-kira'), { kind, resolutionId: 'res-upgraded' }));
}

async function plainClock(name, filled) {
  const clocks = await gmOf(table).import('../../src/clocks/clocks.js');
  const clock = await onGm(table, () => clocks.createClock({ name, type: 'tension', segments: 4 }));
  if (filled) await onGm(table, () => clocks.adjustClockSegments(clock._id, filled));
  return clock;
}

describe('issue #364 PLAN-CLOCK-REWOUND-WORDING — the reversal card says what was done to each clock', () => {
  it('a plan clock left as a later trigger paced it is not called rewound: only this price\'s scene is taken back', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 3);
    const first = await payThePrice();
    const firstVignette = vignettesOf(plan.clockId).at(-1);
    await setFilled(plan.clockId, 3);
    await payThePrice();
    await payThePrice();   // a price after the second trigger turns the emptied clock on
    const before = clockOf(plan.clockId);
    expect(before).toMatchObject({ filled: 1, active: true });

    const reverted = await revertThePrice(first.filter(c => c._id === plan.clockId));
    expect(flagsOf(firstVignette).burnSuperseded, 'the price\'s own scene is struck').toBe(true);
    expect(clockOf(plan.clockId), 'and the clock is exactly where it stood').toMatchObject({ filled: 1, active: true, pacedBy: before.pacedBy });

    const name = clockOf(plan.clockId).name;
    expect(reverted).toEqual([`${name} clock left as it stands (1/4): it triggered again since — only this price's TRIGGERED scene is taken back`]);
    expect(lastReversal()).toContain('left as it stands (1/4)');
    expect(lastReversal(), 'nothing was rewound').not.toMatch(/clock rewound/);
    expect(lastReversal(), 'no hint of what stands behind the clock').not.toMatch(/escalat|plan\b|step/i);
  }, 90_000);

  it('a plan clock its trigger had emptied is said to be put back, with where it stands', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 3);
    const first = await payThePrice();
    expect(clockOf(plan.clockId), 'the trigger\'s scene emptied it').toMatchObject({ filled: 0, active: true });

    const reverted = await revertThePrice(first.filter(c => c._id === plan.clockId), 'improve');
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 3, active: true });
    const name = clockOf(plan.clockId).name;
    expect(reverted).toEqual([`${name} clock put back to 3/4 — its TRIGGERED scene is taken back`]);
    expect(table.cards(f => f.improveReversal === true).at(-1)?.content).toContain('put back to 3/4');
    expect(lastReversal()).not.toMatch(/clock rewound/);
    expect(lastReversal()).not.toMatch(/escalat|plan\b|step/i);
  }, 90_000);

  it('a clock a segment is taken off is still said to be rewound', async () => {
    const clock = await plainClock('Reactor breach', 2);
    const reverted = await revertThePrice([{ _id: clock._id, name: clock.name, type: 'tension', filled: 2, segments: 4, triggered: false }]);
    expect(clockOf(clock._id).filled).toBe(1);
    expect(reverted).toEqual(['Reactor breach clock rewound']);
    expect(lastReversal()).toContain('Reactor breach clock rewound');
  }, 60_000);

  it('a clock the rewind changed nothing on has no line — gone since, or already empty', async () => {
    const empty = await plainClock('Hull stress', 0);
    const kept  = await plainClock('Reactor breach', 2);
    const reverted = await revertThePrice([
      { _id: 'clock-removed-since', name: 'Pursuit', type: 'tension', triggered: false },
      { _id: empty._id, name: empty.name, type: 'tension', triggered: false },
      { _id: kept._id, name: kept.name, type: 'tension', triggered: false },
    ]);
    expect(reverted).toEqual(['Reactor breach clock rewound']);
    expect(lastReversal()).not.toMatch(/Pursuit|Hull stress/);
  }, 60_000);

  it('with nothing unwound at all there is no reversal card', async () => {
    const empty = await plainClock('Hull stress', 0);
    const reverted = await revertThePrice([{ _id: empty._id, name: empty.name, type: 'tension', triggered: false }]);
    expect(reverted).toEqual([]);
    expect(reversalCards()).toHaveLength(0);
  }, 60_000);

  it('the rewind reports each clock\'s fate once its write has landed', async () => {
    const clocks = await gmOf(table).import('../../src/clocks/clocks.js');
    const kept = await plainClock('Reactor breach', 4);
    const fates = {};
    const untriggered = await onGm(table, () => clocks.revertTensionClocksForBurn([kept._id, 'gone'], { fates }));
    expect(untriggered.map(c => c._id)).toEqual([kept._id]);
    expect(fates).toEqual({ [kept._id]: { fate: 'rewound', filled: 3, segments: 4, active: true } });
  }, 60_000);
});

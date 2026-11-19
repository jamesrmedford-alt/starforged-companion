/**
 * STARFORGED COMPANION
 * tests/unit/planClockBurnAfterLaterPrice.test.js
 *
 * Issue #364 PLAN-CLOCK-BURN-AFTER-LATER-PRICE (left open by issue #362
 * AC33): a miss's Pay the Price fills a hidden plan's clock, its trigger
 * vignette plays the plan's next step and empties the clock — and then
 * another price is paid before the first roller burns momentum. The burn
 * found its trigger by the clock's pacing stamp, trusted only while the clock
 * stood as the pacing left it (empty): one segment on, the burn found
 * nothing. The vignette stayed live fiction, the step stayed played, and the
 * reversal card still said the clock was rewound.
 *
 * The price's receipt now names its own trigger vignette (the narration id is
 * minted with the advance — `vignetteNarrationId`), and the burn takes back
 * the pacing that narration did wherever later prices have turned the clock
 * since. The same id keeps a later trigger's pacing from being taken for the
 * earlier price's.
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

async function burnThePrice(advanced) {
  const { revertPayThePrice } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
  await onGm(table, () => revertPayThePrice({ clocksAdvanced: advanced, sufferMeterDeltas: [] },
    game.actors.get('pc-kira'), { kind: 'burn', resolutionId: 'res-burned' }));
}

describe('issue #364 PLAN-CLOCK-BURN-AFTER-LATER-PRICE — a burned price takes its plan step back after a later price turned the clock', () => {
  it('the price that fills a plan clock names its trigger vignette on its receipt, and the vignette is written under that id', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 3);
    const advanced = await payThePrice();
    const entry = advanced.find(c => c._id === plan.clockId);
    expect(entry.triggered).toBe(true);
    expect(typeof entry.vignetteNarrationId).toBe('string');
    expect(flagsOf(vignettesOf(plan.clockId).at(-1)).narrationId, 'the card the receipt names').toBe(entry.vignetteNarrationId);
    expect(clockOf(plan.clockId).pacedBy, 'and the pacing it did').toBe(entry.vignetteNarrationId);
  }, 90_000);

  it('a price paid between the trigger and the burn: the vignette is struck, the step taken back, the clock one short of full', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 3);
    const first = await payThePrice();
    expect(planOf(plan.id).escalation.map(e => e.done)).toEqual([true, false, false]);
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 0, active: true });

    // Another player's miss pays its price before the first roller decides.
    const later = await payThePrice();
    expect(later.find(c => c._id === plan.clockId)).toMatchObject({ filled: 1, triggered: false });
    expect(clockOf(plan.clockId), 'the emptied clock turned on: no longer as the pacing left it').toMatchObject({ filled: 1, active: true });

    await burnThePrice(first);
    expect(flagsOf(vignettesOf(plan.clockId).at(-1)).burnSuperseded, 'the trigger did not happen: its vignette is struck').toBe(true);
    expect(planOf(plan.id).escalation.map(e => e.done), 'the step the burned price played is taken back').toEqual([false, false, false]);
    const clock = clockOf(plan.clockId);
    expect(clock, 'the step is owed again: the next price that fills the clock plays it').toMatchObject({ filled: 3, active: true });
    expect(clock.pacedBy).toBeUndefined();
    expect(clock.pacedFrom).toBeUndefined();
  }, 90_000);

  it('the GMs\' Retry of that rewind finds the trigger the same way', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 3);
    const first = await payThePrice();
    await payThePrice();
    const entry = first.find(c => c._id === plan.clockId);

    const { retryUpgradeStep } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
    const res = await onGm(table, () => retryUpgradeStep({ effect: 'tensionClocks', kind: 'burn', resolutionId: 'res-burned',
      clocks: [{ _id: entry._id, name: entry.name, triggered: true, vignetteNarrationId: entry.vignetteNarrationId }] }));
    expect(res.ok).toBe(true);
    expect(flagsOf(vignettesOf(plan.clockId).at(-1)).burnSuperseded).toBe(true);
    expect(planOf(plan.id).escalation.map(e => e.done)).toEqual([false, false, false]);
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 3, active: true });
  }, 90_000);

  it('a later trigger of the same clock is not taken for the burned price\'s: its vignette and its step stand', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 3);
    const first = await payThePrice();
    const firstVignette = vignettesOf(plan.clockId).at(-1);
    // The clock fills again, and a second vignette plays the second step.
    await setFilled(plan.clockId, 3);
    await payThePrice();
    const secondVignette = vignettesOf(plan.clockId).at(-1);
    expect(secondVignette._id ?? secondVignette.id).not.toBe(firstVignette._id ?? firstVignette.id);
    expect(planOf(plan.id).escalation.map(e => e.done)).toEqual([true, true, false]);
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 0, active: true });

    await burnThePrice(first);
    expect(flagsOf(secondVignette).burnSuperseded ?? false, 'the later trigger happened: its vignette is not struck').toBe(false);
    // The burned price's own step is taken back by its mark, from under the
    // later vignette's version (PLAN-STEP-REWRITTEN-BEFORE-BURN).
    expect(planOf(plan.id).escalation.map(e => e.done), 'and the step it played stands').toEqual([false, true, false]);
    expect(clockOf(plan.clockId), 'its pacing left as it is').toMatchObject({ filled: 0, active: true });
  }, 90_000);

  it('a receipt from before the id was kept still finds a clock that stands as its vignette paced it', async () => {
    const plan = await decidedThreat();
    await setFilled(plan.clockId, 3);
    const advanced = (await payThePrice()).map(({ vignetteNarrationId: _dropped, ...entry }) => entry);
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 0, active: true });

    await burnThePrice(advanced);
    expect(flagsOf(vignettesOf(plan.clockId).at(-1)).burnSuperseded).toBe(true);
    expect(planOf(plan.id).escalation.map(e => e.done)).toEqual([false, false, false]);
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 3, active: true });
  }, 90_000);
});

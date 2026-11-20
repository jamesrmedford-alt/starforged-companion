/**
 * STARFORGED COMPANION
 * tests/unit/struckVignetteNoteWhenClockStands.test.js
 *
 * Issue #364 PLAN-VIGNETTE-NOTE-SAYS-REWOUND (found while fixing
 * PLAN-CLOCK-REWOUND-WORDING): a hidden plan's clock triggers twice and the
 * first price is then burned. The burn strikes that price's own TRIGGERED
 * scene and leaves the clock exactly as the later trigger paced it
 * (PLAN-CLOCK-TWO-TRIGGERS-FIRST-BURN) — but the note on the struck scene
 * still read "momentum was burned and the clock rewound". Nothing was
 * rewound: the note now says only why the scene did not happen. A scene
 * struck because its clock WAS rewound keeps the old note.
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
const messageOf = (card) => table.world.message(card._id ?? card.id);

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

async function revertThePrice(advanced, kind) {
  const { revertPayThePrice } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
  await onGm(table, () => revertPayThePrice({ clocksAdvanced: advanced, sufferMeterDeltas: [] },
    game.actors.get('pc-kira'), { kind, resolutionId: 'res-upgraded' }));
}

async function twoTriggers() {
  const plan = await decidedThreat();
  await setFilled(plan.clockId, 3);
  const first = await payThePrice();
  const firstVignette = vignettesOf(plan.clockId).at(-1);
  await setFilled(plan.clockId, 3);
  const second = await payThePrice();
  const secondVignette = vignettesOf(plan.clockId).at(-1);
  return { plan, first, second, firstVignette, secondVignette };
}

describe('issue #364 PLAN-VIGNETTE-NOTE-SAYS-REWOUND — a scene struck with its clock left standing', () => {
  it('a burn: the note does not say the clock was rewound', async () => {
    const { plan, first, firstVignette } = await twoTriggers();
    const before = clockOf(plan.clockId);

    await revertThePrice(first.filter(c => c._id === plan.clockId), 'burn');
    const struck = messageOf(firstVignette);
    expect(struck.flags[MODULE_ID].burnSuperseded).toBe(true);
    expect(clockOf(plan.clockId), 'the clock was not touched').toMatchObject({ filled: before.filled, pacedBy: before.pacedBy });
    expect(struck.content).toContain('Superseded — momentum was burned: this has not happened.');
    expect(struck.content).not.toMatch(/clock rewound/);
  }, 90_000);

  it('an improvement: the same', async () => {
    const { plan, first, firstVignette } = await twoTriggers();

    await revertThePrice(first.filter(c => c._id === plan.clockId), 'improve');
    const struck = messageOf(firstVignette);
    expect(struck.content).toContain('Superseded — the result was improved: this has not happened.');
    expect(struck.content).not.toMatch(/clock rewound/);
  }, 90_000);

  it('the GMs\' Retry of that step writes the same note', async () => {
    const { plan, first, firstVignette } = await twoTriggers();
    const entry = first.find(c => c._id === plan.clockId);

    const { retryUpgradeStep } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
    await onGm(table, () => retryUpgradeStep({ effect: 'tensionClocks', kind: 'burn', resolutionId: 'res-upgraded',
      clocks: [{ _id: entry._id, name: entry.name, triggered: true, vignetteNarrationId: entry.vignetteNarrationId }] }));
    const struck = messageOf(firstVignette);
    expect(struck.content).toContain('Superseded — momentum was burned: this has not happened.');
    expect(struck.content).not.toMatch(/clock rewound/);
  }, 90_000);

  it('a scene struck because its clock was put back keeps the note that says so', async () => {
    const { plan, second, secondVignette } = await twoTriggers();

    await revertThePrice(second.filter(c => c._id === plan.clockId), 'burn');
    expect(clockOf(plan.clockId), 'the later price\'s trigger is owed again').toMatchObject({ filled: 3, active: true });
    expect(messageOf(secondVignette).content).toContain('Superseded — momentum was burned and the clock rewound: this has not happened.');
  }, 90_000);
});

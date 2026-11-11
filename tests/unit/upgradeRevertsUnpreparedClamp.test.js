/**
 * STARFORGED COMPANION
 * tests/unit/upgradeRevertsUnpreparedClamp.test.js
 *
 * Issue #345 AA46 UPGRADE-UNPREPARED-CLAMP-MOMENTUM (the upgrades auditor's
 * UPG-2 probe).
 *
 * Issue #342 D4 (option A, narrowly): a reverted price's own unprepared marks
 * are cleared, and a burn reverts the price before its meter write. Three
 * siblings were left — the mark's momentum clamp outlived the price:
 *
 *   (a) Improve Result wrote its meters before it reverted the price, so the
 *       strong hit's +1 momentum was capped under the maximum the price's
 *       unprepared mark lowered (9, not 10). It now reverts first, as the burn.
 *   (b) The mark clamped an ally's momentum down when it was made (10 → 9,
 *       actorBridge.recalculateMomentumBounds); the reversal cleared the mark,
 *       never the clamp — for a price "never actually paid". The mark's clamp
 *       is now on the price's receipt (markUnprepared's `momentumClamped`),
 *       and the reversal gives it back once the mark is cleared.
 *   (c) The burn spent the momentum the price's mark clamped (9), capped at
 *       the maximum that mark lowered — "9 → Weak Hit" against 8 and 9 — not
 *       the 10 Kira held at the roll ("A burn spends the momentum from before
 *       the move", issue #322 V04).
 *
 * Booted GM + two players, the real pipeline, scripted dice: Kira and Ren
 * share supply 1, no impacts. Kira's Face Danger misses; its Pay the Price is
 * "You waste resources" (Sacrifice Resources -1): supply 0, both unprepared.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null, abilities: [], ptp: 70 }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => control.abilities),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
// Pay the Price 70: "You waste resources" — Sacrifice Resources (-1).
vi.mock('../../src/oracles/roller.js', async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== 'pay_the_price') return real.rollOracle(...args);
    const rng = vi.spyOn(Math, 'random').mockReturnValueOnce((control.ptp - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table, kira, ren;
const flags = (id) => table.world.message(id).flags[MODULE_ID];
// challenge 6, 7; action die 1 — iron 3 + 1 = 4 misses both.
const MISS = [0.55, 0.65, 0.1];
// challenge 8, 9; action die 1 — a miss a burn at 10 makes a strong hit, at 9 a weak one.
const MISS_8_9 = [0.75, 0.85, 0.1];
const FUGITIVE = [{ assetId: null, abilityIndex: null, assetName: 'Fugitive',
  text: 'improve the result to a strong hit', resultImprovement: { improveTo: 'strong_hit' }, hasClock: false }];

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.abilities = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'aa46-s1', sessionNumber: 1,
      currentSceneId: 'aa46-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 9 }, supply: { value: 1 } } });
  ren  = table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, system: { momentum: { value: 10 }, supply: { value: 1 } } });
  scriptClaude(table, { fallback: () => 'The cargo spills into the void.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

/** Kira's Face Danger misses and pays "You waste resources"; the card. */
async function missed(dice = MISS) {
  control.interpretation = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'probe', mischiefApplied: false };
  control.dice = dice;
  await table.client('pl-1').chat('Kira dumps the cargo to outrun them.', { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
  const card = table.cards(f => f.moveResolution).at(-1);
  // The price landed: the crew's supply is spent and both are unprepared (max 9).
  expect(kira.system.supply.value).toBe(0);
  expect({ kira: kira.system.debility.unprepared, ren: ren.system.debility.unprepared }).toEqual({ kira: true, ren: true });
  return card;
}

async function press(card, selector) {
  await table.client('pl-1').click(card._id, selector);
  await table.settle(); await table.drain();
}

describe('issue #345 AA46 (a) — Improve Result writes its momentum after the undone price\'s impact is gone', () => {
  it('control: the improvement reverts the price — supply refunded, both marks cleared', async () => {
    control.abilities = FUGITIVE;
    const card = await missed();
    await press(card, '[data-action="sf-improve-result"]');
    expect(flags(card._id).improve.consumed).toBe(true);
    expect(kira.system.supply.value).toBe(1);
    expect({ kira: kira.system.debility.unprepared, ren: ren.system.debility.unprepared }).toEqual({ kira: false, ren: false });
  }, 60_000);

  it('the strong hit\'s +1 momentum lands on the max the price never lowered: 9 → 10', async () => {
    control.abilities = FUGITIVE;
    const card = await missed();
    await press(card, '[data-action="sf-improve-result"]');
    expect(flags(card._id).improve.consumed).toBe(true);
    expect(kira.system.debility.unprepared).toBe(false);
    expect(kira.system.momentum.value, 'Face Danger strong hit: +1 momentum, with no impact').toBe(10);
  }, 60_000);

  it('the improvement gives back what the mark clamped: Ren 10 again, and Kira at 10 stays 10 (her +1 caps there)', async () => {
    control.abilities = FUGITIVE;
    kira.system.momentum.value = 10;
    const card = await missed();
    expect({ kira: kira.system.momentum.value, ren: ren.system.momentum.value }).toEqual({ kira: 9, ren: 9 });
    await press(card, '[data-action="sf-improve-result"]');
    expect({ kira: kira.system.momentum.value, ren: ren.system.momentum.value }).toEqual({ kira: 10, ren: 10 });
  }, 60_000);
});

describe('issue #345 AA46 (c) — the burn spends the momentum held at the roll, not what the price\'s mark clamped', () => {
  it('control: the price lands and clamps Kira\'s 10 to 9 under the unprepared mark', async () => {
    kira.system.momentum.value = 10;
    const card = await missed(MISS_8_9);
    expect(kira.system.momentum.value).toBe(9);
    expect(flags(card._id).burn?.canBurn).toBe(true);
  }, 60_000);

  it('the burn offered is the 10 Kira held at the roll — a strong hit against 8 and 9', async () => {
    kira.system.momentum.value = 10;
    const card = await missed(MISS_8_9);
    expect({ momentum: flags(card._id).burn?.momentum, preview: flags(card._id).burn?.previewOutcome })
      .toEqual({ momentum: 10, preview: 'strong_hit' });
  }, 60_000);

  it('pressed, it burns that 10: a strong hit, the reset with no impact (+2) and its +1', async () => {
    kira.system.momentum.value = 10;
    const card = await missed(MISS_8_9);
    await press(card, '[data-action="sf-burn-momentum"]');
    expect(flags(card._id).burn.consumed).toBe(true);
    expect(card._id && table.world.message(card._id).content).toMatch(/Strong Hit/);
    expect({ kira: kira.system.momentum.value, ren: ren.system.momentum.value }).toEqual({ kira: 3, ren: 10 });
  }, 60_000);
});

describe('issue #345 AA46 (b) — the undone price\'s mark gives back the momentum its clamp took', () => {
  it('control: the burn resets Kira (reset +2, then the strong hit\'s +1) and clears Ren\'s mark', async () => {
    const card = await missed();
    await press(card, '[data-action="sf-burn-momentum"]');
    expect(flags(card._id).burn.consumed).toBe(true);
    expect(kira.system.momentum.value).toBe(3);
    expect(ren.system.debility.unprepared).toBe(false);
  }, 60_000);

  it('Ren gets back the momentum the reverted price\'s mark clamped away: 10', async () => {
    const card = await missed();
    expect(ren.system.momentum.value).toBe(9);
    await press(card, '[data-action="sf-burn-momentum"]');
    expect(flags(card._id).burn.consumed).toBe(true);
    expect(ren.system.debility.unprepared).toBe(false);
    expect(ren.system.momentum.value, 'the price was never paid').toBe(10);
  }, 60_000);

  it('control: an ally the price did not mark (unprepared before it) keeps the mark and the momentum', async () => {
    ren.system.debility.unprepared = true;
    ren.system.momentum.value = 9;
    const card = await missed();
    await press(card, '[data-action="sf-burn-momentum"]');
    expect({ unprepared: ren.system.debility.unprepared, momentum: ren.system.momentum.value }).toEqual({ unprepared: true, momentum: 9 });
  }, 60_000);
});

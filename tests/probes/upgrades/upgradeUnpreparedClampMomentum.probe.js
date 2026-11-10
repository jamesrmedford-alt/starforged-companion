/**
 * PROBE UPG-2 — UPGRADE-UNPREPARED-CLAMP-MOMENTUM (RULES / LOSE-STATE, low)
 *
 * Issue #342 D4 (option A, narrowly): a reverted price's own unprepared marks
 * are cleared, and "a burn reverts the price before its meter write, so its
 * momentum reset is computed without the cleared impact" (decisions.md →
 * "A reversal clears the unprepared its reverted price made";
 * burnMomentum.js:584-597 reverts first, then reads the reset). Two siblings were left:
 *
 *   (a) Improve Result writes its meters FIRST and reverts the price after
 *       (src/moves/improveResult.js:345 applyUpgradeStep "meters", then :353
 *       revertPayThePrice). The strong hit's +1 momentum is clamped under the
 *       max the undone price's unprepared mark lowered (actorBridge.js
 *       applyMeterChanges:376/:404 — max = 10 − impacts), and the mark is
 *       cleared only afterwards: the momentum the rules give is lost.
 *   (b) The mark itself clamped an ally's momentum down when it was made
 *       (sufferExecutor.js markUnprepared → actorBridge.setDebility →
 *       recalculateMomentumBounds:1305-1316, 10 → 9). The reversal clears the
 *       mark (resultUpgrade.js:438-444) but never gives back what that clamp
 *       took, for a price "never actually paid" (decisions.md → "Burn Momentum
 *       reverses Pay-the-Price side effects"). A burn's reset hides this for
 *       the burner; an ally — and an improver — keep the loss.
 *
 * Scenario (booted GM + two players, the real pipeline, scripted dice):
 *   1. Kira (momentum 9) and Ren (momentum 10) share supply 1, no impacts.
 *   2. Kira's Face Danger misses; its Pay the Price is "You waste resources"
 *      (Sacrifice Resources -1): supply 0, both marked unprepared (max 9 —
 *      Ren's 10 is clamped to 9).
 *   3a. Kira presses ✦ Improve to Strong Hit (Fugitive): the price reverts,
 *       the marks clear, the strong hit's +1 lands.
 *       Expected: Kira 9 + 1 = 10. Actual: 9.
 *   3b. Kira presses 🔥 Burn instead: the price reverts, the marks clear.
 *       Expected: Ren back to the 10 he held. Actual: 9.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null, abilities: [], ptp: 70 }));
vi.mock('../../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => control.abilities),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
// Pay the Price 70: "You waste resources" — Sacrifice Resources (-1).
vi.mock('../../../src/oracles/roller.js', async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== 'pay_the_price') return real.rollOracle(...args);
    const rng = vi.spyOn(Math, 'random').mockReturnValueOnce((control.ptp - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table, kira, ren;
const flags = (id) => table.world.message(id).flags[MODULE_ID];
// challenge 6, 7; action die 1 — iron 3 + 1 = 4 misses both.
const MISS = [0.55, 0.65, 0.1];
const FUGITIVE = [{ assetId: null, abilityIndex: null, assetName: 'Fugitive',
  text: 'improve the result to a strong hit', resultImprovement: { improveTo: 'strong_hit' }, hasClock: false }];

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.abilities = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'upg2-s1', sessionNumber: 1,
      currentSceneId: 'upg2-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 9 }, supply: { value: 1 } } });
  ren  = table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, system: { momentum: { value: 10 }, supply: { value: 1 } } });
  scriptClaude(table, { fallback: () => 'The cargo spills into the void.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

async function missed() {
  control.interpretation = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'probe', mischiefApplied: false };
  control.dice = MISS;
  await table.client('pl-1').chat('Kira dumps the cargo to outrun them.', { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
  const card = table.cards(f => f.moveResolution).at(-1);
  // The price landed: the crew's supply is spent and both are unprepared (max 9).
  expect(kira.system.supply.value).toBe(0);
  expect({ kira: kira.system.debility.unprepared, ren: ren.system.debility.unprepared }).toEqual({ kira: true, ren: true });
  expect({ kira: kira.system.momentum.value, ren: ren.system.momentum.value }).toEqual({ kira: 9, ren: 9 });
  return card;
}

async function press(card, selector) {
  await table.client('pl-1').click(card._id, selector);
  await table.settle(); await table.drain();
}

describe('UPG-2 (a) — Improve Result writes its momentum under the undone price\'s impact', () => {
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
});

describe('UPG-2 (c) — the burn spends the momentum the price\'s mark clamped, not the momentum held at the roll', () => {
  // "A burn spends the momentum from before the move" (decisions.md, issue
  // #322 V04): burnMomentum.js:212-215 burnableMomentum adds back only the
  // price's momentum receipts (priceMomentumTaken), never the clamp its
  // unprepared mark made, and clamps to the max that mark lowered.
  // challenge 8, 9; action die 1 — iron 3 + 1 = 4 misses both.
  const MISS_8_9 = [0.75, 0.85, 0.1];
  async function missedAtTen() {
    kira.system.momentum.value = 10;
    control.interpretation = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'probe', mischiefApplied: false };
    control.dice = MISS_8_9;
    await table.client('pl-1').chat('Kira dumps the cargo to outrun them.', { speaker: { actor: kira.id } });
    await table.settle(); await table.drain();
    return table.cards(f => f.moveResolution).at(-1);
  }

  it('control: the price lands and clamps Kira\'s 10 to 9 under the unprepared mark', async () => {
    const card = await missedAtTen();
    expect(kira.system.debility.unprepared).toBe(true);
    expect(kira.system.momentum.value).toBe(9);
    expect(flags(card._id).burn?.canBurn).toBe(true);
  }, 60_000);

  it('the burn offered is the 10 Kira held at the roll — a strong hit against 8 and 9', async () => {
    const card = await missedAtTen();
    expect({ momentum: flags(card._id).burn?.momentum, preview: flags(card._id).burn?.previewOutcome })
      .toEqual({ momentum: 10, preview: 'strong_hit' });
  }, 60_000);
});

describe('UPG-2 (b) — the undone price\'s mark keeps the momentum its clamp took', () => {
  it('control: the burn resets Kira (reset +2, then the strong hit\'s +1) and clears Ren\'s mark', async () => {
    const card = await missed();
    await press(card, '[data-action="sf-burn-momentum"]');
    expect(flags(card._id).burn.consumed).toBe(true);
    expect(kira.system.momentum.value).toBe(3);
    expect(ren.system.debility.unprepared).toBe(false);
  }, 60_000);

  it('Ren gets back the momentum the reverted price\'s mark clamped away: 10', async () => {
    const card = await missed();
    await press(card, '[data-action="sf-burn-momentum"]');
    expect(flags(card._id).burn.consumed).toBe(true);
    expect(ren.system.debility.unprepared).toBe(false);
    expect(ren.system.momentum.value, 'the price was never paid').toBe(10);
  }, 60_000);
});

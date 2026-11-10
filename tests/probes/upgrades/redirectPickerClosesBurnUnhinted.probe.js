/**
 * PROBE UPG-4 — PRICE-REDIRECT-PICKER-CLOSES-BURN-UNHINTED (UX, low)
 *
 * Issue #336 Y18 (RESIST-CARD-CLOSES-BURN-UNHINTED) gave the price's resist
 * card the "Burn momentum or improve the result first …" hint while the move
 * whose price it is still offers an upgrade (sufferExecutor.js:288
 * RESIST_UPGRADE_FIRST, :301 resistRollPrompt, :320 upgradeFirstOwed). The
 * price's other card was left without it: a "You waste resources" price
 * while the PC is unprepared posts the W16 redirect picker — "make a suffer
 * move (-1)" without Sacrifice Resources — bound to the move's resolution
 * and stamped `priceCard` (sufferExecutor.js:688-694, no hint in its
 * prompt). A pick on it is that outcome's chosen consequence:
 * resultUpgrade.js:657 outcomeChoiceCards / :676 consequenceChosen count it,
 * and sufferCard.js:590/611 (closeUpgradesForChoice, resultUpgrade.js:727) stamps the move card's
 * Burn / Improve `choiceMade`. The rules' "burn momentum before applying any
 * other effects of the move" is enforced, but — unlike the resist card — the
 * player is never told: picking first silently spends the burn.
 *
 * Scenario (booted GM + player table, the real pipeline):
 *   1. Kira (momentum 9) is already unprepared at supply 2.
 *   2. Her Face Danger misses (6, 7 vs 4); the move card offers 🔥 Burn
 *      (9 → Strong Hit). Its price, "You waste resources", is redirected: the
 *      picker card posts.
 *   Expected: the picker says to burn or improve first, as the resist card does.
 *   Actual: no hint; picking Endure Harm on it closes the burn ("the
 *   consequence was already chosen").
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: 70 }));
vi.mock('../../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
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
// Pay the Price 70: "You waste resources" — Sacrifice Resources (-1); 78: "You are harmed".
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

let table, kira;
const flags = (id) => table.world.message(id).flags[MODULE_ID];
const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — iron 3 + 1 misses
const HINT = /burn momentum or improve the result first/i;
const priceCards = () => table.cards(f => f.sufferCard && f.priceCard);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'upg4-s1', sessionNumber: 1,
      currentSceneId: 'upg4-sc', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  scriptClaude(table, { fallback: () => 'The hold empties.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  control.interpretation = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'probe', mischiefApplied: false };
  control.dice = MISS;
});

async function miss() {
  await table.client('pl-1').chat('Kira dumps the cargo to outrun them.', { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

describe('UPG-4 — the price\'s cards while its move still offers a burn', () => {
  it('control (Y18): a price that harms Kira to 0 posts the resist card with the hint', async () => {
    control.ptp = 78;
    kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 9 }, health: { value: 1 } } });
    const card = await miss();
    expect(flags(card._id).burn?.canBurn).toBe(true);
    const [resist] = priceCards();
    expect(resist.flags[MODULE_ID].sufferPrompt.resist).toBe('health');
    expect(resist.content).toMatch(HINT);
  }, 60_000);

  it('the redirect picker of an unprepared crew\'s price says to burn or improve first', async () => {
    control.ptp = 70;
    kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
      system: { momentum: { value: 9 }, supply: { value: 2 }, debility: { unprepared: true } } });
    const card = await miss();
    expect(flags(card._id).burn?.canBurn).toBe(true);
    const [picker] = priceCards();
    expect(picker.flags[MODULE_ID].sufferPrompt).toMatchObject({ kind: 'any', exclude: ['sacrifice_resources'] });
    expect(picker.content, 'the picker carries the burn-first hint').toMatch(HINT);
  }, 60_000);

  it('control: picking on that picker closes the move\'s burn — the choice is the outcome\'s', async () => {
    control.ptp = 70;
    kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
      system: { momentum: { value: 9 }, supply: { value: 2 }, debility: { unprepared: true } } });
    const card = await miss();
    const [picker] = priceCards();
    await table.client('pl-1').click(picker._id, '[data-suffer-id="endure_harm"]');
    await table.settle(); await table.drain();
    expect(kira.system.health.value).toBe(4);
    expect(flags(card._id).burn.choiceMade).toBe(true);
  }, 60_000);
});

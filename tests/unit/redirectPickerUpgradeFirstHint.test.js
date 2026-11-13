/**
 * Issue #345 AA47 PRICE-REDIRECT-PICKER-CLOSES-BURN-UNHINTED (the upgrades
 * auditor's UPG-4 probe) — the sibling of issue #336 Y18.
 *
 * Y18 gave the price's resist card the "Burn momentum or improve the result
 * first …" hint while the move whose price it is still offers an upgrade
 * (sufferExecutor RESIST_UPGRADE_FIRST / upgradeFirstOwed). The price's other
 * card posted before the move card was left without it: a "You waste
 * resources" price while the PC is unprepared posts the W16 redirect picker —
 * "make a suffer move (-1)" without Sacrifice Resources — bound to the move's
 * resolution. A pick on it is the move's chosen consequence and closes its
 * Burn / Improve (issue #311 P03), but nothing on the picker said to take
 * them first. It now carries the hint while an upgrade is open, and the
 * Sacrifice Resources card's line says it too.
 *
 * Booted GM + player table, the real pipeline, scripted dice and Pay the
 * Price roll.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: 70 }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
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
// Pay the Price 70: "You waste resources" — Sacrifice Resources (-1); 78: "You are harmed".
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

let table, kira;
const flags = (id) => table.world.message(id).flags[MODULE_ID];
const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — iron 3 + 1 misses
const HINT = /burn momentum or improve the result first/i;
const priceCards = () => table.cards(f => f.sufferCard && f.priceCard);
const unprepared = (momentum) => table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
  system: { momentum: { value: momentum }, supply: { value: 2 }, debility: { unprepared: true } } });

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    // The price is paid and the result narrated at once, and an upgrade
    // undoes them — the flow these tests are about. (Asking first is the
    // default since issue #354 P2-10: heldResultBeforePrice.test.js.)
    holdResultForUpgrade: false,
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'aa47-s1', sessionNumber: 1,
      currentSceneId: 'aa47-sc', sceneTruths: [], clocks: [] },
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

async function click(card, selector) {
  await table.client('pl-1').click(card._id, selector);
  await table.settle(); await table.drain();
}

describe('issue #345 AA47 — the price\'s redirect picker says to burn or improve first', () => {
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
    kira = unprepared(9);
    const card = await miss();
    expect(flags(card._id).burn?.canBurn).toBe(true);
    const [picker] = priceCards();
    expect(picker.flags[MODULE_ID].sufferPrompt).toMatchObject({ kind: 'any', exclude: ['sacrifice_resources'] });
    expect(picker.content, 'the picker carries the burn-first hint').toMatch(HINT);
    // The Sacrifice Resources card's line says it too, as the Endure Harm card's does for the resist roll.
    const sacrifice = table.cards(f => f.suffer === 'sacrifice_resources').at(-1);
    expect(sacrifice.content).toMatch(HINT);
  }, 60_000);

  it('control: picking on that picker closes the move\'s burn — the choice is the outcome\'s', async () => {
    control.ptp = 70;
    kira = unprepared(9);
    const card = await miss();
    const [picker] = priceCards();
    await click(picker, '[data-suffer-id="endure_harm"]');
    expect(kira.system.health.value).toBe(4);
    expect(flags(card._id).burn.choiceMade).toBe(true);
  }, 60_000);

  it('control: with no burn or improvement offered, the picker carries no hint', async () => {
    control.ptp = 70;
    kira = unprepared(2);   // 2 beats neither 6 nor 7: nothing to burn
    const card = await miss();
    expect(flags(card._id).burn?.canBurn).not.toBe(true);
    const [picker] = priceCards();
    expect(picker.flags[MODULE_ID].sufferPrompt.kind).toBe('any');
    expect(picker.content).not.toMatch(HINT);
  }, 60_000);

  it('a burn that keeps the price (Battle → weak hit) keeps the picker and drops its spent hint', async () => {
    control.ptp = 70;
    control.interpretation = { moveId: 'battle', moveName: 'Battle', statUsed: 'iron', adds: 0, rationale: 'probe', mischiefApplied: false };
    control.dice = [0.35, 0.75, 0.0];   // challenge 4 and 8; action die 1 — iron 1 + 1 misses; momentum 6 beats the 4
    kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
      system: { momentum: { value: 6 }, supply: { value: 0 }, iron: 1, debility: { unprepared: true } } });
    const card = await miss();
    const [picker] = priceCards();
    expect(picker.content).toMatch(HINT);
    await click(card, '[data-action="sf-burn-momentum"]');
    expect(flags(card._id).burn.consumed).toBe(true);
    expect(flags(picker._id)).toMatchObject({ resolved: false, upgraded: true });
    expect(table.world.message(picker._id).content, 'the spent upgrade\'s hint is gone').not.toMatch(HINT);
  }, 60_000);
});

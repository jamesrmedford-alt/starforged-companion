/**
 * PROBE — IDXC-04 · STATED-MISS-PAID-ON-A-WEAK-HIT
 *
 * Scenario: a player rolls Battle. The Confirm dialog states the stakes
 * (issue #353 R1): "On a hit: You hold the docking bay." / "On a miss: The
 * raiders overrun the bay and take the ship. (Endure Harm −2)". The roll is a
 * WEAK HIT — "Objective achieved but at cost. Pay the Price."
 *
 * Correct: the line shown as "On a miss" is what a MISS costs (decisions.md →
 * "Issue #353 R1: the stakes are stated before the roll, and a miss pays
 * them" — "a routed miss … posts its Pay the Price card with the stated
 * miss"). A weak hit's Pay the Price is not that line: the table is rolled
 * (85, "You are stressed" → Endure Stress −1), the miss's Endure Harm −2 does
 * not land, and the narrator is not seeded with the miss as this beat's price
 * while being told to deliver the hit.
 *
 * Today: the pipeline hands index.js postMovePayThePriceCard the stated miss
 * for ANY result that routes Pay the Price (movePipeline.js: `const stated =
 * statedPrice(resolution.stakes)` — no outcome check; Battle's, Clash's and
 * Finish the Scene's weak hits route one). The card reads "As stated before
 * the roll: The raiders overrun the bay and take the ship.", Endure Harm −2
 * lands, no table is rolled, and the narration — told "This is a weak hit:
 * deliver the hit as stated" — is seeded "Pay the Price: The raiders overrun
 * the bay and take the ship."
 *
 * End to end on a booted table, as tests/unit/statedStakes.test.js runs it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [85], ptpRolls: 0 }));
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
vi.mock('../../../src/oracles/roller.js', async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== 'pay_the_price') return real.rollOracle(...args);
    control.ptpRolls += 1;
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const HIT_LINE  = 'You hold the docking bay.';
const MISS_LINE = 'The raiders overrun the bay and take the ship.';
const STAKES = { hit: HIT_LINE, miss: MISS_LINE, missSuffer: { move: 'endure_harm', amount: 2 }, priceStated: true };

const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 + wits 2 = 3 — a miss
const WEAK = [0.25, 0.65, 0.5];   // challenge 3, 7; action die 4 + wits 2 = 6 — a weak hit

let table, pc;
const ptpCard = () => table.cards(f => f.payThePriceCard).at(-1);
const lastLog = () => table.cards(f => f.narratorCard && f.resolutionId).at(-1)?.flags[MODULE_ID];
const moveNarration = () => table.claude.calls.filter(c => /## STAKES STATED BEFORE THE ROLL/.test(c.userText ?? '')).at(-1);

async function battle(dice) {
  control.interpretation = { moveId: 'battle', moveName: 'Battle', statUsed: 'wits', adds: 0, rationale: 'test', mischiefApplied: false, stakes: STAKES };
  control.dice = dice;
  await table.client('pl-1').chat('We hold the docking bay against the raiders.', { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = [85];   // were the table rolled: 85, You are stressed (Endure Stress -1)
  control.ptpRolls = 0;
  await table.reset({ world: { settings: {
    // The price is paid and the result narrated at once (statedStakes.test.js's setting).
    holdResultForUpgrade: false,
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'idxc-w1', sessionNumber: 1,
      currentSceneId: 'idxc-w-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  pc = table.addActor({ id: 'pc-kira-w', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe('IDXC-04 — the outcome stated for a miss, and a weak hit that pays the price', () => {
  it('control: a MISS pays the stated miss — no table roll, its Endure Harm (-2) lands', async () => {
    await battle(MISS);
    expect(lastLog().outcome).toBe('miss');
    expect(control.ptpRolls).toBe(0);
    expect(ptpCard().content).toContain(`As stated before the roll: <strong>${MISS_LINE}</strong>`);
    expect(pc.system.health.value).toBe(3);
    expect(moveNarration().userText).toContain('This is a miss: deliver the miss as stated');
  }, 30_000);

  it('a WEAK HIT does not pay the line shown as "On a miss"', async () => {
    await battle(WEAK);
    expect(lastLog().outcome).toBe('weak_hit');
    // The weak hit pays a price — it has a Pay the Price card…
    expect(ptpCard(), 'the weak hit\'s Pay the Price card').toBeTruthy();
    // …the narrator is told to deliver the hit…
    expect(moveNarration().userText).toContain('This is a weak hit: deliver the hit as stated');
    // …so the price is not the outcome stated for a miss:
    expect(ptpCard().content).not.toContain(MISS_LINE);
    expect(`${moveNarration().system}\n${moveNarration().userText}`).not.toContain(`Pay the Price: ${MISS_LINE}`);
    // the miss's Endure Harm (-2) does not land; the table's price does.
    expect(pc.system.health.value).toBe(5);
    expect(control.ptpRolls).toBe(1);
  }, 30_000);
});

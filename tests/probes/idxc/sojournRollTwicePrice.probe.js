/**
 * PROBE — IDXC-01 · SOJOURN-PRICE-ROLL-TWICE-REROLLED
 *
 * Scenario: Sojourn misses. The resolver rolls the price its "No relief — Pay
 * the Price" option carries once (resolver.rollChoicePrice) and seeds the
 * move's narration with it. The d100 is 97 — the table's "Roll twice" row
 * (96–100) — so the price is two more rolls: 77 "You are harmed" and 84 "You
 * are stressed". The narration depicts "You are harmed / You are stressed".
 * The player then picks "No relief".
 *
 * Correct: the pick pays the price the narration depicted — the card says
 * "You are harmed / You are stressed", and Endure Harm (-1) and Endure Stress
 * (-1) land on the roller (SOJOURN-PTP-ADVISORY: "picking the option pays that
 * same price").
 *
 * Today: index.js payChosenPrice re-reads the table "by the roll"
 * (rollOracle("pay_the_price", { roll: 97 })): row 97 is the directive, so its
 * two sub-rolls are rolled AGAIN with fresh dice. The card shows — and the
 * roller pays — a different price from the narrated one.
 *
 * The dice are scripted at their boundary (Math.random inside the real
 * resolveMove; inside the real rollOracle for the pick's re-read).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], pickDice: [] }));
vi.mock('../../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ moveId: 'sojourn', moveName: 'Sojourn',
    statUsed: 'heart', adds: 0, playerNarration: text, inputMethod: 'chat', rationale: 'test', mischiefApplied: false })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// The move's dice, inside the REAL resolveMove (challenge, challenge, action, then the price's d100s).
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
// The dice a re-read of the table by its roll throws (the pick's payChosenPrice), inside the REAL rollOracle.
vi.mock('../../../src/oracles/roller.js', async (original) => {
  const real = await original();
  return { ...real, rollOracle: (tableId, options = {}) => {
    if (tableId !== 'pay_the_price' || options?.roll === undefined) return real.rollOracle(tableId, options);
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.pickDice) rng.mockReturnValueOnce(value);
    try { return real.rollOracle(tableId, options); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

// challenge 9, 10; action 1 + heart 1 = 2 — a miss; then the price's d100.
const MISS = [0.85, 0.95, 0.0];
// d100 97 "Roll twice" → 77 "You are harmed", 84 "You are stressed".
const ROLL_TWICE_HARMED_STRESSED = [...MISS, 0.965, 0.765, 0.835];
// d100 71 "You waste resources" — a plain row.
const WASTE = [...MISS, 0.705];
// What fresh dice give when row 97 is resolved again: 46 "A new enemy is revealed", 71 "You waste resources".
const FRESH_DICE = [0.455, 0.705];

let table, kira;
const sufferCards = () => table.cards(f => f.sufferCard);
const ptpCards = () => table.cards(f => f.payThePriceCard);
const narrationText = () => table.claude.calls.map(c => `${c.system ?? ''}\n${c.userText ?? ''}`).join('\n');

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    // The result is not held for Burn / Improve (momentum 2 cannot burn 9 and 10 anyway).
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'idxc-s1', sessionNumber: 1,
      currentSceneId: 'idxc-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kira = table.addActor({ id: 'pc-kira-idxc', name: 'Kira', ownership: { 'pl-1': 3 }, system: { heart: 1, supply: { value: 3 } } });
  scriptClaude(table, { fallback: () => 'The station turns you away.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  control.pickDice = FRESH_DICE;
});
afterEach(async () => {
  table.client('gm-1').answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

async function kiraSojournsAndPicksNoRelief() {
  await table.client('pl-1').chat('Kira seeks rest at the station.', { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
  const card = sufferCards().at(-1);
  expect(card, 'the miss posted its choice card').toBeTruthy();
  await table.client('pl-1').click(card._id, '[data-action="sf-suffer-pick"]', { index: 1 });
  await table.settle(); await table.drain();
  return card;
}

describe('IDXC-01 — Sojourn\'s "No relief" on a "Roll twice" price', () => {
  it('control: a plain row (d100 71) is narrated and paid as the same price', async () => {
    control.dice = WASTE;
    await kiraSojournsAndPicksNoRelief();
    expect(narrationText()).toMatch(/Pay the Price: You waste resources/);
    expect(ptpCards()).toHaveLength(1);
    expect(ptpCards()[0].content).toMatch(/d100 = <strong>71<\/strong> · You waste resources/);
    expect(kira.system.supply.value).toBe(2);
  }, 60_000);

  it('control: a "Roll twice" price (d100 97) seeds the narration with both of its results', async () => {
    control.dice = ROLL_TWICE_HARMED_STRESSED;
    await table.client('pl-1').chat('Kira seeks rest at the station.', { speaker: { actor: kira.id } });
    await table.settle(); await table.drain();
    expect(narrationText()).toMatch(/Pay the Price: You are harmed \/ You are stressed/);
    const option = sufferCards().at(-1).flags[MODULE_ID].sufferPrompt.options.find(o => o.route === 'pay_the_price');
    expect(option.price).toMatchObject({ roll: 97, result: 'You are harmed / You are stressed' });
  }, 60_000);

  it('the pick pays the price the narration depicted — its card names it, and its suffer moves land', async () => {
    control.dice = ROLL_TWICE_HARMED_STRESSED;
    await kiraSojournsAndPicksNoRelief();

    expect(narrationText()).toMatch(/Pay the Price: You are harmed \/ You are stressed/);
    expect(ptpCards()).toHaveLength(1);
    // The card shows the narrated price…
    expect(ptpCards()[0].content).toContain('You are harmed / You are stressed');
    expect(ptpCards()[0].flags[MODULE_ID].oracleMemory.answer).toBe('You are harmed / You are stressed');
    // …and the roller pays it: Endure Harm (-1) and Endure Stress (-1), nothing else.
    expect({ health: kira.system.health.value, spirit: kira.system.spirit.value, supply: kira.system.supply.value })
      .toEqual({ health: 4, spirit: 4, supply: 3 });
  }, 60_000);
});

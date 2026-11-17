/**
 * STARFORGED COMPANION
 * tests/unit/sojournRollTwicePrice.test.js
 *
 * Issue #362 AC30 SOJOURN-PRICE-ROLL-TWICE-REROLLED (an incomplete fix of
 * SOJOURN-PTP-ADVISORY) — Sojourn's miss rolls the price its "No relief — Pay
 * the Price" option carries once (resolver.rollChoicePrice) and seeds the
 * narration with it. When the d100 is the table's "Roll twice" row (96–100)
 * the price is two more rows — 97 → 77 "You are harmed" / 84 "You are
 * stressed" — and the narration depicts both.
 *
 * Correct (SOJOURN-PTP-ADVISORY: "picking the option pays that same price"):
 * the pick pays the price the narration depicted — its card names it and
 * Endure Harm (-1) and Endure Stress (-1) land on the roller.
 *
 * It re-read the table by the d100 (rollOracle("pay_the_price", { roll: 97 })):
 * row 97 is the directive, so its two rows were rolled AGAIN with fresh dice.
 * The option now carries the price as rolled — its text and its routes.
 *
 * The dice are scripted at their boundary (Math.random inside the real
 * resolveMove; inside the real rollOracle for a re-read of the table by a roll).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], pickDice: [], rereads: 0 }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ moveId: 'sojourn', moveName: 'Sojourn',
    statUsed: 'heart', adds: 0, playerNarration: text, inputMethod: 'chat', rationale: 'test', mischiefApplied: false })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// The move's dice, inside the REAL resolveMove (challenge, challenge, action, then the price's d100s).
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
// The dice a re-read of the table by its roll throws, inside the REAL rollOracle.
vi.mock('../../src/oracles/roller.js', async (original) => {
  const real = await original();
  return { ...real, rollOracle: (tableId, options = {}) => {
    if (tableId !== 'pay_the_price' || options?.roll === undefined) return real.rollOracle(tableId, options);
    control.rereads += 1;
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.pickDice) rng.mockReturnValueOnce(value);
    try { return real.rollOracle(tableId, options); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { payChosenPrice } from '../../src/index.js';

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
const meters = () => ({ health: kira.system.health.value, spirit: kira.system.spirit.value, supply: kira.system.supply.value });

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    // Momentum 2 cannot burn 9 and 10: the result is not held.
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'ac30-s1', sessionNumber: 1,
      currentSceneId: 'ac30-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kira = table.addActor({ id: 'pc-kira-ac30', name: 'Kira', ownership: { 'pl-1': 3 }, system: { heart: 1, supply: { value: 3 } } });
  scriptClaude(table, { fallback: () => 'The station turns you away.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  control.pickDice = FRESH_DICE;
  control.rereads = 0;
});
afterEach(async () => {
  table.client('gm-1').answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

async function kiraSojourns() {
  await table.client('pl-1').chat('Kira seeks rest at the station.', { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
  const card = sufferCards().at(-1);
  expect(card, 'the miss posted its choice card').toBeTruthy();
  return card;
}

async function pickNoRelief(card) {
  await table.client('pl-1').click(card._id, '[data-action="sf-suffer-pick"]', { index: 1 });
  await table.settle(); await table.drain();
}

describe('issue #362 AC30 — Sojourn\'s "No relief" pays the price the narration depicted', () => {
  it('control: a plain row (d100 71) is narrated and paid as the same price', async () => {
    control.dice = WASTE;
    await pickNoRelief(await kiraSojourns());
    expect(narrationText()).toMatch(/Pay the Price: You waste resources/);
    expect(ptpCards()).toHaveLength(1);
    expect(ptpCards()[0].content).toMatch(/d100 = <strong>71<\/strong> · You waste resources/);
    expect(meters()).toEqual({ health: 5, spirit: 5, supply: 2 });
  }, 60_000);

  it('a "Roll twice" price (d100 97) seeds the narration with both of its rows, and the option carries them — text and routes', async () => {
    control.dice = ROLL_TWICE_HARMED_STRESSED;
    const card = await kiraSojourns();
    expect(narrationText()).toMatch(/Pay the Price: You are harmed \/ You are stressed/);
    const option = card.flags[MODULE_ID].sufferPrompt.options.find(o => o.route === 'pay_the_price');
    expect(option.price).toMatchObject({ roll: 97, result: 'You are harmed / You are stressed',
      sufferRoutes: [{ move: 'endure_harm', amount: 1 }, { move: 'endure_stress', amount: 1 }] });
  }, 60_000);

  it('the pick pays the "Roll twice" price the narration depicted — its card names it, and its two suffer moves land', async () => {
    control.dice = ROLL_TWICE_HARMED_STRESSED;
    await pickNoRelief(await kiraSojourns());

    expect(ptpCards()).toHaveLength(1);
    expect(control.rereads, 'the table is not rolled again at the pick').toBe(0);
    // The card shows the narrated price…
    expect(ptpCards()[0].content).toContain('d100 = <strong>97</strong> · You are harmed / You are stressed');
    expect(ptpCards()[0].flags[MODULE_ID].oracleMemory.answer).toBe('You are harmed / You are stressed');
    // …and the roller pays it: Endure Harm (-1) and Endure Stress (-1), nothing else.
    expect(meters()).toEqual({ health: 4, spirit: 4, supply: 3 });
  }, 60_000);
});

describe('issue #362 AC30 — payChosenPrice, the price it is handed', () => {
  const pay = (price) => table.client('gm-1').run(() => payChosenPrice(price, globalThis.game.actors.get('pc-kira-ac30')));

  it('an option posted before the routes were carried (the d100 alone) is read back from the table by its roll', async () => {
    const res = await pay({ roll: 71, moveName: 'Sojourn' });
    await table.settle(); await table.drain();
    expect(res).toMatchObject({ ok: true, price: 'You waste resources' });
    expect(control.rereads).toBe(1);
    expect(ptpCards()[0].content).toMatch(/d100 = <strong>71<\/strong> · You waste resources/);
    expect(meters()).toEqual({ health: 5, spirit: 5, supply: 2 });
  }, 60_000);

  it('a carried route that is not a table route — an unknown move, an amount past 3 — is not paid', async () => {
    const res = await pay({ roll: 77, result: 'You are harmed', moveName: 'Sojourn',
      sufferRoutes: [{ move: 'endure_harm', amount: 9 }, { move: 'face_death', amount: 1 }, { move: 'endure_stress', amount: 1 }] });
    await table.settle(); await table.drain();
    expect(res).toMatchObject({ ok: true, price: 'You are harmed' });
    expect(control.rereads).toBe(0);
    expect(ptpCards()[0].flags[MODULE_ID].sufferRoutes).toEqual([{ move: 'endure_stress', amount: 1 }]);
    expect(meters()).toEqual({ health: 5, spirit: 4, supply: 3 });
  }, 60_000);
});

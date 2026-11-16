/**
 * WJ-06 · CHOSEN-PRICE-ROLL-TWICE-REROLLED  (INCOMPLETE-FIX of SOJOURN-PTP-ADVISORY)
 *
 * Scenario: Kira misses a Sojourn. The miss rolls its Pay the Price once
 * (resolver.rollChoicePrice) and the d100 is 98 — "Roll twice" — which the
 * roller resolves at once to two prices: "You waste resources / You are
 * stressed". The narration is seeded with those two. Kira's player picks
 * "No relief — Pay the Price".
 *
 * Correct (decisions.md SOJOURN-PTP-ADVISORY: "rolls its price once … picking
 * the option pays that same price"): the price card says "You waste resources
 * / You are stressed", and those routes land on Kira (supply −1, spirit −1).
 *
 * Today: the option carries only the d100 (`price.roll` = 98) and
 * `payChosenPrice` reads the result back with `rollOracle("pay_the_price",
 * { roll: 98 })`. `options.roll` pins the first die only: a "Roll twice" row
 * rolls its two results afresh, so on 96–100 (one priced pick in twenty) the
 * price that is paid — its card, its suffer routes, what RECENT ORACLE
 * RESULTS remembers — is two other rows than the ones the narration told.
 * The 1–95 rows are single results and are read back the same.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], oracleDice: [] }));
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
// The dice only: the move's own (as tests/unit/sojournChosenPrice.test.js scripts them) …
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
// … and the dice of an oracle roll made later, at the pick (`control.oracleDice`).
vi.mock('../../../src/oracles/roller.js', async (original) => {
  const real = await original();
  return { ...real, rollOracle: vi.fn((...args) => {
    if (!control.oracleDice.length) return real.rollOracle(...args);
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.oracleDice.splice(0)) rng.mockReturnValueOnce(value);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

// challenge 9, 10; action 1 + heart 1 = 2 — a miss; then the price's d100.
const MISS = [0.85, 0.95, 0.0];
const D100_71 = [0.705];                       // "You waste resources"
const D100_98_THEN_71_85 = [0.975, 0.705, 0.845];   // "Roll twice" → "You waste resources" / "You are stressed"
// What the dice give when the same table is rolled again at the pick: 3 and 11.
const OTHER_ROWS = [0.02, 0.10];

let table, kira;
const sufferCards = () => table.cards(f => f.sufferCard);
const ptpCards = () => table.cards(f => f.payThePriceCard);
const narrations = () => table.claude.calls.filter(c => /Sojourn/.test(c.userText ?? ''));

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'soj-s1', sessionNumber: 1,
      currentSceneId: 'soj-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kira = table.addActor({ id: 'pc-kira-soj', name: 'Kira', ownership: { 'pl-1': 3 }, system: { heart: 1, supply: { value: 3 } } });
  scriptClaude(table, { fallback: () => 'The station turns you away.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  control.oracleDice = [];
});
afterEach(async () => {
  control.oracleDice = [];
  table.client('gm-1').answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

async function kiraSojournsAndPaysThePrice() {
  await table.client('pl-1').chat('Kira seeks rest at the station.', { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
  const card = sufferCards().at(-1);
  expect(card, 'the miss posted its choice card').toBeTruthy();
  control.oracleDice = [...OTHER_ROWS];   // whatever the dice would say if the table were rolled again now
  await table.client('pl-1').click(card._id, '[data-action="sf-suffer-pick"]', { index: 1 });
  await table.settle(); await table.drain();
}

describe('WJ-06 — "No relief — Pay the Price" pays the price the miss rolled, on 96–100 too', () => {
  it('control: a single-row price (d100 = 71) is narrated and paid as rolled', async () => {
    control.dice = [...MISS, ...D100_71];
    await kiraSojournsAndPaysThePrice();
    expect(narrations().some(c => /Pay the Price: You waste resources/.test(`${c.system ?? ''}\n${c.userText ?? ''}`))).toBe(true);
    expect(ptpCards()).toHaveLength(1);
    expect(ptpCards()[0].content).toMatch(/d100 = <strong>71<\/strong> · You waste resources/);
    expect(kira.system.supply.value).toBe(2);
  }, 60_000);

  it('"Roll twice" (d100 = 98): the two prices the narration was given are the two that are paid', async () => {
    control.dice = [...MISS, ...D100_98_THEN_71_85];
    await kiraSojournsAndPaysThePrice();
    // The narration was seeded with the two rows the miss rolled.
    expect(narrations().some(c => /Pay the Price: You waste resources \/ You are stressed/.test(`${c.system ?? ''}\n${c.userText ?? ''}`)),
      'the narration was told "You waste resources / You are stressed"').toBe(true);
    expect(ptpCards()).toHaveLength(1);
    const [ptp] = ptpCards();
    expect(ptp.flags[MODULE_ID].oracleMemory.answer, 'the price on the Pay the Price card').toBe('You waste resources / You are stressed');
    expect(kira.system.supply.value, 'Kira\'s supply after "You waste resources"').toBe(2);
  }, 60_000);
});

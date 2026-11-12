/**
 * STARFORGED COMPANION
 * tests/unit/sojournChosenPrice.test.js
 *
 * SOJOURN-PTP-ADVISORY — Sojourn's miss: "Choose: the community needs help
 * (Swear an Iron Vow) OR no relief (Pay the Price)". The resolver rolled an
 * advisory Pay the Price for the narration to depict, but the choice card's
 * "No relief — Pay the Price" only posted a "Trigger: pay_the_price"
 * reminder: the price the table then paid with `!ptp` was another roll, not
 * the narrated one. The miss now rolls its price once — the narration's seed
 * and the option's price are that roll — and the pick pays it: its card, its
 * suffer route on the roller, the countdown clocks.
 *
 * The booted table: a GM and a player; the interpretation scripted; the dice
 * scripted (a miss, then the d100 = 71, "You waste resources" →
 * Sacrifice Resources -1).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
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
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { resolveMove } from '../../src/moves/resolver.js';
import { rollChoicePrice, withChoicePrice, mapConsequences } from '../../src/moves/resolver.js';

// challenge 9, 10; action 1 + heart 1 = 2 — a miss; then the d100 = 71.
const MISS_THEN_WASTE = [0.85, 0.95, 0.0, 0.705];

let table, kira;
const sufferCards = () => table.cards(f => f.sufferCard);
const ptpCards = () => table.cards(f => f.payThePriceCard);
const breach = () => (table.world.campaignState()?.clocks ?? []).find(c => c._id === 'clk-breach');
const narrations = () => table.claude.calls.filter(c => /Sojourn/.test(c.userText ?? ''));

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'soj-s1', sessionNumber: 1,
      currentSceneId: 'soj-scene', sceneTruths: [],
      clocks: [{ _id: 'clk-breach', name: 'Reactor Breach', type: 'tension', segments: 6, filled: 1, active: true, triggered: false }] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kira = table.addActor({ id: 'pc-kira-soj', name: 'Kira', ownership: { 'pl-1': 3 }, system: { heart: 1, supply: { value: 3 } } });
  scriptClaude(table, { fallback: () => 'The station turns you away.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  control.dice = MISS_THEN_WASTE;
});
afterEach(async () => {
  table.client('gm-1').answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

async function kiraSojourns() {
  await table.client('pl-1').chat('Kira seeks rest at the station.', { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
}

describe('SOJOURN-PTP-ADVISORY — "No relief" pays the narrated price (booted table)', () => {
  it("the narration depicts the d100's price, and the pick pays that same price — its card, its route, the clocks", async () => {
    await kiraSojourns();
    const card = sufferCards().at(-1);
    expect(card, 'the miss posted its choice card').toBeTruthy();
    // The narration was seeded with the price the option carries.
    expect(narrations().some(c => /Pay the Price: You waste resources/.test(`${c.system ?? ''}\n${c.userText ?? ''}`))).toBe(true);
    expect(ptpCards()).toEqual([]);
    expect(breach().filled).toBe(1);

    await table.client('pl-1').click(card._id, '[data-action="sf-suffer-pick"]', { index: 1 });
    await table.settle(); await table.drain();

    const [ptp] = ptpCards();
    expect(ptpCards()).toHaveLength(1);
    expect(ptp.content).toMatch(/d100 = <strong>71<\/strong> · You waste resources/);
    expect(ptp.flags[MODULE_ID].oracleMemory).toMatchObject({ name: 'Pay the Price', answer: 'You waste resources' });
    expect(kira.system.supply.value).toBe(2);         // the route, on the roller
    expect(breach().filled).toBe(2);                  // the clocks turn
    expect(table.cards(f => f.deferredSuffer || f.route).filter(m => /Trigger: pay_the_price/.test(m.content))).toEqual([]);
    expect(table.cards(f => f.sufferCard).find(m => m._id === card._id).content).toMatch(/Applied: the price paid \(see its card\)/);
  }, 60_000);

  it('control: "Community needs help" pays no price', async () => {
    await kiraSojourns();
    await table.client('pl-1').click(sufferCards().at(-1)._id, '[data-action="sf-suffer-pick"]', { index: 0 });
    await table.settle(); await table.drain();
    expect(ptpCards()).toEqual([]);
    expect(kira.system.supply.value).toBe(3);
    expect(breach().filled).toBe(1);
  }, 60_000);
});

describe('SOJOURN-PTP-ADVISORY — rollChoicePrice / withChoicePrice', () => {
  it("rolls once for Sojourn's miss, and the seed and the option carry the same roll", () => {
    const rng = vi.spyOn(Math, 'random');
    for (const v of [0.85, 0.95, 0.0, 0.705]) rng.mockReturnValueOnce(v);
    let r;
    try {
      r = resolveMove({ moveId: 'sojourn', moveName: 'Sojourn', statUsed: 'heart', adds: 0, playerNarration: 'x' }, { heart: 1 });
    } finally { rng.mockRestore(); }
    expect(r.outcome).toBe('miss');
    const option = r.consequences.sufferPrompt.options.find(o => o.route === 'pay_the_price');
    expect(option.price).toEqual({ roll: 71, result: 'You waste resources', moveName: 'Sojourn' });
    expect(r.oracleSeeds.results.filter(s => s.startsWith('Pay the Price:'))).toEqual(['Pay the Price: You waste resources']);
  });

  it('rolls nothing for a hit, a routed price, or a move whose miss seeds no price', () => {
    expect(rollChoicePrice('sojourn', 'weak_hit', mapConsequences('sojourn', 'weak_hit', false))).toBeNull();
    expect(rollChoicePrice('face_danger', 'miss', mapConsequences('face_danger', 'miss', false))).toBeNull();
    expect(rollChoicePrice('test_your_relationship', 'miss', mapConsequences('test_your_relationship', 'miss', false))).toBeNull();
  });

  it('withChoicePrice stamps only the pay_the_price option, on a new prompt', () => {
    const prompt = mapConsequences('sojourn', 'miss', false).sufferPrompt;
    const out = withChoicePrice(prompt, { roll: 40, result: 'The environment or terrain introduces a new hazard' }, null);
    expect(out.options.map(o => o.price?.roll ?? null)).toEqual([null, 40]);
    expect(prompt.options[1].price).toBeUndefined();
  });
});

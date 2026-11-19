/**
 * STARFORGED COMPANION
 * tests/unit/sojournStatedMissPrice.test.js
 *
 * Issue #362 AC03 SOJOURN-STATED-MISS-PAYS-TABLE — Sojourn's miss offers a
 * choice: the community needs help, or "No relief — Pay the Price". With a
 * miss stated before the roll ("On a miss: the settlement's gates stay shut
 * against you (Endure Stress −1)", shown in the Confirm dialog), the resolver
 * still rolled the option's price on the table (rollChoicePrice,
 * SOJOURN-PTP-ADVISORY): the narration was told two prices — the d100's seed
 * and "deliver the miss as stated — it is what this miss costs" — and the pick
 * paid the d100's suffer move, not the one the dialog showed.
 *
 * Correct (decisions.md → "Issue #353 R1": "An unrouted miss whose text says
 * to pay the price is seeded with the stated miss instead of an advisory
 * table roll. The table is rolled only when no miss was stated"): one price,
 * the stated miss — the seed, and what the pick pays.
 *
 * End to end on a booted GM + player table: the player's line through the
 * chat hook, the REAL interpreter (Claude answered at the fetch boundary),
 * move pipeline, resolver, narrator prompt, choice card and its pick.
 * Scripted: the pacing decision, the ability scan, the confirm dialog (which
 * records the stakes it was given), the dice and the d100.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], confirmedStakes: [] }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async (interpretation) => {
    control.confirmedStakes.push(JSON.parse(JSON.stringify(interpretation?.stakes ?? null)));
    return true;
  }),
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
import { stakesShown, STAKES_SETTING } from '../../src/moves/stakes.js';

const MISS_LINE = "The settlement's gates stay shut against you.";
const STATED = { hit: 'The settlement takes you in.', miss: MISS_LINE, missSuffer: { move: 'endure_stress', amount: 1 } };
// challenge 9, 10; action 1 + heart 1 = 2 — a miss; then, if the resolver rolls the table, the d100 = 71:
// "You waste resources" → Sacrifice Resources -1.
const MISS_THEN_WASTE = [0.85, 0.95, 0.0, 0.705];

let table, kira, reading;
const sufferCards = () => table.cards(f => f.sufferCard);
const ptpCards    = () => table.cards(f => f.payThePriceCard);
const narratorCalls = () => table.claude.calls.filter(c => /MOVE OUTCOME/.test(`${c.userText}`));
const meters = () => ({ spirit: kira.system.spirit.value, supply: kira.system.supply.value });

async function kiraSojourns(stakes) {
  reading = { moveId: 'sojourn', moveName: 'Sojourn', statUsed: 'heart', rationale: 'Rest at the station.', confidence: 'high', stakes };
  control.dice = MISS_THEN_WASTE;
  await table.client('pl-1').chat('Kira seeks rest at the station.', { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
  const call = narratorCalls().at(-1);
  return `${call?.system ?? ''}\n${call?.userText ?? ''}`;
}

async function pickNoRelief() {
  await table.client('pl-1').click(sufferCards().at(-1)._id, '[data-action="sf-suffer-pick"]', { index: 1 });
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
async function resetTable(settings = {}) {
  control.confirmedStakes = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, ...settings,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'ac03-s1', sessionNumber: 1,
      currentSceneId: 'ac03-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kira = table.addActor({ id: 'pc-kira-ac03', name: 'Kira', ownership: { 'pl-1': 3 }, system: { heart: 1, supply: { value: 3 } } });
  scriptClaude(table, { fallback: (call) => (/move interpreter/.test(call?.system ?? '')
    ? JSON.stringify(reading)
    : /NARRATOR ROLE|SIDECAR/.test(call?.system ?? '')
      ? 'The station turns you away.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'
      : '{}') });
}
beforeEach(async () => { await resetTable(); });
afterEach(async () => {
  table.client('gm-1').answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

describe('issue #362 AC03 — Sojourn\'s miss with a miss stated before the roll', () => {
  it('control: no miss stated — the narration is seeded with the table\'s price, and "No relief" pays it', async () => {
    const prompt = await kiraSojourns(null);
    expect(prompt).toContain('Pay the Price: You waste resources');
    expect(prompt).not.toContain('it is what this miss costs');
    await pickNoRelief();
    expect(ptpCards()).toHaveLength(1);
    expect(ptpCards()[0].content).toMatch(/d100 = <strong>71<\/strong> · You waste resources/);
    expect(meters()).toEqual({ spirit: 5, supply: 2 });
  }, 60_000);

  it('the narration is given the stated miss as the price — not a table roll beside it', async () => {
    const prompt = await kiraSojourns(STATED);
    expect(sufferCards().at(-1), 'the miss posted its choice card (setup)').toBeTruthy();
    // The narration is written before the card is picked: the stated miss is
    // the price on offer, not yet "what this miss costs" (issue #364
    // SOJOURN-MISS-PRICE-NARRATED-BEFORE-CHOICE — this setup pinned the old line).
    expect(prompt, 'the narrator is told the stated miss is the price on offer (setup)').toContain(`The price it offers: ${MISS_LINE}`);
    expect(prompt).not.toContain('it is what this miss costs');
    expect(prompt).toContain(`Pay the Price: ${MISS_LINE}`);
    expect(prompt).not.toContain('Pay the Price: You waste resources');
    // The option carries the stated price: nothing was rolled for it.
    const option = sufferCards().at(-1).flags[MODULE_ID].sufferPrompt.options.find(o => o.route === 'pay_the_price');
    expect(option.price).toMatchObject({ roll: null, stated: true, result: MISS_LINE,
      sufferRoutes: [{ move: 'endure_stress', amount: 1 }] });
  }, 60_000);

  it('"No relief — Pay the Price" pays what the dialog showed under "On a miss"', async () => {
    await kiraSojourns(STATED);
    const shown = stakesShown(control.confirmedStakes.at(-1)).find(s => s.kind === 'miss');
    expect(shown, 'the dialog showed the miss and its cost (setup)').toMatchObject({ text: MISS_LINE, cost: 'Endure Stress −1' });
    await pickNoRelief();
    expect(ptpCards(), 'the pick paid a price (setup)').toHaveLength(1);
    expect(ptpCards()[0].content).toContain(`As stated before the roll: <strong>${MISS_LINE}</strong>`);
    expect(ptpCards()[0].content).not.toContain('d100');
    expect(ptpCards()[0].flags[MODULE_ID].oracleMemory.answer).toBe(MISS_LINE);
    // The dialog said Endure Stress −1; the table's Sacrifice Resources −1 was never stated.
    expect(meters()).toEqual({ spirit: 4, supply: 3 });
  }, 60_000);

  it('with the world setting off, the table is the price again — the stated miss was not shown as one', async () => {
    await resetTable({ [STAKES_SETTING]: false });
    const prompt = await kiraSojourns(STATED);
    expect(control.confirmedStakes.at(-1)).toMatchObject({ priceStated: false });
    expect(prompt).toContain('Pay the Price: You waste resources');
    expect(prompt).not.toContain(`Pay the Price: ${MISS_LINE}`);
    await pickNoRelief();
    expect(ptpCards()[0].content).toMatch(/d100 = <strong>71<\/strong> · You waste resources/);
    expect(meters()).toEqual({ spirit: 5, supply: 2 });
  }, 60_000);
});

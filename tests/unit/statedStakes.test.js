/**
 * STARFORGED COMPANION
 * tests/unit/statedStakes.test.js
 *
 * Issue #353 R1 — the stakes are stated before the roll, and a miss costs
 * the obvious thing. (Decided, maintainer 2026-11-13: the stated outcome is a
 * miss's default price; the Pay the Price table is the alternative.)
 *   - The interpreter's `stakes` — a hit line, a miss line, the miss's one
 *     suffer move — are kept bounded (the parse: interpreterStakes.test.js).
 *   - The Confirm dialog shows both lines; the miss only when it is the price.
 *   - A miss that pays the price pays the stated one: no table roll, the card
 *     says so, its suffer move lands through the same executors and leaves
 *     the receipt a burn undoes.
 *   - The table is rolled only when no miss was stated, or with the world
 *     setting "Miss Pays the Stated Stakes" off.
 *   - The narrator is told the stakes and which one the outcome delivers —
 *     the burned outcome's too.
 * The pipeline cases run a player's line through the GM's real move pipeline
 * on a booted table, the interpretation and the dice scripted at their
 * boundaries (as tests/unit/payThePriceRoutes.test.js does).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [78], ptpRolls: 0 }));
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
vi.mock('../../src/oracles/roller.js', async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== 'pay_the_price') return real.rollOracle(...args);
    control.ptpRolls += 1;
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import {
  normaliseStakes, withPriceSource, statedPrice, formatStakesBlock, STAKES_LINE_MAX, STAKES_SETTING,
} from '../../src/moves/stakes.js';
import { buildNarratorUserMessage } from '../../src/narration/narratorPrompt.js';
import { staticSettingScope } from '../helpers/settingScopes.js';

const MISS_LINE = 'The data core sparks and the shock throws you against the bulkhead.';
const HIT_LINE  = 'You pull the convoy\'s route from the data core.';
const stakes = (over = {}) => ({ hit: HIT_LINE, miss: MISS_LINE, missSuffer: { move: 'endure_harm', amount: 1 }, priceStated: true, ...over });

// ─────────────────────────────────────────────────────────────────────────────
// The stakes, pure
// ─────────────────────────────────────────────────────────────────────────────

describe('issue #353 R1 — the stakes the interpreter states', () => {
  it('keeps one bounded line each, and one known suffer move of 1–3 beside a miss', () => {
    expect(normaliseStakes({ hit: '  You get in.\n', miss: 'They see you.', missSuffer: { move: 'endure_stress', amount: 5 } }))
      .toEqual({ hit: 'You get in.', miss: 'They see you.', missSuffer: { move: 'endure_stress', amount: 3 } });
    expect(normaliseStakes({ hit: 'x'.repeat(500), miss: null }).hit).toHaveLength(STAKES_LINE_MAX);
    expect(normaliseStakes({ miss: 'Lost.', missSuffer: { move: 'face_death', amount: 1 } }).missSuffer).toBeNull();
    expect(normaliseStakes({ hit: 'In.', missSuffer: { move: 'endure_harm', amount: 1 } }).missSuffer).toBeNull();
    expect(normaliseStakes({ hit: '', miss: '  ' })).toBeNull();
    expect(normaliseStakes('stakes')).toBeNull();
  });

  it('the setting the stakes read is the world setting the panel registers', () => {
    expect(staticSettingScope(MODULE_ID, STAKES_SETTING)).toBe('world');
  });

  it('a stated miss is the price unless the world setting is off', () => {
    expect(withPriceSource(normaliseStakes({ hit: 'In.', miss: 'Out.' })).priceStated).toBe(true);
    expect(withPriceSource(normaliseStakes({ hit: 'In.' })).priceStated).toBe(false);
    game.settings._store.set(`${MODULE_ID}.${STAKES_SETTING}`, false);
    try {
      expect(withPriceSource(normaliseStakes({ hit: 'In.', miss: 'Out.' })).priceStated).toBe(false);
    } finally {
      game.settings._store.delete(`${MODULE_ID}.${STAKES_SETTING}`);
    }
  });

  it('the stated price: its line and its one route — a companion\'s harm falls back to Endure Harm', () => {
    expect(statedPrice(stakes())).toEqual({ price: MISS_LINE, sufferRoutes: [{ move: 'endure_harm', amount: 1 }] });
    expect(statedPrice(stakes({ missSuffer: { move: 'companion_takes_a_hit', amount: 2 } })).sufferRoutes)
      .toEqual([{ move: 'companion_takes_a_hit', amount: 2, soloFallback: 'endure_harm' }]);
    expect(statedPrice(stakes({ missSuffer: null })).sufferRoutes).toEqual([]);
    expect(statedPrice(stakes({ priceStated: false }))).toBeNull();
    expect(statedPrice(null)).toBeNull();
  });

  it('the narrator is told what was shown, and which line the outcome delivers', () => {
    const miss = formatStakesBlock(stakes(), 'miss');
    expect(miss).toContain('## STAKES STATED BEFORE THE ROLL');
    expect(miss).toContain(`- On a hit: ${HIT_LINE}`);
    expect(miss).toContain(`- On a miss: ${MISS_LINE} (Endure Harm −1)`);
    expect(miss).toContain('This is a miss: deliver the miss as stated');
    expect(formatStakesBlock(stakes(), 'strong_hit')).toContain('This is a strong hit: deliver the hit as stated.');
    expect(formatStakesBlock(stakes(), 'weak_hit')).toContain('deliver the hit as stated, with the cost or complication');
    // A miss whose price was not the stated one: the miss line was not shown.
    const rolled = formatStakesBlock(stakes({ priceStated: false }), 'miss');
    expect(rolled).not.toContain(MISS_LINE);
    expect(rolled).toContain('Its cost is the move outcome\'s, not a stated one.');
    expect(formatStakesBlock(null, 'miss')).toBe('');
  });

  it('a miss whose price the pipeline does not route is seeded with the stated one, not a table roll', async () => {
    const { buildOracleSeeds } = await import('../../src/moves/resolver.js');
    control.ptpRolls = 0;
    const seeds = buildOracleSeeds('face_danger', 'miss', false, null, { routesPayThePrice: false, statedPriceText: MISS_LINE });
    expect(seeds.results).toContain(`Pay the Price: ${MISS_LINE}`);
    expect(control.ptpRolls).toBe(0);
    const rolled = buildOracleSeeds('face_danger', 'miss', false, null, { routesPayThePrice: false });
    expect(rolled.results.some(l => /^Pay the Price: /.test(l))).toBe(true);
    expect(control.ptpRolls).toBe(1);
  });

  it('it reaches the move\'s user message, after the outcome', () => {
    const text = buildNarratorUserMessage({ loremasterContext: '[MOVE: Gather Information +wits] [OUTCOME: Miss]', outcome: 'miss',
      stakes: stakes() }, 'I pull the logs.', 3, 'Kira');
    expect(text.indexOf('## MOVE OUTCOME')).toBeLessThan(text.indexOf('## STAKES STATED BEFORE THE ROLL'));
    expect(text).toContain(MISS_LINE);
  });
});

describe('issue #353 R1 — the Confirm dialog shows them before the roll', () => {
  async function dialogHtml(interp) {
    const { MoveConfirmDialog } = await vi.importActual('../../src/ui/settingsPanel.js');
    const { StubElement } = await import('../helpers/cardDom.js');
    const saved = globalThis.document;
    globalThis.document = { createElement: (tag) => new StubElement(tag) };
    try {
      const el = await new MoveConfirmDialog({ id: 'test-confirm' })._renderHTML({ moveId: interp.moveId, statUsed: interp.statUsed,
        rationale: '', stakes: interp.stakes, mischiefApplied: false, mischiefAside: '', applicableAbilities: [],
        dialLabel: 'Balanced', forced: false }, {});
      return el.outerHTML ?? el.innerHTML;
    } finally {
      globalThis.document = saved;
    }
  }

  it('a hit line and a miss line with its cost', async () => {
    const html = await dialogHtml({ moveId: 'gather_information', statUsed: 'wits', stakes: stakes() });
    expect(html).toContain(`<strong>On a hit:</strong> ${HIT_LINE}`);
    expect(html).toContain(`<strong>On a miss:</strong> ${MISS_LINE}`);
    expect(html).toContain('(Endure Harm −1)');
  });

  it('the miss line only when it is the price', async () => {
    const html = await dialogHtml({ moveId: 'gather_information', statUsed: 'wits', stakes: stakes({ priceStated: false }) });
    expect(html).toContain('On a hit:');
    expect(html).not.toContain('On a miss:');
    expect(await dialogHtml({ moveId: 'gather_information', statUsed: 'wits', stakes: null })).not.toContain('At stake');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Through the move pipeline
// ─────────────────────────────────────────────────────────────────────────────

let table, pc;
const flags   = (id) => table.world.message(id).flags[MODULE_ID];
const lastLog = () => table.cards(f => f.narratorCard && f.resolutionId).at(-1)?.flags[MODULE_ID];
const ptpCard = () => table.cards(f => f.payThePriceCard).at(-1);
const NARRATION_MODEL = 'claude-sonnet-5-5';
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — wits 2 misses
const BURN = '[data-action="sf-burn-momentum"]';

async function roll(moveId, { stakesOf = stakes(), statUsed = 'wits', dice = MISS } = {}) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: 'test', mischiefApplied: false, stakes: stakesOf };
  control.dice = dice;
  await table.client('pl-1').chat(`I attempt ${moveId}.`, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = [85];   // were the table rolled: 85, You are stressed
  control.ptpRolls = 0;
  await table.reset({ world: { settings: {
    // The price is paid and the result narrated at once, and an upgrade
    // undoes them — the flow these tests are about. (Asking first is the
    // default since issue #354 P2-10: heldResultBeforePrice.test.js.)
    holdResultForUpgrade: false,
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'r1-s1', sessionNumber: 1,
      currentSceneId: 'r1-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  pc = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe('issue #353 R1 — a miss pays what was at stake', () => {
  it('the stated miss is the price: no table roll, the card says so, and its harm lands with its receipt', async () => {
    const card = await roll('gather_information');
    expect(lastLog().outcome).toBe('miss');
    expect(control.ptpRolls).toBe(0);
    expect(ptpCard().content).toContain(`As stated before the roll: <strong>${MISS_LINE}</strong>`);
    expect(ptpCard().content).not.toContain('d100');
    expect(ptpCard().flags[MODULE_ID].sufferRoutes).toEqual([{ move: 'endure_harm', amount: 1 }]);
    expect(pc.system.health.value).toBe(4);
    expect(pc.system.spirit.value).toBe(5);
    expect(flags(card._id).burn.ptpReversals.sufferMeterDeltas).toEqual([expect.objectContaining({
      move: 'endure_harm', meterKey: 'health', amount: 1, before: 5, after: 4 })]);
  });

  it('the narration is told the stakes and that the miss is what it costs — and is seeded with that price', async () => {
    await roll('gather_information');
    const call = narrations().find(c => /## STAKES STATED BEFORE THE ROLL/.test(c.userText ?? ''));
    expect(call, 'the move narration').toBeTruthy();
    expect(call.userText).toContain(`- On a miss: ${MISS_LINE} (Endure Harm −1)`);
    expect(call.userText).toContain('This is a miss: deliver the miss as stated');
    expect(call.system).toContain(`Pay the Price: ${MISS_LINE}`);
  });

  it('a burn undoes the stated price and its re-narration delivers the hit', async () => {
    const card = await roll('gather_information');
    expect(pc.system.health.value).toBe(4);
    await table.client('pl-1').click(card._id, BURN);
    await table.settle(); await table.drain();
    expect(lastLog().outcome).toBe('strong_hit');
    expect(pc.system.health.value).toBe(5);
    expect(table.cards(f => f.burnReversal).at(-1)?.content).toMatch(/health \+1 refunded/);
    const renarration = narrations().filter(c => /## STAKES STATED BEFORE THE ROLL/.test(c.userText ?? '')).at(-1);
    expect(renarration.userText).toContain('This is a strong hit: deliver the hit as stated.');
  });

  it('a stated miss with no suffer move costs no meter', async () => {
    const meters = () => [pc.system.health.value, pc.system.spirit.value, pc.system.supply.value];
    const before = meters();
    await roll('gather_information', { stakesOf: stakes({ missSuffer: null }) });
    expect(control.ptpRolls).toBe(0);
    expect(ptpCard().content).toContain(MISS_LINE);
    expect(ptpCard().flags[MODULE_ID].sufferRoutes).toEqual([]);
    expect(meters()).toEqual(before);
  });

  it('the table is the alternative: rolled when no miss was stated', async () => {
    await roll('gather_information', { stakesOf: stakes({ miss: null, missSuffer: null, priceStated: false }) });
    expect(control.ptpRolls).toBe(1);
    expect(ptpCard().content).toContain('d100 = <strong>85</strong> · You are stressed');
    expect(pc.system.spirit.value).toBe(4);
    expect(pc.system.health.value).toBe(5);
  });

  it('…and when the setting is off (the stakes read it: the miss line is not the price)', async () => {
    await roll('gather_information', { stakesOf: stakes({ priceStated: false }) });
    expect(control.ptpRolls).toBe(1);
    expect(ptpCard().content).not.toContain(MISS_LINE);
    expect(pc.system.spirit.value).toBe(4);
    expect(pc.system.health.value).toBe(5);
  });

  it('a hit never pays it', async () => {
    await roll('gather_information', { dice: [0.05, 0.15, 0.95] });   // challenge 1, 2; action 6
    expect(lastLog().outcome).toBe('strong_hit');
    expect(ptpCard()).toBeUndefined();
    expect(pc.system.health.value).toBe(5);
  });
});

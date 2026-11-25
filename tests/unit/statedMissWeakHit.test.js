/**
 * STARFORGED COMPANION
 * tests/unit/statedMissWeakHit.test.js
 *
 * Issue #362 AC01 STATED-MISS-PAID-ON-WEAK-HIT — the miss stated before the
 * roll is a MISS's price (decisions.md → "Issue #353 R1": "a routed miss …
 * posts its Pay the Price card with the stated miss"). A Battle or Clash weak
 * hit routes Pay the Price too, and the pipeline paid it the stated miss: the
 * card read "As stated before the roll: <the miss line>", the miss's suffer
 * move landed, and the narration was seeded with the miss as the hit's price
 * beside "This is a weak hit: deliver the hit as stated". A weak hit that pays
 * a price pays the table's.
 *
 * A held miss burned to a weak hit that pays a price (nothing paid yet) pays
 * the table's too: the result paid and narrated is the weak hit.
 *
 * End to end on a booted table, as tests/unit/statedStakes.test.js runs it:
 * the interpretation, the abilities, the dice and the d100 scripted at their
 * boundaries.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [85], ptpRolls: 0 }));
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
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
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
import { progressTracksJournal } from '../helpers/fullStateFixture.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const HIT_LINE  = 'You hold the docking bay.';
const MISS_LINE = 'The raiders overrun the bay and take the ship.';
const STAKES = { hit: HIT_LINE, miss: MISS_LINE, missSuffer: { move: 'endure_harm', amount: 2 }, priceStated: true };

// [challenge, challenge, action] Math.random values; wits 2, momentum 2 — nothing to burn, so nothing is held.
const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 + wits 2 = 3 — a miss
const WEAK = [0.25, 0.65, 0.5];   // challenge 3, 7; action die 4 + wits 2 = 6 — a weak hit
const BURN = '[data-action="sf-burn-momentum"]';
const KEEP = '[data-action="sf-keep-result"]';

let table, pc;
const flags   = (id) => table.world.message(id).flags[MODULE_ID];
const ptpCard = () => table.cards(f => f.payThePriceCard).at(-1);
const priceCards = () => table.cards(f => f.payThePriceCard);
const lastLog = () => table.cards(f => f.narratorCard && f.resolutionId).at(-1)?.flags[MODULE_ID];
const moveNarration = () => table.claude.calls.filter(c => /\[stakes\] The player saw these before rolling:/.test(c.userText ?? '')).at(-1);
const promptOf = (call) => `${call?.system ?? ''}\n${call?.userText ?? ''}`;

async function fight(moveId, dice, { statUsed = 'wits', line = 'We hold the docking bay against the raiders.' } = {}) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: 'test', mischiefApplied: false, stakes: { ...STAKES } };
  control.dice = dice;
  await table.client('pl-1').chat(line, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = [85];   // were the table rolled: 85, You are stressed (Endure Stress -1)
  control.ptpRolls = 0;
  await table.reset({ world: { settings: {
    // Default settings: a result that offers an upgrade is held for it.
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'ac01-s1', sessionNumber: 1,
      currentSceneId: 'ac01-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  // a Clash is made in a fight, in a bad spot (the move gate's OPEN_FIGHT, POSITION) — overhaul 4.
  table.journal._set(progressTracksJournal([{ id: 'fight-1', label: 'Raiders', type: 'combat', rank: 'dangerous', ticks: 8, completed: false, combatState: 'bad_spot', positions: { 'pc-kira': 'bad_spot' } }]));
  pc = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe('issue #362 AC01 — the miss stated before the roll is a miss\'s price, not a weak hit\'s', () => {
  it('control: a Battle MISS pays the stated miss — no table roll, its card says so, its Endure Harm (-2) lands', async () => {
    const card = await fight('battle', MISS);
    expect(flags(card._id).awaitingUpgrade).toBeUndefined();
    expect(lastLog().outcome).toBe('miss');
    expect(control.ptpRolls).toBe(0);
    expect(ptpCard().content).toContain(`As stated before the roll: <strong>${MISS_LINE}</strong>`);
    expect(pc.system.health.value).toBe(3);
    expect(moveNarration().userText).toContain('This is a miss: deliver the miss as stated');
    expect(promptOf(moveNarration())).toContain(`Pay the Price: ${MISS_LINE}`);
  });

  for (const moveId of ['battle', 'clash']) {
    it(`a ${moveId} WEAK HIT pays the table's price — not the line shown as "On a miss"`, async () => {
      const card = await fight(moveId, WEAK);
      expect(flags(card._id).awaitingUpgrade, 'not held: the price is paid at the roll (setup)').toBeUndefined();
      expect(lastLog().outcome).toBe('weak_hit');
      expect(priceCards(), 'the weak hit pays a price (setup)').toHaveLength(1);
      // The table is rolled for it, and its card shows that roll.
      expect(control.ptpRolls).toBe(1);
      expect(ptpCard().content).not.toContain(MISS_LINE);
      expect(ptpCard().content).not.toContain('As stated before the roll');
      expect(ptpCard().content).toContain('d100 = <strong>85</strong> · You are stressed');
      // The miss's Endure Harm (-2) does not land; the table's Endure Stress (-1) does.
      expect(pc.system.health.value).toBe(5);
      expect(pc.system.spirit.value).toBe(4);
      // The narration is told to deliver the hit, and is not seeded with the miss as its price.
      expect(moveNarration().userText).toContain('This is a weak hit: deliver the hit as stated');
      expect(promptOf(moveNarration())).not.toContain(`Pay the Price: ${MISS_LINE}`);
      expect(promptOf(moveNarration())).toContain('Pay the Price: You are stressed');
    });
  }
});

describe('issue #362 AC01 — a held miss, kept or burned to a weak hit', () => {
  // Battle: iron 1, challenge 4 and 8, die 1 — a miss; momentum 6 beats one die: a weak hit, which pays the price too.
  const HELD_MISS = [0.35, 0.75, 0.0];
  async function heldBattleMiss() {
    pc.system.momentum.value = 6;
    pc.system.iron = 1;
    const card = await fight('battle', HELD_MISS, { statUsed: 'iron', line: 'Kira throws herself into the fight.' });
    expect(flags(card._id).awaitingUpgrade, 'the miss is held (setup)').toMatchObject({ open: true, heldPrice: { stated: { price: MISS_LINE } } });
    expect(priceCards()).toEqual([]);
    return card;
  }

  it('control: kept, the held miss pays the stated miss', async () => {
    const card = await heldBattleMiss();
    await table.client('pl-1').click(card._id, KEEP);
    await table.settle(); await table.drain();
    expect(lastLog().outcome).toBe('miss');
    expect(control.ptpRolls).toBe(0);
    expect(ptpCard().content).toContain(`As stated before the roll: <strong>${MISS_LINE}</strong>`);
    expect(pc.system.health.value).toBe(3);
  });

  it('burned to a weak hit that pays a price, it pays the table\'s — the weak hit\'s — not the stated miss', async () => {
    const card = await heldBattleMiss();
    await table.client('pl-1').click(card._id, BURN);
    await table.settle(); await table.drain();
    expect(lastLog().outcome).toBe('weak_hit');
    expect(priceCards()).toHaveLength(1);
    expect(control.ptpRolls).toBe(1);
    expect(ptpCard().content).not.toContain(MISS_LINE);
    expect(ptpCard().content).toContain('d100 = <strong>85</strong> · You are stressed');
    expect(pc.system.health.value).toBe(5);
    expect(pc.system.spirit.value).toBe(4);
    const call = moveNarration();
    expect(call.userText).toContain('This is a weak hit: deliver the hit as stated');
    expect(promptOf(call)).not.toContain(`Pay the Price: ${MISS_LINE}`);
    expect(promptOf(call)).toContain('Pay the Price: You are stressed');
  });
});

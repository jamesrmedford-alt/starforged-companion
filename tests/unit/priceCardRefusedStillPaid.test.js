/**
 * STARFORGED COMPANION
 * tests/unit/priceCardRefusedStillPaid.test.js
 *
 * Issue #362 D12 (decided A, maintainer 2026-11-17): a Pay the Price — and a
 * Take Decisive Action weak hit's cost — is paid even when the world refuses
 * its card, as payChosenPrice's is ("the price is paid all the same"). A
 * refused card used to drop the whole price before anything ran: its suffer
 * routes, the countdown clocks and the narration's seed — and with the
 * result held, keeping it had already closed the wait, so nothing could pay
 * it later. The GM whose client paid it is told the card was not saved.
 *
 * End to end on a booted table: a player's line through the GM's real move
 * pipeline, the interpretation, the dice and the tables scripted at their
 * boundaries (as tests/unit/payThePriceRoutes.test.js runs it).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [78] }));
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
// Pay the Price answers control.ptp; Take Decisive Action's cost table one entry
// that routes "make a suffer move (-2)".
vi.mock('../../src/oracles/roller.js', async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] === 'decisive_action_cost') {
      return { roll: 12, result: 'You are separated from your allies', sufferRoutes: [{ move: 'any', amount: 2 }],
        tableName: 'Take Decisive Action — Weak Hit Cost' };
    }
    if (args[0] !== 'pay_the_price') return real.rollOracle(...args);
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, failWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — wits 2 misses
const KEEP = '[data-action="sf-keep-result"]';

let table, pc;
const priceCards = () => table.cards(f => f.payThePriceCard);
const costCards  = () => table.cards(f => f.decisiveActionCostCard);
const pickers    = () => table.cards(f => f.sufferCard && f.sufferPrompt && !f.suffer);
const breach     = () => (table.world.campaignState()?.clocks ?? []).find(c => c._id === 'clk-breach');
const moveNarration = () => table.claude.calls.filter(c => /MOVE OUTCOME|Narrate the consequence/.test(`${c.system}\n${c.userText}`)).at(-1);
const promptOf = (call) => `${call?.system ?? ''}\n${call?.userText ?? ''}`;
const gmWarnings = () => table.client('gm-1').notifications.filter(n => n.level === 'warn').map(n => n.message);
const cardPost = (flag) => (w) => w.kind === 'message.create' && w.data?.flags?.[MODULE_ID]?.[flag] === true;

/** The "Starforged Progress Tracks" journal: a document-level flag store, as progressTracks.js writes it. */
function makeTracksJournal() {
  const flags = {};
  return {
    id:      'tracks-journal',
    name:    'Starforged Progress Tracks',
    getFlag: (mod, key) => flags[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { flags[`${mod}.${key}`] = JSON.parse(JSON.stringify(value)); },
  };
}

async function roll(moveId, { statUsed = 'wits', dice = MISS, extra = {} } = {}) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: 'test', mischiefApplied: false, ...extra };
  control.dice = dice;
  await table.client('pl-1').chat(`I attempt ${moveId}.`, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = [78];   // Pay the Price 78: You are harmed — Endure Harm (-1)
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'd12-s1', sessionNumber: 1,
      currentSceneId: 'd12-scene', sceneTruths: [],
      clocks: [{ _id: 'clk-breach', name: 'Reactor Breach', type: 'tension', segments: 6, filled: 1, active: true, triggered: false }] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  // Momentum 2: the miss cannot be burned — nothing is held, the price is paid at the roll.
  pc = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2 } } });
  table.journal._set(makeTracksJournal());
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe('issue #362 D12 — a Pay the Price is paid even when its card cannot be posted', () => {
  it('control: the card posts, and the price is paid — its route, the clocks, the narration\'s seed', async () => {
    await roll('face_danger');
    expect(priceCards()).toHaveLength(1);
    expect(pc.system.health.value).toBe(4);
    expect(breach().filled).toBe(2);
    expect(promptOf(moveNarration())).toContain('Pay the Price: You are harmed');
    expect(gmWarnings()).toEqual([]);
  });

  it('a refused card: the route lands, the clocks turn, the narration is seeded with it — and the GM is told', async () => {
    const refused = failWrites(table, cardPost('payThePriceCard'));
    await roll('face_danger');
    expect(refused.refused, 'the card was refused (setup)').toBe(1);
    expect(priceCards()).toEqual([]);
    expect(pc.system.health.value, 'the route landed').toBe(4);
    expect(breach().filled, 'the clocks turned').toBe(2);
    expect(promptOf(moveNarration()), 'the narration depicts the price').toContain('Pay the Price: You are harmed');
    expect(gmWarnings().some(m => /did not save the Pay the Price card/.test(m) && /paid all the same/.test(m))).toBe(true);
  });

  it('a held miss kept with its card refused: the price the wait held is paid all the same', async () => {
    pc.system.momentum.value = 9;   // a miss against 6 and 7 can be burned: the result is held
    const card = await roll('face_danger');
    expect(table.world.message(card._id).flags[MODULE_ID].awaitingUpgrade, 'held (setup)').toMatchObject({ open: true });
    const refused = failWrites(table, cardPost('payThePriceCard'));
    await table.client('pl-1').click(card._id, KEEP);
    await table.settle(); await table.drain();
    expect(refused.refused).toBe(1);
    expect(table.world.message(card._id).flags[MODULE_ID].awaitingUpgrade.open, 'the wait closed (setup)').toBe(false);
    expect(pc.system.health.value).toBe(4);
    expect(breach().filled).toBe(2);
    expect(promptOf(moveNarration())).toContain('Pay the Price: You are harmed');
  });

  it('a Take Decisive Action weak hit\'s cost card refused: its suffer move is still owed, and the narration is seeded with it', async () => {
    const gm = table.client('gm-1');
    const store = await gm.import('../../src/ui/progressTracks.js');
    await gm.run(async () => {
      const t = await store.addProgressTrack({ label: 'Boarders', type: 'combat', rank: 'dangerous' });
      await store.updateTrackFields(t.id, { ticks: 24, combatState: 'in_control' });
    });
    const refused = failWrites(table, cardPost('decisiveActionCostCard'));
    // Score 6 (24 ticks) against challenge dice 3 and 9 — a weak hit.
    await roll('take_decisive_action', { statUsed: null, dice: [0.25, 0.85],
      extra: { moveName: 'Take Decisive Action', isProgressMove: true, moveTarget: 'Boarders' } });
    expect(refused.refused, 'the cost card was refused (setup)').toBe(1);
    expect(costCards()).toEqual([]);
    expect(pickers().map(c => c.flags[MODULE_ID].sufferPrompt), 'the cost\'s "make a suffer move (-2)"')
      .toEqual([expect.objectContaining({ kind: 'any', amount: 2 })]);
    expect(promptOf(moveNarration())).toContain('You are separated from your allies');
    expect(gmWarnings().some(m => /did not save the Decisive Action — Cost card/.test(m))).toBe(true);
  });
});

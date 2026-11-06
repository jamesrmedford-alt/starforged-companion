/**
 * SWP-1 ORACLE-MEMORY-LOST-TO-NEXT-WRITE — the move pipeline's own price
 * (eleventh audit, sweep). See ptpOracleMemoryLostToClockWrite.probe.js for
 * the `!ptp` and oracle follow-up pairs; this is the commonest one.
 *
 * Kira's Face Danger misses; its Pay the Price lands a price with no suffer
 * route (d100 = 1, "A trusted individual or community acts against you")
 * while a tension clock runs. postMovePayThePriceCard posts the card — whose
 * `oracleMemory` the canonical GM's capture hook writes into `recentOracles`
 * as a whole-object campaignState write, not waited for — and goes straight
 * on (no route: no actor write between) to advanceClocksOnPayThePrice, whose
 * clock write is a whole-object copy of the cache built before the capture's
 * write came back. Applied second, it erases the price from RECENT ORACLE
 * RESULTS; persistResolution keeps `recentOracles` store-owned, so the move's
 * record never restores it.
 *
 * The server round trip is modelled with interceptWrites (SESS-1's model):
 * every campaignState write is held and applied in the order it was sent.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: 1 }));
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
    const rng = vi.spyOn(Math, 'random').mockReturnValueOnce((control.ptp - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const CS_KEY = `${MODULE_ID}.campaignState`;
const PRICE = 'A trusted individual or community acts against you';
// challenge 6, 7; action die 1 — iron 3 + 1 misses.
const MISS = [0.55, 0.65, 0.1];

let table, pc;
const world = () => table.world.campaignState();
const remembered = () => (world().recentOracles ?? []).filter(o => o.name === 'Pay the Price').map(o => o.answer);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

async function resetTable(clocks) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'swp1-s1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(),
      currentSceneId: 'swp1-scene', sceneTruths: [], clocks, recentOracles: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  pc = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2 } } });
  scriptClaude(table, { fallback: () => 'The breach seals behind Kira.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
}

/** The server: campaignState writes held, applied in the order sent, until none is left. */
function serverOrder() {
  const sent = [];
  table.interceptWrites((w) => {
    if (w.kind !== 'setting' || w.key !== CS_KEY) return undefined;
    let release;
    const held = new Promise(r => { release = r; });
    sent.push({ value: w.value, release });
    return held;
  });
  return {
    sent,
    async applyAll() {
      for (let i = 0; i < 80; i++) {
        const batch = sent.filter(s => !s.applied);
        if (!batch.length) { await table.settle(); if (!sent.some(s => !s.applied)) break; continue; }
        for (const s of batch) { s.applied = true; s.release(); }
        await table.settle();
      }
    },
  };
}

async function faceDangerMiss() {
  control.interpretation = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'probe', mischiefApplied: false };
  control.dice = MISS;
  await table.client('pl-1').chat('Kira dives for the breach controls.', { speaker: { actor: pc.id } });
  await table.settle();
}

const TENSION = { _id: 'clk-raid', name: 'The raiders close in', type: 'tension', segments: 6, filled: 2, active: true };

describe("SWP-1 — a move's own Pay the Price keeps its oracle memory when the clocks advance", () => {
  it("Kira's miss: the price (no suffer route) stays in RECENT ORACLE RESULTS after the clock write", async () => {
    await resetTable([{ ...TENSION }]);
    const server = serverOrder();
    await faceDangerMiss();
    await server.applyAll();
    await table.drain();

    const card = table.cards(f => f.payThePriceCard).at(-1);
    expect(card?.flags?.[MODULE_ID]?.sufferRoutes ?? null).toEqual([]);   // no route
    expect(world().clocks[0].filled).toBe(3);                              // the clock advanced
    expect(world().pendingMove).toBe(false);                               // the move finished
    expect(remembered()).toEqual([PRICE]);                                 // and the price is remembered
  }, 30_000);

  it('control: with no tension clock, the same miss remembers its price', async () => {
    await resetTable([]);
    const server = serverOrder();
    await faceDangerMiss();
    await server.applyAll();
    await table.drain();
    expect(world().pendingMove).toBe(false);
    expect(remembered()).toEqual([PRICE]);
  }, 30_000);
});

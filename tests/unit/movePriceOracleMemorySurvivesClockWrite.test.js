/**
 * STARFORGED COMPANION
 * tests/unit/movePriceOracleMemorySurvivesClockWrite.test.js
 *
 * Issue #342 Z17 ORACLE-MEMORY-LOST-TO-NEXT-WRITE — the move pipeline's own
 * price (the sweep auditor's SWP-1 probe; oracleMemorySurvivesClockAndSceneWrites
 * has the `!ptp` and oracle follow-up pairs).
 *
 * Kira's Face Danger misses; its Pay the Price lands a price with no suffer
 * route (d100 = 1, "A trusted individual or community acts against you")
 * while a tension clock runs. postMovePayThePriceCard posts the card — whose
 * `oracleMemory` the canonical GM's capture hook writes into `recentOracles`
 * as a whole-object campaignState write, not waited for — and goes straight
 * on (no route: no actor write between) to advanceClocksOnPayThePrice, whose
 * clock write was a whole-object copy of the cache built before the capture's
 * write came back. Applied second, it erased the price from RECENT ORACLE
 * RESULTS; persistResolution keeps `recentOracles` store-owned, so the move's
 * record never restored it. Both writers now share the client's campaignState
 * write chain.
 *
 * The server round trip is modelled with interceptWrites: every write — a
 * setting, a card, an actor update — is held and applied in the order it was
 * sent (Foundry's socket order), and a Claude call answers only once every
 * write sent before it has landed. With no tension clock (the control) that
 * model gives the price back; only the clock write between lost it.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: 1 }));
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
    const rng = vi.spyOn(Math, 'random').mockReturnValueOnce((control.ptp - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

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

/**
 * The server, first in first out: EVERY write — a setting, a chat card, an
 * actor update — is held and applied in the order it was sent, so a write
 * lands before anything sent after it (Foundry's socket order). A Claude call
 * answers only once every write sent before it has landed (it takes seconds;
 * a Foundry round trip does not).
 */
function serverOrder() {
  const sent = [];
  table.interceptWrites((w) => {
    let release, landed;
    const held = new Promise(r => { release = r; });
    const done = new Promise(r => { landed = r; });
    sent.push({ kind: w.kind, key: w.key, value: w.value, release: () => { release(); landed(); }, done });
    return held;
  });
  table.claude.respond(async (call) => {
    await Promise.all(sent.map(s => s.done));
    return /SIDECAR|NARRATOR ROLE/.test(call?.system ?? '')
      ? 'The breach seals behind Kira.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'
      : '{}';
  });
  return {
    sent,
    async applyAll() {
      for (let i = 0; i < 200; i++) {
        const batch = sent.filter(s => !s.applied);
        if (!batch.length) {
          await table.settle();
          if (!sent.some(s => !s.applied)) break;
          continue;
        }
        for (const s of batch) { s.applied = true; s.release(); }
        await table.settle();
      }
    },
  };
}

/** Kira's player types the line; the server applies everything, in order, until the move is done. */
async function faceDangerMiss(server) {
  control.interpretation = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'probe', mischiefApplied: false };
  control.dice = MISS;
  // The line's own create is a held write: let the server run while it waits.
  const typed = table.client('pl-1').chat('Kira dives for the breach controls.', { speaker: { actor: pc.id } });
  await server.applyAll();
  await typed;
  await server.applyAll();
  await table.drain();
  await server.applyAll();
}

const TENSION = { _id: 'clk-raid', name: 'The raiders close in', type: 'tension', segments: 6, filled: 2, active: true };

describe("Z17 — a move's own Pay the Price keeps its oracle memory when the clocks advance", () => {
  it("Kira's miss: the price (no suffer route) stays in RECENT ORACLE RESULTS after the clock write", async () => {
    await resetTable([{ ...TENSION }]);
    const server = serverOrder();
    await faceDangerMiss(server);

    const card = table.cards(f => f.payThePriceCard).at(-1);
    expect(card?.flags?.[MODULE_ID]?.sufferRoutes ?? null).toEqual([]);   // no route
    expect(world().clocks[0].filled).toBe(3);                              // the clock advanced
    expect(world().pendingMove).toBe(false);                               // the move finished
    expect(remembered()).toEqual([PRICE]);                                 // and the price is remembered
  }, 30_000);

  it('control: with no tension clock, the same miss remembers its price', async () => {
    await resetTable([]);
    const server = serverOrder();
    await faceDangerMiss(server);
    expect(world().pendingMove).toBe(false);
    expect(remembered()).toEqual([PRICE]);
  }, 30_000);
});

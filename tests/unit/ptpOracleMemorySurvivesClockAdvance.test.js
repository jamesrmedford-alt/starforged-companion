/**
 * STARFORGED COMPANION
 * tests/unit/ptpOracleMemorySurvivesClockAdvance.test.js
 *
 * Issue #342 Z17 ORACLE-MEMORY-LOST-TO-NEXT-WRITE (the session auditor's
 * SESS-6 probe — the GM's own and a player's `!ptp`).
 *
 * A Pay the Price — typed `!ptp`, or a move's miss (postMovePayThePriceCard)
 * — posts its card carrying `oracleMemory`, and then advances the countdown
 * clocks. On the canonical GM the card's createChatMessage queues the oracle
 * capture (index.js registerOracleMemoryCaptureHook → captureOracleResult):
 * `{ ...cached, recentOracles: [...] }` — a whole campaignState, sent. A
 * narrative price has no suffer route to await, so the clock advance follows
 * at once (advanceTensionClocksForPayThePrice): `deepClone(readState())` plus
 * the fill — a whole campaignState built from the cache, which the capture's
 * write had not reached yet (Foundry's cached setting changes only on the
 * server's answer). The server applied the capture, then the advance: the
 * price's result was gone from RECENT ORACLE RESULTS. Each writer had its own
 * queue (X44's for captures, W53's for clocks); both now run on the client's
 * one campaignState write chain, so the advance reads the store after the
 * capture has landed.
 *
 * The harness applies writes synchronously; the server round trip is
 * modelled by holding every campaignState write and applying them in the
 * order they were sent.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ ptpRoll: null }));
vi.mock('../../src/oracles/roller.js', async (orig) => {
  const original = await orig();
  return {
    ...original,
    rollOracle: vi.fn((id, opts = {}) => original.rollOracle(id,
      id === 'pay_the_price' && control.ptpRoll ? { ...opts, roll: control.ptpRoll } : opts)),
  };
});
vi.mock('../../src/narration/narrator.js', async (orig) => ({
  ...(await orig()),
  narrateClockAdvancement: vi.fn(async () => null),
  narrateOracleFollowup:   vi.fn(async () => null),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const CS_KEY = `${MODULE_ID}.campaignState`;
const NARRATIVE = 20;   // "A surprising development complicates your quest" — no suffer route
const HARMED    = 78;   // "You are harmed" — an Endure Harm route, awaited before the clocks

let table;
const world = () => table.world.campaignState();
const ptpMemories = () => (world().recentOracles ?? []).filter(o => o.name === 'Pay the Price');

function campaignState(clocks) {
  return {
    ...CampaignStateSchema, sessionActive: true, currentSessionId: 'po-s1', sessionStartedId: 'po-s1', sessionNumber: 1,
    lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [], recentOracles: [], clocks,
  };
}
const BREACH = [{ _id: 't1', name: 'Hull breach', type: 'tension', segments: 6, filled: 1, active: true }];

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

async function resetWith(clocks) {
  control.ptpRoll = NARRATIVE;
  await table.reset({ world: { settings: { chronicleAutoEntry: false, narratorSessionSummary: false, campaignState: campaignState(clocks) } } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
}

/**
 * Every campaignState write and Actor update held, then applied in the order
 * sent (the server's order — an Actor update's answer comes back after the
 * writes sent before it).
 */
function serverOrder() {
  const sent = [];
  table.interceptWrites((w) => {
    if (!(w.kind === 'setting' && w.key === CS_KEY) && w.kind !== 'actor.update') return undefined;
    let release;
    const held = new Promise(r => { release = r; });
    sent.push({ client: w.client, value: w.value, release });
    return held;
  });
  return {
    sent,
    async applyAll() {
      for (let i = 0; i < 50; i++) {
        const batch = sent.filter(s => !s.applied);
        if (!batch.length) break;
        for (const s of batch) { s.applied = true; s.release(); }
        await table.settle();
      }
    },
  };
}

async function typePtp(who) {
  const server = serverOrder();
  const typing = table.client(who).chat('!ptp', { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await server.applyAll();
  await typing;
  await table.settle();
  await server.applyAll();
  // The campaignState writes as the GM sent them.
  return server.sent.filter(s => s.value?.clocks).map(s => ({ oracles: (s.value.recentOracles ?? []).length, filled: s.value.clocks?.[0]?.filled ?? null }));
}

describe('Z17 — a narrative Pay the Price with a tension clock running', () => {
  beforeEach(() => resetWith(BREACH));

  it.each(['gm-1', 'pl-1'])("%s's !ptp: the price reaches RECENT ORACLE RESULTS and the clock advances", async (who) => {
    const order = await typePtp(who);
    expect(world().clocks[0].filled).toBe(2);
    expect(ptpMemories()).toHaveLength(1);
    // The capture, then the advance — read once the capture had landed.
    expect(order).toEqual([{ oracles: 1, filled: 1 }, { oracles: 1, filled: 2 }]);
  }, 30_000);
});

describe('Z17 controls', () => {
  it('control: no tension clock — the price reaches RECENT ORACLE RESULTS', async () => {
    await resetWith([]);
    await typePtp('gm-1');
    expect(ptpMemories()).toHaveLength(1);
  }, 30_000);

  it('control: a routed price ("You are harmed") — its suffer writes land between, and both stand', async () => {
    await resetWith(BREACH);
    control.ptpRoll = HARMED;
    await typePtp('gm-1');
    expect(world().clocks[0].filled).toBe(2);
    expect(ptpMemories()).toHaveLength(1);
  }, 30_000);
});

/**
 * SWP — PTP-ORACLE-MEMORY-LOST-TO-CLOCK-WRITE (eleventh audit, sweep).
 *
 * A Pay the Price posts its card with an `oracleMemory` flag; the canonical
 * GM's capture hook (registerOracleMemoryCaptureHook → captureOracleResult,
 * src/index.js) writes the WHOLE campaignState — `{ ...cached, recentOracles }`.
 * Right after the card, the same client advances the tension clocks
 * (`payThePrice.advanceClocks` → advanceTensionClocksForPayThePrice,
 * src/clocks/clocks.js), which also writes the WHOLE campaignState — a copy of
 * the cache with the clocks advanced. Each writer is serialised only against
 * its own kind (X44's `_oracleMemoryWrites`, W53's `serialiseClockWrite`);
 * across the two, the clock write is built from the cache before the capture's
 * write has come back (no I/O between: the GM's own `!ptp`, or a move's price
 * with no suffer route, goes straight from the card to the clocks), so it
 * carries the old `recentOracles` and, reaching the server second, erases the
 * price from RECENT ORACLE RESULTS. persistResolution keeps `recentOracles`
 * store-owned, so a move's record never puts it back.
 *
 * The harness applies a world-setting write synchronously, so the server
 * round trip is modelled with interceptWrites: every campaignState write is
 * held and applied in the order it was sent (as SESS-1's probe does).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const CS_KEY = `${MODULE_ID}.campaignState`;

let table;
const world = () => table.world.campaignState();

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

function stateWith(clocks) {
  return {
    ...CampaignStateSchema, sessionActive: true, currentSessionId: 'ptp-s1', sessionNumber: 2,
    // Fresh, so the chat-activity stamp (SESS-1) writes nothing here.
    lastSessionTimestamp: new Date().toISOString(),
    currentSceneId: null, sceneTruths: [], recentOracles: [], clocks,
  };
}

const TENSION = { _id: 'clk-raid', name: 'The raiders close in', type: 'tension', segments: 6, filled: 2, active: true };

async function resetTable(clocks) {
  await table.reset({ world: { settings: {
    narratorSessionSummary: false, chronicleAutoEntry: false, sessionLogAutoWrite: false,
    campaignState: stateWith(clocks),
  } } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { health: { value: 5, max: 5 } } });
}

/** The server: every campaignState write is held, then applied in the order sent. */
function serverOrder() {
  const sent = [];
  table.interceptWrites((w) => {
    if (w.kind !== 'setting' || w.key !== CS_KEY) return undefined;
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

/** The GM types `!ptp`, the d100 scripted to 1 — "A trusted individual or community acts against you" (no suffer route). */
async function gmPaysThePrice() {
  const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.0);
  try {
    await table.client('gm-1').chat('!ptp');
    await table.settle();
  } finally {
    dice.mockRestore();
  }
}

const remembered = () => (world().recentOracles ?? []).map(e => e.answer ?? e.result ?? e.question);
const PRICE = 'A trusted individual or community acts against you';

describe('SWP — a Pay the Price that advances a clock keeps its oracle memory', () => {
  beforeEach(async () => { await resetTable([{ ...TENSION }]); });

  it("the GM's !ptp: the price stays in RECENT ORACLE RESULTS after the clock advance's write", async () => {
    const server = serverOrder();
    await gmPaysThePrice();

    const card = table.cards(f => f.payThePriceCard).at(-1);
    expect(card?.flags?.[MODULE_ID]?.sufferRoutes ?? []).toEqual([]);   // no suffer route: nothing between the card and the clocks
    // Sanity — the two writes the race is made of: the capture's (with the
    // price), then the clocks' (the clock advanced, the ring as the cache had it).
    expect(server.sent.map(s => s.client)).toEqual(['gm-1', 'gm-1']);
    expect(server.sent[0].value.recentOracles.map(e => e.answer)).toEqual([PRICE]);
    expect(server.sent[1].value.clocks[0].filled).toBe(3);

    await server.applyAll();
    expect(world().clocks[0].filled).toBe(3);   // the clock advanced
    // The price must still be remembered (it is erased by the clock write: [] ).
    expect(remembered()).toEqual([PRICE]);
  }, 30_000);

  it('control: with no tension clock to advance, the price is remembered', async () => {
    await resetTable([]);
    const server = serverOrder();
    await gmPaysThePrice();
    expect(server.sent).toHaveLength(1);
    await server.applyAll();
    expect(remembered()).toEqual([PRICE]);
  }, 30_000);

  it('control: when the capture lands before the clocks are read (no round trip modelled), both stand', async () => {
    await gmPaysThePrice();
    await table.drain();
    expect(world().clocks[0].filled).toBe(3);
    expect(remembered()).toEqual([PRICE]);
  }, 30_000);
});

describe("SWP — the same race inside an oracle's follow-up: its scene start's write", () => {
  let script;
  beforeEach(async () => {
    await resetTable([]);   // no clock: only the follow-up writes after the capture
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    script = scriptClaude(table);
  });

  /** The GM asks the oracle; the d100 lands on YES at "likely". */
  async function gmAsks() {
    const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.1);   // d100 = 11
    try {
      await table.client('gm-1').chat('!oracle yes likely is the hatch sealed');
      await table.settle();
    } finally {
      dice.mockRestore();
    }
  }
  const questions = () => (world().recentOracles ?? []).map(e => e.question);

  /**
   * The follow-up's Claude call takes far longer than a Foundry round trip:
   * every write sent before it is applied (in order) before its reply.
   */
  const holdNarration = () => script.hold(c => /SIDECAR|NARRATOR ROLE/.test(c?.system ?? ''));
  async function narrateAfterWritesLand(server, call) {
    await server.applyAll();          // what was sent before the call, in order
    await call.arrived;
    await server.applyAll();
    call.release();
    await table.settle();
    await server.applyAll();
    await table.drain();
  }

  it("the oracle's answer stays in RECENT ORACLE RESULTS after the follow-up opens its scene", async () => {
    const server = serverOrder();
    const call = holdNarration();
    await gmAsks();
    // Sanity: the capture's write (with the answer) went first, the scene
    // start's — built from the cache before it came back — second, both before
    // the narration's Claude call.
    expect(server.sent).toHaveLength(2);
    expect(server.sent[0].value.recentOracles.map(e => e.question)).toEqual(['is the hatch sealed']);
    expect(server.sent[1].value.currentSceneId).toBeTruthy();
    expect(server.sent[1].value.recentOracles ?? []).toEqual([]);

    await narrateAfterWritesLand(server, call);
    expect(world().currentSceneId).toBeTruthy();                // the scene opened
    expect(questions()).toEqual(['is the hatch sealed']);       // and the answer is remembered
  }, 30_000);

  it('control: with a scene already open (no scene-start write), the answer is remembered', async () => {
    table.world.setSetting('campaignState', { ...world(), currentSceneId: 'sc-open', sceneTruths: [] });
    const server = serverOrder();
    const call = holdNarration();
    await gmAsks();
    expect(server.sent).toHaveLength(1);                        // the capture alone before the call
    await narrateAfterWritesLand(server, call);
    expect(questions()).toEqual(['is the hatch sealed']);
  }, 30_000);
});

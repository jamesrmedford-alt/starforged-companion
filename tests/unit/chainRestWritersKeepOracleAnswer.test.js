/**
 * STARFORGED COMPANION
 * tests/unit/chainRestWritersKeepOracleAnswer.test.js
 *
 * CAMPSTATE-CHAIN-REST (found while fixing the issue #342 open items) — the
 * campaignState read-and-set writers still off the client's write chain
 * after CAMPSTATE-CHAIN-PARTIAL. Each read the cache and wrote it back whole;
 * sent while the GM's oracle capture was on its way, it erased the answer.
 * Two of them, end to end — `!sector <name>` and `!pace hot` typed by the GM
 * while the answer's write is in flight; tests/unit/campaignStateChainSweep.test.js
 * checks every writer statically.
 *
 * The harness applies a write at once, so the GM's campaignState writes are
 * held and released in the order the client sent them (the server applies
 * them in that order) — the round trip the harness does not model.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { campaignStateWrite, deferred, scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
let gm;
let gates = [];
const world = () => table.world.campaignState();
const questions = () => (world().recentOracles ?? []).map(e => e.question);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  gm = table.client('gm-1');
}, 30_000);
afterAll(() => table?.teardown());
afterEach(async () => {
  for (const g of gates) g.resolve(undefined);
  gates = [];
  await table.settle(); await table.drain();
});

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [], recentOracles: [],
      sectors: [
        { id: 'sec-maw',   name: "Devil's Maw", regionLabel: 'Terminus' },
        { id: 'sec-reach', name: 'Old Reach',   regionLabel: 'Outlands' },
      ],
      activeSectorId: 'sec-maw',
      pacing: {},
    },
  } } });
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table);
});

/** Hold the GM's campaignState writes (the round trip): each released in the order it was sent. */
function holdGmCampaignStateWrites() {
  const held = [];
  table.interceptWrites((w) => {
    if (!campaignStateWrite('gm-1')(w)) return undefined;
    const gate = deferred();
    gates.push(gate);
    held.push({ value: w.value, gate });
    return gate.promise;
  });
  return held;
}

async function releaseInOrder(held) {
  for (let i = 0; i < held.length; i++) {
    held[i].gate.resolve(undefined);
    await table.settle();
  }
  await table.drain();
}

/** The GM asks the oracle (no key: no follow-up); its answer's write is held. */
async function answerInFlight() {
  const held = holdGmCampaignStateWrites();
  const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.1);   // d100 = 11 — YES at "likely"
  try {
    await gm.chat('!oracle yes likely is the hatch sealed');
    await table.settle();
  } finally {
    dice.mockRestore();
  }
  expect(held[0]?.value?.recentOracles?.map(e => e.question), 'the capture\'s write is in flight').toEqual(['is the hatch sealed']);
  return held;
}

describe('CAMPSTATE-CHAIN-REST — a GM command\'s write while an oracle answer is on its way', () => {
  it('!sector <name>: the switch and the answer both stand', async () => {
    const held = await answerInFlight();
    await gm.chat('!sector Old Reach');
    await table.settle();
    await releaseInOrder(held);
    expect(world().activeSectorId).toBe('sec-reach');
    expect(questions()).toEqual(['is the hatch sealed']);
  }, 30_000);

  it('!pace hot: the override and the answer both stand', async () => {
    const held = await answerInFlight();
    await gm.chat('!pace hot');
    await table.settle();
    await releaseInOrder(held);
    expect(world().pacing?.sceneOverride).toEqual({ modifier: 3, label: 'hot' });
    expect(questions()).toEqual(['is the hatch sealed']);
  }, 30_000);

  it('control: !sector once the answer has landed — both stand', async () => {
    const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.1);
    try {
      await gm.chat('!oracle yes likely is the hatch sealed');
      await table.settle(); await table.drain();
    } finally {
      dice.mockRestore();
    }
    await gm.chat('!sector Old Reach');
    await table.settle(); await table.drain();
    expect(world().activeSectorId).toBe('sec-reach');
    expect(questions()).toEqual(['is the hatch sealed']);
  }, 30_000);
});

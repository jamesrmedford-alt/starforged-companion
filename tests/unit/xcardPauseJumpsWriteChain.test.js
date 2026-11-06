/**
 * STARFORGED COMPANION
 * tests/unit/xcardPauseJumpsWriteChain.test.js
 *
 * CAMPSTATE-CHAIN-PARTIAL (found while fixing issue #342 Z17) — the X-Card's
 * writers.
 *
 * Z17 put the canonical GM's fire-and-forget campaignState writers on one
 * per-client chain (src/multiplayer/campaignStateChain.js): each reads the
 * store only once the write ahead of it has landed. The X-Card's pause stayed
 * off it — it must not wait behind a write that never settles (decisions.md →
 * "X-Card: anyone plays it, a GM resumes it") — and so the chain did not wait
 * for it either: an oracle card the GM captured while the pause was on its
 * way to the server built its write from a cache without the pause, and,
 * applied after it, put `xCardActive: false` back — the scene the player
 * stopped went on. The pause now jumps the chain (runCampaignStateWriteNow):
 * written at once, with every chained write that has not yet read the store
 * waiting for it to land. The resume (clearXCard) and the redirect clear go
 * on the chain.
 *
 * The harness applies a write at once, so the GM's campaignState writes are
 * held and released in the order the client sent them (the server applies
 * them in that order) — the round trip the harness does not model.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { campaignStateWrite, deferred, scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
let gates = [];   // every held write's gate — opened after each test, so none stays pending
const world = () => table.world.campaignState();
const questions = () => (world().recentOracles ?? []).map(e => e.question);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());
afterEach(async () => {
  for (const g of gates) g.resolve(undefined);
  gates = [];
  await table.settle();
});

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-7', sessionNumber: 7, currentSceneId: 'sc-1', sceneTruths: [],
      sceneState: { bySubject: {}, sceneId: 'sc-1' }, lastSessionTimestamp: new Date().toISOString(), recentOracles: [],
    },
  } } });
  // No key: an oracle answer posts no narration follow-up (only its capture writes).
  table.addActor({ id: 'pc-pat',   name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-quinn', name: 'Ren',  ownership: { 'pl-2': 3 } });
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

/** pl-2 asks the oracle; the d100 lands on YES at "likely". Its card is captured on the GM. */
async function renAsks() {
  const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.1);   // d100 = 11
  try {
    await table.client('pl-2').chat('!oracle yes likely is the hatch sealed');
    await table.settle();
  } finally {
    dice.mockRestore();
  }
}

describe('CAMPSTATE-CHAIN-PARTIAL — the X-Card\'s pause and the chained writes behind it', () => {
  it('an oracle card captured while a relayed X-Card\'s pause is on its way does not carry the pause back', async () => {
    const held = holdGmCampaignStateWrites();
    await table.client('pl-1').chat('!x');
    await table.settle();
    expect(held[0]?.value?.xCardActive, 'the pause\'s write is in flight').toBe(true);

    await renAsks();
    expect(table.cards(f => f.oracleMemory)).toHaveLength(1);

    await releaseInOrder(held);
    expect(questions()).toEqual(['is the hatch sealed']);   // the answer is remembered
    expect(world().xCardActive).toBe(true);                 // and the scene stays paused
    expect(world().xCardPlays).toBe(1);
  }, 30_000);

  it('the GM\'s resume, sent while the pause is on its way, lands after it — the pause\'s count stands', async () => {
    const held = holdGmCampaignStateWrites();
    await table.client('pl-1').chat('!x');
    await table.settle();
    expect(held[0]?.value?.xCardActive).toBe(true);

    const safety = await table.client('gm-1').import('../../src/context/safety.js');
    const resumed = table.client('gm-1').run(() => safety.clearXCard());
    await table.settle();
    await releaseInOrder(held);
    expect(await resumed).toBe(true);
    expect(world().xCardActive).toBe(false);   // resumed
    expect(world().xCardPlays).toBe(1);        // the play still counts: a narration in flight stays discarded
  }, 30_000);

  it('the pause does not wait behind a chained write that has not landed — it is sent at once', async () => {
    const held = holdGmCampaignStateWrites();
    await renAsks();
    expect(held[0]?.value?.recentOracles?.map(e => e.question), 'the capture\'s write is in flight').toEqual(['is the hatch sealed']);

    await table.client('pl-1').chat('!x');
    await table.settle();
    // Sent while the capture's write is still unanswered.
    expect(held).toHaveLength(2);
    expect(held[1].value.xCardActive).toBe(true);

    await releaseInOrder(held);
    // (The pause was built without the capture still in flight, and lands
    // after it: the answer it takes back is the price of not waiting.)
    expect(world().xCardActive).toBe(true);
  }, 30_000);

  it('control: the oracle card captured once the pause has landed — both stand', async () => {
    await table.client('pl-1').chat('!x');
    await table.settle(); await table.drain();
    await renAsks();
    await table.drain();
    expect(questions()).toEqual(['is the hatch sealed']);
    expect(world().xCardActive).toBe(true);
  }, 30_000);
});

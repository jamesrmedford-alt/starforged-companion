/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/moveLockClaimAfterOracleCapture.test.js
 *
 * CAMPSTATE-CHAIN-PARTIAL (found while fixing issue #342 Z17) — the free-flow
 * move's lock claim.
 *
 * The free-flow pipeline claimed the move lock by setting it on the cached
 * campaignState in place and writing that object whole. The canonical GM's
 * oracle capture (on the client's campaignState write chain since Z17) writes
 * a copy of the cache with the answer; a line typed while that write was on
 * its way to the server claimed the lock from a cache without the answer and,
 * applied after it, erased the answer from RECENT ORACLE RESULTS. The claim is
 * now the round's claim (claimPendingMoveLock): marked in flight at once and
 * written on the chain, from the store as the write ahead of it left it.
 *
 * The harness applies a write at once, so the GM's campaignState writes are
 * held and released in the order the client sent them (the server applies
 * them in that order) — the round trip the harness does not model.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false })),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { campaignStateWrite, deferred, scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const STRONG = [0.25, 0.35, 0.9];

let table;
let gates = [];
const world = () => table.world.campaignState();
const questions = () => (world().recentOracles ?? []).map(e => e.question);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());
afterEach(async () => {
  for (const g of gates) g.resolve(undefined);
  gates = [];
  await table.settle(); await table.drain();
});

beforeEach(async () => {
  control.dice = [STRONG];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, combatTrackerEnabled: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [], recentOracles: [],
    },
  } } });
  // No Claude key: the oracle answer posts no follow-up, the move a fallback card.
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  scriptClaude(table);
  silenceConsoleErrors();
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

describe('CAMPSTATE-CHAIN-PARTIAL — a free-flow move claims the lock while an oracle answer is on its way', () => {
  it('the move\'s lock claim keeps the answer the capture had just written', async () => {
    const held = holdGmCampaignStateWrites();
    await gmAsks();
    expect(held[0]?.value?.recentOracles?.map(e => e.question), 'the capture\'s write is in flight').toEqual(['is the hatch sealed']);

    await table.client('pl-1').chat('I slip through the vent before the drones turn.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    await releaseInOrder(held);

    // Sanity: the move rolled, and freed its lock.
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-kira')).toHaveLength(1);
    expect(world().pendingMove).toBe(false);
    // The answer is still remembered.
    expect(questions()).toEqual(['is the hatch sealed']);
    // The claim's write was built once the capture's had landed.
    const claim = held.find(h => h.value?.pendingMove === true);
    expect(claim.value.recentOracles.map(e => e.question)).toEqual(['is the hatch sealed']);
  }, 30_000);

  it('control: the line typed once the answer has landed — both stand', async () => {
    await gmAsks();
    await table.drain();
    await table.client('pl-1').chat('I slip through the vent before the drones turn.', { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-kira')).toHaveLength(1);
    expect(questions()).toEqual(['is the hatch sealed']);
  }, 30_000);
});

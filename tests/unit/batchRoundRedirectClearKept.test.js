/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundRedirectClearKept.test.js
 *
 * CAMPSTATE-CHAIN-PARTIAL (found while fixing issue #342 Z17) — the move
 * lock's own paths.
 *
 * After a GM resumes from the X-Card, the first narration carries the X-CARD
 * — REDIRECT block, and the canonical GM clears `xCardRedirect` once that
 * narration's card has posted (narrator.js registerXCardRedirectHook). A
 * Batch Mode round posts its card and, at once, releases the move lock — a
 * whole-object write built from the cache, which had not yet heard the
 * clear's write back (a server round trip): applied after it, the release put
 * the redirect back, deterministically, so every later round's narration was
 * told to redirect away from the X-carded scene again. The lock's claim and
 * release and the redirect clear now run on the client's campaignState write
 * chain, each reading the store once the write ahead of it has landed.
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
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
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
import { scriptClaude, campaignStateWrite, deferred } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const STRONG = [0.25, 0.35, 0.9];
const REDIRECT_BLOCK = /X-CARD — REDIRECT/;

let table;
let gates = [];
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
let seq = 0;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());
afterEach(async () => {
  for (const g of gates) g.resolve(undefined);
  gates = [];
  await table.settle(); await table.drain();
});

beforeEach(async () => {
  control.dice = [STRONG, STRONG];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [],
      // A GM resumed from an X-Card: the next narration is told to redirect.
      xCardActive: false, xCardPlays: 1, xCardRedirect: { sessionId: 'sess-1', at: new Date().toISOString() },
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

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

/** Kira acts and confirms, Ren passes: the round resolves on the canonical GM. */
async function playRound(held = null) {
  const r0 = round();
  await relay('pl-1', 'batch.submit', { roundId: r0.id, text: 'I slip through the vent before the drones turn.', submissionId: `sub-${++seq}` });
  await relay('pl-2', 'batch.pass', { roundId: r0.id });
  const r = round();
  await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
  if (held) await releaseInOrder(held);
  await table.settle(); await table.drain();
}

describe('CAMPSTATE-CHAIN-PARTIAL — a Batch Mode round\'s redirect clear, then its lock release', () => {
  it('the redirect is cleared once the first round after the resume has been narrated with it — and the next round is not told again', async () => {
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();

    const held = holdGmCampaignStateWrites();
    await playRound(held);
    // Sanity: the round was narrated, with the redirect, and its lock is free.
    expect(table.cards(f => f.narratorCard && f.roundId)).toHaveLength(1);
    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].system).toMatch(REDIRECT_BLOCK);
    expect(world().pendingMove).toBe(false);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });

    // The clear stands: the release, read once it had landed, kept it.
    expect(world().xCardRedirect ?? null).toBeNull();

    await playRound(held);
    expect(narrations()).toHaveLength(2);
    expect(narrations()[1].system).not.toMatch(REDIRECT_BLOCK);
  }, 30_000);

  it('control: with every write landing at once, the clear stands', async () => {
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
    await playRound();
    expect(narrations()[0].system).toMatch(REDIRECT_BLOCK);
    expect(world().xCardRedirect ?? null).toBeNull();
  }, 30_000);
});

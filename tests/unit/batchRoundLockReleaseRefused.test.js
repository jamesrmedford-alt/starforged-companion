/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundLockReleaseRefused.test.js
 *
 * Issue #342 Z19 ROUND-LOCK-RELEASE-NO-RETRY (the eleventh audit's BATCH-10
 * and PIPE-3 — one finding, two probes).
 *
 * releasePendingMoveLock returns false when the world refuses the release,
 * so its caller can retry it — the free-flow pipeline does (its early
 * release, then its `finally`: issue #302, #315 S01). The Batch Mode round
 * released its claims through the same function in three `finally` blocks and
 * dropped the result: one refused release after the rolls left
 * `campaignState.pendingMove` held by the canonical GM itself, the round's
 * own narration met the busy lock and waited for a write that would free it
 * — none came — and nobody was told. The round now retries a refused release
 * once; refused again, the GMs are told and the round's next claim takes its
 * own lock back.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

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

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { campaignStateWrite, failWrites, scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const KEY = `${MODULE_ID}.campaignState`;
const NARRATION_MODEL = 'claude-sonnet-5-5';
const REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 3 and 4, action die 6 (+edge 2 = 8): a strong hit.
const STRONG = [0.25, 0.35, 0.9];

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);
let seq = 0;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [],
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

/**
 * Refuse the first `times` campaignState writes from the GM that free the
 * move lock after a claim was seen — the lock's release (a server error, a
 * dropped socket).
 */
function refuseLockReleases(times = 1) {
  let sawClaim = false;
  let refused = 0;
  table.interceptWrites((w) => {
    if (w.kind !== 'setting' || w.key !== KEY || w.client !== 'gm-1') return undefined;
    if (w.value?.pendingMove === true) { sawClaim = true; return undefined; }
    if (sawClaim && refused < times && w.value?.pendingMove === false) {
      refused += 1;
      return new Error('Setting [campaignState] could not be saved: the server refused the write');
    }
    return undefined;
  });
  return { get refused() { return refused; } };
}

/** Kira acts and confirms, Ren passes: the round resolves on the canonical GM. */
async function playRound({ refuse = null } = {}) {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
  control.dice = [STRONG];
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: `sub-${++seq}` });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  const fault = refuse ? refuse() : null;
  const r = round();
  await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
  await table.settle(); await table.drain();
  return fault;
}

describe('Z19 — the move lock\'s release refused during a round', () => {
  it('control: no refusal — narrated once, the lock free, round 2 open', async () => {
    await playRound();
    expect(roundCards()).toHaveLength(1);
    expect(narrations()).toHaveLength(1);
    expect(world().pendingMove).toBe(false);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);

  it('control: free-flow — the pipeline\'s early release refused once is retried by its finally', async () => {
    const fault = refuseLockReleases(1);
    control.dice = [STRONG];
    await table.client('pl-1').chat('I slip through the vent before the drones turn.', { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-kira')).toHaveLength(1);
    expect(fault.refused).toBe(1);
    expect(world().pendingMove).toBe(false);
  }, 30_000);

  it('the release after the rolls is refused once: it is retried, and the round is still narrated (BATCH-10)', async () => {
    const fault = await playRound({ refuse: () => failWrites(table, (w) => campaignStateWrite('gm-1')(w) && w.value?.pendingMove === false, { times: 1 }) });
    expect(fault.refused).toBe(1);
    expect(roundCards(), `round ${round()?.number} ${round()?.phase}; lock held: ${world().pendingMove}`).toHaveLength(1);
  }, 30_000);

  it('one refused release: the round still narrates and the lock is free (PIPE-3)', async () => {
    const fault = await playRound({ refuse: () => refuseLockReleases(1) });
    // Sanity: Kira's move rolled, and exactly one release was refused.
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-kira')).toHaveLength(1);
    expect(fault.refused).toBe(1);
    expect(world().pendingMove).toBe(false);
    expect(narrations()).toHaveLength(1);
  }, 30_000);

  it('the release refused twice: the GMs are told, and the round\'s narration takes its own lock back — narrated once, the lock free', async () => {
    const fault = await playRound({ refuse: () => refuseLockReleases(2) });
    expect(fault.refused).toBe(2);
    const told = table.cards(f => f.batchNotice && f.batchLockNotice).filter(m => (m.whisper ?? []).includes('gm-1'));
    expect(told).toHaveLength(1);
    expect(roundCards()).toHaveLength(1);
    expect(narrations()).toHaveLength(1);
    expect(world().pendingMove).toBe(false);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);
});

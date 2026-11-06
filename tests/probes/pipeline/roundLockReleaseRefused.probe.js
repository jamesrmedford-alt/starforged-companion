/**
 * PIPE-3 ROUND-LOCK-RELEASE-NOT-RETRIED — a Batch Mode round's move-lock
 * release the world refuses is never retried: the lock stays held by the
 * canonical GM, the round never narrates, and every free-flow move is refused
 * "already being resolved" until a GM reloads.
 *
 * releasePendingMoveLock returns false on a refused write so its caller can
 * retry it (issue #302; #315 S01: "a refused early release is still
 * retried" — the free-flow pipeline's `finally` does). The round driver
 * releases through the same path in each `finally` (startResolution,
 * rollRound, narrateTheRound — src/batch/driver.js) and ignores the result.
 * CLAUDE.md: "Concurrency guards and pipeline locks … must be released in a
 * finally … An exception … between claiming and releasing the guard wedges it
 * permanently"; decisions.md, Batch Mode: "The move lock is claimed for the
 * rolls and again for the narration, each released in a finally through the
 * lock's own paths".
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));

vi.mock('../../../src/pacing/router.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
    decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  };
});
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false })),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const KEY = `${MODULE_ID}.campaignState`;
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const STRONG = [0.25, 0.35, 0.9];

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
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
 * Refuse the first campaignState write from the GM that frees the move lock
 * after a claim was seen — the lock's release (a server error, a dropped socket).
 */
function refuseFirstLockRelease() {
  let sawClaim = false;
  let refused = 0;
  table.interceptWrites((w) => {
    if (w.kind !== 'setting' || w.key !== KEY || w.client !== 'gm-1') return undefined;
    if (w.value?.pendingMove === true) { sawClaim = true; return undefined; }
    if (sawClaim && refused === 0 && w.value?.pendingMove === false) {
      refused += 1;
      return new Error('Setting [campaignState] could not be saved: the server refused the write');
    }
    return undefined;
  });
  return { get refused() { return refused; } };
}

describe('PIPE-3 — a refused release of the round\'s move lock is retried, as the free-flow pipeline\'s is', () => {
  it('the round still narrates and the lock is free after one refused release', async () => {
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
    control.dice = [STRONG];
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: `sub-${++seq}` });
    await relay('pl-2', 'batch.pass', { roundId: round().id });

    const fault = refuseFirstLockRelease();
    const r = round();
    await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
    await table.settle(); await table.drain();

    // Sanity: Kira's move rolled, and exactly one release was refused.
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-kira')).toHaveLength(1);
    expect(fault.refused).toBe(1);

    expect(world().pendingMove).toBe(false);
    expect(narrations()).toHaveLength(1);
  }, 30_000);

  it('control: free-flow — the pipeline\'s early release refused once is retried by its finally', async () => {
    const fault = refuseFirstLockRelease();
    control.dice = [STRONG];
    await table.client('pl-1').chat('I slip through the vent before the drones turn.', { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();

    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-kira')).toHaveLength(1);
    expect(fault.refused).toBe(1);
    expect(world().pendingMove).toBe(false);
  }, 30_000);

  it('control: with no refusal the round narrates once and frees the lock', async () => {
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
    control.dice = [STRONG];
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: `sub-${++seq}` });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    const r = round();
    await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
    await table.settle(); await table.drain();
    expect(narrations()).toHaveLength(1);
    expect(world().pendingMove).toBe(false);
  }, 30_000);
});

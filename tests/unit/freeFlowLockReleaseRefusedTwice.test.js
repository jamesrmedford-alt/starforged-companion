/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/freeFlowLockReleaseRefusedTwice.test.js
 *
 * FREE-FLOW-RELEASE-REFUSED-TWICE (found while fixing issue #342 Z19).
 *
 * The free-flow pipeline releases the move lock early, before the asset
 * riders, and its `finally` retries a release the world refused (issue #302,
 * #315 S01). A second refusal was dropped: `campaignState.pendingMove` stayed
 * held by the canonical GM, every later move met "A move is already being
 * resolved" until a reload, and nobody was told. A round's refused release
 * tells the GMs (Z19's releaseRoundLock); so does free-flow's now. A move
 * stopped before the early release (a cancelled confirm, a throw) retries its
 * one release in the `finally` too, before telling.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], confirm: true }));
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
  confirmInterpretation: vi.fn(async () => control.confirm),
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
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const KEY = `${MODULE_ID}.campaignState`;
const REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 3 and 4, action die 6 (+edge 2 = 8): a strong hit.
const STRONG = [0.25, 0.35, 0.9];

let table;
const world = () => table.world.campaignState();
const told = () => table.cards(f => f.moveLockNotReleasedCard);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [STRONG];
  control.confirm = true;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});

/**
 * Refuse the first `times` campaignState writes from the canonical GM that
 * free the move lock after a claim was seen — the lock's release (a server
 * error, a dropped socket).
 */
function refuseLockReleases(times) {
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

async function kiraActs() {
  await table.client('pl-1').chat('I slip through the vent before the drones turn.', { speaker: { actor: 'pc-kira' } });
  await table.settle(); await table.drain();
}

describe('FREE-FLOW-RELEASE-REFUSED-TWICE — a free-flow move whose lock release is refused twice', () => {
  it('control: one refused release — the finally retries it, the lock is free and nobody is told', async () => {
    const fault = refuseLockReleases(1);
    await kiraActs();
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-kira')).toHaveLength(1);
    expect(fault.refused).toBe(1);
    expect(world().pendingMove).toBe(false);
    expect(told()).toHaveLength(0);
  }, 30_000);

  it('the early release and the finally\'s retry both refused: the lock stays held, and the GMs are told — once', async () => {
    const fault = refuseLockReleases(2);
    await kiraActs();
    // Sanity: the move rolled, and both releases were refused.
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-kira')).toHaveLength(1);
    expect(fault.refused).toBe(2);
    expect(world().pendingMove).toBe(true);
    const notices = told();
    expect(notices).toHaveLength(1);
    expect([...notices[0].whisper].sort()).toEqual(['gm-1', 'gm-2']);
    expect(notices[0].content).toMatch(/Move lock not released/);
    expect(notices[0].content).toMatch(/already being resolved/);
  }, 30_000);

  it('a cancelled confirm (no early release): one refused release is retried — the lock free, nobody told', async () => {
    control.confirm = false;
    const fault = refuseLockReleases(1);
    await kiraActs();
    expect(table.cards(f => f.moveResolution)).toHaveLength(0);
    expect(fault.refused).toBe(1);
    expect(world().pendingMove).toBe(false);
    expect(told()).toHaveLength(0);
  }, 30_000);

  it('a cancelled confirm whose release is refused twice: the GMs are told', async () => {
    control.confirm = false;
    const fault = refuseLockReleases(2);
    await kiraActs();
    expect(fault.refused).toBe(2);
    expect(world().pendingMove).toBe(true);
    expect(told()).toHaveLength(1);
  }, 30_000);
});

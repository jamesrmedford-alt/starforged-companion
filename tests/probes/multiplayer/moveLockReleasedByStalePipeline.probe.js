/**
 * PROBE — MP-02 MOVE-LOCK-RELEASED-BY-STALE-PIPELINE (ninth audit, area multiplayer)
 *
 * What the user does: two GMs are connected. The canonical GM (gm-1) is
 * resolving a player's move A — its narration call is out — when gm-1's
 * socket drops for a moment (a flaky connection; Foundry reconnects the same
 * page, the pipeline keeps running). The other GM (gm-2), canonical while
 * gm-1 is away, releases the lock gm-1 held and whispers the GMs (issue #325
 * W25 — correct: the claimant has "left"). gm-1 is back a moment later and
 * canonical again; a player types move B, which gm-1 claims the lock for
 * (`pendingMoveBy: gm-1`) and narrates. Then move A's narration returns.
 *
 * What happens: move A's pipeline finishes and releases "its" lock —
 * `releasePendingMoveLock` (src/index.js:2477–2487) clears `pendingMove`
 * whatever `pendingMoveBy` says and whichever move claimed it; the pipeline
 * calls it on its success path and in its `finally` (src/index.js:1769).
 * Move B's lock is gone while B is still narrating: the next line typed runs
 * a third pipeline beside B — two concurrent persists, duplicate narration
 * cards, the stale-snapshot overwrite the lock exists to prevent.
 *
 * What should happen: decisions.md (issue #325 W25) — "A GM who leaves
 * releases their own lock: the lock records its claimant (pendingMoveBy)".
 * A release must be of the claim the releaser made: a pipeline whose lock was
 * released on its behalf (by W25, by a reload's reset) must not release a
 * lock a later move holds. The lock stays B's until B's own release.
 *
 * Controls: the W25 handover itself — gm-2 releases the departed gm-1's lock
 * and whispers — and gm-1 claiming move B after it is back.
 *
 * (Foundry) the blip semantics — `userConnected(user, false)` then
 * `(user, true)` on a socket drop and reconnect without a page reload — are
 * Foundry's; the harness models them with table.leave / table.join on a
 * booted client (join does not reboot a client that already booted).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
  })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(() => Promise.resolve(true)),
}));

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { deferred } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const world = () => table.world.campaignState();

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', currentSceneId: 'sc-1', sceneTruths: [],
      lastSessionTimestamp: new Date().toISOString(),
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  await table.setClaudeKey('gm-2', 'sk-ant-gus');
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
});

describe('MP-02 a pipeline whose lock was released while its GM was away', () => {
  it('control (W25): the GM who drops mid-move has their lock released by the other GM, who whispers the GMs', async () => {
    silenceConsoleErrors();
    table.claude.respond((call) => (call.model === NARRATION_MODEL ? new Promise(() => {}) : DEFAULT_REPLY));
    await table.client('pl-1').chat('I brace against the hull and push through the breach.', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    expect(world()).toMatchObject({ pendingMove: true, pendingMoveBy: 'gm-1' });
    await table.leave('gm-1');
    expect(world()).toMatchObject({ pendingMove: false, pendingMoveBy: null });
    expect(table.cards(f => f.moveLockReleasedCard)).toHaveLength(1);
  }, 30_000);

  it('does not release the lock a later move holds when its narration finally returns', async () => {
    silenceConsoleErrors();
    // Each narration call is answered only when the test says so.
    const gates = [deferred(), deferred()];
    let narrations = 0;
    table.claude.respond((call) => {
      if (call.model === NARRATION_MODEL) return gates[narrations++]?.promise ?? DEFAULT_REPLY;
      return DEFAULT_REPLY;
    });

    // Move A: gm-1 claims the lock and its narration is out.
    await table.client('pl-1').chat('I brace against the hull and push through the breach.', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    expect(world()).toMatchObject({ pendingMove: true, pendingMoveBy: 'gm-1' });   // control
    expect(narrations).toBe(1);

    // gm-1's socket drops: gm-2, canonical meanwhile, releases the departed GM's lock (W25).
    await table.leave('gm-1');
    expect(world()).toMatchObject({ pendingMove: false, pendingMoveBy: null });     // control: W25
    expect(table.cards(f => f.moveLockReleasedCard)).toHaveLength(1);              // control: the GMs are told

    // gm-1 reconnects — the same page, move A's pipeline still waiting on its
    // narration — and is canonical again. A world write landing after the
    // reconnect brings gm-1's cached campaignState up to date.
    await table.join('gm-1');
    await table.client('gm-2').setSetting('campaignState', { ...world(), lastSessionTimestamp: new Date(Date.now() + 1000).toISOString() });
    await table.settle();

    // Move B: gm-1 claims the lock for it; B's narration is out.
    await table.client('pl-1').chat('I slip through the hatch before it seals.', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    expect(world()).toMatchObject({ pendingMove: true, pendingMoveBy: 'gm-1' });   // control: B holds the lock
    expect(narrations).toBe(2);
    expect(table.cards(f => f.moveResolution)).toHaveLength(2);

    // Move A's narration returns at last: A finishes and "releases its lock".
    gates[0].resolve(DEFAULT_REPLY);
    await table.settle();   // (drain would wait on B's held narration)
    expect(table.cards(f => f.narratorCard && !f.narrationFallback).length).toBeGreaterThanOrEqual(1);   // A narrated

    // B is still narrating, so the lock must still be B's.
    // FAILS today: releasePendingMoveLock clears whichever move's lock is held — pendingMove is false.
    expect(world()).toMatchObject({ pendingMove: true, pendingMoveBy: 'gm-1' });

    gates[1].resolve(DEFAULT_REPLY);
    await table.settle();
    await table.drain();
    expect(world().pendingMove).toBe(false);   // B's own release frees the table
  }, 30_000);
});

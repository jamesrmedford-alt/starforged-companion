/**
 * STARFORGED COMPANION
 * tests/unit/moveLockClaimToken.test.js
 *
 * Issue #329 X08 (MOVE-LOCK-RELEASED-BY-STALE-PIPELINE) — a pipeline whose
 * lock was released while its GM was away does not release a later move's.
 *
 * Two GMs. gm-1 (canonical) is narrating move A when its socket drops for a
 * moment; gm-2, canonical meanwhile, releases gm-1's lock and whispers the
 * GMs (issue #325 W25 — correct). gm-1 reconnects (same page, A's pipeline
 * still waiting on its narration), is canonical again and claims the lock for
 * the player's next move B. When A's narration returned, A's pipeline
 * "released its lock" — releasePendingMoveLock cleared `pendingMove` whoever
 * claimed it — so B lost its lock mid-narration and the next line typed ran
 * a third pipeline beside it. Now each claim stamps a token
 * (`pendingMoveClaim`) and a pipeline releases the lock only while the store
 * still holds its own claim; the W25 handover and the ready reset still clear
 * it without a token — each only a lock whose claimant is gone (the ready
 * reset since issue #335 Y07: readyResetLiveLock.test.js).
 *
 * (Foundry) the blip semantics — `userConnected(user, false)` then
 * `(user, true)` without a reload — are modelled with table.leave / join.
 *
 * (Converted from the ninth audit's probe
 * tests/probes/multiplayer/moveLockReleasedByStalePipeline.probe.js.)
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(() => Promise.resolve(true)),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { deferred } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
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

describe('issue #329 X08 — a pipeline whose lock was released while its GM was away', () => {
  it('control (W25): the GM who drops mid-move has their lock released by the other GM, who whispers the GMs', async () => {
    silenceConsoleErrors();
    const held = deferred();
    table.claude.respond((call) => (call.model === NARRATION_MODEL ? held.promise : DEFAULT_REPLY));
    await table.client('pl-1').chat('I brace against the hull and push through the breach.', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    expect(world()).toMatchObject({ pendingMove: true, pendingMoveBy: 'gm-1' });
    expect(world().pendingMoveClaim).toEqual(expect.any(String));   // the claim's token
    await table.leave('gm-1');
    expect(world()).toMatchObject({ pendingMove: false, pendingMoveBy: null, pendingMoveClaim: null });
    expect(table.cards(f => f.moveLockReleasedCard)).toHaveLength(1);
    // The held narration returns, so its pipeline is not left running into the next test.
    await table.join('gm-1');
    held.resolve(DEFAULT_REPLY);
    await table.settle();
    await table.drain();
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

    // B is still narrating, so the lock is still B's (A's release used to clear it).
    expect(world()).toMatchObject({ pendingMove: true, pendingMoveBy: 'gm-1' });

    gates[1].resolve(DEFAULT_REPLY);
    await table.settle();
    await table.drain();
    expect(world().pendingMove).toBe(false);   // B's own release frees the table
  }, 30_000);

  it('a pipeline releases its own claim; a lock from before claims carried a token is released as before', async () => {
    const { releasePendingMoveLock } = await import('../../src/index.js');
    await table.client('gm-1').setSetting('campaignState', { ...world(), pendingMove: true, pendingMoveBy: 'gm-1', pendingMoveClaim: 'claim-b' });
    await table.settle();
    expect(await table.client('gm-1').run(() => releasePendingMoveLock('claim-a'))).toBe(true);   // not this claim's: untouched
    expect(world()).toMatchObject({ pendingMove: true, pendingMoveClaim: 'claim-b' });
    expect(await table.client('gm-1').run(() => releasePendingMoveLock('claim-b'))).toBe(true);
    expect(world()).toMatchObject({ pendingMove: false, pendingMoveBy: null, pendingMoveClaim: null });

    await table.client('gm-1').setSetting('campaignState', { ...world(), pendingMove: true, pendingMoveBy: 'gm-1', pendingMoveClaim: null });
    await table.settle();
    expect(await table.client('gm-1').run(() => releasePendingMoveLock('claim-a'))).toBe(true);
    expect(world().pendingMove).toBe(false);
  }, 30_000);
});

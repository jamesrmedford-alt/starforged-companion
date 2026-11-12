/* global silenceConsoleErrors */
/**
 * STARFORGED COMPANION
 * tests/unit/moveLockStaleWriteResiduals.test.js
 *
 * The move lock (`campaignState.pendingMove`) against a co-GM's stale write —
 * a campaignState write built from a cache that had not yet seen the lock's
 * latest change, landing after it:
 *
 *   - LOCK-LOST-BY-COGM-STALE-WRITE (the reverse of
 *     LOCK-RESURRECTED-BY-COGM-STALE-WRITE): a write built before a claim
 *     reached the co-GM lands after it with `pendingMove: false`, so a second
 *     pipeline could start beside the first. The claimant now puts its live
 *     claim back: nothing but its own release frees it while its page can act.
 *   - LOCK-RESURRECTED-DEPARTED-CLAIMANT: a write that carries back the claim
 *     of a GM who left, after the W25 handover freed it, had no claimant left
 *     to undo it — the lock held until the next GM load. The canonical GM now
 *     frees, on any campaignState update, a lock whose claimant is gone.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

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

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
afterEach(() => table?.teardown());

const world = () => table.world.campaignState();

async function seat() {
  table = await simulateTable({
    users: [USERS.GM, USERS.GM2, USERS.P1],
    world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false,
      campaignState: {
        ...CampaignStateSchema,
        sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
        lastSessionTimestamp: new Date().toISOString(),
      },
    } },
  });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  await table.setClaudeKey('gm-2', 'sk-ant-gus');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  silenceConsoleErrors();
}

/** gm-2 writes campaignState whole from `snapshot` — its cache as it was before the lock's last change. */
async function staleWriteFromGm2(snapshot, change) {
  await table.client('gm-2').run(() => game.settings.set(MODULE_ID, 'campaignState', { ...snapshot, ...change }));
  await table.settle();
}

const snapshotOf = (userId) => table.client(userId).run(() => structuredClone(game.settings.get(MODULE_ID, 'campaignState')));

describe('LOCK-LOST-BY-COGM-STALE-WRITE — a live claim a stale write freed is put back', () => {
  it("gm-2's write built before gm-1's claim frees the lock mid-move: gm-1 puts its claim back", async () => {
    await seat();
    const narration = scriptClaude(table, { fallback: () => REPLY }).hold(c => c.model === NARRATION_MODEL);
    const before = snapshotOf('gm-2');                     // gm-2's cache before the claim
    await table.client('pl-1').chat('I brace against the hull and push through the breach.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    await narration.arrived;
    const claimed = world();
    expect(claimed).toMatchObject({ pendingMove: true, pendingMoveBy: 'gm-1' });

    await staleWriteFromGm2(before, { loreRecap: 'written from a cache without the claim' });
    await table.settle();
    expect(world(), "gm-1's live claim is back").toMatchObject({
      pendingMove: true, pendingMoveBy: 'gm-1', pendingMoveClaim: claimed.pendingMoveClaim,
    });
    expect(world().loreRecap, "gm-2's own change kept").toBe('written from a cache without the claim');

    narration.release(REPLY);
    await table.settle();
    await table.drain();
    expect(world().pendingMove, "released by gm-1's own pipeline once the move is done").toBe(false);
  }, 30_000);

  it("control: gm-1's own release frees the lock and nothing puts it back", async () => {
    await seat();
    scriptClaude(table, { fallback: () => REPLY });
    await table.client('pl-1').chat('I brace against the hull and push through the breach.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    await table.drain();
    expect(world().pendingMove).toBe(false);
    expect(table.cards(f => f.moveResolution).length).toBeGreaterThan(0);
  }, 30_000);
});

describe('LOCK-RESURRECTED-DEPARTED-CLAIMANT — a departed GM\'s claim carried back is freed again', () => {
  it("gm-1 leaves mid-move, gm-2 frees its lock; a stale write carries gm-1's claim back — gm-2 frees it again", async () => {
    await seat();
    const narration = scriptClaude(table, { fallback: () => REPLY }).hold(c => c.model === NARRATION_MODEL);
    await table.client('pl-1').chat('I brace against the hull and push through the breach.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    await narration.arrived;
    const locked = snapshotOf('gm-2');                     // gm-2's cache holds gm-1's claim
    expect(locked).toMatchObject({ pendingMove: true, pendingMoveBy: 'gm-1' });

    await table.leave('gm-1');                             // W25: gm-2 frees the departed GM's lock
    expect(world().pendingMove).toBe(false);
    expect(table.cards(f => f.moveLockReleasedCard)).toHaveLength(1);

    await staleWriteFromGm2(locked, { loreRecap: 'written from a cache that still held the claim' });
    await table.settle();
    expect(world().pendingMove, 'the carried-back lock is freed').toBe(false);
    expect(world().loreRecap).toBe('written from a cache that still held the claim');
    expect(table.cards(f => f.moveLockReleasedCard), 'no second card').toHaveLength(1);
  }, 30_000);

  it('control: a lock whose claimant is connected is left alone', async () => {
    await seat();
    const narration = scriptClaude(table, { fallback: () => REPLY }).hold(c => c.model === NARRATION_MODEL);
    await table.client('pl-1').chat('I brace against the hull and push through the breach.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    await narration.arrived;
    await table.client('gm-2').run(() => game.settings.set(MODULE_ID, 'campaignState',
      { ...game.settings.get(MODULE_ID, 'campaignState'), loreRecap: 'an unrelated write' }));
    await table.settle();
    expect(world()).toMatchObject({ pendingMove: true, pendingMoveBy: 'gm-1' });
    narration.release(REPLY);
    await table.settle();
    await table.drain();
  }, 30_000);
});

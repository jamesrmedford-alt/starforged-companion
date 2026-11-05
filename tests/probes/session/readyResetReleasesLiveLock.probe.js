/**
 * PROBE — SESSION-02 READY-RESET-RELEASES-LIVE-LOCK (tenth audit, area session)
 *
 * What the user does: a two-GM table. Gus (gm-2) has been running the night
 * alone — he is the canonical GM — and Pat's move is being narrated: gm-2's
 * pipeline holds the move lock (`pendingMove: true, pendingMoveBy: "gm-2"`,
 * its claim token). Gina (gm-1, the lower user id) arrives and loads the
 * world while that narration is in flight.
 *
 * What happens: gm-1 is the canonical GM the moment she is active. Her ready
 * hook sees `pendingMove: true` and resets it as a stale lock — "left set if
 * Foundry was closed mid-move" (src/index.js:7442-7448) — and writes the reset
 * as owned fields (:7460-7462), without checking that the lock's claimant is a
 * connected GM mid-move. The lock gm-2's LIVE pipeline holds is released
 * while its narration is in flight, so the next typed line starts a second
 * pipeline on gm-1 beside it: two narrations, two persists — the concurrency
 * the lock exists to prevent. The lock records its claimant precisely so that
 * "the claimant's departure is the event that matters" (decisions.md, issue
 * #325 W25's rejection of expiring the lock by age; issue #329 X08: a
 * pipeline releases only its own claim); the W25 handover
 * (releaseLockOfDisconnectedGM, :1889-1894) releases only a DEPARTED user's
 * lock. The ready reset ignores the claimant it records, and
 * releasePendingMoveLock's own header says so: "The handover and the ready
 * reset release without a token, unconditionally" (:2613-2614).
 *
 * What should happen: a lock whose claimant is a connected GM stands at
 * another GM's load; the ready reset clears only a lock held by nobody
 * connected (the crash / close case it is for).
 *
 * Control: a lock held by a user who is not connected (a GM who crashed) is
 * released by the next canonical GM's load.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/session/readyResetReleasesLiveLock.probe.js
 */

/* global silenceConsoleErrors */
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (orig) => ({
  ...(await orig()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (orig) => ({
  ...(await orig()), interpretMove: vi.fn(async (text) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: text, inputMethod: 'chat',
  })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (orig) => ({
  ...(await orig()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (orig) => ({
  ...(await orig()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/narration/narrator.js', async (orig) => ({
  ...(await orig()),
  finalizeSessionSummary: vi.fn(async () => {}),
  getCampaignRecap:       vi.fn(async () => ''),
  postCampaignRecap:      vi.fn(async () => ''),
}));

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;
afterEach(() => table?.teardown());

const world = () => table.world.campaignState();
const LINE = 'Kira slips past the sentry and forces the hatch open.';

function liveSession(extra = {}) {
  return {
    ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: new Date().toISOString(),
    currentSessionId: 'rl-s1', sessionStartedId: 'rl-s1', sessionNumber: 1,
    lastSessionTimestamp: new Date().toISOString(), currentSceneId: null, sceneTruths: [], clocks: [],
    ...extra,
  };
}

const SETTINGS = { chronicleAutoEntry: false, narratorSessionSummary: false, autoRecapEnabled: false };

describe('SESSION-02 a second GM\'s world load releases a connected GM\'s live move lock', () => {
  it("gm-2 (canonical, alone) is narrating Pat's move when gm-1 loads: the lock gm-2 holds must stand", async () => {
    silenceConsoleErrors();
    // gm-1 is away: gm-2 is the canonical GM and runs the pipeline. Both GMs
    // have played keyed before, so both are in the world's keyed-GM registry
    // (advertiseClaudeKeyPresence never removes a keyed GM who is merely
    // offline): gm-1 is the canonical GM the moment she is active.
    table = await simulateTable({
      users: [{ ...USERS.GM, active: false }, USERS.GM2, USERS.P1],
      world: { settings: { ...SETTINGS, keyedGmUserIds: ['gm-1', 'gm-2'], campaignState: liveSession() } },
      clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-test' } },
    });
    await table.setClaudeKey('gm-2', 'sk-ant-test');
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
    const claude = scriptClaude(table);
    const held = claude.hold(() => true);                 // the move's narration, in flight on gm-2

    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await held.arrived;
    await table.settle();

    // Sanity: gm-2's pipeline holds the lock while its narration is in flight.
    expect(world().pendingMove).toBe(true);
    expect(world().pendingMoveBy).toBe('gm-2');
    const claim = world().pendingMoveClaim;
    expect(typeof claim).toBe('string');

    // gm-1 arrives mid-move: a fresh page load, canonical from now on.
    await table.join('gm-1');
    await table.settle();

    // Expected: gm-2 is connected and mid-move, so its lock stands.
    // Actual: gm-1's ready hook reset it as "stale" — the world says no move is being resolved.
    expect(world().pendingMove).toBe(true);
    expect.soft(world().pendingMoveBy).toBe('gm-2');
    expect.soft(world().pendingMoveClaim).toBe(claim);

    held.release();
    await table.drain();
  }, 60_000);

  it("control: a lock held by a GM who is no longer connected is released by the next canonical GM's load", async () => {
    silenceConsoleErrors();
    table = await simulateTable({
      users: [USERS.GM, USERS.P1], boot: false,
      world: { settings: { ...SETTINGS, campaignState: liveSession({ pendingMove: true, pendingMoveBy: 'gm-9', pendingMoveClaim: 'crashed-claim' }) } },
    });
    await table.client('gm-1').boot();
    await table.client('pl-1').boot();
    await table.settle(); await table.drain();

    expect(world().pendingMove).toBe(false);              // the stale lock is cleared (correct)
    expect(world().pendingMoveBy).toBeNull();
  }, 60_000);
});

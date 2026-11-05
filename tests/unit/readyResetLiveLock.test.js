/**
 * STARFORGED COMPANION
 * tests/unit/readyResetLiveLock.test.js
 *
 * Issue #335 Y07 (READY-RESET-RELEASES-LIVE-LOCK) — a second GM's world load
 * leaves a connected GM's live move lock alone.
 *
 * A two-GM table: Gus (gm-2) runs the night alone — the canonical GM — and a
 * player's move is being narrated, so gm-2's pipeline holds the move lock
 * (`pendingMoveBy: "gm-2"`, its claim token). Gina (gm-1, the lower id, in
 * the keyed-GM registry) loads the world mid-narration and is canonical at
 * once. Her ready hook reset the lock as one "left set if Foundry was closed
 * mid-move" without looking at its claimant: the next typed line would run a
 * second pipeline beside gm-2's. The ready reset now follows the W25
 * handover's rule — the claimant's departure is the event that matters: it
 * clears a lock that names nobody, this client's own earlier page's, or a
 * user's who is not connected, and only while the store still holds it.
 *
 * (Converted from the tenth audit's probe
 * tests/probes/session/readyResetReleasesLiveLock.probe.js.)
 */

/* global silenceConsoleErrors */
import { describe, it, expect, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ finalize: null }));
vi.mock('../../src/pacing/router.js', async (orig) => ({
  ...(await orig()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (orig) => ({
  ...(await orig()), interpretMove: vi.fn(async (text) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: text, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (orig) => ({
  ...(await orig()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (orig) => ({
  ...(await orig()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/narration/narrator.js', async (orig) => ({
  ...(await orig()),
  // A test may hold the session roll's summary finalise (an await inside the ready mint).
  finalizeSessionSummary: vi.fn(async () => { if (control.finalize) await control.finalize; }),
  getCampaignRecap:       vi.fn(async () => ''),
  postCampaignRecap:      vi.fn(async () => ''),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude, deferred } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
afterEach(() => { control.finalize = null; table?.teardown(); });

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

/** gm-1 loads a world whose stored lock is `lock`, alone with a player. */
async function loadWithLock(lock, extra = {}) {
  table = await simulateTable({
    users: [USERS.GM, USERS.P1], boot: false,
    world: { settings: { ...SETTINGS, campaignState: liveSession({ ...lock, ...extra }) } },
  });
  await table.client('gm-1').boot();
  await table.client('pl-1').boot();
  await table.settle(); await table.drain();
}

describe('issue #335 Y07 — the ready-time stale-lock reset', () => {
  it("gm-2 (canonical, alone) is narrating a move when gm-1 loads: gm-2's live lock stands until gm-2 releases it", async () => {
    silenceConsoleErrors();
    // gm-1 is away: gm-2 is the canonical GM and runs the pipeline. Both GMs
    // have played keyed before, so both are in the world's keyed-GM registry
    // (advertiseClaudeKeyPresence never removes a keyed GM who is merely
    // offline): gm-1 is the canonical GM the moment she is active.
    // Fact continuity is off here: with it on, gm-2's narration relays its
    // side-data to gm-1 (canonical by then), whose whole-object write can land
    // within one delivery of gm-2's release and carry its cached lock back —
    // the two-GM concurrent-write limitation (issue #299), not this finding.
    table = await simulateTable({
      users: [{ ...USERS.GM, active: false }, USERS.GM2, USERS.P1],
      world: { settings: { ...SETTINGS, 'factContinuity.enabled': false, keyedGmUserIds: ['gm-1', 'gm-2'], campaignState: liveSession() } },
      clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-test' } },
    });
    await table.setClaudeKey('gm-2', 'sk-ant-test');
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
    const claude = scriptClaude(table);
    const held = claude.hold(() => true);                 // the move's narration, in flight on gm-2

    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await held.arrived;
    await table.settle();

    expect(world().pendingMove).toBe(true);               // gm-2's pipeline holds the lock
    expect(world().pendingMoveBy).toBe('gm-2');
    const claim = world().pendingMoveClaim;
    expect(typeof claim).toBe('string');

    // gm-1 arrives mid-move: a fresh page load, canonical from now on.
    await table.join('gm-1');
    await table.settle();

    // gm-2 is connected and mid-move, so its lock stands — claimant and token.
    expect(world().pendingMove).toBe(true);
    expect(world().pendingMoveBy).toBe('gm-2');
    expect(world().pendingMoveClaim).toBe(claim);

    // gm-2's narration returns: its own release (its claim) frees the table.
    held.release();
    await table.drain();
    expect(world().pendingMove).toBe(false);
  }, 60_000);

  it("control: a lock held by a GM who is no longer connected is released by the next canonical GM's load", async () => {
    silenceConsoleErrors();
    await loadWithLock({ pendingMove: true, pendingMoveBy: 'gm-9', pendingMoveClaim: 'crashed-claim' });

    expect(world().pendingMove).toBe(false);              // the stale lock is cleared
    expect(world().pendingMoveBy).toBeNull();
    expect(world().pendingMoveClaim).toBeNull();
  }, 60_000);

  it("control: the GM's own lock from before a reload (Foundry closed mid-move) is released at its load", async () => {
    silenceConsoleErrors();
    await loadWithLock({ pendingMove: true, pendingMoveBy: 'gm-1', pendingMoveClaim: 'my-old-page' });

    expect(world().pendingMove).toBe(false);
    expect(world().pendingMoveClaim).toBeNull();
  }, 60_000);

  it('control: a lock from before the claimant was stamped is released at load', async () => {
    silenceConsoleErrors();
    await loadWithLock({ pendingMove: true, pendingMoveBy: null, pendingMoveClaim: null });

    expect(world().pendingMove).toBe(false);
  }, 60_000);

  it('a move claimed while the load is still minting the session keeps its lock', async () => {
    silenceConsoleErrors();
    // A session idle past the gap: the load closes it out (its summary
    // finalise, held here) before minting the next — the stale lock's reset
    // is written with the mint.
    const finalise = deferred();
    control.finalize = finalise.promise;
    table = await simulateTable({
      users: [USERS.GM, USERS.P1], boot: false,
      world: { settings: { ...SETTINGS, campaignState: liveSession({
        pendingMove: true, pendingMoveBy: 'gm-9', pendingMoveClaim: 'crashed-claim',
        lastSessionTimestamp: new Date(Date.now() - 6 * 3600_000).toISOString(),
      }) } },
    });
    await table.client('gm-1').boot();

    // Meanwhile a move claims the lock — the pipeline's own claim, a fresh token.
    await table.client('gm-1').setSetting('campaignState', { ...world(), pendingMove: true, pendingMoveBy: 'gm-1', pendingMoveClaim: 'live-claim' });
    finalise.resolve();
    await table.settle(); await table.drain();

    expect(world().currentSessionId).not.toBe('rl-s1');    // the mint landed …
    expect(world().pendingMove).toBe(true);               // … and left the live claim alone
    expect(world().pendingMoveClaim).toBe('live-claim');
  }, 60_000);
});

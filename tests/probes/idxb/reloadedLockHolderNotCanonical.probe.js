/**
 * Probe IDXB — a stale move lock whose claimant is connected again, on a fresh
 * page, and is not the canonical GM.
 *
 * The lock's two recoveries each assume the other covers this case:
 *   - the W25 handover (index.js releaseLockOfDisconnectedGM) acts when the
 *     claimant's DEPARTURE is seen by a canonical GM;
 *   - the ready reset (index.js staleMoveLockAtReady, the `ready` hook) runs
 *     on the canonical GM only, and since issue #335 Y07 leaves a lock alone
 *     when "another user who is connected holds it".
 * A co-GM (gm-2) who ran a night alone and closed the browser mid-move left
 * `pendingMoveBy: "gm-2"` with nobody connected to see the departure. When
 * both GMs then load in overlapping windows (each socket connects before
 * either page's `ready`), gm-1 — canonical — finds the claimant "connected"
 * and leaves the lock; gm-2's own `ready` is not canonical and skips the
 * reset. Nothing releases it until gm-2 leaves again.
 *
 * Correct: once both pages have loaded, no pipeline is running, so the lock is
 * free (the claimant's own load knows its earlier page's claim is dead).
 */

/* global silenceConsoleErrors */
import { describe, it, expect, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;
afterEach(() => { table?.teardown(); });

const world = () => table.world.campaignState();
const SETTINGS = { chronicleAutoEntry: false, narratorSessionSummary: false, autoRecapEnabled: false };

function liveSession(extra = {}) {
  return {
    ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: new Date().toISOString(),
    currentSessionId: 'idxb-s1', sessionStartedId: 'idxb-s1', sessionNumber: 1,
    lastSessionTimestamp: new Date().toISOString(), currentSceneId: null, sceneTruths: [], clocks: [],
    ...extra,
  };
}

// gm-2's last night alone ended with the browser closed mid-move.
const GM2_OLD_LOCK = { pendingMove: true, pendingMoveBy: 'gm-2', pendingMoveClaim: 'gm-2-last-night' };

describe("IDXB: the claimant of a stale move lock is connected again and is not the canonical GM", () => {
  it("both GMs load in overlapping windows: the dead lock of gm-2's earlier page is released", async () => {
    silenceConsoleErrors();
    // Both GMs keyed (the registry lists both); gm-1 — the lower id — is the
    // canonical GM whenever she is connected. Both sockets are connected
    // (`active`) before either page's `ready` runs.
    table = await simulateTable({
      users: [USERS.GM, USERS.GM2, USERS.P1], boot: false,
      world: { settings: { ...SETTINGS, keyedGmUserIds: ['gm-1', 'gm-2'], campaignState: liveSession(GM2_OLD_LOCK) } },
      clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-test' }, 'gm-2': { claudeApiKey: 'sk-ant-test' } },
    });
    await table.client('gm-1').boot();     // canonical: finds gm-2 "connected" — leaves the lock (Y07's rule)
    await table.client('gm-2').boot();     // the claimant's own fresh page: not canonical — skips the ready reset
    await table.client('pl-1').boot();
    await table.settle(); await table.drain();

    // Nobody is resolving a move: every page that could have held this claim is gone.
    expect(world().pendingMove).toBe(false);
  }, 60_000);

  it("control: the same lock is released when gm-2 loads before gm-1 connects (canonical at his own ready)", async () => {
    silenceConsoleErrors();
    table = await simulateTable({
      users: [{ ...USERS.GM, active: false }, USERS.GM2, USERS.P1], boot: false,
      world: { settings: { ...SETTINGS, keyedGmUserIds: ['gm-1', 'gm-2'], campaignState: liveSession(GM2_OLD_LOCK) } },
      clientSettings: { 'gm-2': { claudeApiKey: 'sk-ant-test' } },
    });
    await table.client('gm-2').boot();
    await table.client('pl-1').boot();
    await table.settle(); await table.drain();
    expect(world().pendingMove).toBe(false);
    expect(world().pendingMoveClaim).toBeNull();
  }, 60_000);

  it("control: and when gm-1 loads while gm-2 is not connected (the claimant is gone)", async () => {
    silenceConsoleErrors();
    table = await simulateTable({
      users: [USERS.GM, { ...USERS.GM2, active: false }, USERS.P1], boot: false,
      world: { settings: { ...SETTINGS, keyedGmUserIds: ['gm-1', 'gm-2'], campaignState: liveSession(GM2_OLD_LOCK) } },
      clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-test' } },
    });
    await table.client('gm-1').boot();
    await table.client('pl-1').boot();
    await table.settle(); await table.drain();
    expect(world().pendingMove).toBe(false);
  }, 60_000);
});

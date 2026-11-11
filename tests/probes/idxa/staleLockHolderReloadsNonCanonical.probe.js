/**
 * PROBE IDXA-1 — a stale move lock whose holder reloads as a NON-canonical GM
 * is never reset.
 *
 * The two paths that free a lock nobody is resolving any more:
 *   - the `ready` reset (src/index.js Hooks.once("ready") → staleMoveLockAtReady)
 *     runs only inside `if (isCanonicalGM())`, and treats a lock held by
 *     ANOTHER user who is connected as live (issue #335 Y07);
 *   - the W25 handover (releaseLockOfDisconnectedGM) runs when a READY
 *     canonical GM sees the holder leave.
 * So a lock left by gm-2's earlier page (gm-2 ran the night alone and Foundry
 * was closed mid-move — the case the ready reset's own comment names) is freed
 * only if gm-2 is canonical at its next `ready`. When both GMs open the world
 * together and gm-1 outranks gm-2 (lower id, or the keyed one):
 *   - gm-1 (canonical) reads "held by gm-2, who is connected" → not reset;
 *   - gm-2 is not canonical → its `ready` skips the reset of its own old lock.
 * Nobody is resolving a move, the lock stays held, and every move is refused.
 *
 * Correct behaviour asserted here: after both GMs have loaded, a lock whose
 * claimant's page is gone is free, and a player's move is rolled.
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

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;
afterEach(() => { table?.teardown(); });

const world = () => table.world.campaignState();
const LINE = 'Kira slips past the sentry and forces the hatch open.';
const SETTINGS = { chronicleAutoEntry: false, narratorSessionSummary: false, autoRecapEnabled: false, 'factContinuity.enabled': false };

function liveSession(extra = {}) {
  return {
    ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: new Date().toISOString(),
    currentSessionId: 'idxa-s1', sessionStartedId: 'idxa-s1', sessionNumber: 1,
    lastSessionTimestamp: new Date().toISOString(), currentSceneId: null, sceneTruths: [], clocks: [],
    ...extra,
  };
}

// The lock gm-2's earlier page left: gm-2 was the canonical GM (alone) and
// Foundry was closed mid-move.
const GM2_OLD_LOCK = { pendingMove: true, pendingMoveBy: 'gm-2', pendingMoveClaim: 'gm2-earlier-page' };

/** Both GMs and the player open the world together (all connected before any is ready). */
async function loadTogether({ order, lock, keyed = ['gm-1', 'gm-2'] }) {
  table = await simulateTable({
    users: [USERS.GM, USERS.GM2, USERS.P1], boot: false,
    world: { settings: { ...SETTINGS, keyedGmUserIds: keyed, campaignState: liveSession(lock) } },
    clientSettings: Object.fromEntries(keyed.map(id => [id, { claudeApiKey: 'sk-ant-test' }])),
  });
  for (const id of order) await table.client(id).boot();
  await table.settle(); await table.drain();
}

describe('IDXA-1 — a stale lock whose holder loads as a non-canonical GM', () => {
  it("both GMs load together (gm-1 first): gm-2's earlier page's lock is freed", async () => {
    silenceConsoleErrors();
    await loadTogether({ order: ['gm-1', 'gm-2', 'pl-1'], lock: GM2_OLD_LOCK });
    // Nobody is resolving a move: gm-2's page that claimed it is gone.
    expect({ pendingMove: world().pendingMove, by: world().pendingMoveBy })
      .toEqual({ pendingMove: false, by: null });
  }, 60_000);

  it("both GMs load together (gm-2 first): gm-2's earlier page's lock is freed", async () => {
    silenceConsoleErrors();
    await loadTogether({ order: ['gm-2', 'gm-1', 'pl-1'], lock: GM2_OLD_LOCK });
    expect({ pendingMove: world().pendingMove, by: world().pendingMoveBy })
      .toEqual({ pendingMove: false, by: null });
  }, 60_000);

  it('a keyless assistant GM whose solo night left the lock: the keyed GM and the assistant load together and the table can move', async () => {
    silenceConsoleErrors();
    await loadTogether({ order: ['gm-1', 'gm-2', 'pl-1'], lock: GM2_OLD_LOCK, keyed: ['gm-1'] });
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
    scriptClaude(table);

    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();

    const busy = table.client('gm-1').notifications.filter(n => /already being resolved/.test(n.message)).length;
    const rolled = table.cards(f => f.moveResolution).length;
    expect({ rolled, busy, pendingMove: world().pendingMove }).toEqual({ rolled: 1, busy: 0, pendingMove: false });
  }, 60_000);

  it("control: gm-2 loading alone frees its own earlier page's lock", async () => {
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
    expect(world().pendingMoveBy).toBeNull();
  }, 60_000);

  it("control: loading together, the CANONICAL GM's own earlier page's lock is freed", async () => {
    silenceConsoleErrors();
    await loadTogether({ order: ['gm-1', 'gm-2', 'pl-1'],
      lock: { pendingMove: true, pendingMoveBy: 'gm-1', pendingMoveClaim: 'gm1-earlier-page' } });
    expect(world().pendingMove).toBe(false);
  }, 60_000);

  it('control: with the lock stuck, gm-2 leaving lets the canonical GM release it (W25)', async () => {
    silenceConsoleErrors();
    await loadTogether({ order: ['gm-1', 'gm-2', 'pl-1'], lock: GM2_OLD_LOCK });
    await table.leave('gm-2');
    await table.settle(); await table.drain();
    expect(world().pendingMove).toBe(false);
    expect(table.cards(f => f.moveLockReleasedCard).length).toBe(1);
    expect(MODULE_ID).toBe('starforged-companion');
  }, 60_000);
});

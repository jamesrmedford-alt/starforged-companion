/**
 * PROBE IDXA-5 — a ready GM stands down for a GM whose page is still loading.
 *
 * isCanonicalGM() (src/multiplayer/gmGate.js) picks the lowest-id ACTIVE GM
 * among those in the keyed-GM registry. A user is `active` from the moment
 * their socket connects — the START of their page load — while every hook,
 * the relay listener and the chat pipeline of this module are installed at
 * `ready`, many seconds later. And a keyed GM stays in the world's registry
 * while offline (advertiseKeyPresence only edits it from that GM's own
 * loaded client).
 *
 * So when gm-1 (lower id, keyed before) opens the world while gm-2 runs the
 * table, canonicity passes to gm-1 at once: for the whole of gm-1's load,
 * gm-2 — connected, ready, keyed — answers `isCanonicalGM() === false` and
 * drops what the canonical GM alone handles (src/index.js onMessage
 * `if (!isCanonicalGM()) return;`, commandRouting.js RUN_ON.CANONICAL_GM,
 * gmRelay.js registerGmRelaySocket), and gm-1 has no handler installed yet.
 * A player's `!x` is not recorded, their typed line is not narrated, and
 * nobody is told (`hasActiveGM()` is true). Nothing replays them at `ready`.
 *
 * known-issues "Accepted limitations → No ack channel" records the ONE-GM
 * case (the only GM is loading). Here a ready GM is connected throughout.
 *
 * Correct behaviour asserted here: while a ready GM is connected, a player's
 * X-Card is recorded and their move is rolled.
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

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;
afterEach(() => { table?.teardown(); });

const world = () => table.world.campaignState();
const SETTINGS = { chronicleAutoEntry: false, narratorSessionSummary: false, autoRecapEnabled: false, 'factContinuity.enabled': false };
const liveSession = () => ({
  ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: new Date().toISOString(),
  currentSessionId: 'sess-1', sessionStartedId: 'sess-1', sessionNumber: 1,
  lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [],
});

/** gm-2 runs the table with a player; gm-1 is away. `gm1Listed`: gm-1 has played keyed before. */
async function tableRunByGm2({ gm1Listed }) {
  table = await simulateTable({
    users: [{ ...USERS.GM, active: false }, USERS.GM2, USERS.P1],
    world: { settings: { ...SETTINGS, keyedGmUserIds: gm1Listed ? ['gm-1', 'gm-2'] : ['gm-2'], campaignState: liveSession() } },
    clientSettings: gm1Listed ? { 'gm-1': { claudeApiKey: 'sk-ant-gina' } } : {},
  });
  await table.setClaudeKey('gm-2', 'sk-ant-gus');
  table.addActor({ id: 'pc-1', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table);
}

/** gm-1's socket connects (the user is active everywhere) — its page has not reached `ready`. */
function gm1StartsLoading() {
  const c = table.client('gm-1');
  c.user.active = true;
  c.connected = true;
  for (const other of table.connectedClients) {
    if (other !== c) other.run(() => other.hooks.call('userConnected', [c.user, true], false));
  }
}

describe('IDXA-5 — the canonical GM is still loading while a ready GM is connected', () => {
  it("a player's X-Card typed during gm-1's load is recorded (gm-2 is connected and ready)", async () => {
    silenceConsoleErrors();
    await tableRunByGm2({ gm1Listed: true });
    gm1StartsLoading();

    await table.client('pl-1').chat('!x');
    await table.settle(); await table.drain();
    const duringLoad = world().xCardActive === true;

    await table.client('gm-1').boot();          // gm-1 reaches `ready`
    await table.settle(); await table.drain();

    expect({ recordedDuringLoad: duringLoad, recordedAfterReady: world().xCardActive === true })
      .toEqual({ recordedDuringLoad: true, recordedAfterReady: true });
  }, 60_000);

  it("a player's move typed during gm-1's load is rolled", async () => {
    silenceConsoleErrors();
    await tableRunByGm2({ gm1Listed: true });
    gm1StartsLoading();

    await table.client('pl-1').chat('Kira slips past the sentry and forces the hatch open.', { speaker: { actor: 'pc-1' } });
    await table.settle(); await table.drain();
    const duringLoad = table.cards(f => f.moveResolution).length;

    await table.client('gm-1').boot();
    await table.settle(); await table.drain();

    expect({ rolledDuringLoad: duringLoad, rolledAfterReady: table.cards(f => f.moveResolution).length })
      .toEqual({ rolledDuringLoad: 1, rolledAfterReady: 1 });
  }, 60_000);

  it('control: gm-1 not in the keyed registry (gm-2 stays canonical) — the X-Card and the move both land during its load', async () => {
    silenceConsoleErrors();
    await tableRunByGm2({ gm1Listed: false });
    gm1StartsLoading();

    await table.client('pl-1').chat('Kira slips past the sentry and forces the hatch open.', { speaker: { actor: 'pc-1' } });
    await table.settle(); await table.drain();
    await table.client('pl-1').chat('!x');
    await table.settle(); await table.drain();

    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    expect(world().xCardActive).toBe(true);
  }, 60_000);
});

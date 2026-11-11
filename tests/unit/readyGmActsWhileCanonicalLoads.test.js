/**
 * STARFORGED COMPANION
 * tests/unit/readyGmActsWhileCanonicalLoads.test.js
 *
 * A ready GM keeps the table while another GM's page loads (issue #347 AB03).
 *
 * isCanonicalGM() elected the lowest-id (keyed) GM among the ACTIVE ones — and
 * a user is active from its socket's connect, the start of its page load,
 * while this module's chat pipeline, hooks and relay listener exist only from
 * its `ready`. So when gm-1 (lower id, keyed on an earlier night) opened the
 * world while gm-2 ran the table, gm-2 stood down for the whole load: a
 * player's X-Card was not recorded, their line was not rolled, card presses
 * were dropped, and nobody was told.
 *
 * Each client now passes over a GM whose connect it saw until that GM
 * announces its page ready; a GM whose socket came back on a page already
 * loaded answers the "is your page ready?" question at once.
 */
/* global silenceConsoleErrors */
import { describe, it, expect, afterEach, vi } from 'vitest';

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

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
afterEach(() => { table?.teardown(); });

const world = () => table.world.campaignState();
const SETTINGS = { chronicleAutoEntry: false, narratorSessionSummary: false, autoRecapEnabled: false, 'factContinuity.enabled': false };
const liveSession = () => ({
  ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: new Date().toISOString(),
  currentSessionId: 'sess-1', sessionStartedId: 'sess-1', sessionNumber: 1,
  lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [],
});
const LINE = 'Kira slips past the sentry and forces the hatch open.';

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

/** Whether `userId`'s client counts itself the canonical GM. */
async function canonical(userId) {
  const client = table.client(userId);
  const gate = await client.import('../../src/multiplayer/gmGate.js');
  return client.run(() => gate.isCanonicalGM());
}

describe('a ready GM keeps the table while another GM loads (issue #347 AB03)', () => {
  it("a player's X-Card played during gm-1's load is recorded, and stays recorded once gm-1 is ready", async () => {
    silenceConsoleErrors();
    await tableRunByGm2({ gm1Listed: true });
    gm1StartsLoading();

    await table.client('pl-1').chat('!x');
    await table.settle(); await table.drain();
    expect(world().xCardActive, 'recorded by gm-2 while gm-1 loads').toBe(true);

    await table.client('gm-1').boot();          // gm-1 reaches `ready`
    await table.settle(); await table.drain();
    expect(world().xCardActive).toBe(true);
  }, 60_000);

  it("a player's move typed during gm-1's load is rolled — once", async () => {
    silenceConsoleErrors();
    await tableRunByGm2({ gm1Listed: true });
    gm1StartsLoading();

    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-1' } });
    await table.settle(); await table.drain();
    expect(table.cards(f => f.moveResolution), 'rolled while gm-1 loads').toHaveLength(1);

    await table.client('gm-1').boot();
    await table.settle(); await table.drain();
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
  }, 60_000);

  it('gm-2 is the canonical GM while gm-1 loads; once gm-1 announces its page ready, gm-1 is', async () => {
    silenceConsoleErrors();
    await tableRunByGm2({ gm1Listed: true });
    gm1StartsLoading();
    expect(await canonical('gm-2')).toBe(true);

    await table.client('gm-1').boot();
    await table.settle();
    expect(await canonical('gm-1')).toBe(true);
    expect(await canonical('gm-2')).toBe(false);
  }, 60_000);

  it("control: gm-1's connection drops and comes back on the same page — it answers at once and is the canonical GM again", async () => {
    silenceConsoleErrors();
    await tableRunByGm2({ gm1Listed: true });
    gm1StartsLoading();
    await table.client('gm-1').boot();
    await table.settle();

    await table.leave('gm-1');
    expect(await canonical('gm-2')).toBe(true);
    await table.join('gm-1');                    // no reload: the page — and its listener — stayed
    await table.settle();
    expect(await canonical('gm-1')).toBe(true);
    expect(await canonical('gm-2')).toBe(false);
  }, 60_000);

  it('control: gm-1 not in the keyed registry — gm-2 stays canonical through the load and after it', async () => {
    silenceConsoleErrors();
    await tableRunByGm2({ gm1Listed: false });
    gm1StartsLoading();

    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-1' } });
    await table.settle(); await table.drain();
    await table.client('pl-1').chat('!x');
    await table.settle(); await table.drain();
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    expect(world().xCardActive).toBe(true);

    await table.client('gm-1').boot();
    await table.settle();
    expect(await canonical('gm-2')).toBe(true);
  }, 60_000);
});

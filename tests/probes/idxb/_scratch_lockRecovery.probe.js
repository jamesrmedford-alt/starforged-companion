/* global silenceConsoleErrors */
import { describe, it, expect, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
let table;
afterEach(() => { table?.teardown(); });
const world = () => table.world.campaignState();
const SETTINGS = { chronicleAutoEntry: false, narratorSessionSummary: false, autoRecapEnabled: false };
const liveSession = (extra = {}) => ({
  ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: new Date().toISOString(),
  currentSessionId: 'idxb-s1', sessionStartedId: 'idxb-s1', sessionNumber: 1,
  lastSessionTimestamp: new Date().toISOString(), currentSceneId: null, sceneTruths: [], clocks: [], ...extra,
});
const GM2_OLD_LOCK = { pendingMove: true, pendingMoveBy: 'gm-2', pendingMoveClaim: 'gm-2-last-night' };
describe("scratch", () => {
  it("observe recovery paths", async () => {
    silenceConsoleErrors();
    table = await simulateTable({
      users: [USERS.GM, USERS.GM2, USERS.P1], boot: false,
      world: { settings: { ...SETTINGS, keyedGmUserIds: ['gm-1', 'gm-2'], campaignState: liveSession(GM2_OLD_LOCK) } },
      clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-test' }, 'gm-2': { claudeApiKey: 'sk-ant-test' } },
    });
    await table.client('gm-1').boot();
    await table.client('gm-2').boot();
    await table.client('pl-1').boot();
    await table.settle(); await table.drain();
    const seen = { afterLoad: world().pendingMove };
    // a player's line
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
    const before = table.client('gm-1').messages?.contents?.length ?? null;
    await table.client('pl-1').chat('Kira forces the hatch open.', { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();
    seen.afterLine = world().pendingMove;
    seen.claudeCalls = table.claude.calls.length;
    // gm-1 reloads
    await table.leave('gm-1'); await table.settle();
    seen.afterGm1Left = world().pendingMove;
    await table.join('gm-1'); await table.settle(); await table.drain();
    seen.afterGm1Reload = world().pendingMove;
    // gm-2 reloads
    await table.leave('gm-2'); await table.settle(); await table.drain();
    seen.afterGm2Left = world().pendingMove;
    console.log("SEEN", JSON.stringify(seen), before);
    expect(true).toBe(true);
  }, 60_000);
});

/**
 * PROBE — AUTOSEED-DOUBLE-PORTRAIT
 *
 * With the world setting "Auto-Seed NPC / Connection Details"
 * (autoSeedConnection) on and an OpenRouter key set, every connection the
 * module creates gets TWO silent portrait generations:
 *   1. the createActor hook (src/index.js registerStarshipSeedHook, second
 *      handler) sees connectionNeedsSeed(actor) — every createConnection
 *      record starts `seeded:false` — and runs seedConnectionActor, which
 *      calls generatePortrait with its own snapshot (portraitId null);
 *   2. the creator's own path — draft Confirm, the make_a_connection
 *      auto-create, the inciting vow target — calls postCreationEnrichment,
 *      which calls generatePortrait again (portraitId still null).
 * Two OpenRouter image calls are billed per NPC, two art assets are stored,
 * and whichever links last wins; seedConnectionActor's whole-record flag
 * write (portraitId:null from its snapshot) can also undo the other link.
 *
 * Correct behaviour (asserted): confirming one detected NPC generates one
 * portrait.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const art = vi.hoisted(() => ({ calls: [] }));
vi.mock('../../../src/art/generator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  generatePortrait: vi.fn(async (hostId, typeKey) => { art.calls.push({ hostId, typeKey }); return null; }),
}));

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  art.calls.length = 0;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    autoSeedConnection: true,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', connectionIds: [] },
  } } });
  await table.client('gm-1').setSetting('openRouterApiKey', 'sk-or-test');
  await table.settle();
});

describe('PROBE AUTOSEED-DOUBLE-PORTRAIT', () => {
  it('confirming one NPC draft generates one portrait', async () => {
    const gm = table.client('gm-1');
    const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
    await gm.run(() => routeEntityDrafts(
      [{ type: 'connection', name: 'Vance Oduya', description: 'The dockmaster of the Hollow Spire.', confidence: 'high' }],
      game.settings.get(MODULE_ID, 'campaignState'), { autoCreateConnection: false },
    ));
    await table.settle();
    const card = table.cards(f => f.draftEntityCard)[0];
    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();

    const vance = table.actors.find(a => a.name === 'Vance Oduya' && a.flags?.[MODULE_ID]?.entityType === 'connection');
    expect(vance).toBeTruthy();
    expect(art.calls.filter(c => c.hostId === vance.id)).toHaveLength(1);
  });
});

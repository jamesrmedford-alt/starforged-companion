/**
 * PROBE — ENT-04 ENTITY-CREATE-ID-CACHED-MUTATE (ninth audit, area entities)
 *
 * What the user does: the GM confirms a "New Entities Detected" draft (or a
 * Make a Connection hit auto-creates its NPC, or a draft ship / faction is
 * confirmed) while the world write is refused — a server error, a dropped
 * socket.
 *
 * What happens: every creator pushes the new host id onto the caller's
 * campaignState BEFORE the store write — `campaignState.connectionIds.push(
 * actor.id)` (src/entities/connection.js:103-106; ship.js:167-170,
 * faction.js:104-108, settlement.js:146-150, planet.js:150-153,
 * location.js:120-123, creature.js:88-92, syncCommandVehicleFlag ship.js:296-
 * 303, registerStarshipActorLight :533-540, seedStarshipActor :640-647;
 * storeArtAsset storage.js:56-57 the same for artAssetIds) — and the
 * caller's object is the client's CACHED setting: confirmDraft reads
 * `game.settings.get(MODULE_ID, "campaignState")` (entityExtractor.js:1538)
 * and hands it over, as do the createActor hooks (index.js:2822, 2851). When
 * registerEntityIdInStore's write is refused (registry.js:216-225 writes a
 * copy of the latest store, as F14 asked), the GM's cache already holds the
 * id the world never took: this client lists the NPC in the Entities panel,
 * the roster and every id-list read, the next Confirm of the same name finds
 * it "existing" (U25) and creates nothing — and after a reload the card is an
 * orphan Actor no list names. rules/foundry-api.md: set nothing on the cached
 * value before a write that can fail; issue #326 W51 fixed nine such sites.
 *
 * What should happen: after a refused registration this client's cached
 * campaignState equals the world's (the push undone, or made on a copy), and
 * the creator reports the failure (it does — the rejection is kept).
 *
 * Control: with the write accepted, the id reaches the world and the cache.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const KEY = `${MODULE_ID}.campaignState`;
let table, gm, createConnection;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  gm = table.client('gm-1');
  ({ createConnection } = await gm.import('../../src/entities/connection.js'));
}, 60_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoSeedConnection: false,
    campaignState: { ...CampaignStateSchema, connectionIds: [], sectors: [] },
  } } });
});

const cache = () => gm.getSetting('campaignState');
const world = () => table.world.campaignState();

describe('ENT-04 a refused id registration leaves the GM\'s cached campaignState equal to the world', () => {
  it('createConnection: the refused write does not leave the new card\'s id in the cache', async () => {
    silenceConsoleErrors();   // the creator logs the refusal
    table.interceptWrites(w => (w.kind === 'setting' && w.key === KEY && w.client === 'gm-1')
      ? new Error('Setting [campaignState] could not be saved: the server refused the write')
      : undefined);

    // confirmDraft / the hooks hand the creator the cached setting object itself.
    const attempt = gm.run(() => createConnection({ name: 'Vex', rank: 'dangerous' }, game.settings.get(MODULE_ID, 'campaignState')));
    await expect(attempt).rejects.toThrow(/refused/);
    await table.settle();

    const card = table.actors.find(a => a.flags?.[MODULE_ID]?.entityType === 'connection');
    expect(card).toBeTruthy();                                          // the Actor exists either way
    expect(world().connectionIds).toEqual([]);                          // the world never took the id
    // Expected: the cache equals the world. Today: the GM's cache holds the id.
    expect(cache().connectionIds).toEqual(world().connectionIds);
  });

  it('control: an accepted registration reaches the world and the cache alike', async () => {
    await gm.run(() => createConnection({ name: 'Vex', rank: 'dangerous' }, game.settings.get(MODULE_ID, 'campaignState')));
    await table.settle();
    const card = table.actors.find(a => a.flags?.[MODULE_ID]?.entityType === 'connection');
    expect(world().connectionIds).toEqual([card.id]);
    expect(cache().connectionIds).toEqual([card.id]);
  }, 30_000);
}, 60_000);

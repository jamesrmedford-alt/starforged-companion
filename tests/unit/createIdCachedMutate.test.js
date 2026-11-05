/**
 * STARFORGED COMPANION
 * tests/unit/createIdCachedMutate.test.js
 *
 * Issue #331 X35 (ENTITY-CREATE-ID-CACHED-MUTATE). Every entity creator pushed
 * the new host id onto the caller's campaignState BEFORE the store write, and
 * the caller's object is often the client's CACHED setting (confirmDraft and
 * the createActor hooks hand over game.settings.get(...)). When the write was
 * refused the GM's cache held an id the world never took: this client listed
 * the NPC, the next Confirm of the name found it "existing" (U25) and created
 * nothing, and after a reload the card was an orphan Actor no list names.
 * registerEntityId writes the store first and pushes onto the caller's copy
 * only once the world took it; storeArtAsset the same.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

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

describe('X35 — a refused id registration leaves the GM\'s cached campaignState equal to the world', () => {
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
    // The cache equals the world (it held the id the world never took).
    expect(cache().connectionIds).toEqual(world().connectionIds);
  });

  it('createFaction and createSettlement: the same, for a journal-hosted and an actor-hosted type', async () => {
    silenceConsoleErrors();
    table.interceptWrites(w => (w.kind === 'setting' && w.key === KEY && w.client === 'gm-1')
      ? new Error('Setting [campaignState] could not be saved: the server refused the write')
      : undefined);
    const { createFaction } = await gm.import('../../src/entities/faction.js');
    const { createSettlement } = await gm.import('../../src/entities/settlement.js');
    await expect(gm.run(() => createFaction({ name: 'Iron Syndicate' }, game.settings.get(MODULE_ID, 'campaignState')))).rejects.toThrow(/refused/);
    await expect(gm.run(() => createSettlement({ name: 'Bleakhold' }, game.settings.get(MODULE_ID, 'campaignState')))).rejects.toThrow(/refused/);
    await table.settle();
    expect(cache().factionIds ?? []).toEqual(world().factionIds ?? []);
    expect(cache().settlementIds ?? []).toEqual(world().settlementIds ?? []);
  });

  it('registerEntityId: refused, nothing is pushed onto the caller\'s copy; landed, it is', async () => {
    silenceConsoleErrors();
    const { registerEntityId } = await gm.import('../../src/entities/registry.js');
    const copy = { connectionIds: [] };
    const off = table.interceptWrites(w => (w.kind === 'setting' && w.key === KEY)
      ? new Error('refused (test fault)') : undefined);
    await expect(gm.run(() => registerEntityId(copy, 'connectionIds', 'act-1'))).rejects.toThrow(/refused/);
    expect(copy.connectionIds).toEqual([]);
    off?.();
    table.interceptWrites(() => undefined);
  });

  it('registerEntityId: landed, it says to list the id; persist: false writes nothing; a listed id is left', async () => {
    const { registerEntityId } = await gm.import('../../src/entities/registry.js');
    const copy = {};
    await expect(gm.run(() => registerEntityId(copy, 'planetIds', 'act-3'))).resolves.toBe(true);
    expect(world().planetIds).toContain('act-3');
    expect(copy.planetIds).toEqual([]);                       // the push is the caller's

    await expect(gm.run(() => registerEntityId(copy, 'planetIds', 'act-2', { persist: false }))).resolves.toBe(true);
    expect(world().planetIds ?? []).not.toContain('act-2');

    copy.planetIds.push('act-4');
    await expect(gm.run(() => registerEntityId(copy, 'planetIds', 'act-4'))).resolves.toBe(false);
  });

  it('control: an accepted registration reaches the world and the cache alike', async () => {
    await gm.run(() => createConnection({ name: 'Vex', rank: 'dangerous' }, game.settings.get(MODULE_ID, 'campaignState')));
    await table.settle();
    const card = table.actors.find(a => a.flags?.[MODULE_ID]?.entityType === 'connection');
    expect(world().connectionIds).toEqual([card.id]);
    expect(cache().connectionIds).toEqual([card.id]);
  }, 30_000);
}, 60_000);

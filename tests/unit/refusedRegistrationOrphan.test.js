/**
 * STARFORGED COMPANION
 * tests/unit/refusedRegistrationOrphan.test.js
 *
 * Issue #337 Y34 (REFUSED-REGISTRATION-ORPHAN). Every Actor-hosted creator
 * makes its Actor before the campaignState id-list write (issue #331 X35's
 * order), and a refused write left the Actor: an NPC card no list names. The
 * draft Confirm's catch warned and left the row pending; the retried Confirm
 * found nothing by name in `connectionIds` and made a SECOND "Vex" (both shown
 * by the Entities panel, one listed). A sidebar starship whose light
 * registration was refused got a console warning only, and no load-time pass
 * ever listed it — getCommandVehicle / SHIP POSITION / Withstand Damage never
 * saw it. A portrait whose art-index write was refused was never linked to
 * its entity, so the next Finalise paid for another.
 *
 * Now: a creator adopts the unlisted Actor of the same type, name and sector
 * (rules/reachability.md §7 — get-or-create); the GM is told when a ship's
 * registration is refused; the canonical GM's world load lists every flagged
 * Actor its list misses (migrator.registerUnlistedEntityActors); and a
 * refused art index leaves the portrait linked.
 */

/* global expectConsoleError */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { failWrites, campaignStateWrite } from '../helpers/faults.js';
import { CampaignStateSchema, ConnectionSchema } from '../../src/schemas.js';

vi.mock('../../src/art/openRouterImage.js', () => ({ generateOpenRouterImage: vi.fn() }));
import { generateOpenRouterImage } from '../../src/art/openRouterImage.js';

let table;
const world = () => table.world.campaignState();
const named = (name) => table.actors.filter(a => a.name === name && a.flags?.[MODULE_ID]?.entityType === 'connection');
const rows  = (card) => table.world.message(card._id).flags[MODULE_ID].drafts.map(d => [d.name, d.status]);

const BASE_STATE = {
  ...CampaignStateSchema,
  sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
  connectionIds: [], shipIds: [], sectors: [],
};

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoSeedConnection: false, autoSeedStarship: false,
    campaignState: BASE_STATE,
  } } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
});

async function vexDraftCard() {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts(
    [{ type: 'connection', name: 'Vex', description: 'A wiry pilot with a burned hand.', confidence: 'high' }],
    game.settings.get(MODULE_ID, 'campaignState'),
    { autoCreateConnection: false },
  ));
  await table.settle();
  const cards = table.cards(f => f.draftEntityCard);
  expect(cards).toHaveLength(1);
  return cards[0];
}

/** The canonical GM's load-time entity repairs (index.js ready: the migrator passes and the command-vehicle scan). */
async function runLoadTimeRepairs() {
  const gm = table.client('gm-1');
  const migrator = await gm.import('../../src/entities/migrator.js');
  const ship     = await gm.import('../../src/entities/ship.js');
  await gm.run(async () => {
    const state = game.settings.get(MODULE_ID, 'campaignState');
    await migrator.flattenSectorActorFolders(state);
    await migrator.scaffoldPcShipFolders();
    await migrator.migrateJournalConnectionsToActors(state);
    await migrator.backfillNpcCardSheets();
    await migrator.syncEntityRecordNames(state);
    await migrator.moveRecordNotesToSheets();
    await migrator.registerUnlistedEntityActors();
    for (const actor of (game.actors?.contents ?? []).filter(a => a?.type === 'starship')) {
      await ship.syncCommandVehicleFlag(actor, game.settings.get(MODULE_ID, 'campaignState'));
    }
  });
  await table.drain();
}

describe('a Confirm whose registration the world refused, then confirmed again', () => {
  it('the retry adopts the card the first Confirm made — one Vex, listed, with its bond', async () => {
    expectConsoleError(/registering connectionIds failed/);
    expectConsoleError(/draft confirm: createXxx failed/);
    const gm = table.client('gm-1');
    const card = await vexDraftCard();
    const refused = failWrites(table, campaignStateWrite('gm-1'), { times: 1 });

    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(refused.refused).toBe(1);
    expect(gm.notifications.some(n => /Failed to create connection "Vex"/.test(n.message))).toBe(true);   // control: the GM was told
    expect(rows(card)).toEqual([['Vex', 'pending']]);                                                     // control: Confirm is offered again
    expect(world().connectionIds).toEqual([]);                                                            // the world never took it
    expect(named('Vex')).toHaveLength(1);                                                                 // … but the card exists
    const orphanId = named('Vex')[0].id;

    // The GM presses Confirm again; the world takes this write.
    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(rows(card)).toEqual([['Vex', 'confirmed']]);
    expect(named('Vex')).toHaveLength(1);
    expect(world().connectionIds).toEqual([orphanId]);
    // The adopted card gets what the first Confirm never reached: the PC's bond Item.
    const kira = table.actors.find(a => a.id === 'pc-kira');
    const recordId = named('Vex')[0].flags[MODULE_ID].connection._id;
    expect(kira.items.contents.filter(i => i.flags?.[MODULE_ID]?.connectionId === recordId)).toHaveLength(1);
  }, 30_000);

  it('control: with the write accepted one Confirm makes one listed card', async () => {
    const gm = table.client('gm-1');
    const card = await vexDraftCard();
    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(rows(card)).toEqual([['Vex', 'confirmed']]);
    expect(named('Vex')).toHaveLength(1);
    expect(world().connectionIds).toEqual(named('Vex').map(a => a.id));
  }, 30_000);

  it('control: a listed card of the name is never adopted — a second, distinct creation still makes its own', async () => {
    const gm = table.client('gm-1');
    const { createConnection } = await gm.import('../../src/entities/connection.js');
    await gm.run(() => createConnection({ name: 'Vex', rank: 'dangerous' }, game.settings.get(MODULE_ID, 'campaignState')));
    await table.settle();
    await gm.run(() => createConnection({ name: 'Vex', rank: 'dangerous' }, game.settings.get(MODULE_ID, 'campaignState')));
    await table.settle();
    expect(named('Vex')).toHaveLength(2);
    expect(world().connectionIds).toHaveLength(2);
  }, 30_000);

  it("a settlement's retried creation adopts the one the refused try made, in its own sector only", async () => {
    expectConsoleError(/registering settlementIds failed/);
    const gm = table.client('gm-1');
    const { createSettlement } = await gm.import('../../src/entities/settlement.js');
    failWrites(table, campaignStateWrite('gm-1'), { times: 1 });
    await expect(gm.run(() => createSettlement({ name: 'Bleakhold', sectorId: 'sec-a' }, game.settings.get(MODULE_ID, 'campaignState'))))
      .rejects.toThrow();
    await gm.run(() => createSettlement({ name: 'Bleakhold', sectorId: 'sec-a' }, game.settings.get(MODULE_ID, 'campaignState')));
    await gm.run(() => createSettlement({ name: 'Bleakhold', sectorId: 'sec-b' }, game.settings.get(MODULE_ID, 'campaignState')));
    await table.settle();
    const bleakholds = table.actors.filter(a => a.name === 'Bleakhold');
    expect(bleakholds).toHaveLength(2);                                                 // sec-a's adopted, sec-b's its own
    expect(world().settlementIds).toEqual(bleakholds.map(a => a.id));
  }, 30_000);
});

describe('a sidebar starship whose registration the world refused', () => {
  it('the GM is told, and the next load lists the ship the module registered on its own Actor', async () => {
    expectConsoleError(/registering shipIds failed/);
    const gm = table.client('gm-1');
    const refused = failWrites(table, campaignStateWrite('gm-1'), { times: 1 });

    await gm.run(() => Actor.create({ name: 'Kestrel', type: 'starship' }));
    await table.drain();
    expect(refused.refused).toBe(1);
    const ship = table.actors.find(a => a.type === 'starship' && a.name === 'Kestrel');
    expect(ship?.flags?.[MODULE_ID]?.ship?._id).toBeTruthy();   // control: the module wrote its ship record onto the Actor
    expect(world().shipIds).toEqual([]);                        // the world never took the id

    expect(gm.notifications.some(n => /starship "Kestrel" was not registered/.test(n.message))).toBe(true);

    await runLoadTimeRepairs();
    expect(world().shipIds).toEqual([ship.id]);
    const { getCommandVehicle } = await gm.import('../../src/entities/ship.js');
    expect(gm.run(() => getCommandVehicle(game.settings.get(MODULE_ID, 'campaignState')))?.name).toBe('Kestrel');
  }, 30_000);

  it('control: with the write accepted a sidebar ship is listed at once', async () => {
    const gm = table.client('gm-1');
    await gm.run(() => Actor.create({ name: 'Kestrel', type: 'starship' }));
    await table.drain();
    const ship = table.actors.find(a => a.type === 'starship' && a.name === 'Kestrel');
    expect(world().shipIds).toEqual([ship.id]);
  }, 30_000);
});

describe('a portrait whose art-index write the world refused', () => {
  // The art cache is a JournalEntry with one page holding the asset; the
  // tests/setup.js stub keeps none, so this table's journal keeps them here.
  let savedCreate;
  beforeEach(() => {
    savedCreate = globalThis.JournalEntry.create;
    globalThis.JournalEntry.create = async (data) => {
      const entry = {
        id: foundry.utils.randomID(), name: data.name, flags: data.flags ?? {}, pages: { contents: [] },
        createEmbeddedDocuments: async (_type, pages) => {
          entry.pages.contents.push(...pages.map(p => ({ ...p, flags: p.flags ?? {} })));
          return entry.pages.contents;
        },
      };
      table.journal.set(entry.id, entry);
      return entry;
    };
  });
  afterEach(() => { globalThis.JournalEntry.create = savedCreate; });

  it('is still linked to its NPC, shown, and never paid for twice', async () => {
    expectConsoleError(/registering the art asset failed/);
    const gm = table.client('gm-1');
    table.addActor({
      id: 'npc-vex', type: 'character', name: 'Vex', hasPlayerOwner: false,
      flags: { [MODULE_ID]: { entityType: 'connection', entityId: 'conn-vex', connection: {
        ...ConnectionSchema, _id: 'conn-vex', name: 'Vex', rank: 'dangerous',
        portraitSourceDescription: 'A wiry pilot with a burned hand',
      } } },
    });
    await gm.run(() => game.settings.set(MODULE_ID, 'openRouterApiKey', 'sk-or-v1-a-key'));
    generateOpenRouterImage.mockReset();
    generateOpenRouterImage.mockResolvedValue('A'.repeat(400));
    const { generatePortrait } = await gm.import('../../src/art/generator.js');
    const { loadArtAsset } = await gm.import('../../src/art/storage.js');
    const { getConnection } = await gm.import('../../src/entities/connection.js');
    failWrites(table, campaignStateWrite('gm-1'), { times: 1 });

    const asset = await gm.run(() => generatePortrait('npc-vex', 'connection', getConnection('npc-vex'), game.settings.get(MODULE_ID, 'campaignState')));
    await table.drain();
    expect(asset?._id).toBeTruthy();
    expect(world().artAssetIds?.[asset._id]).toBeUndefined();                          // the index never took it
    // … but the NPC is linked to it, and loadArtAsset finds an unindexed asset
    // by its journal entry's flags.
    expect(gm.run(() => getConnection('npc-vex')).portraitId).toBe(asset._id);
    expect((await gm.run(() => loadArtAsset(asset._id, game.settings.get(MODULE_ID, 'campaignState'))))?._id).toBe(asset._id);

    await gm.run(() => generatePortrait('npc-vex', 'connection', getConnection('npc-vex'), game.settings.get(MODULE_ID, 'campaignState')));
    expect(generateOpenRouterImage).toHaveBeenCalledTimes(1);                           // no second image bought
  }, 30_000);
});

describe('the canonical GM\'s world load lists the entities a refused write left unregistered', () => {
  let loadTable;
  afterAll(() => loadTable?.teardown());

  it('an NPC card and a ship are listed; a copy of a listed record and an unstored sector\'s leftover are not', async () => {
    loadTable = await simulateTable({
      users: [USERS.GM], boot: false,
      world: { settings: {
        chronicleAutoEntry: false, autoSeedConnection: false, autoSeedStarship: false,
        campaignState: { ...BASE_STATE, connectionIds: ['npc-listed'], sectors: [{ id: 'sec-1', name: 'Reach' }] },
      } },
    });
    const card = (id, recordId, name, extra = {}) => loadTable.addActor({
      id, type: 'character', name, hasPlayerOwner: false,
      flags: { [MODULE_ID]: { entityType: 'connection', entityId: recordId, connection: {
        ...ConnectionSchema, _id: recordId, name, rank: 'dangerous', ...extra,
      } } },
    });
    card('npc-listed', 'rec-listed', 'Sol');
    card('npc-orphan', 'rec-orphan', 'Vex');                                     // a refused Confirm's card
    card('npc-copy', 'rec-listed', 'Sol (Copy)');                                 // the sidebar's Duplicate of a listed card
    card('npc-partial', 'rec-partial', 'Ash', { sectorId: 'sec-unstored' });      // a sector creation's leftover
    card('npc-sector', 'rec-sector', 'Ren', { sectorId: 'sec-1' });               // a refused card in a stored sector
    loadTable.addActor({ id: 'ship-orphan', type: 'starship', name: 'Kestrel',
      flags: { [MODULE_ID]: { entityType: 'ship', entityId: 'rec-ship', ship: { _id: 'rec-ship', name: 'Kestrel' } } } });

    await loadTable.client('gm-1').boot();
    await loadTable.drain();

    const state = loadTable.world.campaignState();
    expect(state.connectionIds).toEqual(['npc-listed', 'npc-orphan', 'npc-sector']);
    expect(state.shipIds).toEqual(['ship-orphan']);
  }, 60_000);
});

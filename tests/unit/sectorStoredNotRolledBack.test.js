// tests/unit/sectorStoredNotRolledBack.test.js
//
// A sector creation that fails AFTER the sector is stored takes nothing back
// (issue #362 AC26, SECTOR-ROLLBACK-AFTER-STORE — an incomplete fix of
// SECTOR-CREATE-PARTIAL).
//
// sectorPanel.createSector wrapped the whole of buildAndStoreSector in one
// try/catch whose catch took the run back (rollBackSectorCreation: the Actors
// the run made, its Sector Record journal, its Scene) — "the sector is not
// stored … so every one of them is a failed run's". But the last two
// statements of buildAndStoreSector came AFTER storeSector had written the
// sector to campaignState and made it the active sector: the "Sector Created"
// chat card (`await ChatMessage.create(…)`, unguarded) and the notification.
// When the world refused that card, the catch deleted every settlement, the
// local connection, the sites' locations, the Sector Record and the Scene of
// a sector that WAS stored and active; the wizard said "Failed to save
// sector", and pressing Create again found the sector "already stored"
// (runSectorCreationPipeline → findStoredSector) and closed as done.
//
// Now the card is a report of a stored sector, not a step of it (a refused
// card leaves the sector created, and the run resolves with it), and the
// catch takes nothing back once the world has stored the sector — whatever
// failed after the store.
//
// Production path: the real runSectorCreationPipeline (entity creation, Scene,
// Sector Record, storeSector, rollback); only the chat card's create (or the
// toast) is made to throw. Setup as tests/unit/sectorCreatePartialRetry.test.js.

/* global expectConsoleError */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/entities/finalize.js', () => ({ finalizeEntityArtOnly: vi.fn() }));

import { generateSector } from '../../src/sectors/sectorGenerator.js';
import { runSectorCreationPipeline } from '../../src/sectors/sectorPanel.js';
import { _resetFolderCache } from '../../src/entities/folder.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

function freshState() {
  return { ...JSON.parse(JSON.stringify(CampaignStateSchema)), sectors: [], settlementIds: [], connectionIds: [], locationIds: [], shipIds: [], activeSectorId: null };
}

let scenes, journals, realJournalEntry, realGameJournal, realGameScenes, realActorCreate;
function collection(list) {
  return { get contents() { return [...list]; }, get: (id) => list.find(d => d.id === id) ?? null };
}
function doc(list, data, extra = {}) {
  const d = {
    id: `${data.name}-${list.length + 1}`, ...data,
    delete: vi.fn(async () => { const i = list.indexOf(d); if (i >= 0) list.splice(i, 1); return d; }),
    ...extra,
  };
  list.push(d);
  return d;
}

beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset?.();
  game.folders._reset?.();
  _resetFolderCache();
  scenes = []; journals = [];
  realJournalEntry = global.JournalEntry;
  realGameJournal  = game.journal;
  realGameScenes   = game.scenes;
  realActorCreate  = global.Actor.create;
  // An Actor deletes itself from the world, as Foundry's documents do.
  global.Actor.create = async (data) => {
    const actor = await realActorCreate(data);
    actor.delete = vi.fn(async () => {
      game.actors._setAll(game.actors.contents.filter(a => a !== actor));
      return actor;
    });
    return actor;
  };
  global.JournalEntry = { create: vi.fn(async (data) => doc(journals, data, { createEmbeddedDocuments: async () => [] })) };
  game.journal = Object.assign(collection(journals), {
    find: (fn) => journals.find(fn) ?? null, getName: () => null, [Symbol.iterator]: function* () { yield* journals; },
  });
  global.Scene = { create: vi.fn(async (data) => {
    const s = doc(scenes, data, {
      dimensions: { sceneX: 200, sceneY: 200, sceneWidth: 1792, sceneHeight: 1024 },
      createEmbeddedDocuments: vi.fn(async (_type, d) => d),
    });
    s.update = vi.fn(async () => s);
    return s;
  }) };
  game.scenes = collection(scenes);
  game.settings._store.set(KEY, freshState());
  game.settings._store.set(`${MODULE_ID}.sectorArtEnabled`, false);
  game.settings._store.set(`${MODULE_ID}.sectorNarratorStubsEnabled`, false);
  game.settings._store.set(`${MODULE_ID}.sectorEntityPortraitsEnabled`, false);
});
afterEach(() => {
  vi.restoreAllMocks();
  delete global.Scene;
  global.Actor.create = realActorCreate;
  global.JournalEntry = realJournalEntry;
  game.journal = realGameJournal;
  game.scenes  = realGameScenes;
});

const world         = () => game.settings.get(MODULE_ID, 'campaignState');
const actorCount    = () => game.actors.contents.length;
const sectorRecords = () => journals.filter(j => j.flags?.[MODULE_ID]?.sectorRecord);
const listedActors  = () => [...world().settlementIds, ...world().connectionIds, ...world().locationIds];

/** The world refuses the "Sector Created" card — the one write after the sector is stored. */
function refuseTheSectorCreatedCard() {
  const realCreate = ChatMessage.create;
  vi.spyOn(ChatMessage, 'create').mockImplementation(async function (data, ...rest) {
    if (data?.flags?.[MODULE_ID]?.sectorCreated) throw new Error('ChatMessage could not be created: the server refused the write');
    return realCreate.call(ChatMessage, data, ...rest);
  });
}

describe('a sector creation that fails after the sector is stored takes nothing back (issue #362 AC26)', () => {
  it('control: a run refused at the store itself is rolled back whole (SECTOR-CREATE-PARTIAL holds)', async () => {
    const sector = generateSector('expanse');
    sector.trouble = null;
    const realSet = game.settings.set;
    let calls = 0;
    vi.spyOn(game.settings, 'set').mockImplementation(async (...args) => {
      if (args[1] === 'campaignState') calls += 1;
      if (args[1] === 'campaignState' && calls === 1) throw new Error('Setting [campaignState] could not be saved: the server refused the write');
      return realSet.apply(game.settings, args);
    });
    expectConsoleError(/storing the sector failed/);

    await expect(runSectorCreationPipeline(sector)).rejects.toThrow(/refused/);
    expect(world().sectors.some(s => s.id === sector.id)).toBe(false);   // not stored
    expect(actorCount()).toBe(0);
    expect(scenes).toHaveLength(0);
    expect(sectorRecords()).toHaveLength(0);
  });

  it('control: with the card posted, the stored sector keeps everything it lists', async () => {
    const sector = generateSector('expanse');
    sector.trouble = null;
    await runSectorCreationPipeline(sector);
    expect(world().activeSectorId).toBe(sector.id);
    expect(listedActors().every(id => !!game.actors.get(id))).toBe(true);
    expect(scenes).toHaveLength(1);
  });

  it('the "Sector Created" card refused: the sector is stored and active — its Actors, Scene and Sector Record are still in the world', async () => {
    const sector = generateSector('expanse');
    sector.trouble = null;
    refuseTheSectorCreatedCard();

    const created = await runSectorCreationPipeline(sector).catch(err => ({ rejected: err }));

    // The store took the sector before the card was tried (the setup is real).
    const stored = world().sectors.find(s => s.id === sector.id);
    expect(stored?.mapData).toBeTruthy();
    expect(world().activeSectorId).toBe(sector.id);
    const listed = listedActors();
    expect(listed).toHaveLength(sector.settlements.length + 1 + sector.sites.length);

    // Everything the stored record lists is still there — every one of them
    // was deleted by the rollback (0 Actors, 0 Scenes, 0 Sector Records).
    expect(listed.filter(id => !game.actors.get(id))).toEqual([]);
    expect(scenes.some(s => s.id === stored.sceneId)).toBe(true);
    expect(sectorRecords()).toHaveLength(1);

    // The card is cosmetic: the run is the sector's creation, and it succeeded
    // (it rejected, and the wizard said "Failed to save sector").
    expect(created?.rejected).toBeUndefined();
    expect(created?.id).toBe(sector.id);
    expect(ChatMessage._created.some(m => m.flags?.[MODULE_ID]?.sectorCreated)).toBe(false);
  });

  it('…and a later run for it (a retry, a quickstart re-run), which finds the sector "already stored" and reports success, returns a sector that has its settlements', async () => {
    const sector = generateSector('expanse');
    sector.trouble = null;
    refuseTheSectorCreatedCard();
    await runSectorCreationPipeline(sector).catch(() => null);
    vi.restoreAllMocks();

    const again = await runSectorCreationPipeline(sector);
    expect(again?.id).toBe(sector.id);                                  // "created" — the wizard closes
    // It was 0 — the settlements the record names were deleted and nothing made them again.
    expect(world().sectors.find(s => s.id === sector.id).settlementIds.filter(id => !!game.actors.get(id)))
      .toHaveLength(sector.settlements.length);
    expect(actorCount()).toBe(sector.settlements.length + 1 + sector.sites.length);   // no second set
    expect(scenes).toHaveLength(1);
  });

  it('any other step failing after the store (the toast) takes nothing back either: the run returns the stored sector', async () => {
    const sector = generateSector('expanse');
    sector.trouble = null;
    const realInfo = ui.notifications.info;
    vi.spyOn(ui.notifications, 'info').mockImplementation((msg, ...rest) => {
      if (/^Sector ".*" created\.$/.test(String(msg))) throw new Error('the toast failed');
      return realInfo.call(ui.notifications, msg, ...rest);
    });

    const created = await runSectorCreationPipeline(sector).catch(err => ({ rejected: err }));
    expect(world().activeSectorId).toBe(sector.id);
    expect(listedActors().filter(id => !game.actors.get(id))).toEqual([]);
    expect(scenes).toHaveLength(1);
    expect(sectorRecords()).toHaveLength(1);
    expect(created?.rejected).toBeUndefined();
    expect(created?.id).toBe(sector.id);
  });
});

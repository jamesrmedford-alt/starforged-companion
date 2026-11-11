/* global silenceConsoleErrors */
/**
 * STARFORGED COMPANION
 * tests/unit/artCachePagelessEntryCompleted.test.js
 *
 * Issue #345 AA54 (ART-CACHE-PAGELESS-ENTRY) — the page-less-journal shape
 * issue #342 fixed for the Chronicle (Z62), a faction
 * (FACTION-PAGELESS-JOURNAL) and a creature (CREATURE-PAGELESS-JOURNAL), in
 * the Art Cache. storage.createAssetEntry creates "Art: <type> <entityId>
 * <assetId>" flagged `entityType: "artAsset"`, then its one page (the image,
 * in a page flag) in a second write. A refused page threw out of
 * storeArtAsset / generatePortrait and left the entry, page-less: nothing
 * reads an asset off it (findEntityPortrait, loadArtAsset, deleteEntityArtAssets),
 * so the GM's next Generate made a second entry beside it and the first
 * stayed empty in the Art Cache folder for good — and updateAssetEntry's own
 * page-less branch made another entry of the same name.
 *
 * Now a page-less entry made for the entity is the one the next portrait
 * completes (renamed to it, its page added): one entry, never two. The entry
 * is stamped with the entity its asset was made for (assetEntityType /
 * assetEntityId), the name its creator gave it the fallback for an entry made
 * before that; the X-Card's deleteEntityArtAssets takes a page-less entry of
 * the entity too.
 *
 * Driven as portraitLinkRefused.test.js drives the generator: a booted GM
 * table, the real generator and Art Cache storage, the image call stubbed,
 * page creations refused on demand.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const art = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../src/art/openRouterImage.js', () => ({
  generateOpenRouterImage: vi.fn(async () => { art.calls += 1; return 'A'.repeat(400); }),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let nextId = 0;
let refusePages = 0;

/** A JournalEntry that keeps its pages; a refused page creation creates none. */
function makeJournal(data) {
  const id = `jrnl${String(++nextId).padStart(12, '0')}`;
  const journal = {
    id, name: data.name, folder: data.folder ?? null,
    flags: JSON.parse(JSON.stringify(data.flags ?? {})),
    pages: { contents: [] },
    async createEmbeddedDocuments(_type, list) {
      if (refusePages > 0) { refusePages -= 1; throw new Error('The server refused the page (test fault)'); }
      return list.map((d) => {
        const page = {
          id: `page${String(++nextId).padStart(12, '0')}`,
          name: d.name, type: d.type ?? 'text', text: d.text ?? {},
          flags: JSON.parse(JSON.stringify(d.flags ?? {})),
          getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
          async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = JSON.parse(JSON.stringify(value)); return this; },
          async update() { return this; },
        };
        journal.pages.contents.push(page);
        return page;
      });
    },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = value; return this; },
    async update(changes) { Object.assign(this, JSON.parse(JSON.stringify(changes))); return this; },
    async delete() { globalThis.game.journal.delete(this.id); return this; },
  };
  return journal;
}

let table;
let savedJournalEntry;
let vance;
const record = () => vance.flags[MODULE_ID].connection;
const artEntries = () => table.journal.contents.filter(e => e.flags?.[MODULE_ID]?.entityType === 'artAsset');
const pageless = () => artEntries().filter(e => !e.pages.contents.length).map(e => e.name);
const pageAsset = (entry) => entry.pages.contents[0]?.flags?.[MODULE_ID]?.artAsset ?? null;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  art.calls = 0;
  refusePages = 0;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoSeedConnection: false,
    campaignState: { ...CampaignStateSchema, connectionIds: ['npc-vance'] },
  } } });
  await table.client('gm-1').setSetting('openRouterApiKey', 'sk-or-test');
  globalThis.foundry.applications.apps.FilePicker.implementation._reset();
  savedJournalEntry = globalThis.JournalEntry;
  globalThis.JournalEntry = {
    async create(data) {
      const j = makeJournal(data);
      globalThis.game.journal._set(j.id, j);
      return j;
    },
  };
  vance = table.addActor({
    id: 'npc-vance', name: 'Vance', type: 'character', img: 'icons/svg/mystery-man.svg',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'rec-vance', name: 'Vance', role: 'Pilot', rank: 'dangerous', active: true, history: [],
      portraitSourceDescription: 'A weathered pilot in a patched flight suit',
    } } },
  });
  vance.documentName = 'Actor';
  await table.settle();
  silenceConsoleErrors();
});
afterEach(() => { globalThis.JournalEntry = savedJournalEntry; });

/** The GM's Generate (or a seed / Finalise): the real generatePortrait on the GM's client. */
async function generate() {
  const gm = table.client('gm-1');
  const generator = await gm.import('../../src/art/generator.js');
  const out = await gm.run(() => generator.generatePortrait('npc-vance', 'connection', record(), game.settings.get(MODULE_ID, 'campaignState')))
    .catch(err => ({ threw: String(err?.message ?? err) }));
  await table.settle();
  return out;
}

/** The GM's client's own storage module. */
async function storage() {
  return table.client('gm-1').import('../../src/art/storage.js');
}

describe('issue #345 AA54 — a portrait whose Art Cache page the world refused', () => {
  it('leaves no empty "Art: …" journal behind — after the refusal and the GM\'s next Generate, the Art Cache holds only the portrait that was saved', async () => {
    refusePages = 1;
    const first = await generate();
    expect(first?.threw ?? null, 'the first portrait was not saved (setup)').toMatch(/refused the page/);
    expect(record().portraitId ?? null, 'nothing linked (setup)').toBeNull();
    expect(pageless(), 'the refusal left one page-less entry (setup)').toHaveLength(1);

    const second = await generate();
    expect(second?._id, 'the retry saved a portrait (setup)').toBeTruthy();
    expect(record().portraitId).toBe(second._id);

    expect(pageless(), 'no page-less Art Cache entry').toEqual([]);
    expect(artEntries().map(e => e.flags[MODULE_ID].assetId), "the Art Cache's entries for Vance").toEqual([second._id]);
    // The one entry is the saved portrait's, under its own name — what
    // loadArtAsset's index and the next store of the asset find it by.
    const [entry] = artEntries();
    expect(entry.name).toBe(`Art: connection rec-vance ${second._id}`);
    expect(pageAsset(entry)?._id).toBe(second._id);
    const stored = table.client('gm-1').getSetting('campaignState');
    expect(stored.artAssetIds?.[second._id]).toBe(entry.name);
    const { loadArtAsset } = await storage();
    const loaded = await table.client('gm-1').run(() => loadArtAsset(second._id, stored));
    expect(loaded?._id, 'the panel loads it').toBe(second._id);
  }, 60_000);

  it('a page refused twice still leaves one page-less entry, which the third Generate completes', async () => {
    refusePages = 2;
    expect((await generate())?.threw ?? null).toMatch(/refused the page/);
    expect((await generate())?.threw ?? null).toMatch(/refused the page/);
    expect(pageless(), 'one page-less entry, not two').toHaveLength(1);

    const third = await generate();
    expect(third?._id).toBeTruthy();
    expect(pageless()).toEqual([]);
    expect(artEntries().map(e => e.flags[MODULE_ID].assetId)).toEqual([third._id]);
  }, 60_000);

  it('a page-less entry made before the entity flags (named only) is completed too', async () => {
    const legacy = makeJournal({
      name: 'Art: connection rec-vance oldAsset0000001',
      flags: { [MODULE_ID]: { entityType: 'artAsset', assetId: 'oldAsset0000001' } },
    });
    table.journal._set(legacy.id, legacy);
    // Another entity's page-less entry is not Vance's.
    const other = makeJournal({
      name: 'Art: connection rec-sable oldAsset0000002',
      flags: { [MODULE_ID]: { entityType: 'artAsset', assetId: 'oldAsset0000002' } },
    });
    table.journal._set(other.id, other);

    const made = await generate();
    expect(made?._id).toBeTruthy();
    expect(legacy.pages.contents, "the legacy entry was given Vance's page").toHaveLength(1);
    expect(legacy.name).toBe(`Art: connection rec-vance ${made._id}`);
    expect(legacy.flags[MODULE_ID]).toMatchObject({ entityType: 'artAsset', assetId: made._id, assetEntityType: 'connection', assetEntityId: 'rec-vance' });
    expect(pageless(), "only the other NPC's entry is left page-less").toEqual(['Art: connection rec-sable oldAsset0000002']);
  }, 60_000);

  it('the same asset stored again onto its page-less entry gives that entry its page — no second entry of the name', async () => {
    const { storeArtAsset } = await storage();
    const asset = { _id: 'asset-retry', entityType: 'connection', entityId: 'rec-vance', b64: 'iVBOR', locked: false };
    refusePages = 1;
    await expect(table.client('gm-1').run(() => storeArtAsset(asset, {}))).rejects.toThrow(/refused the page/);
    await table.settle();
    expect(pageless(), 'setup').toEqual(['Art: connection rec-vance asset-retry']);

    await table.client('gm-1').run(() => storeArtAsset({ ...asset, locked: true }, {}));
    await table.settle();
    expect(artEntries().map(e => e.name)).toEqual(['Art: connection rec-vance asset-retry']);
    expect(pageAsset(artEntries()[0])).toMatchObject({ _id: 'asset-retry', locked: true });
  }, 60_000);

  it("the X-Card's portrait removal takes the entity's page-less entry with it", async () => {
    refusePages = 1;
    expect((await generate())?.threw ?? null).toMatch(/refused the page/);
    expect(pageless(), 'setup').toHaveLength(1);
    const { deleteEntityArtAssets } = await storage();
    const deleted = await table.client('gm-1').run(() => deleteEntityArtAssets('connection', 'rec-vance', { portraitId: null }));
    await table.settle();
    expect(deleted).toBe(1);
    expect(artEntries()).toEqual([]);
  }, 60_000);

  it('control: with every page saved, one Generate makes one entry, with its page', async () => {
    const made = await generate();
    expect(made?._id).toBeTruthy();
    expect(pageless()).toEqual([]);
    expect(artEntries().map(e => e.flags[MODULE_ID].assetId)).toEqual([made._id]);
    expect(art.calls).toBe(1);
  }, 60_000);
});

/* global silenceConsoleErrors */
/**
 * STARFORGED COMPANION
 * tests/unit/artRegenerationLeavesNoOrphan.test.js
 *
 * Two orphans a portrait's one regeneration left in the Art Cache folder:
 *
 * REGENERATE-PORTRAIT-ORPHAN — regeneratePortrait had no host-gone check of
 * its own (generatePortrait has had one since issue #338 D6(ii)): a
 * connection deleted while its regenerated image was out — the X-Card taking
 * it back with its narration, or the GM deleting the card — still had the new
 * portrait stored, an "Art: …" entry nothing links to.
 *
 * ART-REGEN-PAGELESS-ENTRY (issue #345 AA54's residual) — a regeneration
 * whose new portrait's page the world refused left that "Art: …" entry
 * page-less. The entity is locked once the regeneration is spent, so no later
 * Generate completes it (storeArtAsset's page-less branch), and it went only
 * with the entity. The refusal path now deletes it.
 *
 * Driven as artCachePagelessEntryCompleted.test.js drives the generator: a
 * booted GM table, the real generator and Art Cache storage, the image call
 * stubbed (held on demand), page creations refused on demand.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const art = vi.hoisted(() => ({ calls: 0, next: [] }));
vi.mock('../../src/art/openRouterImage.js', () => ({
  generateOpenRouterImage: vi.fn(async () => {
    art.calls += 1;
    const step = art.next.shift();
    if (step?.hold) await step.hold;
    return 'A'.repeat(400);
  }),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { deferred } from '../helpers/faults.js';
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
  art.next = [];
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

/** Start fn(generator, campaignState) on the GM's client; its promise. */
async function startOnGm(fn) {
  const gm = table.client('gm-1');
  const generator = await gm.import('../../src/art/generator.js');
  return gm.run(() => fn(generator, game.settings.get(MODULE_ID, 'campaignState')));
}
async function generate() {
  const out = await startOnGm((g, cs) => g.generatePortrait('npc-vance', 'connection', record(), cs));
  await table.settle();
  return out;
}
const regenerate = () => startOnGm((g, cs) => g.regeneratePortrait('npc-vance', 'connection', record(), cs));

describe('REGENERATE-PORTRAIT-ORPHAN — a regeneration whose entity went while its image was out', () => {
  it('stores nothing: the Art Cache keeps no portrait of an entity that is gone', async () => {
    const first = await generate();
    expect(first?._id, 'the first portrait (setup)').toBeTruthy();
    const image = deferred();
    art.next = [{ hold: image.promise }];
    const regen = regenerate();
    await vi.waitFor(() => expect(art.calls).toBe(2));   // the regeneration's image is out

    // The X-Card's removal of the unused card (connection.retractNarrationConnections):
    // the actor, and its portraits with it (deleteEntityArtAssets).
    table.actors.delete('npc-vance');
    for (const e of artEntries()) table.journal.delete(e.id);
    image.resolve();
    const out = await regen;
    await table.settle();

    expect(out).toBeNull();
    // It stored the regenerated portrait — and gave the claimed one back,
    // re-creating the entry the removal deleted.
    expect(artEntries().map(e => e.name)).toEqual([]);
    expect(Object.keys(table.client('gm-1').getSetting('campaignState').artAssetIds ?? {})
      .filter(id => id !== first._id)).toEqual([]);
  }, 60_000);

  it('control: with the entity still there, the regeneration lands, locked', async () => {
    await generate();
    const landed = await regenerate();
    await table.settle();
    expect(landed).toMatchObject({ regenerationUsed: true, locked: true });
    expect(record().portraitId).toBe(landed._id);
  }, 60_000);
});

describe('ART-REGEN-PAGELESS-ENTRY — a regeneration whose page the world refused', () => {
  it('leaves no page-less "Art: …" entry: the earlier portrait stays, locked, and the Art Cache holds only it', async () => {
    const first = await generate();
    refusePages = 1;
    const out = await regenerate();
    await table.settle();

    expect(out, 'the regenerated portrait was not saved (setup)').toBeNull();
    expect(record().portraitId, 'the earlier portrait stays the entity\'s').toBe(first._id);
    expect(pageless(), 'no page-less Art Cache entry').toEqual([]);
    expect(artEntries().map(e => pageAsset(e)?._id)).toEqual([first._id]);
    expect(pageAsset(artEntries()[0])).toMatchObject({ regenerationUsed: true, locked: true });
  }, 60_000);

  it('control: a page-less entry of the first portrait (no regeneration) is still completed by the next Generate', async () => {
    refusePages = 1;
    await startOnGm((g, cs) => g.generatePortrait('npc-vance', 'connection', record(), cs)).catch(() => null);
    await table.settle();
    expect(pageless(), 'setup').toHaveLength(1);
    const made = await generate();
    expect(made?._id).toBeTruthy();
    expect(pageless()).toEqual([]);
  }, 60_000);
});

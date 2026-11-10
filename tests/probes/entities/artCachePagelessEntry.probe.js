/* global silenceConsoleErrors */
/**
 * PROBE — ENT: ART-CACHE-PAGELESS-ENTRY (twelfth audit, 2026-11-09)
 *
 * The page-less-journal shape this cycle fixed three times — the Chronicle
 * (issue #342 Z62), a faction (FACTION-PAGELESS-JOURNAL) and a creature
 * (CREATURE-PAGELESS-JOURNAL): a creator makes a JournalEntry, then its one
 * page in a second write; a world that refuses the page leaves a flagged
 * journal with no page that nothing ever completes, and the retry makes a
 * second one. The Art Cache's portrait store has the same two-step creation
 * and was not covered: storage.createAssetEntry (src/art/storage.js:242)
 * creates "Art: <type> <entityId> <assetId>" flagged `entityType: "artAsset"`,
 * then `createEmbeddedDocuments("JournalEntryPage", …)` with the image in its
 * flag. A refused page throws out of storeArtAsset / generatePortrait (the
 * image bought is lost with it) and leaves the entry, page-less:
 *   - findEntityPortrait / loadArtAsset read the asset off the page
 *     (readAssetFromEntry → null), so the next Generate / seed / Finalise
 *     makes a second entry beside it (FIRST-PORTRAIT-LINK-REFUSED's
 *     "link the stored image" cannot see it — there is no image in it);
 *   - deleteEntityArtAssets matches by the page's asset or the record's
 *     portraitId (never set), so the X-Card's removal of the NPC leaves it;
 *   - updateAssetEntry's own page-less branch (storage.js:262) creates another
 *     entry of the same name rather than giving the existing one its page.
 * So every refused portrait page leaves an empty "Art: …" journal in the Art
 * Cache folder for good.
 *
 * Driven as portraitLinkRefused.test.js drives the generator: a booted GM
 * table, the real generator and Art Cache storage, the image call stubbed,
 * one page creation refused.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const art = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../../src/art/openRouterImage.js', () => ({
  generateOpenRouterImage: vi.fn(async () => { art.calls += 1; return 'A'.repeat(400); }),
}));

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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
    async update(changes) { Object.assign(this, changes); return this; },
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

describe('ENT probe — a portrait whose Art Cache page the world refused', () => {
  it('leaves no empty "Art: …" journal behind — after the refusal and the GM\'s next Generate, the Art Cache holds only the portrait that was saved', async () => {
    refusePages = 1;
    const first = await generate();
    expect(first?.threw ?? null, 'the first portrait was not saved (setup)').toMatch(/refused the page/);
    expect(record().portraitId ?? null, 'nothing linked (setup)').toBeNull();

    const second = await generate();
    expect(second?._id, 'the retry saved a portrait (setup)').toBeTruthy();
    expect(record().portraitId).toBe(second._id);

    expect.soft(pageless(), 'no page-less Art Cache entry').toEqual([]);
    expect(artEntries().map(e => e.flags[MODULE_ID].assetId), "the Art Cache's entries for Vance").toEqual([second._id]);
  }, 60_000);

  it('control: with every page saved, one Generate makes one entry, with its page', async () => {
    const made = await generate();
    expect(made?._id).toBeTruthy();
    expect(pageless()).toEqual([]);
    expect(artEntries().map(e => e.flags[MODULE_ID].assetId)).toEqual([made._id]);
    expect(art.calls).toBe(1);
  }, 60_000);
});

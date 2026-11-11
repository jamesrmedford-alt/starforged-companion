/**
 * Issue #345 AA18 FACTION-JOURNAL-RENAME-NOT-FOLLOWED.
 *
 * A faction (or creature) record lives on a JournalEntry page flag; its journal
 * sits in the GM's "Starforged Entities" folder, named after the faction. The
 * only way a GM renames a faction is the Journal sidebar's rename — nothing in
 * the module renames a faction record. A sidebar rename of an Actor-hosted
 * entity was followed into its record (syncEntityRecordNameOnUpdate,
 * syncEntityRecordNames — "Actor name is authoritative", v1.7.10 finding #2),
 * but both left the journal-hosted types out ("their host journal is named
 * from the record"). So after the rename the Entities panel showed the new
 * name while every narrator / detection surface read the record's old one,
 * and a narration naming the faction by its new name proposed it as a NEW
 * faction (a second World Journal Factions page, a draft row for a second
 * record).
 *
 * Now the journal's name is authoritative for these types too: the record —
 * and a faction's World Journal page, by its backlink — follow it, live on
 * the canonical GM (updateJournalEntry) and at world load
 * (syncEntityRecordNames).
 *
 * Probe adaptation: the probe asserted the World Journal kept exactly its
 * pre-rename entry, ['Iron Syndicate'] — "no second entry"; with the page now
 * following the rename the one entry is ['Ashen Hand'], so the test asserts
 * one entry under the new name (and one [4e] line).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const BASE_STATE = {
  ...CampaignStateSchema,
  sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
  factionIds: [], creatureIds: [], sectors: [],
};

let nextId = 0;

/** A JournalEntry that keeps its pages (the tests/setup.js stub keeps none). */
function makeJournal(data) {
  const id = `jrnl${String(++nextId).padStart(12, '0')}`;
  const journal = {
    id, name: data.name, folder: data.folder ?? null,
    flags: JSON.parse(JSON.stringify(data.flags ?? {})),
    pages: { contents: [] },
    async createEmbeddedDocuments(_type, list) {
      return list.map((d) => {
        const page = {
          id: `page${String(++nextId).padStart(12, '0')}`,
          name: d.name, type: d.type ?? 'text', text: d.text ?? {},
          flags: JSON.parse(JSON.stringify(d.flags ?? {})),
          getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
          async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = value; return this; },
          async update(changes) { if (changes.text) this.text = changes.text; if (changes.name) this.name = changes.name; return this; },
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

describe('issue #345 AA18 — a faction renamed in the Journal sidebar', () => {
  let table;
  let savedJournalEntry;
  const world = () => table.world.campaignState();
  const factionJournals = () => table.journal.contents.filter(j => j.flags?.[MODULE_ID]?.entityType === 'faction');
  const draftRows = () => table.cards(f => f.draftEntityCard).flatMap(c => c.flags[MODULE_ID].drafts.map(d => `${d.type}:${d.name}:${d.status}`));
  // The World Journal's Factions entries (one page per faction).
  const wjFactionPages = () => table.journal.contents
    .flatMap(j => j.pages?.contents ?? [])
    .filter(p => p.flags?.[MODULE_ID]?.factionEntry);
  const wjFactionNames = () => wjFactionPages().map(p => p.flags[MODULE_ID].factionEntry.factionName);

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, autoSeedConnection: false, autoSeedStarship: false,
      campaignState: BASE_STATE,
    } } });
    savedJournalEntry = globalThis.JournalEntry;
    globalThis.JournalEntry = {
      async create(data) {
        const j = makeJournal(data);
        globalThis.game.journal._set(j.id, j);
        return j;
      },
    };
  });
  afterEach(() => { globalThis.JournalEntry = savedJournalEntry; });

  /** A narration's detection naming one entity, routed as the capture routes it. */
  async function detect(name, description = '', type = 'faction') {
    const gm = table.client('gm-1');
    const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
    await gm.run(() => routeEntityDrafts(
      [{ confidence: 'high', type, name, description }],
      game.settings.get(MODULE_ID, 'campaignState'),
      { autoCreateConnection: false },
    ));
    await table.settle();
  }

  /** The faction made the production way: a narration surfaces it, the GM presses Confirm. */
  async function confirmFaction(name) {
    await detect(name, 'A smuggling cartel.');
    const card = table.cards(f => f.draftEntityCard).at(-1);
    table.client('gm-1').click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    const [journal] = factionJournals();
    expect(journal, 'the Confirm made the faction (setup)').toBeTruthy();
    expect(world().factionIds, 'listed (setup)').toEqual([journal.id]);
    expect(wjFactionNames(), 'its World Journal page (setup)').toEqual([name]);
    return journal;
  }

  /** The GM's sidebar rename: the journal document's name, fanned out as Foundry does. */
  async function sidebarRename(journal, name) {
    await journal.update({ name });
    table.fireDocumentHook('gm-1', 'updateJournalEntry', journal, { name });
    await table.settle(); await table.drain();
  }

  /** What the narrator reads: its roster's faction names and the [4e] landscape's. */
  async function narratorNames() {
    const gm = table.client('gm-1');
    const { collectAllEntities } = await gm.import('../../src/context/relevanceResolver.js');
    const { mergeFactionLandscape, listFactions } = await gm.import('../../src/entities/faction.js');
    const { getFactionLandscape } = await gm.import('../../src/world/worldJournal.js');
    return gm.run(async () => {
      const state = game.settings.get(MODULE_ID, 'campaignState');
      const roster = await collectAllEntities(state);
      return {
        roster:    roster.filter(r => r.entityType === 'faction').map(r => r.name),
        landscape: mergeFactionLandscape(listFactions(state), getFactionLandscape(state, { limit: Infinity })).map(l => l.name),
      };
    });
  }

  it('after the GM renames "Iron Syndicate" to "Ashen Hand", the narrator calls it the Ashen Hand and a narration naming it proposes no second faction', async () => {
    const journal = await confirmFaction('Iron Syndicate');
    const rowsBefore = draftRows();

    await sidebarRename(journal, 'Ashen Hand');
    expect(table.journal.get(journal.id).name, 'the rename landed (control)').toBe('Ashen Hand');

    expect(journal.pages.contents[0].flags[MODULE_ID].faction.name, 'the record follows its journal').toBe('Ashen Hand');
    expect(await narratorNames()).toEqual({ roster: ['Ashen Hand'], landscape: ['Ashen Hand'] });
    // One World Journal page for the faction, under its new name, still backlinked.
    expect(wjFactionNames()).toEqual(['Ashen Hand']);
    expect(wjFactionPages()[0].name).toBe('Ashen Hand');
    expect(wjFactionPages()[0].flags[MODULE_ID].factionEntry.entityId).toBe(journal.id);

    // The next narration names it by its (new) name.
    await detect('Ashen Hand', 'Their enforcers watch the docks.');
    expect(wjFactionNames(), 'no second World Journal faction entry').toEqual(['Ashen Hand']);
    expect(draftRows(), 'no new faction row is offered').toEqual(rowsBefore);
    expect(factionJournals()).toHaveLength(1);
  }, 60_000);

  it('the creature twin: a creature renamed "Glowmaw" → "Ashmaw" in the sidebar is not offered again as a new creature', async () => {
    const gm = table.client('gm-1');
    await detect('Glowmaw', 'A luminous void-eel.', 'creature');
    const card = table.cards(f => f.draftEntityCard).at(-1);
    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    const journal = table.journal.contents.find(j => j.flags?.[MODULE_ID]?.entityType === 'creature');
    expect(journal, 'the Confirm made the creature (setup)').toBeTruthy();
    const rowsBefore = draftRows();

    await sidebarRename(journal, 'Ashmaw');
    expect(journal.pages.contents[0].flags[MODULE_ID].creature.name).toBe('Ashmaw');

    await detect('Ashmaw', 'A luminous void-eel.', 'creature');
    expect(draftRows(), 'no new creature row is offered').toEqual(rowsBefore);
  }, 60_000);

  it('a rename made while no GM ran the live sync is followed at world load', async () => {
    const journal = await confirmFaction('Iron Syndicate');
    // Renamed with no updateJournalEntry reaching a GM (no GM connected).
    await journal.update({ name: 'Ashen Hand' });

    const gm = table.client('gm-1');
    const migrator = await gm.import('../../src/entities/migrator.js');
    const summary = await gm.run(() => migrator.syncEntityRecordNames(game.settings.get(MODULE_ID, 'campaignState')));
    await table.drain();

    expect(summary.synced).toBe(1);
    expect(journal.pages.contents[0].flags[MODULE_ID].faction.name).toBe('Ashen Hand');
    expect(wjFactionNames()).toEqual(['Ashen Hand']);
    expect(await narratorNames()).toEqual({ roster: ['Ashen Hand'], landscape: ['Ashen Hand'] });
  }, 60_000);

  it('a World Journal page already named for the new name is another faction\'s log — it is not merged by a guess', async () => {
    const journal = await confirmFaction('Iron Syndicate');
    // The World Journal already logs an "Ashen Hand" (a WJ-only faction).
    const gm = table.client('gm-1');
    const { recordFactionIntelligence } = await gm.import('../../src/world/worldJournal.js');
    await gm.run(() => recordFactionIntelligence('Ashen Hand', { attitude: 'hostile', summary: 'Raiders.' },
      game.settings.get(MODULE_ID, 'campaignState')));
    await table.settle();
    expect(wjFactionNames().sort(), 'two pages (setup)').toEqual(['Ashen Hand', 'Iron Syndicate']);

    await sidebarRename(journal, 'Ashen Hand');
    expect(journal.pages.contents[0].flags[MODULE_ID].faction.name, 'the record still follows its journal').toBe('Ashen Hand');
    expect(wjFactionNames().sort(), 'neither page renamed onto the other').toEqual(['Ashen Hand', 'Iron Syndicate']);
  }, 60_000);

  it('control: without a rename, a narration naming the faction again proposes nothing', async () => {
    await confirmFaction('Iron Syndicate');
    const rowsBefore = draftRows();
    const wjBefore = wjFactionNames();

    await detect('Iron Syndicate', 'Their enforcers watch the docks.');
    expect(draftRows()).toEqual(rowsBefore);
    expect(wjFactionNames()).toEqual(wjBefore);
    expect(factionJournals()).toHaveLength(1);
  }, 60_000);
});

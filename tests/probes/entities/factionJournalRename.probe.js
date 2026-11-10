/**
 * PROBE — ENT: FACTION-JOURNAL-RENAME-NOT-FOLLOWED (twelfth audit, 2026-11-09)
 *
 * A faction (or creature) record lives on a JournalEntry page flag; its journal
 * sits in the GM's "Starforged Entities" folder, named after the faction. The
 * only way a GM can rename a faction is the Journal sidebar's rename — nothing
 * in the module renames a faction record (updateFaction's `name` branch has no
 * caller; the Entities panel edits no record field). A sidebar rename of an
 * Actor-hosted entity is followed into its record (index.js
 * syncEntityRecordNameOnUpdate, migrator.syncEntityRecordNames — "Actor name is
 * authoritative", v1.7.10 finding #2), but both explicitly leave the
 * journal-hosted types out ("their host journal is named from the record",
 * migrator.js:766, index.js:2359). So after the rename:
 *   - the Entities panel shows the journal's new name (entityPanel.js
 *     loadAllEntities / findEntity: `document.name ?? data.name`);
 *   - every narrator / detection surface still reads the record's old name
 *     (relevanceResolver.collectAllEntities, faction.findFactionByName,
 *     entityExtractor.entityExistsAnyType / collectEstablishedEntityNames,
 *     mergeFactionLandscape via listFactions);
 *   - a narration that names the faction by its new name gets it proposed as a
 *     NEW faction: routeEntityDrafts' dedup (entityExistsAnyType) misses it,
 *     the faction auto-surface writes a second World Journal Factions entry
 *     and a draft row offers to create a second faction record.
 *
 * Cited source (22bdbeb): src/entities/faction.js:119 getFaction / :172
 * findFactionByName (record name), :355 updateFaction (renames the journal
 * only when the RECORD is renamed); src/index.js:2360 RENAME_SYNC_TYPES
 * (connection, ship, settlement, planet, location — no faction / creature);
 * src/entities/migrator.js:766; src/entities/entityExtractor.js:552
 * routeEntityDrafts → :575 / :1350 entityExistsAnyType; src/ui/entityPanel.js:141 / :176.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('ENT probe — a faction renamed in the Journal sidebar', () => {
  let table;
  let savedJournalEntry;
  const world = () => table.world.campaignState();
  const factionJournals = () => table.journal.contents.filter(j => j.flags?.[MODULE_ID]?.entityType === 'faction');
  const draftRows = () => table.cards(f => f.draftEntityCard).flatMap(c => c.flags[MODULE_ID].drafts.map(d => `${d.type}:${d.name}:${d.status}`));
  // The World Journal's Factions entries (one page per faction).
  const wjFactionNames = () => table.journal.contents
    .flatMap(j => j.pages?.contents ?? [])
    .map(p => p.flags?.[MODULE_ID]?.factionEntry?.factionName)
    .filter(Boolean);

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

  /** A narration's detection naming one faction, routed as the capture routes it. */
  async function detect(name, description = '') {
    const gm = table.client('gm-1');
    const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
    await gm.run(() => routeEntityDrafts(
      [{ confidence: 'high', type: 'faction', name, description }],
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
    return journal;
  }

  it('after the GM renames "Iron Syndicate" to "Ashen Hand" in the sidebar, a narration naming the Ashen Hand does not propose a second faction', async () => {
    const journal = await confirmFaction('Iron Syndicate');
    const rowsBefore = draftRows();
    const wjBefore = wjFactionNames();

    // The GM's sidebar rename: the journal document's name, fanned out as Foundry does.
    await journal.update({ name: 'Ashen Hand' });
    table.fireDocumentHook('gm-1', 'updateJournalEntry', journal, { name: 'Ashen Hand' });
    await table.settle();

    // The Entities panel's name for it is the journal's (control: the rename landed).
    expect(table.journal.get(journal.id).name).toBe('Ashen Hand');

    // What the narrator's roster calls it (soft: the duplicate below is the
    // player-visible consequence).
    const gm = table.client('gm-1');
    const { collectAllEntities } = await gm.import('../../src/context/relevanceResolver.js');
    const roster = await gm.run(() => collectAllEntities(game.settings.get(MODULE_ID, 'campaignState')));
    expect.soft(roster.filter(r => r.entityType === 'faction').map(r => r.name), 'the narrator roster name').toEqual(['Ashen Hand']);

    // The next narration names it by its (new) name.
    await detect('Ashen Hand', 'Their enforcers watch the docks.');
    expect(wjFactionNames(), 'no second World Journal faction entry').toEqual(wjBefore);
    expect(draftRows(), 'no new faction row is offered').toEqual(rowsBefore);
    expect(factionJournals()).toHaveLength(1);
  }, 60_000);

  it('the creature twin: a creature renamed "Glowmaw" → "Ashmaw" in the sidebar is not offered again as a new creature', async () => {
    const gm = table.client('gm-1');
    const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
    const route = async (name) => {
      await gm.run(() => routeEntityDrafts(
        [{ confidence: 'high', type: 'creature', name, description: 'A luminous void-eel.' }],
        game.settings.get(MODULE_ID, 'campaignState'), { autoCreateConnection: false }));
      await table.settle();
    };
    await route('Glowmaw');
    const card = table.cards(f => f.draftEntityCard).at(-1);
    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    const journal = table.journal.contents.find(j => j.flags?.[MODULE_ID]?.entityType === 'creature');
    expect(journal, 'the Confirm made the creature (setup)').toBeTruthy();
    const rowsBefore = draftRows();

    await journal.update({ name: 'Ashmaw' });
    table.fireDocumentHook('gm-1', 'updateJournalEntry', journal, { name: 'Ashmaw' });
    await table.settle();

    await route('Ashmaw');
    expect(draftRows(), 'no new creature row is offered').toEqual(rowsBefore);
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

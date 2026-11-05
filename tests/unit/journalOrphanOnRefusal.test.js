/**
 * STARFORGED COMPANION
 * tests/unit/journalOrphanOnRefusal.test.js
 *
 * Known-issues JOURNAL-ORPHAN-ON-REFUSAL — issue #337 Y34's shape, for the
 * entities that live on a JournalEntry. `createFaction` / `createCreature`
 * make their JournalEntry, then register its id in campaignState (issue #331
 * X35's order); a refused registration left an entry no list names, and the
 * GM's retried draft Confirm made a SECOND one — two "Iron Syndicate" journals,
 * one listed, the first never seeded and never read again. No load-time pass
 * listed a journal-hosted entity either.
 *
 * Now a creator adopts the unlisted journal of its type and name
 * (`registry.adoptUnlistedEntityJournal` — rules/reachability.md §7
 * get-or-create; a faction's name by its identity key, issue #336 Y31), and
 * the canonical GM's world load lists faction and creature journals their
 * list misses (`migrator.registerUnlistedEntityActors`).
 */

/* global expectConsoleError */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { failWrites, campaignStateWrite } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { FactionSchema } from '../../src/entities/faction.js';
import { CreatureSchema } from '../../src/entities/creature.js';

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
  };
  return journal;
}

/** A journal as a creator leaves it: the entry flagged, one page carrying the record. */
async function entityJournal(typeKey, record) {
  const journal = makeJournal({ name: record.name, flags: { [MODULE_ID]: { entityType: typeKey, entityId: record._id } } });
  await journal.createEmbeddedDocuments('JournalEntryPage', [{
    name: 'Data', type: 'text', text: { content: '' }, flags: { [MODULE_ID]: { [typeKey]: record } },
  }]);
  return journal;
}

describe('a faction or creature Confirm whose registration the world refused, then confirmed again', () => {
  let table;
  let savedJournalEntry;
  const world = () => table.world.campaignState();
  const journalsOf = (typeKey, name) => table.journal.contents.filter(j =>
    j.flags?.[MODULE_ID]?.entityType === typeKey && (!name || j.name === name));
  const rows = (card) => table.world.message(card._id).flags[MODULE_ID].drafts.map(d => [d.name, d.status]);

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

  async function draftCard(entity) {
    const gm = table.client('gm-1');
    const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
    await gm.run(() => routeEntityDrafts(
      [{ confidence: 'high', ...entity }],
      game.settings.get(MODULE_ID, 'campaignState'),
      { autoCreateConnection: false },
    ));
    await table.settle();
    const cards = table.cards(f => f.draftEntityCard);
    expect(cards).toHaveLength(1);
    return cards[0];
  }

  /** Confirm once with the registration refused, then again with it taken. */
  async function confirmRefusedThenRetried(card, typeKey, name, listKey) {
    const gm = table.client('gm-1');
    const refused = failWrites(table, campaignStateWrite('gm-1'), { times: 1 });

    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(refused.refused).toBe(1);
    expect(gm.notifications.some(n => new RegExp(`Failed to create ${typeKey} "${name}"`).test(n.message))).toBe(true);   // control: the GM was told
    expect(rows(card)).toEqual([[name, 'pending']]);                                                                        // control: Confirm is offered again
    expect(world()[listKey]).toEqual([]);                                                                                   // the world never took it
    expect(journalsOf(typeKey, name)).toHaveLength(1);                                                                      // … but the journal exists
    const orphanId = journalsOf(typeKey, name)[0].id;

    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    return orphanId;
  }

  it('a faction: the retry adopts the journal the first Confirm made — one Iron Syndicate, listed, seeded', async () => {
    expectConsoleError(/registering factionIds failed/);
    expectConsoleError(/draft confirm: createXxx failed/);
    const card = await draftCard({ type: 'faction', name: 'Iron Syndicate', description: 'A smuggling cartel.' });

    const orphanId = await confirmRefusedThenRetried(card, 'faction', 'Iron Syndicate', 'factionIds');

    expect(rows(card)).toEqual([['Iron Syndicate', 'confirmed']]);
    expect(journalsOf('faction', 'Iron Syndicate')).toHaveLength(1);              // it made a second journal
    expect(world().factionIds).toEqual([orphanId]);
    // The adopted record gets what the first Confirm never reached: its oracle seed.
    const record = table.journal.get(orphanId).pages.contents[0].flags[MODULE_ID].faction;
    expect(record.seeded).toBe(true);
    expect(record.type).toBeTruthy();
  }, 30_000);

  it('a creature: the retry adopts the journal the first Confirm made', async () => {
    expectConsoleError(/registering creatureIds failed/);
    expectConsoleError(/draft confirm: createXxx failed/);
    const card = await draftCard({ type: 'creature', name: 'Glass Wyrm', description: 'A crystalline burrower.' });

    const orphanId = await confirmRefusedThenRetried(card, 'creature', 'Glass Wyrm', 'creatureIds');

    expect(rows(card)).toEqual([['Glass Wyrm', 'confirmed']]);
    expect(journalsOf('creature', 'Glass Wyrm')).toHaveLength(1);
    expect(world().creatureIds).toEqual([orphanId]);
  }, 30_000);

  it('control: with the write accepted one Confirm makes one listed journal', async () => {
    const gm = table.client('gm-1');
    const card = await draftCard({ type: 'faction', name: 'Iron Syndicate', description: 'A smuggling cartel.' });
    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(rows(card)).toEqual([['Iron Syndicate', 'confirmed']]);
    expect(journalsOf('faction', 'Iron Syndicate')).toHaveLength(1);
    expect(world().factionIds).toEqual(journalsOf('faction', 'Iron Syndicate').map(j => j.id));
  }, 30_000);

  it("a faction is adopted by its identity key (issue #336 Y31): an unlisted \"The Iron Syndicate\" is the Iron Syndicate's", async () => {
    const gm = table.client('gm-1');
    const orphan = await entityJournal('faction', { ...FactionSchema, _id: 'rec-iron', name: 'The Iron Syndicate' });
    table.journal.set(orphan.id, orphan);
    const { createFaction } = await gm.import('../../src/entities/faction.js');

    const made = await gm.run(() => createFaction({ name: 'Iron  syndicate' }, game.settings.get(MODULE_ID, 'campaignState')));
    await table.settle();

    expect(made._id).toBe('rec-iron');
    expect(journalsOf('faction')).toHaveLength(1);
    expect(world().factionIds).toEqual([orphan.id]);
  }, 30_000);

  it('control: a listed journal, or one of another name or type, is never adopted', async () => {
    const gm = table.client('gm-1');
    const { createFaction } = await gm.import('../../src/entities/faction.js');
    const { createCreature } = await gm.import('../../src/entities/creature.js');
    const unlistedCreature = await entityJournal('creature', { ...CreatureSchema, _id: 'rec-wyrm', name: 'Iron Syndicate' });
    const unlistedFaction  = await entityJournal('faction', { ...FactionSchema, _id: 'rec-veil', name: 'Crimson Veil' });
    table.journal.set(unlistedCreature.id, unlistedCreature);
    table.journal.set(unlistedFaction.id, unlistedFaction);

    await gm.run(() => createFaction({ name: 'Iron Syndicate' }, game.settings.get(MODULE_ID, 'campaignState')));
    await gm.run(() => createFaction({ name: 'Iron Syndicate' }, game.settings.get(MODULE_ID, 'campaignState')));
    await gm.run(() => createCreature({ name: 'Glass Wyrm' }, game.settings.get(MODULE_ID, 'campaignState')));
    await table.settle();

    expect(journalsOf('faction', 'Iron Syndicate')).toHaveLength(2);   // the first was listed: a second creation makes its own
    expect(world().factionIds).toHaveLength(2);
    expect(world().factionIds).not.toContain(unlistedFaction.id);
    expect(world().creatureIds).not.toContain(unlistedCreature.id);
    expect(journalsOf('creature', 'Glass Wyrm')).toHaveLength(1);
  }, 30_000);
});

describe("the canonical GM's world load lists the faction and creature journals a refused write left unregistered", () => {
  let loadTable;
  afterAll(() => loadTable?.teardown());

  it('an unlisted faction and creature are listed; a copy of a listed record is not', async () => {
    loadTable = await simulateTable({
      users: [USERS.GM], boot: false,
      world: { settings: {
        chronicleAutoEntry: false, autoSeedConnection: false, autoSeedStarship: false,
        campaignState: { ...BASE_STATE, factionIds: ['fac-listed'] },
      } },
    });
    const put = (journal, id) => { journal.id = id; loadTable.journal.set(id, journal); };
    put(await entityJournal('faction',  { ...FactionSchema,  _id: 'rec-listed', name: 'Crimson Veil' }), 'fac-listed');
    put(await entityJournal('faction',  { ...FactionSchema,  _id: 'rec-iron',   name: 'Iron Syndicate' }), 'fac-orphan');      // a refused Confirm's journal
    put(await entityJournal('faction',  { ...FactionSchema,  _id: 'rec-listed', name: 'Crimson Veil (Copy)' }), 'fac-copy');  // the sidebar's Duplicate of a listed one
    put(await entityJournal('creature', { ...CreatureSchema, _id: 'rec-wyrm',   name: 'Glass Wyrm' }), 'cre-orphan');

    await loadTable.client('gm-1').boot();
    await loadTable.drain();

    const state = loadTable.world.campaignState();
    expect(state.factionIds).toEqual(['fac-listed', 'fac-orphan']);
    expect(state.creatureIds).toEqual(['cre-orphan']);
  }, 60_000);
});

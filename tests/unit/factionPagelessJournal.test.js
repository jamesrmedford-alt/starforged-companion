/**
 * STARFORGED COMPANION
 * tests/unit/factionPagelessJournal.test.js
 *
 * Known-issues FACTION-PAGELESS-JOURNAL (found while fixing issue #342 Z62 —
 * its faction twin). `createFaction` makes the faction's JournalEntry, then
 * its one page (the record), then registers the entry's id. A world that
 * refused the page creation left a journal flagged as a faction with no page:
 * the GM's retried draft Confirm adopted nothing — adoption
 * (`registry.adoptUnlistedEntityJournal`) and the world load's listing
 * (`migrator.registerUnlistedEntityActors`) read the record off the page — so
 * it made a SECOND "Iron Syndicate" journal, the first left empty and unlisted
 * for good. Now the retry completes the first creation: an unlisted faction
 * journal with no page, of the faction's name, gets its page (the record,
 * under the id the journal's `entityId` flag names) and is listed — the
 * get-or-create of rules/reachability.md §7, as the Chronicle's page-less
 * journal is completed by its next write (issue #342 Z62).
 */

/* global expectConsoleError */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const BASE_STATE = {
  ...CampaignStateSchema,
  sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
  factionIds: [], creatureIds: [], sectors: [],
};

let nextId = 0;
// Journal page creations the world refuses next (one each).
let refusePages = 0;

/** A JournalEntry that keeps its pages (the tests/setup.js stub keeps none); a refused page creation creates none. */
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

/** A journal as a refused page creation leaves it: flagged, no page. */
function pagelessJournal(typeKey, name, entityId) {
  return makeJournal({ name, flags: { [MODULE_ID]: { entityType: typeKey, entityId } } });
}

describe('a faction Confirm whose page the world refused, then confirmed again', () => {
  let table;
  let savedJournalEntry;
  const world = () => table.world.campaignState();
  const journalsOf = (typeKey, name) => table.journal.contents.filter(j =>
    j.flags?.[MODULE_ID]?.entityType === typeKey && (!name || j.name === name));
  const rows = (card) => table.world.message(card._id).flags[MODULE_ID].drafts.map(d => [d.name, d.status]);
  const recordOf = (journal) => journal.pages.contents[0]?.flags?.[MODULE_ID]?.faction ?? null;

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    refusePages = 0;
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

  it('the retry completes the journal the first Confirm made — one Iron Syndicate, with its page, listed, seeded', async () => {
    expectConsoleError(/draft confirm: createXxx failed/);
    const gm = table.client('gm-1');
    const card = await draftCard({ type: 'faction', name: 'Iron Syndicate', description: 'A smuggling cartel.' });

    refusePages = 1;
    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(gm.notifications.some(n => /Failed to create faction "Iron Syndicate"/.test(n.message)), 'the GM was told (control)').toBe(true);
    expect(rows(card), 'Confirm is offered again (control)').toEqual([['Iron Syndicate', 'pending']]);
    const [first] = journalsOf('faction', 'Iron Syndicate');
    expect(first?.pages.contents, 'the journal landed without its page (setup)').toEqual([]);

    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();

    expect(rows(card)).toEqual([['Iron Syndicate', 'confirmed']]);
    // It made a second journal, the first left empty and unlisted.
    expect(journalsOf('faction', 'Iron Syndicate').map(j => j.id)).toEqual([first.id]);
    expect(world().factionIds).toEqual([first.id]);
    const record = recordOf(first);
    expect(record).toMatchObject({ name: 'Iron Syndicate', description: 'A smuggling cartel.', _id: first.flags[MODULE_ID].entityId });
    // The rest of the creation ran on it: the oracle seed.
    expect(record.seeded).toBe(true);
  }, 30_000);

  it('a page refused again leaves the one journal, still page-less and unlisted, and the row pending — a third Confirm completes it', async () => {
    expectConsoleError(/draft confirm: createXxx failed/);
    const gm = table.client('gm-1');
    const card = await draftCard({ type: 'faction', name: 'Iron Syndicate', description: 'A smuggling cartel.' });

    refusePages = 2;
    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();

    expect(journalsOf('faction', 'Iron Syndicate')).toHaveLength(1);
    expect(journalsOf('faction', 'Iron Syndicate')[0].pages.contents).toEqual([]);
    expect(world().factionIds).toEqual([]);
    expect(rows(card)).toEqual([['Iron Syndicate', 'pending']]);

    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(rows(card)).toEqual([['Iron Syndicate', 'confirmed']]);
    expect(journalsOf('faction', 'Iron Syndicate')).toHaveLength(1);
    expect(world().factionIds).toEqual(journalsOf('faction', 'Iron Syndicate').map(j => j.id));
  }, 30_000);

  it('a page-less journal is completed by the faction\'s identity key (issue #336 Y31): "The Iron Syndicate" is the Iron Syndicate\'s', async () => {
    const gm = table.client('gm-1');
    const orphan = pagelessJournal('faction', 'The Iron Syndicate', 'rec-iron');
    table.journal.set(orphan.id, orphan);
    const { createFaction } = await gm.import('../../src/entities/faction.js');

    const made = await gm.run(() => createFaction({ name: 'Iron  syndicate' }, game.settings.get(MODULE_ID, 'campaignState')));
    await table.settle();

    expect(made._id).toBe('rec-iron');
    expect(journalsOf('faction')).toHaveLength(1);
    expect(recordOf(orphan)?._id).toBe('rec-iron');
    expect(world().factionIds).toEqual([orphan.id]);
  }, 30_000);

  it('control: a listed journal, one of another name, of another type or of no entity type is never completed', async () => {
    const gm = table.client('gm-1');
    const listed   = pagelessJournal('faction', 'Iron Syndicate', 'rec-listed');
    const other    = pagelessJournal('faction', 'Crimson Veil', 'rec-veil');
    const creature = pagelessJournal('creature', 'Iron Syndicate', 'rec-wyrm');
    const notes    = makeJournal({ name: 'Iron Syndicate', flags: {} });   // the GM's own journal of that name
    for (const j of [listed, other, creature, notes]) table.journal.set(j.id, j);
    table.world.setSetting('campaignState', { ...BASE_STATE, factionIds: [listed.id] });
    const { createFaction } = await gm.import('../../src/entities/faction.js');

    await gm.run(() => createFaction({ name: 'Iron Syndicate' }, game.settings.get(MODULE_ID, 'campaignState')));
    await table.settle();

    for (const j of [listed, other, creature, notes]) expect(j.pages.contents, j.name).toEqual([]);
    expect(journalsOf('faction', 'Iron Syndicate')).toHaveLength(2);   // the listed one, and the new creation
    expect(world().factionIds).toHaveLength(2);
    expect(world().factionIds).not.toContain(other.id);
  }, 30_000);
});

/**
 * STARFORGED COMPANION
 * tests/unit/relistedFactionConfirm.test.js
 *
 * Issue #342 Z60 (RELIST-CONFIRM-SKIPS-CREATION) — the faction twin of
 * known-issues BOND-ITEM-AFTER-RELIST.
 *
 * A faction draft Confirm whose campaignState registration the world refused
 * leaves its journal unlisted (JOURNAL-ORPHAN-ON-REFUSAL). The canonical GM's
 * world load lists it (`migrator.registerUnlistedEntityActors`). When the GM
 * then pressed Confirm again, confirmDraft found the faction "already exists"
 * (issue #321 U25's path) and only marked the row confirmed — the steps the
 * refused Confirm died before reaching never ran: no Starforged oracle seed
 * (`seedFactionRecord` — FACTION-RECORD-WRITE-ONCE), no reconcile of the
 * stance the narration had already given the faction on the World Journal
 * (FACTION-DUAL-STORE), no WJ backlink, no ledger-subject promotion. And the
 * narrator's [4e] FACTION LANDSCAPE let the bare record shadow the World
 * Journal entry of the same name, so the hostile stance left every prompt
 * the moment the load listed the record — whether or not the GM pressed
 * Confirm again.
 *
 * The "exists" path now finishes the creation, each step a no-op once done
 * (`completeListedEntity`); and a record with no stance yet shows the one
 * its World Journal attitude maps to in [4e].
 *
 * Controls: the same retry WITHOUT the world load in between adopts the
 * journal and seeds + reconciles it (JOURNAL-ORPHAN-ON-REFUSAL's fix); a
 * Confirm whose card write was lost (U25's own case) changes nothing.
 */

/* global expectConsoleError */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { failWrites, campaignStateWrite } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

// A fact the narrator recorded under the faction's name before it had a record.
const SYNDICATE_TRUTH = {
  id: 't-syndicate', fact: 'The Iron Syndicate runs the dock cranes', subject: { kind: 'text', text: 'Iron Syndicate' },
  sceneId: 'sc-1', createdAt: 1,
};

const BASE_STATE = {
  ...CampaignStateSchema,
  sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1',
  sceneTruths: [SYNDICATE_TRUTH],
  factionIds: [], creatureIds: [], connectionIds: [], sectors: [],
};

let nextId = 0;

/** A JournalEntry that keeps its pages (the tests/setup.js stub keeps none) — journalOrphanOnRefusal.test.js's. */
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
          async update(changes) {
            if (changes.text) this.text = changes.text;
            if (changes.name) this.name = changes.name;
            if (changes.flags) for (const [s, v] of Object.entries(changes.flags)) this.flags[s] = { ...(this.flags[s] ?? {}), ...v };
            return this;
          },
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

describe('issue #342 Z60 — a faction Confirm the world refused, listed by the world load, then confirmed again', () => {
  let table;
  let savedJournalEntry;
  const world = () => table.world.campaignState();
  const journalsOf = (typeKey, name) => table.journal.contents.filter(j =>
    j.flags?.[MODULE_ID]?.entityType === typeKey && (!name || j.name === name));
  const rows = (card) => table.world.message(card._id).flags[MODULE_ID].drafts.map(d => [d.name, d.status]);
  const recordOf = (journalId) => table.journal.get(journalId).pages.contents[0].flags[MODULE_ID].faction;

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

  /** The narration names the Iron Syndicate (draft card + WJ auto-surface) and makes them hostile. */
  async function syndicateDraftCard() {
    const gm = table.client('gm-1');
    const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
    await gm.run(() => routeEntityDrafts(
      [{ type: 'faction', name: 'Iron Syndicate', description: 'A smuggling cartel.', confidence: 'high' }],
      game.settings.get(MODULE_ID, 'campaignState'),
      { autoCreateConnection: false },
    ));
    await table.settle();
    // A later narration's attitude shift on the World Journal (detection's factionUpdates).
    const wj = await gm.import('../../src/world/worldJournal.js');
    await gm.run(() => wj.recordFactionIntelligence('Iron Syndicate', { attitude: 'hostile', summary: 'They opened fire.' },
      game.settings.get(MODULE_ID, 'campaignState')));
    await table.settle();
    const cards = table.cards(f => f.draftEntityCard);
    expect(cards).toHaveLength(1);
    return cards[0];
  }

  /** The first Confirm, its campaignState registration refused. */
  async function refusedConfirm(card) {
    const gm = table.client('gm-1');
    const refused = failWrites(table, campaignStateWrite('gm-1'), { times: 1 });
    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    refused.off?.();
    expect(refused.refused).toBe(1);
    expect(rows(card)).toEqual([['Iron Syndicate', 'pending']]);   // control: Confirm is offered again
    expect(world().factionIds).toEqual([]);
    expect(journalsOf('faction', 'Iron Syndicate')).toHaveLength(1);
    return journalsOf('faction', 'Iron Syndicate')[0].id;
  }

  /** The canonical GM's world load (index.js ready → registerUnlistedEntityActors). */
  async function worldLoadListsIt() {
    const gm = table.client('gm-1');
    const migrator = await gm.import('../../src/entities/migrator.js');
    await gm.run(() => migrator.registerUnlistedEntityActors());
    await table.drain();
  }

  /** What the narrator's [4e] FACTION LANDSCAPE says about the Syndicate (narrator.js buildNarratorExtras). */
  async function landscapeLine() {
    const gm = table.client('gm-1');
    const faction = await gm.import('../../src/entities/faction.js');
    const wj      = await gm.import('../../src/world/worldJournal.js');
    return gm.run(() => {
      const cs = game.settings.get(MODULE_ID, 'campaignState');
      return faction.mergeFactionLandscape(faction.listFactions(cs), wj.getFactionLandscape(cs, { limit: Infinity }))
        .find(e => /iron syndicate/i.test(e.name)) ?? null;
    });
  }

  /** The World Journal — Factions entry for the Syndicate. */
  async function wjEntry() {
    const gm = table.client('gm-1');
    const wj = await gm.import('../../src/world/worldJournal.js');
    return gm.run(() => wj.getFactionEntry('Iron Syndicate'));
  }

  it('the second Confirm completes the faction: oracle-seeded, holding the hostile stance, backlinked, its facts promoted', async () => {
    expectConsoleError(/registering factionIds failed/);
    expectConsoleError(/draft confirm: createXxx failed/);
    const gm = table.client('gm-1');
    const card = await syndicateDraftCard();
    expect((await landscapeLine())?.stance).toBe('hostile');   // control: before any record, the WJ stance reaches [4e]

    const orphanId = await refusedConfirm(card);
    await worldLoadListsIt();
    expect(world().factionIds).toEqual([orphanId]);   // control: listed before the second press
    expect(recordOf(orphanId).seeded ?? false).toBe(false);   // control: listed bare

    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(rows(card)).toEqual([['Iron Syndicate', 'confirmed']]);
    expect(journalsOf('faction', 'Iron Syndicate')).toHaveLength(1);

    const record = recordOf(orphanId);
    const line   = await landscapeLine();
    // The finding: the "exists" path marked the row and did nothing else.
    expect.soft(record.seeded ?? false, 'the faction oracles were rolled').toBe(true);
    expect.soft(record.type, 'a rolled faction type').toBeTruthy();
    expect.soft(record.relationship, 'the WJ stance reconciled onto the record').toBe('antagonistic');
    expect.soft((await wjEntry())?.entityId, 'the WJ entry backlinks the record').toBe(orphanId);
    expect.soft(world().sceneTruths.find(t => t.id === 't-syndicate')?.subject?.entityId,
      'the fact recorded under the name is promoted to the record').toBe(orphanId);
    // …so the narrator's landscape names the Syndicate with no stance at all.
    expect(line?.stance, '[4e] FACTION LANDSCAPE stance').toBe('antagonistic');
  }, 30_000);

  it('the world load listing the bare record alone keeps the stance the narration gave it in [4e]', async () => {
    expectConsoleError(/registering factionIds failed/);
    expectConsoleError(/draft confirm: createXxx failed/);
    const card = await syndicateDraftCard();
    const orphanId = await refusedConfirm(card);
    await worldLoadListsIt();
    expect(world().factionIds).toEqual([orphanId]);
    expect(recordOf(orphanId).relationship).toBe('unknown');   // control: nothing reconciled it yet
    // The record's line, with the stance the World Journal's "hostile" maps to.
    expect((await landscapeLine())?.stance).toBe('antagonistic');
  }, 30_000);

  it('control: the same retry with no world load in between adopts the journal, seeds it and takes the stance', async () => {
    expectConsoleError(/registering factionIds failed/);
    expectConsoleError(/draft confirm: createXxx failed/);
    const gm = table.client('gm-1');
    const card = await syndicateDraftCard();
    const orphanId = await refusedConfirm(card);

    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(rows(card)).toEqual([['Iron Syndicate', 'confirmed']]);
    expect(world().factionIds).toEqual([orphanId]);
    const record = recordOf(orphanId);
    expect(record.seeded).toBe(true);
    expect(record.relationship).toBe('antagonistic');
    expect((await landscapeLine())?.stance).toBe('antagonistic');
  }, 30_000);

  it("control: a Confirm whose card write was lost (U25's case) — the second Confirm changes nothing", async () => {
    expectConsoleError(/updateDraftCard failed/);
    const gm = table.client('gm-1');
    const card = await syndicateDraftCard();
    // The first Confirm creates, seeds, reconciles and mirrors the faction; its card write is refused.
    failWrites(table, (w) => w.kind === 'message.update' && w.id === card._id && w.client === 'gm-1', { times: 1 });
    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(rows(card)).toEqual([['Iron Syndicate', 'pending']]);
    const [journal] = journalsOf('faction', 'Iron Syndicate');
    const before    = JSON.parse(JSON.stringify(recordOf(journal.id)));
    const entry     = await wjEntry();
    expect(before.seeded).toBe(true);
    expect(entry.entityId).toBe(journal.id);

    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(rows(card)).toEqual([['Iron Syndicate', 'confirmed']]);
    expect(journalsOf('faction', 'Iron Syndicate')).toHaveLength(1);
    expect(recordOf(journal.id)).toEqual(before);   // not re-seeded, not re-stamped
    const after = await wjEntry();
    expect(after.encounters).toHaveLength(entry.encounters.length);   // no second mirror
    expect(after.updatedAt).toBe(entry.updatedAt);
  }, 30_000);
});

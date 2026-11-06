/**
 * Eleventh audit — entities. RELIST-CONFIRM-SKIPS-CREATION (the faction twin
 * of BOND-ITEM-AFTER-RELIST).
 *
 * A faction draft Confirm whose campaignState registration the world refused
 * leaves its journal unlisted (JOURNAL-ORPHAN-ON-REFUSAL). The canonical GM's
 * world load lists it (`migrator.registerUnlistedEntityActors`). When the GM
 * then presses Confirm again, confirmDraft finds the faction "already exists"
 * (issue #321 U25's path) and only marks the row confirmed — the steps the
 * refused Confirm died before reaching never run: no Starforged oracle seed
 * (`seedFactionRecord` — FACTION-RECORD-WRITE-ONCE), no reconcile of the
 * stance the narration already gave the faction on the World Journal
 * (`applyAttitudeToFactionRecord` — FACTION-DUAL-STORE), no WJ backlink.
 * BOND-ITEM-AFTER-RELIST fixed this exact sequence for a connection's bond
 * Item only.
 *
 * The narrator's [4e] FACTION LANDSCAPE renders the records first and drops a
 * WJ entry of the same key, so the hostile stance the narration established
 * disappears from every prompt once the bare record is listed.
 *
 * Controls: the same retry WITHOUT the world load in between adopts the
 * journal and seeds + reconciles it (JOURNAL-ORPHAN-ON-REFUSAL's fix).
 */

/* global expectConsoleError */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { failWrites, campaignStateWrite } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const BASE_STATE = {
  ...CampaignStateSchema,
  sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
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

describe('a faction Confirm the world refused, listed by the world load, then confirmed again', () => {
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

  /** What the narrator's [4e] FACTION LANDSCAPE says about the Syndicate (narrator.js buildNarratorExtras). */
  async function landscapeLine() {
    const gm = table.client('gm-1');
    const faction = await gm.import('../../src/entities/faction.js');
    const wj      = await gm.import('../../src/world/worldJournal.js');
    return gm.run(() => {
      const cs = game.settings.get(MODULE_ID, 'campaignState');
      return faction.mergeFactionLandscape(faction.listFactions(cs), wj.getFactionLandscape(cs))
        .find(e => /iron syndicate/i.test(e.name)) ?? null;
    });
  }

  it('the second Confirm completes the faction: oracle-seeded and holding the hostile stance the narration gave it', async () => {
    expectConsoleError(/registering factionIds failed/);
    expectConsoleError(/draft confirm: createXxx failed/);
    const gm = table.client('gm-1');
    const card = await syndicateDraftCard();
    expect((await landscapeLine())?.stance).toBe('hostile');   // control: before any record, the WJ stance reaches [4e]

    const orphanId = await refusedConfirm(card);

    // The canonical GM's world load (index.js ready → registerUnlistedEntityActors).
    const migrator = await gm.import('../../src/entities/migrator.js');
    await gm.run(() => migrator.registerUnlistedEntityActors());
    await table.drain();
    expect(world().factionIds).toEqual([orphanId]);   // control: listed before the second press

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
    // …so the narrator's landscape names the Syndicate with no stance at all.
    expect(line?.stance, '[4e] FACTION LANDSCAPE stance').toBe('antagonistic');
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
});

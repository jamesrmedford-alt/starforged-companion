/**
 * FACTION-CONFIRM-TWO-ENCOUNTERS (known-issues). A faction draft's Confirm
 * appended two encounter entries to its World Journal page: the reconcile's
 * backlink (recordFactionIntelligence(name, { entityId })) and the mirror
 * (recordFactionIntelligence(name, { summary, entityId })) each pushed one —
 * though the Confirm met the faction nowhere in the fiction, and the
 * narration that named it had already logged its encounter when it surfaced
 * the faction (routeEntityDrafts). The Confirm's two writes log none on a
 * page that exists; a page the mirror starts gets the description as its
 * first encounter.
 *
 * Harness: factionConfirmAttitude.test.js's (the GM presses Confirm on the
 * real draft card).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
let savedJournalEntry;
let nextId = 0;

/** A JournalEntry that keeps its pages and lives in game.journal (the setup stub keeps neither). */
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

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', factionIds: [] },
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

/** The narration names the faction (its draft card, its World Journal surface); `dropPage` loses that page first. */
async function nameThenConfirm({ dropPage = false } = {}) {
  const gm = table.client('gm-1');
  const wj = await gm.import('../../src/world/worldJournal.js');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts(
    [{ type: 'faction', name: 'Iron Syndicate', description: 'A smuggling cartel.', confidence: 'high' }],
    game.settings.get(MODULE_ID, 'campaignState'), { autoCreateConnection: false }));
  await table.settle();
  const factions = () => gm.run(() => game.journal.getName('World Journal — Factions'));
  expect(gm.run(() => wj.getFactionEntry('Iron Syndicate'))?.encounters).toHaveLength(1);   // the narration's surface
  if (dropPage) factions().pages.contents.length = 0;

  const card = table.cards(f => f.draftEntityCard)[0];
  gm.click(card._id, '[data-action="sf-draft-confirm"]');
  await table.drain();
  return gm.run(() => wj.getFactionEntry('Iron Syndicate'));
}

describe('FACTION-CONFIRM-TWO-ENCOUNTERS — a faction Confirm logs no encounter of its own', () => {
  it('the page the narration surfaced keeps its one encounter, now linked to the record', async () => {
    const entry = await nameThenConfirm();
    expect(entry.encounters).toHaveLength(1);                       // was 3: + the backlink's + the mirror's
    expect(entry.entityId).toBeTruthy();                            // control: the Confirm linked the record
  });

  it('a page the mirror starts gets the description as its one encounter', async () => {
    const entry = await nameThenConfirm({ dropPage: true });
    expect(entry.encounters.map(e => e.summary)).toEqual(['A smuggling cartel.']);
    expect(entry.entityId).toBeTruthy();
  });
});

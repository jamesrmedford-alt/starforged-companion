/**
 * PROBE — FACTION-CONFIRM-WJ-ATTITUDE-RESET
 *
 * Draft Confirm of a faction (confirmDraft, src/entities/entityExtractor.js)
 * reconciles the World Journal intelligence onto the new record — the WJ
 * entry's attitude becomes the record's stance (FACTION-DUAL-STORE fix) and
 * a first recordFactionIntelligence(name, { entityId: hit.id }) keeps the
 * WJ attitude. Then the "Mirror a confirmed faction into the World Journal"
 * block runs a SECOND recordFactionIntelligence(name, { attitude: "unknown",
 * summary, entityId: record._id }). recordFactionIntelligence takes
 * `entry.attitude ?? existing.attitude`, and "unknown" is not nullish, so the
 * known attitude is overwritten: the WJ Factions page reads
 * "Attitude: unknown", its encounter log records attitudeAtTime "unknown",
 * the detection Haiku's "Faction attitudes" line says unknown, and the two
 * stores disagree (record antagonistic, WJ unknown). The same call re-points
 * the backlink from the host journal id to the record's internal _id.
 *
 * Correct behaviour (asserted): a faction the narration already established
 * as hostile still reads hostile in the World Journal after the GM confirms
 * its draft, and the record carries the mapped stance.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('PROBE FACTION-CONFIRM-WJ-ATTITUDE-RESET', () => {
  it('confirming a hostile faction keeps its World Journal attitude', async () => {
    const gm = table.client('gm-1');
    const wj = await gm.import('../../src/world/worldJournal.js');
    const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
    const faction = await gm.import('../../src/entities/faction.js');

    // The narration established them as hostile (a detection factionUpdate) and
    // named them as a new faction (an entity draft) — runDiscoveryDetection's order.
    await gm.run(async () => {
      const cs = game.settings.get(MODULE_ID, 'campaignState');
      await wj.recordFactionIntelligence('Iron Syndicate',
        { attitude: 'hostile', summary: 'Their enforcers opened fire on the dock.', isNew: true }, cs);
      await routeEntityDrafts([{ type: 'faction', name: 'Iron Syndicate', description: 'A smuggling cartel.', confidence: 'high' }],
        cs, { autoCreateConnection: false });
    });
    await table.settle();
    expect(gm.run(() => wj.getFactionEntry('Iron Syndicate'))?.attitude).toBe('hostile');   // before confirm

    const card = table.cards(f => f.draftEntityCard)[0];
    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();

    const record = gm.run(() => faction.findFactionByName('Iron Syndicate', game.settings.get(MODULE_ID, 'campaignState')));
    const entry  = gm.run(() => wj.getFactionEntry('Iron Syndicate'));
    const page   = gm.run(() => game.journal.getName('World Journal — Factions')?.pages.contents.find(p => p.name === 'Iron Syndicate'));

    expect({
      recordStance: record?.faction?.relationship,
      wjAttitude:   entry?.attitude,
      pageBody:     String(page?.text?.content ?? '').match(/Attitude:<\/strong> (\w+)/)?.[1],
    }).toEqual({ recordStance: 'antagonistic', wjAttitude: 'hostile', pageBody: 'hostile' });
  });
});

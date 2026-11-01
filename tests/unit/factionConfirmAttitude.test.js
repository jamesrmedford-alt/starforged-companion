/**
 * STARFORGED COMPANION
 * tests/unit/factionConfirmAttitude.test.js
 *
 * Confirming a faction's draft keeps the World Journal attitude the
 * narration established, and backlinks the entry to the faction's host
 * document (issue #321 U28).
 *
 * confirmDraft reconciles the World Journal intelligence onto the new record
 * (the WJ attitude becomes the record's stance) and backlinks the entry by
 * host id. Then its "mirror a confirmed faction into the World Journal" call
 * ran recordFactionIntelligence(name, { attitude: "unknown", entityId:
 * record._id }): "unknown" is not nullish, so it overwrote the known attitude
 * — the Factions page read "Attitude: unknown", the encounter log recorded
 * "unknown", and the record (antagonistic) and the WJ (unknown) disagreed —
 * and the backlink moved to the record's internal _id. The mirror now passes
 * no attitude and the host id.
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

/**
 * The narration names a faction (an entity draft) — optionally having first
 * established its attitude (a detection factionUpdate), runDiscoveryDetection's
 * order — and the GM confirms the draft. Returns what each store says after.
 */
async function confirmFaction({ attitude }) {
  const gm = table.client('gm-1');
  const wj = await gm.import('../../src/world/worldJournal.js');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  const faction = await gm.import('../../src/entities/faction.js');

  await gm.run(async () => {
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    if (attitude) {
      await wj.recordFactionIntelligence('Iron Syndicate',
        { attitude, summary: 'Their enforcers opened fire on the dock.', isNew: true }, cs);
    }
    await routeEntityDrafts([{ type: 'faction', name: 'Iron Syndicate', description: 'A smuggling cartel.', confidence: 'high' }],
      cs, { autoCreateConnection: false });
  });
  await table.settle();
  if (attitude) expect(gm.run(() => wj.getFactionEntry('Iron Syndicate'))?.attitude).toBe(attitude);

  const card = table.cards(f => f.draftEntityCard)[0];
  gm.click(card._id, '[data-action="sf-draft-confirm"]');
  await table.drain();

  const hit   = gm.run(() => faction.findFactionByName('Iron Syndicate', game.settings.get(MODULE_ID, 'campaignState')));
  const entry = gm.run(() => wj.getFactionEntry('Iron Syndicate'));
  const page  = gm.run(() => game.journal.getName('World Journal — Factions')?.pages.contents.find(p => p.name === 'Iron Syndicate'));
  return {
    hostId:       hit?.id ?? null,
    recordId:     hit?.faction?._id ?? null,
    recordStance: hit?.faction?.relationship,
    wjAttitude:   entry?.attitude,
    wjEntityId:   entry?.entityId ?? null,
    lastEncounterAttitude: entry?.encounters?.at(-1)?.attitudeAtTime,
    pageBody:     String(page?.text?.content ?? '').match(/Attitude:<\/strong> (\w+)/)?.[1],
  };
}

describe('confirming a faction draft', () => {
  it('keeps the World Journal attitude the narration established', async () => {
    const out = await confirmFaction({ attitude: 'hostile' });

    expect(out).toMatchObject({
      recordStance: 'antagonistic', wjAttitude: 'hostile', lastEncounterAttitude: 'hostile', pageBody: 'hostile',
    });
  });

  it('backlinks the World Journal entry to the faction host, not the record id', async () => {
    const out = await confirmFaction({ attitude: 'hostile' });

    expect(out.hostId).toBeTruthy();
    expect(out.hostId).not.toBe(out.recordId);
    expect(out.wjEntityId).toBe(out.hostId);
  });

  it('a faction with no World Journal entry yet is mirrored there with an unknown attitude', async () => {
    const out = await confirmFaction({ attitude: null });

    expect(out).toMatchObject({ wjAttitude: 'unknown', pageBody: 'unknown' });
    expect(out.wjEntityId).toBe(out.hostId);
  });
});

/**
 * PROBE — FACTION-PAGE-BODY-STALE
 *
 * createFaction (src/entities/faction.js) renders the record into the
 * "Faction Data" page body once, at creation (renderEntityBody — the F19/T3
 * "the JournalEntryPage isn't blank" fix). Every later write goes through
 * updateFaction, which sets the page FLAG only. A draft-confirmed faction is
 * created with just a name and description and seeded afterwards
 * (seedFactionRecord: type, subtype, influence, quirk, first project), then
 * given its stance (applyAttitudeToFactionRecord) — none of which ever
 * reaches the page the GM opens. The World Journal's own pages keep their
 * body in sync with the flag on every upsert for exactly this reason.
 *
 * Correct behaviour (asserted): after seeding and a stance change, the
 * faction's journal page shows its type and stance.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createFaction, seedFactionRecord, applyAttitudeToFactionRecord } from '../../../src/entities/faction.js';

const MODULE = 'starforged-companion';
let n = 0;

beforeEach(() => {
  global.game.user = { isGM: true, id: 'test-user-gm' };
  const items = [];
  global.game.journal = {
    get: (id) => items.find(j => j.id === id) ?? null,
    find: (fn) => items.find(fn) ?? null,
    getName: (name) => items.find(j => j.name === name) ?? null,
    [Symbol.iterator]() { return items[Symbol.iterator](); },
  };
  global.JournalEntry = {
    async create(data) {
      const j = { id: `j${++n}`, name: data.name, flags: data.flags ?? {}, pages: { contents: [] },
        async createEmbeddedDocuments(_t, list) {
          return list.map(d => {
            const page = { id: `p${++n}`, name: d.name, text: d.text ?? {}, flags: JSON.parse(JSON.stringify(d.flags ?? {})),
              async setFlag(s, k, v) { (this.flags[s] ??= {})[k] = v; return this; },
              async update(c) { if (c.text) this.text = c.text; return this; } };
            j.pages.contents.push(page);
            return page;
          });
        },
        async update(c) { Object.assign(this, c); return this; } };
      items.push(j);
      return j;
    },
  };
  global.game.settings._store.set(`${MODULE}.campaignState`, { factionIds: [] });
});

describe('PROBE FACTION-PAGE-BODY-STALE', () => {
  it("the faction's journal page shows its seeded type and current stance", async () => {
    const cs = global.game.settings.get(MODULE, 'campaignState');
    await createFaction({ name: 'Iron Syndicate', description: 'A smuggling cartel.' }, cs);   // draft-confirm shape
    const hostId = cs.factionIds[0];
    const seeded = await seedFactionRecord(hostId);
    await applyAttitudeToFactionRecord('Iron Syndicate', 'hostile', cs);

    const page = global.game.journal.get(hostId).pages.contents[0];
    const record = page.flags[MODULE].faction;
    expect(record.relationship).toBe('antagonistic');                       // the record has it
    expect(seeded?.type).toBeTruthy();

    const body = String(page.text?.content ?? '');
    expect({ showsType: body.includes(record.type.split(' — ')[0]), showsStance: /antagonistic/i.test(body) })
      .toEqual({ showsType: true, showsStance: true });
  });
});

/**
 * STARFORGED COMPANION
 * tests/unit/entityPageBodyRerender.test.js
 *
 * Issue #322 V31 (the audit's factionPageBodyStale probe,
 * FACTION-PAGE-BODY-STALE): createFaction rendered the record into the
 * "Faction Data" page body once, at creation. Every later write set the page
 * FLAG only: a draft-confirmed faction is created with a name and description
 * and seeded afterwards (type, subtype, influence, quirk, first project),
 * then given its stance — none of which reached the page the GM opens. The
 * same held for creatures. The body is re-rendered from the record on every
 * write now (registry.js rerenderEntityPageBody, from updateFaction and every
 * writeEntityFlag on a journal-hosted entity).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createFaction, seedFactionRecord, applyAttitudeToFactionRecord } from '../../src/entities/faction.js';
import { createCreature } from '../../src/entities/creature.js';
import { writeEntityFlag, readEntityFlag } from '../../src/entities/registry.js';

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

describe('a journal-hosted entity page shows its record as it is (FACTION-PAGE-BODY-STALE)', () => {
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
  it("a creature's page follows its record's edits too", async () => {
    const cs = { creatureIds: [] };
    await createCreature({ name: 'Glass Leech', environment: 'Space', rank: 'dangerous' }, cs);
    const doc = global.game.journal.get(cs.creatureIds[0]);
    const record = readEntityFlag('creature', doc) ?? doc.pages.contents[0].flags[MODULE].creature;
    await writeEntityFlag('creature', doc, { ...record, behavior: 'Swarms toward heat', notes: 'Seen near Bleakhold.' });
    const body = String(doc.pages.contents[0].text?.content ?? '');
    expect(body).toContain('Swarms toward heat');
    expect(body).toContain('Seen near Bleakhold.');
  });
});

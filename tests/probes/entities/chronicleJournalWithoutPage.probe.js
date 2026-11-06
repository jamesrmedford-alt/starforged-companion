/* global makeTestActor, expectConsoleError */
/**
 * Eleventh audit — entities. CHRONICLE-PAGELESS-JOURNAL (the tenth audit's
 * "not probed" lead, chronicle.js createChronicleJournal).
 *
 * A character's Chronicle is created in two writes: the JournalEntry (flagged
 * `chronicleActorId`), then its one page. When the page's creation is refused
 * (the journal write landed, the embedded one did not), createChronicleJournal
 * logs and returns null — but the journal stays, flagged for the actor. Every
 * later write finds it by that flag (findChronicleJournals), sees no page and
 * returns false (writeChronicleNow: `if (!page) return false`): no automatic
 * entry after a narration, no player annotation, no GM entry is ever saved for
 * that character again, and the campaign recap built from the Chronicle never
 * hears of them. Nothing completes the half-made journal — the get-or-create
 * rules/reachability.md §7 asks of a creation (issue #337 Y34 /
 * JOURNAL-ORPHAN-ON-REFUSAL are the same shape for entity journals).
 *
 * Control: the same writes when the page is created land.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { addChronicleEntry, getChronicleEntries } from '../../../src/character/chronicle.js';

const MODULE_ID = 'starforged-companion';
const ACTOR_ID  = 'actor-kira';

let journals;
let refusePages;   // how many page creations the world refuses next

function makeJournal(data) {
  const journal = {
    id: foundry.utils.randomID(),
    name: data.name,
    flags: JSON.parse(JSON.stringify(data.flags ?? {})),
    pages: { contents: [] },
    async createEmbeddedDocuments(_type, list) {
      if (refusePages > 0) { refusePages -= 1; throw new Error('refused by the test (page create)'); }
      return list.map((d) => {
        const page = {
          name: d.name,
          flags: JSON.parse(JSON.stringify(d.flags ?? {})),
          getFlag(mod, key) { return this.flags?.[mod]?.[key]; },
          async setFlag(mod, key, val) { (this.flags[mod] ??= {})[key] = val; },
        };
        journal.pages.contents.push(page);
        return page;
      });
    },
    getFlag(mod, key) { return this.flags?.[mod]?.[key]; },
    async setFlag(mod, key, val) { (this.flags[mod] ??= {})[key] = val; },
    async update(changes) { Object.assign(this, changes); return this; },
  };
  return journal;
}

beforeEach(() => {
  game.actors._reset();
  game.actors._set(ACTOR_ID, makeTestActor({ id: ACTOR_ID, name: 'Kira' }));
  journals = [];
  refusePages = 0;
  game.journal = {
    get contents() { return journals; },
    get: (id) => journals.find(j => j.id === id) ?? null,
    getName: (name) => journals.find(j => j.name === name) ?? null,
    find: (fn) => journals.find(fn) ?? null,
    [Symbol.iterator]: function* () { yield* journals; },
  };
  JournalEntry.create = async (data) => {
    const j = makeJournal(data);
    journals.push(j);
    return j;
  };
});

describe("a Chronicle whose page's creation the world refused", () => {
  it("later entries are still saved — the half-made journal gets its page", async () => {
    expectConsoleError(/failed to create chronicle journal/);
    refusePages = 1;
    // The first entry's creation: the journal lands, its page is refused.
    await addChronicleEntry(ACTOR_ID, { type: 'moment', text: 'Kira fled Bleakhold.' });
    expect(journals).toHaveLength(1);                                             // control: the journal stayed…
    expect(journals[0].flags[MODULE_ID].chronicleActorId).toBe(ACTOR_ID);         // …flagged for Kira
    expect(journals[0].pages.contents).toHaveLength(0);                           // …with no page

    // The world takes writes again: the next narration's entry, a player's note.
    const wrote = await addChronicleEntry(ACTOR_ID, { type: 'vow', text: 'Kira swore to find Dani.' });
    expect.soft(wrote, 'the next write lands').toBe(true);
    expect((await getChronicleEntries(ACTOR_ID)).map(e => e.text)).toEqual(['Kira swore to find Dani.']);
  });

  it('control: with the page created, entries are written and read back', async () => {
    await addChronicleEntry(ACTOR_ID, { type: 'moment', text: 'Kira fled Bleakhold.' });
    expect(await addChronicleEntry(ACTOR_ID, { type: 'vow', text: 'Kira swore to find Dani.' })).toBe(true);
    expect((await getChronicleEntries(ACTOR_ID)).map(e => e.text)).toEqual(['Kira fled Bleakhold.', 'Kira swore to find Dani.']);
    expect(journals).toHaveLength(1);
  });
});

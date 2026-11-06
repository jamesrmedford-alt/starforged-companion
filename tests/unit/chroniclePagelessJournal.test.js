/* global makeTestActor, expectConsoleError */
/**
 * STARFORGED COMPANION
 * tests/unit/chroniclePagelessJournal.test.js
 *
 * Issue #342 Z62 (CHRONICLE-PAGELESS-JOURNAL) — the tenth audit's "not probed"
 * lead in chronicle.js createChronicleJournal.
 *
 * A character's Chronicle is created in two writes: the JournalEntry (flagged
 * `chronicleActorId`), then its one page. When the page's creation was refused
 * (the journal write landed, the embedded one did not), createChronicleJournal
 * logged and returned null — but the journal stayed, flagged for the actor.
 * Every later write found it by that flag (findChronicleJournals), saw no page
 * and returned false (writeChronicleNow: `if (!page) return false`): no
 * automatic entry after a narration, no player annotation, no GM entry was
 * ever saved for that character again, and the campaign recap built from the
 * Chronicle never heard of them. The next write now gives the half-made
 * journal its page — the creation completed (rules/reachability.md §7), as
 * issue #337 Y34 / JOURNAL-ORPHAN-ON-REFUSAL complete an entity's.
 *
 * Control: the same writes when the page is created land.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { addChronicleEntry, getChronicleEntries, updateChronicleEntry } from '../../src/character/chronicle.js';

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

describe("issue #342 Z62 — a Chronicle whose page's creation the world refused", () => {
  it('later entries are still saved — the half-made journal gets its page', async () => {
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
    // The creation completed: the same journal, now with its one page — no second journal.
    expect(journals).toHaveLength(1);
    expect(journals[0].pages.contents.map(p => p.name)).toEqual(['Chronicle']);

    // And it is an ordinary Chronicle from then on: an edit of that entry lands.
    const [entry] = await getChronicleEntries(ACTOR_ID);
    expect(await updateChronicleEntry(ACTOR_ID, entry.id, 'Kira swore to find Dani, whatever it costs.')).toBe(true);
    expect((await getChronicleEntries(ACTOR_ID)).map(e => e.text)).toEqual(['Kira swore to find Dani, whatever it costs.']);
  });

  it('a page refused again leaves the write unsaved, said on the console, and the next one completes it', async () => {
    expectConsoleError(/failed to create chronicle journal|failed to add the missing page/);
    refusePages = 2;
    await addChronicleEntry(ACTOR_ID, { type: 'moment', text: 'Kira fled Bleakhold.' });
    expect(await addChronicleEntry(ACTOR_ID, { type: 'vow', text: 'Kira swore to find Dani.' })).toBe(false);
    expect(journals[0].pages.contents).toHaveLength(0);
    expect(await addChronicleEntry(ACTOR_ID, { type: 'scar', text: 'Kira lost her ship.' })).toBe(true);
    expect((await getChronicleEntries(ACTOR_ID)).map(e => e.text)).toEqual(['Kira lost her ship.']);
    expect(journals).toHaveLength(1);
  });

  it('control: with the page created, entries are written and read back', async () => {
    await addChronicleEntry(ACTOR_ID, { type: 'moment', text: 'Kira fled Bleakhold.' });
    expect(await addChronicleEntry(ACTOR_ID, { type: 'vow', text: 'Kira swore to find Dani.' })).toBe(true);
    expect((await getChronicleEntries(ACTOR_ID)).map(e => e.text)).toEqual(['Kira fled Bleakhold.', 'Kira swore to find Dani.']);
    expect(journals).toHaveLength(1);
    expect(journals[0].pages.contents).toHaveLength(1);
  });
});

/**
 * SWP-2 WORLD-JOURNAL-BY-NAME — twelfth audit, the lead's sweep.
 *
 * The World Journal's five journals (Lore, Threats, Factions, Locations,
 * Session Log) are created with a stable module flag naming their category —
 * `flags[MODULE].worldJournalCategory` (src/world/worldJournal.js:125, :1346)
 * — but nothing reads that flag: every reader and writer finds its journal by
 * display name (findJournal, :1332-1337, used at :587, :634, :910, :950,
 * :1058, :1071, :1141, :1152, :1174, :1191; initWorldJournals :119;
 * getOrCreateJournal :1340). A GM who renames "World Journal — Lore" (to
 * "Lore", say) silently takes every confirmed fact out of the narrator's
 * ESTABLISHED LORE (getConfirmedLore → []), and the next lore the detection
 * pass records lands in a fresh "World Journal — Lore" journal, splitting the
 * record. The same holds for Threats (ACTIVE THREATS), Factions (FACTION
 * LANDSCAPE) and Locations.
 *
 * rules/reachability.md §1 (a flag written with zero readers) and §6
 * (identity by stable id, not display name); the sibling fixes are issue
 * #301 B03 (Chronicle), #306 R08 (Private Channel), #342 Z16 (truths).
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

const MODULE_ID = "starforged-companion";

let wj;
let journals;
let created;
let savedJournal;
let savedCreate;
let savedUser;

function page(id, name, entry) {
  return { id, name, flags: { [MODULE_ID]: { loreEntry: entry } } };
}

function makeJournal(name, category, pages = []) {
  const j = {
    id: `j-${Math.random().toString(36).slice(2, 8)}`,
    name,
    flags: { [MODULE_ID]: { worldJournalCategory: category } },
    pages: { contents: pages },
    getFlag: (m, k) => j.flags?.[m]?.[k],
    createEmbeddedDocuments: async (_type, data) => {
      const made = data.map((d, i) => ({ id: `p-new-${i}`, ...d, update: async () => {} }));
      j.pages.contents.push(...made);
      return made;
    },
  };
  return j;
}

const LORE = {
  title: "The Iron Accord", category: "faction", text: "The Accord's founding charter forbids precursor salvage.",
  confirmed: true, narratorAsserted: true, createdAt: "2026-11-01T10:00:00.000Z", updatedAt: "2026-11-01T10:00:00.000Z",
};

beforeAll(async () => {
  wj = await import("../../../src/world/worldJournal.js");
});

beforeEach(() => {
  journals = [makeJournal("World Journal — Lore", "lore", [page("p-1", "The Iron Accord", LORE)])];
  created = [];
  savedJournal = game.journal;
  savedCreate = globalThis.JournalEntry;
  savedUser = game.user;
  game.user = { ...(savedUser ?? {}), id: "gm-1", isGM: true };
  game.journal = {
    ...savedJournal,
    getName: (n) => journals.find(j => j.name === n) ?? undefined,
    find: (fn) => journals.find(fn) ?? undefined,
    get: (id) => journals.find(j => j.id === id) ?? undefined,
    contents: journals,
    [Symbol.iterator]: function* () { yield* journals; },
  };
  globalThis.JournalEntry = {
    create: async (data) => {
      const j = makeJournal(data.name, data.flags?.[MODULE_ID]?.worldJournalCategory ?? null);
      journals.push(j);
      created.push(j);
      return j;
    },
  };
});

afterEach(() => {
  game.journal = savedJournal;
  globalThis.JournalEntry = savedCreate;
  game.user = savedUser;
});

describe("SWP-2 the World Journal's journals are found by their names", () => {
  it("control: the confirmed lore reaches the narrator's ESTABLISHED LORE", () => {
    expect(wj.getConfirmedLore(null).map(e => e.title)).toEqual(["The Iron Accord"]);
  });

  it("the GM renames the Lore journal — its confirmed lore still reaches the narrator", () => {
    journals[0].name = "Lore";
    expect(wj.getConfirmedLore(null).map(e => e.title), "ESTABLISHED LORE reads the renamed journal by its category flag").toEqual(["The Iron Accord"]);
  });

  it("the GM renames the Lore journal — new lore joins it, no second Lore journal", async () => {
    journals[0].name = "Lore";
    await wj.recordLoreDiscovery("The Drift Beacons", { category: "location", text: "Beacons mark safe lanes.", confirmed: true }, {});
    expect(created.map(j => j.name), "a second, empty World Journal — Lore").toEqual([]);
  });
});

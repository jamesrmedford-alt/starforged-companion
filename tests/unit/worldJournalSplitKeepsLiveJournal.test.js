/**
 * Issue #347 AB16 (WORLD-JOURNAL-SPLIT-FLIPS-TO-STALE) — issue #345 AA63's
 * lookup on a world its defect already split.
 *
 * AA63's defect, as its own regression test states it: a GM who renamed
 * "World Journal — Lore" got a fresh "World Journal — Lore" at the next
 * canonical-GM load (initWorldJournals) or the next lore recorded
 * (getOrCreateJournal). BOTH journals carry `worldJournalCategory: "lore"` —
 * the creator always stamped it. From then until v1.8.1 every read and write
 * went to the one of the default name: the lore of every session played since
 * the rename is there.
 *
 * AA63's findJournal took "the journal flagged with that category" as
 * `game.journal.find(...)` — the first in collection order — so on such a
 * world the upgrade moved every reader and writer onto the old, renamed
 * journal: the lore recorded since the split left ESTABLISHED LORE, and new
 * lore was filed beside the stale entries. Among several flagged journals the
 * one still carrying the default name now wins, as v1.8.0 read it; the
 * Progress Tracks journal's lookup (AA62, TRACKS-JOURNAL-SPLIT-NOT-MERGED)
 * takes the same rule.
 *
 * Fixture follows tests/unit/worldJournalFoundByCategory.test.js.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

const MODULE_ID = "starforged-companion";

let wj;
let journals;
let created;
let saved;

function page(id, name, flagKey, entry) {
  return { id, name, flags: { [MODULE_ID]: { [flagKey]: entry } } };
}

function makeJournal(name, category, pages = []) {
  const j = {
    id: `j-${Math.random().toString(36).slice(2, 8)}`,
    name,
    flags: category === undefined ? {} : { [MODULE_ID]: { worldJournalCategory: category } },
    pages: { contents: pages },
    getFlag: (m, k) => j.flags?.[m]?.[k],
    setFlag: async (m, k, v) => { (j.flags[m] ??= {})[k] = v; return j; },
    createEmbeddedDocuments: async (_type, data) => {
      const made = data.map((d, i) => ({ id: `p-new-${i}`, ...d, update: async () => {} }));
      j.pages.contents.push(...made);
      return made;
    },
  };
  return j;
}

const lore = (title, text, at) => ({
  title, category: "faction", text, confirmed: true, narratorAsserted: true, createdAt: at, updatedAt: at,
});
// Recorded before the GM renamed the journal (2026-09).
const OLD = lore("The Iron Accord", "The Accord's founding charter forbids precursor salvage.", "2026-09-01T10:00:00.000Z");
// Recorded in the sessions since — into the "World Journal — Lore" the next load made.
const NEW = lore("The Drift Beacons", "Beacons mark the safe lanes through the Rift.", "2026-10-20T10:00:00.000Z");

beforeAll(async () => {
  wj = await import("../../src/world/worldJournal.js");
});

function install(list) {
  journals = list;
  created = [];
  game.journal = {
    ...saved.journal,
    getName: (n) => journals.find(j => j.name === n) ?? undefined,
    find: (fn) => journals.find(fn) ?? undefined,
    get: (id) => journals.find(j => j.id === id) ?? undefined,
    contents: journals,
    [Symbol.iterator]: function* () { yield* journals; },
  };
}

beforeEach(() => {
  saved = { journal: game.journal, create: globalThis.JournalEntry, user: game.user, users: game.users, folders: game.folders };
  game.user = { ...(saved.user ?? {}), id: "gm-1", isGM: true, active: true };
  game.users = [game.user];
  game.folders = { find: () => ({ id: "folder-1" }) };
  globalThis.JournalEntry = {
    create: async (data) => {
      const j = makeJournal(data.name, data.flags?.[MODULE_ID]?.worldJournalCategory);
      journals.push(j);
      created.push(j);
      return j;
    },
  };
});

afterEach(() => {
  game.journal = saved.journal;
  globalThis.JournalEntry = saved.create;
  game.user = saved.user;
  game.users = saved.users;
  game.folders = saved.folders;
});

describe("issue #347 AB16 — a World Journal AA63's defect split keeps the journal it has been writing", () => {
  it("control: one renamed Lore journal — its lore reaches the narrator", () => {
    install([makeJournal("Campaign Lore", "lore", [page("p-1", OLD.title, "loreEntry", OLD)])]);
    expect(wj.getConfirmedLore(null).map(e => e.title)).toEqual(["The Iron Accord"]);
  });

  it("renamed journal + the default-named one the next load made: the lore recorded since the split still reaches the narrator", () => {
    const renamed = makeJournal("Campaign Lore", "lore", [page("p-1", OLD.title, "loreEntry", OLD)]);
    const live    = makeJournal("World Journal — Lore", "lore", [page("p-2", NEW.title, "loreEntry", NEW)]);
    install([renamed, live]);   // collection order: the older journal first
    expect(wj.getConfirmedLore(null).map(e => e.title),
      "ESTABLISHED LORE keeps what v1.8.0 read — the journal the module has written since the split").toContain("The Drift Beacons");
  });

  it("renamed journal + the default-named one: new lore joins the journal the sessions since the split wrote to", async () => {
    const renamed = makeJournal("Campaign Lore", "lore", [page("p-1", OLD.title, "loreEntry", OLD)]);
    const live    = makeJournal("World Journal — Lore", "lore", [page("p-2", NEW.title, "loreEntry", NEW)]);
    install([renamed, live]);
    await wj.recordLoreDiscovery("The Hollow Choir", { category: "creature", text: "Something sings in the dark.", confirmed: true }, {});
    expect(created.map(j => j.name), "no third journal").toEqual([]);
    expect(live.pages.contents.map(p => p.name), "filed with the lore of the sessions since").toContain("The Hollow Choir");
  });

  it("control: in either collection order, the default-named journal is the one found", () => {
    const renamed = makeJournal("Campaign Lore", "lore", [page("p-1", OLD.title, "loreEntry", OLD)]);
    const live    = makeJournal("World Journal — Lore", "lore", [page("p-2", NEW.title, "loreEntry", NEW)]);
    install([live, renamed]);
    expect(wj.findWorldJournal("lore")).toBe(live);
    expect(wj.getConfirmedLore(null).map(e => e.title)).toEqual(["The Drift Beacons"]);
  });
});

describe("issue #347 AB16 — a Progress Tracks journal AA62's defect split keeps the one the sessions since wrote", () => {
  let store;
  let interpreter;
  let saved2;
  let trackJournals;

  function tracksJournal(name, tracks) {
    const flags = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
    return {
      id: `j-${Math.random().toString(36).slice(2, 8)}`,
      name,
      flags: {},
      getFlag: (m, k) => flags[`${m}.${k}`],
      setFlag: async (m, k, v) => { flags[`${m}.${k}`] = structuredClone(v); },
    };
  }
  const oldFight = { id: "fight-old", label: "Corsair boarding party", type: "combat", rank: "dangerous", ticks: 8, completed: false };
  const newFight = { id: "fight-new", label: "Drift raiders", type: "combat", rank: "formidable", ticks: 4, completed: false };

  beforeAll(async () => {
    store = await import("../../src/ui/progressTracks.js");
    interpreter = await import("../../src/moves/interpreter.js");
  });

  beforeEach(() => {
    saved2 = { journal: game.journal, create: globalThis.JournalEntry };
    // The renamed journal (older, first in collection order) and the
    // default-named one the next track write made.
    trackJournals = [tracksJournal("Campaign Tracks", [oldFight]), tracksJournal("Starforged Progress Tracks", [newFight])];
    game.journal = {
      ...saved2.journal,
      find: (fn) => trackJournals.find(fn) ?? undefined,
      get: (id) => trackJournals.find(j => j.id === id) ?? undefined,
      contents: trackJournals,
      [Symbol.iterator]: function* () { yield* trackJournals; },
    };
    globalThis.JournalEntry = { create: async () => { throw new Error("no journal is created"); } };
  });

  afterEach(() => {
    game.journal = saved2.journal;
    globalThis.JournalEntry = saved2.create;
  });

  it("the panel, the narrator and the interpreter read the default-named journal's tracks", async () => {
    expect((await store.listProgressTracks()).map(t => t.id)).toEqual(["fight-new"]);
    expect(store.listOpenProgressTracks().map(t => t.id)).toEqual(["fight-new"]);
    expect(interpreter.buildContextSummary({})).toContain('Open progress tracks: combat "Drift raiders"');
  });

  it("a new track joins the default-named journal", async () => {
    await store.addProgressTrack({ label: "Smugglers at the dock", type: "combat", rank: "formidable" });
    expect(trackJournals[1].getFlag(MODULE_ID, "tracks").map(t => t.label)).toEqual(["Drift raiders", "Smugglers at the dock"]);
    expect(trackJournals[0].getFlag(MODULE_ID, "tracks").map(t => t.label)).toEqual(["Corsair boarding party"]);
  });

  it("control: one renamed journal alone is still found by its tracks (AA62)", async () => {
    trackJournals.splice(1, 1);
    expect((await store.listProgressTracks()).map(t => t.id)).toEqual(["fight-old"]);
  });
});

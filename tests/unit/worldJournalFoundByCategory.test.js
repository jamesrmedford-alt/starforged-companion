/**
 * STARFORGED COMPANION
 * tests/unit/worldJournalFoundByCategory.test.js
 *
 * Issue #345 AA63 (WORLD-JOURNAL-BY-NAME, the audit's SWP-2 probe). The World
 * Journal's five journals (Lore, Threats, Factions, Locations, Session Log)
 * are created with a stable flag naming their category —
 * `flags[MODULE].worldJournalCategory` — that nothing read: every reader and
 * writer found its journal by display name (findJournal / getOrCreateJournal,
 * initWorldJournals, the World Journal panel). A GM who renamed "World
 * Journal — Lore" silently took every confirmed fact out of the narrator's
 * ESTABLISHED LORE (getConfirmedLore → []), and the next lore the detection
 * pass recorded — or the next canonical-GM load — made a fresh "World Journal
 * — Lore", splitting the record. Threats (ACTIVE THREATS), Factions (FACTION
 * LANDSCAPE) and Locations likewise.
 *
 * Now the category flag is the lookup key (rules/reachability.md §1, §6); the
 * name finds only a journal with no category flag — one made before the flag,
 * which a GM's write (or the load) stamps — never one flagged as another
 * category.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { StubElement } from "../helpers/cardDom.js";

const MODULE_ID = "starforged-companion";

let wj;
let panel;
let journals;
let created;
let savedJournal;
let savedCreate;
let savedUser;
let savedUsers;
let savedFolders;

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
    sheet: { rendered: 0, render() { this.rendered += 1; } },
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
const THREAT = {
  name: "The Ravager Fleet", category: "faction", severity: "active", summary: "Raiders massing at the Rift.",
  createdAt: "2026-11-01T10:00:00.000Z", updatedAt: "2026-11-01T10:00:00.000Z",
};

beforeAll(async () => {
  wj = await import("../../src/world/worldJournal.js");
  panel = await import("../../src/world/worldJournalPanel.js");
});

beforeEach(() => {
  journals = [
    makeJournal("World Journal — Lore", "lore", [page("p-1", "The Iron Accord", "loreEntry", LORE)]),
    makeJournal("World Journal — Threats", "threats", [page("p-2", "The Ravager Fleet", "threatEntry", THREAT)]),
  ];
  created = [];
  savedJournal = game.journal;
  savedCreate = globalThis.JournalEntry;
  savedUser = game.user;
  savedUsers = game.users;
  savedFolders = game.folders;
  game.user = { ...(savedUser ?? {}), id: "gm-1", isGM: true, active: true };
  game.users = [game.user];
  game.folders = { find: () => ({ id: "folder-1" }) };
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
      const j = makeJournal(data.name, data.flags?.[MODULE_ID]?.worldJournalCategory);
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
  game.users = savedUsers;
  game.folders = savedFolders;
});

describe("issue #345 AA63 — the World Journal's journals are found by their category, not their names", () => {
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
    expect(journals[0].pages.contents.map(p => p.name)).toEqual(["The Iron Accord", "The Drift Beacons"]);
  });

  it("the GM renames the Threats journal — ACTIVE THREATS still lists its threat, and a new one joins it", async () => {
    journals[1].name = "Dangers";
    expect(wj.getActiveThreats(null).map(t => t.name)).toEqual(["The Ravager Fleet"]);
    await wj.recordThreat("The Hollow Choir", { category: "creature", severity: "looming", summary: "Something sings in the dark." }, {});
    expect(created.map(j => j.name)).toEqual([]);
    expect(journals[1].pages.contents.map(p => p.name)).toEqual(["The Ravager Fleet", "The Hollow Choir"]);
  });

  it("the canonical GM's load after a rename makes no second journal for it", async () => {
    journals[0].name = "Lore";
    await wj.initWorldJournals();
    expect(created.map(j => j.name).sort(), "only the categories that have none").toEqual([
      "World Journal — Factions", "World Journal — Locations", "World Journal — Session Log",
    ]);
  });

  it("a journal of the name made before the category flag is still the one used — the GM's next write stamps its category", async () => {
    journals.splice(0, 1, makeJournal("World Journal — Lore", undefined, [page("p-1", "The Iron Accord", "loreEntry", LORE)]));
    expect(wj.getConfirmedLore(null).map(e => e.title)).toEqual(["The Iron Accord"]);
    await wj.recordLoreDiscovery("The Drift Beacons", { category: "location", text: "Beacons mark safe lanes.", confirmed: true }, {});
    expect(created).toEqual([]);
    expect(journals[0].flags[MODULE_ID]?.worldJournalCategory, "its category stamped").toBe("lore");
    journals[0].name = "Lore";   // renamed afterwards: still found
    expect(wj.getConfirmedLore(null).map(e => e.title), "newest first").toEqual(["The Drift Beacons", "The Iron Accord"]);
  });

  it("a journal of the name flagged as another category is not taken for this one", async () => {
    // The GM renamed the Threats journal "World Journal — Lore", and the Lore one "Lore".
    journals[0].name = "Lore";
    journals[1].name = "World Journal — Lore";
    expect(wj.getConfirmedLore(null).map(e => e.title)).toEqual(["The Iron Accord"]);
    expect(wj.getActiveThreats(null).map(t => t.name)).toEqual(["The Ravager Fleet"]);
  });

  it("the World Journal panel's journal buttons open the renamed journal", async () => {
    const savedDocument = globalThis.document;
    globalThis.document = { createElement: (tag) => new StubElement(tag) };
    try {
      journals[0].name = "Lore";
      const app = new panel.WorldJournalPanelApp();
      app.render = async () => app;
      await panel.WorldJournalPanelApp.DEFAULT_OPTIONS.actions.openJournal.call(app, {}, { dataset: { journalKey: "lore" } });
      expect(journals[0].sheet.rendered, "the Lore Journal ↗ button opens it").toBe(1);
    } finally {
      globalThis.document = savedDocument;
    }
  });
});

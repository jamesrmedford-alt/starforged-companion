/**
 * STARFORGED COMPANION
 * tests/unit/worldJournalPageByEntryFlag.test.js
 *
 * WJ-PAGE-BY-TITLE (issue #345 AA63's residual). Issue #345 AA63 found the
 * World Journal's journals by their category flag, so a GM's rename of a
 * journal is followed — but the pages inside were still found by their
 * title. A GM who renamed an entry's page in the journal (to annotate it,
 * say) was not followed: the next record of that entry started a second page
 * beside it, a `!journal` ruling or the capture's "lore confirmed" missed it,
 * and the World Journal panel's per-entry buttons (Dismiss, Review) found
 * nothing.
 *
 * Every entry page carries its entry's own name in its flag (a lore title, a
 * threat's, faction's or location's name); the page is now found by that
 * first, then by its title.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { StubElement } from "../helpers/cardDom.js";

const MODULE_ID = "starforged-companion";

let wj;
let panel;
let journals;
let created;
let saved;

function makePage(id, name, flagKey, entry) {
  const page = {
    id, name, flags: { [MODULE_ID]: { [flagKey]: structuredClone(entry) } }, text: { content: "" },
    async setFlag(mod, key, value) { (page.flags[mod] ??= {})[key] = { ...(page.flags[mod][key] ?? {}), ...structuredClone(value) }; return page; },
    async update(changes) { if (changes?.name) page.name = changes.name; if (changes?.text) page.text = changes.text; return page; },
  };
  return page;
}

function makeJournal(name, category, pages = []) {
  const j = {
    id: `j-${category}`,
    name,
    flags: { [MODULE_ID]: { worldJournalCategory: category } },
    pages: { contents: pages },
    getFlag: (m, k) => j.flags?.[m]?.[k],
    setFlag: async (m, k, v) => { (j.flags[m] ??= {})[k] = v; return j; },
    sheet: { opened: [], render(_force, opts) { this.opened.push(opts?.pageId ?? null); } },
    createEmbeddedDocuments: async (_type, data) => {
      const made = data.map((d, i) => makePage(`p-new-${j.pages.contents.length + i}`, d.name, Object.keys(d.flags[MODULE_ID])[0], Object.values(d.flags[MODULE_ID])[0]));
      j.pages.contents.push(...made);
      created.push(...made.map(p => p.name));
      return made;
    },
  };
  return j;
}

const LORE = {
  title: "The Iron Accord", category: "faction", text: "The Accord's founding charter forbids precursor salvage.",
  confirmed: false, narratorAsserted: true, sessionId: "s1", createdAt: "2026-11-01T10:00:00.000Z", updatedAt: "2026-11-01T10:00:00.000Z",
};
const THREAT = {
  name: "The Ravager Fleet", type: "faction", severity: "looming", summary: "Raiders massing at the Rift.", history: [],
  createdAt: "2026-11-01T10:00:00.000Z", updatedAt: "2026-11-01T10:00:00.000Z",
};

const lorePages    = () => journals[0].pages.contents;
const threatPages  = () => journals[1].pages.contents;

beforeAll(async () => {
  wj = await import("../../src/world/worldJournal.js");
  panel = await import("../../src/world/worldJournalPanel.js");
});

beforeEach(() => {
  created = [];
  journals = [
    makeJournal("World Journal — Lore", "lore", [makePage("p-1", "The Iron Accord", "loreEntry", LORE)]),
    makeJournal("World Journal — Threats", "threats", [makePage("p-2", "The Ravager Fleet", "threatEntry", THREAT)]),
  ];
  saved = { journal: game.journal, user: game.user, users: game.users, folders: game.folders, document: globalThis.document, JournalEntry: globalThis.JournalEntry };
  game.user = { ...(saved.user ?? {}), id: "gm-1", isGM: true, active: true };
  game.users = [game.user];
  game.folders = { find: () => ({ id: "folder-1" }) };
  game.journal = {
    ...saved.journal,
    getName: (n) => journals.find(j => j.name === n) ?? undefined,
    find: (fn) => journals.find(fn) ?? undefined,
    get: (id) => journals.find(j => j.id === id) ?? undefined,
    contents: journals,
    [Symbol.iterator]: function* () { yield* journals; },
  };
  globalThis.JournalEntry = { create: async () => { throw new Error("no journal should be created"); } };
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
});

afterEach(() => {
  game.journal = saved.journal;
  game.user = saved.user;
  game.users = saved.users;
  game.folders = saved.folders;
  globalThis.document = saved.document;
  globalThis.JournalEntry = saved.JournalEntry;
});

describe("WJ-PAGE-BY-TITLE — an entry page the GM renamed is still that entry's page", () => {
  it("control: an unrenamed page is updated in place", async () => {
    await wj.recordLoreDiscovery("The Iron Accord", { text: "Updated.", confirmed: true }, {});
    expect(created).toEqual([]);
    expect(lorePages()[0].flags[MODULE_ID].loreEntry.text).toBe("Updated.");
  });

  it("recording the lore again updates the renamed page — no second page beside it", async () => {
    lorePages()[0].name = "Iron Accord (check with the GM)";
    await wj.recordLoreDiscovery("The Iron Accord", { text: "The charter was amended.", confirmed: true }, {});

    expect(created, "a second page for the same entry").toEqual([]);
    expect(lorePages()).toHaveLength(1);
    expect(lorePages()[0].flags[MODULE_ID].loreEntry.text).toBe("The charter was amended.");
    expect(wj.getConfirmedLore(null).map(e => e.title)).toEqual(["The Iron Accord"]);
  });

  it("the capture's confirmation reaches the renamed page", async () => {
    lorePages()[0].name = "Accord — notes";
    const result = await wj.promoteLoreToConfirmed("The Iron Accord", {});
    expect(result?.confirmed).toBe(true);
    expect(lorePages()[0].flags[MODULE_ID].loreEntry.confirmed).toBe(true);
  });

  it("a threat's severity change reaches its renamed page", async () => {
    threatPages()[0].name = "Ravagers!";
    await wj.updateThreatSeverity("The Ravager Fleet", "immediate", {});
    expect(threatPages()[0].flags[MODULE_ID].threatEntry.severity).toBe("immediate");
    await wj.recordThreat("The Ravager Fleet", { severity: "active", summary: "Closer." }, {});
    expect(created).toEqual([]);
    expect(threatPages()).toHaveLength(1);
  });

  it("the World Journal panel's Dismiss clears the assertion on the renamed page", async () => {
    lorePages()[0].name = "Accord — notes";
    const app = new panel.WorldJournalPanelApp();
    app.render = async () => app;
    await panel.WorldJournalPanelApp.DEFAULT_OPTIONS.actions.dismissAssertion.call(app, {}, { dataset: { title: "The Iron Accord" } });
    expect(lorePages()[0].flags[MODULE_ID].loreEntry.narratorAsserted).toBe(false);
  });

  it("findEntryPage finds by the entry flag first, then by the page's title", () => {
    lorePages()[0].name = "Accord — notes";
    const hand = { id: "p-hand", name: "Hand-written", flags: {} };
    lorePages().push(hand);
    expect(wj.findEntryPage(journals[0], "The Iron Accord")?.id).toBe("p-1");
    expect(wj.findEntryPage(journals[0], "Hand-written")?.id).toBe("p-hand");
    expect(wj.findEntryPage(journals[0], "Accord — notes")?.id).toBe("p-1");
  });
});

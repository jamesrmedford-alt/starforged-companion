/**
 * Issue #330 D9 — a GM's ruling on a lore entry stands until a GM changes it.
 *
 * The detection pass auto-confirms a lore entry; the GM rules it a rumour
 * (`!journal lore "…" rumour — …`, issue #321 U40: out of canon and out of
 * the review queue). A later narration mentions it again: the detection pass
 * re-recorded it `confirmed: true, narratorAsserted: true`, and
 * recordLoreDiscovery kept only a stored `retracted` mark, so the ruling was
 * overwritten and the entry was canon again. A struck entry was protected
 * from exactly this; a rumour ruling and the panel's Dismiss were not. Decided (option A): a narrator write never overturns a
 * GM's ruling — only `!journal lore "<title>" confirmed` or the panel's
 * Confirm promotes it.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseJournalCommand,
  executeJournalCommand,
  getConfirmedLore,
  retractSessionLore,
  recordLoreDiscovery,
  promoteLoreToConfirmed,
  JOURNAL_NAMES,
} from "../../src/world/worldJournal.js";
import { routeWorldJournalResults, applyStateTransition } from "../../src/entities/entityExtractor.js";

const MODULE_ID = "starforged-companion";

function makeJournal(name) {
  const pages = [];
  const journal = {
    id: `journal-${name}`, name, flags: {},
    pages: { get contents() { return pages; }, find: (fn) => pages.find(fn) },
    createEmbeddedDocuments: async (_type, docs) => { const created = docs.map(makePage); pages.push(...created); return created; },
    setFlag: async (mod, key, val) => { (journal.flags[mod] ??= {})[key] = val; },
    getFlag: (mod, key) => journal.flags?.[mod]?.[key],
  };
  return journal;
}
function makePage(doc) {
  const page = {
    id: `page-${doc.name}-${Math.random().toString(36).slice(2, 8)}`,
    name: doc.name, type: doc.type ?? "text", text: doc.text ?? null,
    flags: JSON.parse(JSON.stringify(doc.flags ?? {})),
    setFlag: async (mod, key, val) => { (page.flags[mod] ??= {})[key] = val; },
    getFlag: (mod, key) => page.flags?.[mod]?.[key],
    update: async (data) => Object.assign(page, data),
    delete: async () => {},
  };
  return page;
}

let journals, orig;
beforeEach(() => {
  journals = new Map();
  orig = { get: game.journal.get, getName: game.journal.getName, find: game.journal.find, create: global.JournalEntry?.create, user: global.game.user };
  game.journal.get     = (id) => [...journals.values()].find(j => j.id === id) ?? null;
  game.journal.getName = (n) => journals.get(n) ?? null;
  game.journal.find    = (fn) => [...journals.values()].find(fn) ?? null;
  global.JournalEntry  = { create: async (data) => { const j = makeJournal(data.name); journals.set(data.name, j); return j; } };
  global.game.user = { ...(global.game.user ?? {}), isGM: true, name: "Test GM" };
});
afterEach(() => {
  game.journal.get = orig.get; game.journal.getName = orig.getName; game.journal.find = orig.find;
  global.JournalEntry = { create: orig.create };
  global.game.user = orig.user;
});

const cs = { currentSessionId: "session-1", sessionNumber: 3, connectionIds: [], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [] };
const TITLE = "The Covenant blockade";
const page  = () => journals.get(JOURNAL_NAMES.lore)?.pages.contents.find(p => p.name === TITLE);
const entry = () => page()?.flags[MODULE_ID]?.loreEntry;
const canon = () => getConfirmedLore(cs).map(e => e.title);
const detected = (narrationId = "narr-2") => routeWorldJournalResults({
  lore: [{ title: TITLE, text: "The Covenant has blockaded Ironway.", category: "factions", salience: "defining" }],
}, cs, { narrationId });
const rule = (text) => executeJournalCommand(parseJournalCommand(text), cs);

describe("issue #330 D9 — a GM's lore ruling stands against the narrator", () => {
  it("a rumour ruling stays a rumour when the detection pass records the same title again", async () => {
    await detected("narr-1");
    await rule(`!journal lore "${TITLE}" rumour — Dock gossip, nothing more.`);
    expect(entry()).toMatchObject({ confirmed: false, narratorAsserted: false, retracted: false });
    expect(canon()).not.toContain(TITLE);

    await detected("narr-2");
    expect(entry()).toMatchObject({ confirmed: false, narratorAsserted: false, text: "Dock gossip, nothing more." });
    expect(canon()).not.toContain(TITLE);
  });

  it("the capture's 'lore confirmed' transition does not promote a rumour either", async () => {
    await detected("narr-1");
    await rule(`!journal lore "${TITLE}" rumour — Dock gossip.`);
    await applyStateTransition({ entryType: "lore", change: "confirmed", name: TITLE }, cs, { narrationId: "narr-3" });
    expect(entry().confirmed).toBe(false);
    expect(canon()).not.toContain(TITLE);
  });

  it("a rumour the GM filed before any narration stays the GM's when the narrator mentions it", async () => {
    await rule(`!journal lore "${TITLE}" rumour — The GM's own note.`);
    await detected();
    expect(entry()).toMatchObject({ confirmed: false, narratorAsserted: false, text: "The GM's own note." });
  });

  it("an entry the GM dismissed from review is not re-confirmed by the next mention", async () => {
    await recordLoreDiscovery(TITLE, { text: "Pending.", narratorAsserted: true, confirmed: false }, cs);
    await page().setFlag(MODULE_ID, "loreEntry", { ...entry(), narratorAsserted: false });   // the panel's Dismiss
    await detected();
    expect(entry().confirmed).toBe(false);
  });

  it("a GM's `confirmed` ruling, or the panel's Confirm, still promotes it", async () => {
    await rule(`!journal lore "${TITLE}" rumour — Dock gossip.`);
    await promoteLoreToConfirmed(TITLE, cs);                       // the panel's Confirm
    expect(entry().confirmed).toBe(true);
    expect(canon()).toContain(TITLE);

    await rule(`!journal lore "${TITLE}" rumour — Dock gossip.`);
    await rule(`!journal lore "${TITLE}" confirmed`);
    expect(entry().confirmed).toBe(true);
  });

  it("control: a new narrator-detected lore entry auto-confirms", async () => {
    await detected();
    expect(entry()).toMatchObject({ confirmed: true, narratorAsserted: true });
    expect(canon()).toContain(TITLE);
  });

  it("control: a confirmed narrator entry is re-recorded by the next mention", async () => {
    await detected("narr-1");
    await routeWorldJournalResults({
      lore: [{ title: TITLE, text: "The blockade tightens.", category: "factions", salience: "defining" }],
    }, cs, { narrationId: "narr-2" });
    expect(entry()).toMatchObject({ confirmed: true, text: "The blockade tightens.", narrationId: "narr-2" });
  });

  it("control: a STRUCK entry stays struck when the detection pass records it again", async () => {
    await detected();
    expect(await retractSessionLore("session-1", (e) => e.title === TITLE)).toBe(1);
    await detected();
    expect(entry()).toMatchObject({ retracted: true });
    expect(canon()).not.toContain(TITLE);
  });
});

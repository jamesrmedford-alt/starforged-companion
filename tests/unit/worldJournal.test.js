/**
 * STARFORGED COMPANION
 * tests/unit/worldJournal.test.js
 *
 * Unit tests for src/world/worldJournal.js — CRUD + read functions and
 * !journal command parsing. Pure logic; uses an in-memory Foundry journal
 * stub installed in beforeEach.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initWorldJournals,
  recordLoreDiscovery,
  recordThreat,
  recordFactionIntelligence,
  recordLocation,
  updateThreatSeverity,
  promoteLoreToConfirmed,
  applyStateTransition,
  annotateEntry,
  writeSessionLog,
  parseJournalCommand,
  executeJournalCommand,
  getConfirmedLore,
  getNarratorAssertedLore,
  getActiveThreats,
  getFactionLandscape,
  getRecentDiscoveries,
  listLocationEntries,
  JOURNAL_NAMES,
} from "../../src/world/worldJournal.js";

const MODULE_ID = "starforged-companion";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory journal mock — installed per-test in beforeEach
// ─────────────────────────────────────────────────────────────────────────────

function makeJournal(name) {
  const pages = [];
  const journal = {
    id:    `journal-${name}`,
    name,
    flags: {},
    pages: {
      get contents() { return pages; },
      find: (fn) => pages.find(fn),
    },
    createEmbeddedDocuments: async (_type, docs) => {
      const created = docs.map(d => makePage(d));
      pages.push(...created);
      return created;
    },
    setFlag: async (mod, key, val) => {
      journal.flags[mod] = journal.flags[mod] ?? {};
      journal.flags[mod][key] = val;
    },
    getFlag: (mod, key) => journal.flags?.[mod]?.[key],
  };
  return journal;
}

function makePage(doc) {
  const flags = JSON.parse(JSON.stringify(doc.flags ?? {}));
  const page = {
    id:    `page-${doc.name}-${Math.random().toString(36).slice(2, 8)}`,
    name:  doc.name,
    type:  doc.type ?? "text",
    text:  doc.text ?? null,
    flags,
    setFlag: async (mod, key, val) => {
      page.flags[mod] = page.flags[mod] ?? {};
      page.flags[mod][key] = val;
    },
    getFlag: (mod, key) => page.flags?.[mod]?.[key],
    update:  async (data) => Object.assign(page, data),
    delete:  async () => {},
  };
  return page;
}

let _journals;
let _origGet;
let _origGetName;
let _origFind;
let _origCreate;
let _origUserName;

beforeEach(() => {
  _journals = new Map(); // name → journal mock

  _origGet     = global.game.journal.get;
  _origGetName = global.game.journal.getName;
  _origFind    = global.game.journal.find;
  _origCreate  = global.JournalEntry?.create;
  _origUserName = global.game.user?.name;

  global.game.journal.get     = (id) => [..._journals.values()].find(j => j.id === id) ?? null;
  global.game.journal.getName = (n) => _journals.get(n) ?? null;
  global.game.journal.find    = (fn) => [..._journals.values()].find(fn) ?? null;

  global.JournalEntry = {
    create: async (data) => {
      const j = makeJournal(data.name);
      _journals.set(data.name, j);
      return j;
    },
  };

  global.game.user = { ...(global.game.user ?? {}), isGM: true, name: 'Test GM' };
  global.ChatMessage._reset?.();
});

afterEach(() => {
  global.game.journal.get     = _origGet;
  global.game.journal.getName = _origGetName;
  global.game.journal.find    = _origFind;
  global.JournalEntry         = { create: _origCreate };
  if (global.game.user) global.game.user.name = _origUserName;
});

function campaign(overrides = {}) {
  return {
    currentSessionId: "session-1",
    sessionNumber:   3,
    ...overrides,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// initWorldJournals
// ─────────────────────────────────────────────────────────────────────────────

describe("initWorldJournals", () => {
  it("creates all five category journals", async () => {
    await initWorldJournals();
    for (const name of Object.values(JOURNAL_NAMES)) {
      expect(_journals.has(name)).toBe(true);
    }
  });

  it("is idempotent — re-running does not create duplicates", async () => {
    await initWorldJournals();
    const sizeAfterFirst = _journals.size;
    await initWorldJournals();
    expect(_journals.size).toBe(sizeAfterFirst);
  });

  it("does nothing for non-GM users", async () => {
    global.game.user.isGM = false;
    await initWorldJournals();
    expect(_journals.size).toBe(0);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// recordLoreDiscovery
// ─────────────────────────────────────────────────────────────────────────────

describe("recordLoreDiscovery", () => {
  it("creates a new lore entry with narratorAsserted: false for manual entry", async () => {
    const result = await recordLoreDiscovery(
      "The iron panel navigates to Ascendancy space",
      { text: "Discovered in session 3.", confirmed: false, narratorAsserted: false },
      campaign(),
    );
    expect(result.narratorAsserted).toBe(false);
    expect(result.confirmed).toBe(false);
    expect(result.title).toBe("The iron panel navigates to Ascendancy space");
  });

  it("sets confirmed: true when entry.confirmed === true", async () => {
    const result = await recordLoreDiscovery(
      "Confirmed fact",
      { confirmed: true, text: "From the GM directly." },
      campaign(),
    );
    expect(result.confirmed).toBe(true);
    expect(result.promotedAt).not.toBeNull();
  });

  it("preserves existing entries when adding a new one", async () => {
    await recordLoreDiscovery("Entry A", { text: "first" },  campaign());
    await recordLoreDiscovery("Entry B", { text: "second" }, campaign());
    const journal = _journals.get(JOURNAL_NAMES.lore);
    expect(journal.pages.contents).toHaveLength(2);
    expect(journal.pages.contents.map(p => p.name).sort()).toEqual(["Entry A", "Entry B"]);
  });

  it("rejects entries with an empty title", async () => {
    expectConsoleError(/recordLoreDiscovery rejected/);
    const result = await recordLoreDiscovery("", { text: "x" }, campaign());
    expect(result).toBeNull();
  });

  it("upserts on duplicate titles (does not create a second page)", async () => {
    await recordLoreDiscovery("Same Title", { text: "first" },  campaign());
    await recordLoreDiscovery("Same Title", { text: "second" }, campaign());
    const journal = _journals.get(JOURNAL_NAMES.lore);
    expect(journal.pages.contents).toHaveLength(1);
    const data = journal.pages.contents[0].flags[MODULE_ID].loreEntry;
    expect(data.text).toBe("second");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// recordThreat
// ─────────────────────────────────────────────────────────────────────────────

describe("recordThreat", () => {
  it("creates a new threat entry", async () => {
    const result = await recordThreat(
      "Ascendancy AI fragment",
      { type: "faction", severity: "active", summary: "pursuing the panel" },
      campaign(),
    );
    expect(result.name).toBe("Ascendancy AI fragment");
    expect(result.severity).toBe("active");
  });

  it("default severity is 'looming' when not specified", async () => {
    const result = await recordThreat("Vague Danger", { type: "other" }, campaign());
    expect(result.severity).toBe("looming");
  });

  it("appends to history when severity changes", async () => {
    await recordThreat("Drifting Hulk", { severity: "looming" }, campaign());
    await recordThreat("Drifting Hulk", { severity: "active" }, campaign());
    const journal = _journals.get(JOURNAL_NAMES.threats);
    const data = journal.pages.contents[0].flags[MODULE_ID].threatEntry;
    expect(data.severity).toBe("active");
    expect(data.history.length).toBeGreaterThanOrEqual(2);
    expect(data.history.map(h => h.severity)).toContain("looming");
    expect(data.history.map(h => h.severity)).toContain("active");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// recordFactionIntelligence
// ─────────────────────────────────────────────────────────────────────────────

describe("recordFactionIntelligence", () => {
  it("creates a new faction entry", async () => {
    const result = await recordFactionIntelligence(
      "The Iron Compact",
      { attitude: "neutral", summary: "first contact" },
      campaign(),
    );
    expect(result.factionName).toBe("The Iron Compact");
    expect(result.attitude).toBe("neutral");
  });

  it("appends an encounter to an existing faction entry", async () => {
    await recordFactionIntelligence("Covenant", { attitude: "hostile", summary: "first burn" }, campaign());
    await recordFactionIntelligence("Covenant", { attitude: "hostile", summary: "second burn" }, campaign());
    const journal = _journals.get(JOURNAL_NAMES.factions);
    const data = journal.pages.contents[0].flags[MODULE_ID].factionEntry;
    expect(data.encounters).toHaveLength(2);
  });

  it("updates the attitude when changed", async () => {
    await recordFactionIntelligence("Sable's Crew", { attitude: "neutral" }, campaign());
    await recordFactionIntelligence("Sable's Crew", { attitude: "allied" }, campaign());
    const journal = _journals.get(JOURNAL_NAMES.factions);
    const data = journal.pages.contents[0].flags[MODULE_ID].factionEntry;
    expect(data.attitude).toBe("allied");
  });

  it("stores entityId link when provided", async () => {
    const result = await recordFactionIntelligence(
      "Linked Faction",
      { attitude: "neutral", entityId: "fac-link-1" },
      campaign(),
    );
    expect(result.entityId).toBe("fac-link-1");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// recordLocation
// ─────────────────────────────────────────────────────────────────────────────

describe("recordLocation", () => {
  it("creates a new location entry", async () => {
    const result = await recordLocation(
      "Bleakhold",
      { type: "settlement", description: "rough port at the rim" },
      campaign(),
    );
    expect(result.locationName).toBe("Bleakhold");
    expect(result.type).toBe("settlement");
  });

  it("appends a visit on duplicate names", async () => {
    await recordLocation("Kovash", { type: "derelict", summary: "first sighting" }, campaign());
    await recordLocation("Kovash", { type: "derelict", summary: "return visit" }, campaign());
    const data = _journals.get(JOURNAL_NAMES.locations).pages.contents[0].flags[MODULE_ID].locationEntry;
    expect(data.visits).toHaveLength(2);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// updateThreatSeverity
// ─────────────────────────────────────────────────────────────────────────────

describe("updateThreatSeverity", () => {
  it("updates severity on a named threat", async () => {
    await recordThreat("Marauders", { severity: "looming" }, campaign());
    const updated = await updateThreatSeverity("Marauders", "active", campaign());
    expect(updated.severity).toBe("active");
  });

  it("appends to the history array on update", async () => {
    await recordThreat("Marauders", { severity: "looming" }, campaign());
    await updateThreatSeverity("Marauders", "immediate", campaign());
    const data = _journals.get(JOURNAL_NAMES.threats).pages.contents[0].flags[MODULE_ID].threatEntry;
    expect(data.history.length).toBeGreaterThanOrEqual(2);
    expect(data.history.at(-1).severity).toBe("immediate");
  });

  it("warns and returns null when no threat by that name exists", async () => {
    expectConsoleError?.(/updateThreatSeverity — no threat/);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await updateThreatSeverity("Nobody", "active", campaign());
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// promoteLoreToConfirmed
// ─────────────────────────────────────────────────────────────────────────────

describe("promoteLoreToConfirmed", () => {
  it("sets confirmed: true", async () => {
    await recordLoreDiscovery("Soft Fact", { narratorAsserted: true, text: "x" }, campaign());
    const result = await promoteLoreToConfirmed("Soft Fact", campaign());
    expect(result.confirmed).toBe(true);
  });

  it("sets a promotedAt timestamp", async () => {
    await recordLoreDiscovery("Soft Fact", { narratorAsserted: true, text: "x" }, campaign());
    const result = await promoteLoreToConfirmed("Soft Fact", campaign());
    expect(result.promotedAt).toBeTruthy();
    expect(typeof result.promotedAt).toBe("string");
  });

  it("does not change the narratorAsserted flag", async () => {
    await recordLoreDiscovery("Soft Fact", { narratorAsserted: true, text: "x" }, campaign());
    const result = await promoteLoreToConfirmed("Soft Fact", campaign());
    expect(result.narratorAsserted).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// applyStateTransition
// ─────────────────────────────────────────────────────────────────────────────

describe("applyStateTransition — threat", () => {
  it("'resolved' transition sets severity 'resolved'", async () => {
    await recordThreat("AI Fragment", { severity: "immediate" }, campaign());
    const result = await applyStateTransition(
      { entryType: "threat", name: "AI Fragment", change: "resolved" },
      campaign(),
    );
    expect(result.severity).toBe("resolved");
  });

  it("'escalated' transition updates severity upward", async () => {
    await recordThreat("Watcher", { severity: "looming" }, campaign());
    const result = await applyStateTransition(
      { entryType: "threat", name: "Watcher", change: "escalated", newValue: "immediate" },
      campaign(),
    );
    expect(result.severity).toBe("immediate");
  });
});

describe("applyStateTransition — lore contradiction", () => {
  it("does NOT modify the lore entry", async () => {
    await recordLoreDiscovery("Established", {
      confirmed: true, text: "do not contradict",
    }, campaign());

    await applyStateTransition(
      { entryType: "lore", name: "Established", change: "contradicted",
        summary: "narration described the opposite" },
      campaign(),
    );

    const data = _journals.get(JOURNAL_NAMES.lore).pages.contents[0].flags[MODULE_ID].loreEntry;
    expect(data.text).toBe("do not contradict");
    expect(data.confirmed).toBe(true);
  });

  it("posts a GM-only notification card", async () => {
    await recordLoreDiscovery("Established", { confirmed: true, text: "x" }, campaign());
    global.ChatMessage._reset?.();
    await applyStateTransition(
      { entryType: "lore", name: "Established", change: "contradicted", summary: "..." },
      campaign(),
    );
    const created = global.ChatMessage._created;
    expect(created.length).toBeGreaterThan(0);
    expect(created[0].flags?.[MODULE_ID]?.worldJournalContradiction).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// annotateEntry
// ─────────────────────────────────────────────────────────────────────────────

describe("annotateEntry", () => {
  it("appends a stamped annotation to a lore entry", async () => {
    await recordLoreDiscovery("Annotatable", { text: "x" }, campaign());
    const result = await annotateEntry("lore", "Annotatable", "noted", "Reviewer", campaign());
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0].author).toBe("Reviewer");
    expect(result.annotations[0].text).toBe("noted");
  });

  it("returns null for unknown journal type", async () => {
    const result = await annotateEntry("nope", "Anything", "x", "Reviewer", campaign());
    expect(result).toBeNull();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// writeSessionLog
// ─────────────────────────────────────────────────────────────────────────────

describe("writeSessionLog", () => {
  it("creates a text page in the session log journal", async () => {
    const page = await writeSessionLog(campaign({ sessionNumber: 7, currentSessionId: "ses-7" }));
    expect(page).not.toBeNull();
    expect(page.name).toContain("Session 7");
    const journal = _journals.get(JOURNAL_NAMES.sessionLog);
    expect(journal.pages.contents).toHaveLength(1);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// parseJournalCommand
// ─────────────────────────────────────────────────────────────────────────────

describe("parseJournalCommand", () => {
  it("parses !journal faction \"Name\" attitude — summary", () => {
    const r = parseJournalCommand('!journal faction "The Iron Compact" hostile — burned the relay');
    expect(r).toMatchObject({ type: "faction", name: "The Iron Compact", qualifier: "hostile" });
    expect(r.text).toBe("burned the relay");
  });

  it("parses !journal lore \"Title\" confirmed — text", () => {
    const r = parseJournalCommand('!journal lore "Iron panel route" confirmed — established this session');
    expect(r).toMatchObject({ type: "lore", name: "Iron panel route", qualifier: "confirmed" });
  });

  it("parses !journal threat \"Name\" immediate — summary", () => {
    const r = parseJournalCommand('!journal threat "Ascendancy AI" immediate — actively pursuing');
    expect(r).toMatchObject({ type: "threat", name: "Ascendancy AI", qualifier: "immediate" });
  });

  it("parses !journal location \"Name\" type — description", () => {
    const r = parseJournalCommand('!journal location "Derelict Kovash" derelict — abandoned, radiation');
    expect(r).toMatchObject({ type: "location", name: "Derelict Kovash", qualifier: "derelict" });
  });

  it("rejects unknown journal types", () => {
    expect(parseJournalCommand('!journal what "X" foo — bar')).toBeNull();
  });

  it("handles quoted names with spaces", () => {
    const r = parseJournalCommand('!journal faction "Three Word Name" allied — note');
    expect(r.name).toBe("Three Word Name");
  });

  it("returns null for empty input", () => {
    expect(parseJournalCommand("")).toBeNull();
  });

  it("returns null for non-!journal text", () => {
    expect(parseJournalCommand("hello world")).toBeNull();
  });

  it("accepts a hyphen separator instead of em-dash", () => {
    const r = parseJournalCommand('!journal threat "Stalker" looming - watching from the dark');
    expect(r.qualifier).toBe("looming");
    expect(r.text).toBe("watching from the dark");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// executeJournalCommand
// ─────────────────────────────────────────────────────────────────────────────

describe("executeJournalCommand", () => {
  it("creates a confirmed lore entry from `!journal lore '...' confirmed — text`", async () => {
    const parsed = parseJournalCommand('!journal lore "Ironclad" confirmed — text body');
    const result = await executeJournalCommand(parsed, campaign());
    expect(result.confirmed).toBe(true);
    expect(result.narratorAsserted).toBe(false);
    expect(result.text).toBe("text body");
  });

  it("creates an unconfirmed lore entry when qualifier is not 'confirmed'", async () => {
    const parsed = parseJournalCommand('!journal lore "Whispered Rumour" rumour — possibly true');
    const result = await executeJournalCommand(parsed, campaign());
    expect(result.confirmed).toBe(false);
    expect(result.narratorAsserted).toBe(false);
  });

  it("creates a faction entry with the qualifier as attitude", async () => {
    const parsed = parseJournalCommand('!journal faction "Pelican Confederacy" allied — joint patrol');
    const result = await executeJournalCommand(parsed, campaign());
    expect(result.factionName).toBe("Pelican Confederacy");
    expect(result.attitude).toBe("allied");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Read functions for the assembler (Phase 5 wires these in)
// ─────────────────────────────────────────────────────────────────────────────

describe("getConfirmedLore / getNarratorAssertedLore / getActiveThreats / getFactionLandscape / getRecentDiscoveries", () => {
  it("getConfirmedLore returns only confirmed: true entries", async () => {
    await recordLoreDiscovery("A", { confirmed: true,  text: "a" }, campaign());
    await recordLoreDiscovery("B", { confirmed: false, text: "b" }, campaign());
    const result = getConfirmedLore(campaign());
    expect(result.map(e => e.title)).toEqual(["A"]);
  });

  it("getNarratorAssertedLore returns narratorAsserted but not confirmed entries", async () => {
    await recordLoreDiscovery("A", { confirmed: true, narratorAsserted: true,  text: "a" }, campaign());
    await recordLoreDiscovery("B", { narratorAsserted: true, text: "b" }, campaign());
    await recordLoreDiscovery("C", { text: "c" }, campaign());
    const result = getNarratorAssertedLore(campaign());
    expect(result.map(e => e.title)).toEqual(["B"]);
  });

  it("getActiveThreats returns severity !== 'resolved', sorted immediate → active → looming", async () => {
    await recordThreat("Loom",  { severity: "looming"   }, campaign());
    await recordThreat("Imm",   { severity: "immediate" }, campaign());
    await recordThreat("Done",  { severity: "resolved"  }, campaign());
    await recordThreat("Act",   { severity: "active"    }, campaign());
    const result = getActiveThreats(campaign());
    expect(result.map(t => t.name)).toEqual(["Imm", "Act", "Loom"]);
  });

  it("getFactionLandscape returns up to 3 factions, most recent first", async () => {
    for (const n of ["F1", "F2", "F3", "F4"]) {
      await recordFactionIntelligence(n, { attitude: "neutral" }, campaign());
      // small delay so updatedAt differs across entries
      await new Promise(r => setTimeout(r, 5));
    }
    const result = getFactionLandscape(campaign());
    expect(result).toHaveLength(3);
    expect(result.map(f => f.factionName)).toEqual(["F4", "F3", "F2"]);
  });

  it("getRecentDiscoveries returns current-session unconfirmed lore only", async () => {
    await recordLoreDiscovery("CurrentSoft", { text: "x" }, campaign({ currentSessionId: "ses-1" }));
    await recordLoreDiscovery("OldSoft",     { text: "x", sessionId: "ses-prev" }, campaign({ currentSessionId: "ses-1" }));
    await recordLoreDiscovery("CurrentHard", { text: "x", confirmed: true }, campaign({ currentSessionId: "ses-1" }));
    const result = getRecentDiscoveries(campaign({ currentSessionId: "ses-1" }));
    expect(result.map(e => e.title)).toEqual(["CurrentSoft"]);
  });

  it("listLocationEntries returns all locations sorted by recency", async () => {
    await recordLocation("L1", { type: "settlement" }, campaign());
    await new Promise(r => setTimeout(r, 5));
    await recordLocation("L2", { type: "derelict" },   campaign());
    const result = listLocationEntries(campaign());
    expect(result.map(l => l.locationName)).toEqual(["L2", "L1"]);
  });
});

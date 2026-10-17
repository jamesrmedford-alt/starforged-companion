/**
 * STARFORGED COMPANION
 * tests/unit/customOracles.test.js
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseEntries,
  validateCustomOracleEntries, saveCustomOracle, syncCustomOraclesFromState,
  rehydrateCustomOracles, registerCustomOracleSyncHook, _resetCustomOracleSyncHookForTests,
  postCustomOracleRoll, removeCustomOracle,
} from "../../src/oracles/customOracles.js";
import {
  ORACLE_TABLES, rollOracle, registerOracleTable, unregisterOracleTable,
} from "../../src/oracles/roller.js";


describe("parseEntries", () => {
  it("parses ranged entries", () => {
    const raw = `
      1-30 Triumph
      31-60 Stalemate
      61-100 Collapse
    `;
    expect(parseEntries(raw)).toEqual([
      { min:  1, max: 30,  result: "Triumph" },
      { min: 31, max: 60,  result: "Stalemate" },
      { min: 61, max: 100, result: "Collapse" },
    ]);
  });

  it("parses single-value entries", () => {
    expect(parseEntries("7 Critical")).toEqual([
      { min: 7, max: 7, result: "Critical" },
    ]);
  });

  it("mixes ranged and single-value entries", () => {
    const raw = "1-3 Low\n7 Critical\n9-10 High";
    expect(parseEntries(raw)).toEqual([
      { min: 1, max:  3, result: "Low" },
      { min: 7, max:  7, result: "Critical" },
      { min: 9, max: 10, result: "High" },
    ]);
  });

  it("ignores blank lines and comments", () => {
    const raw = `
      # Faction-of-the-week table
      1-50 Allies

      # commented out → 51-99 Rivals
      100 Wildcard
    `;
    expect(parseEntries(raw)).toEqual([
      { min:   1, max:  50, result: "Allies" },
      { min: 100, max: 100, result: "Wildcard" },
    ]);
  });

  it("drops malformed lines without throwing", () => {
    const raw = "1-3 OK\ngarbage line\n5-7 Fine\nnoresult\n";
    expect(parseEntries(raw)).toEqual([
      { min: 1, max: 3, result: "OK" },
      { min: 5, max: 7, result: "Fine" },
    ]);
  });

  it("drops inverted ranges (max < min)", () => {
    expect(parseEntries("10-5 Backwards\n1-3 OK")).toEqual([
      { min: 1, max: 3, result: "OK" },
    ]);
  });

  it("preserves multi-word results with internal whitespace", () => {
    const raw = "1-100 Long   spaced   description with punctuation!";
    expect(parseEntries(raw)).toEqual([
      { min: 1, max: 100, result: "Long   spaced   description with punctuation!" },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(parseEntries("")).toEqual([]);
    expect(parseEntries("\n\n\n")).toEqual([]);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// D1 — custom die, validation, overwrite, cross-client sync, card text
// ─────────────────────────────────────────────────────────────────────────────

const MODULE_ID = "starforged-companion";
const D6 = [
  { min: 1, max: 1, result: "One" },   { min: 2, max: 2, result: "Two" },
  { min: 3, max: 3, result: "Three" }, { min: 4, max: 4, result: "Four" },
  { min: 5, max: 5, result: "Five" },  { min: 6, max: 6, result: "Six" },
];

function clearCustomTables() {
  for (const [id, e] of Object.entries(ORACLE_TABLES)) {
    if (e.category === "custom") delete ORACLE_TABLES[id];
  }
}

function lastCard() {
  return ChatMessage._created.at(-1)?.content ?? "";
}

beforeEach(async () => {
  clearCustomTables();
  ChatMessage._reset();
  await game.settings.set(MODULE_ID, "campaignState", {});
});
afterEach(() => clearCustomTables());

describe("validateCustomOracleEntries", () => {
  it("accepts a contiguous d6 table and reports its die", () => {
    expect(validateCustomOracleEntries(D6)).toEqual({ ok: true, die: 6 });
  });

  it("accepts entries in any order", () => {
    const rows = parseEntries("5-8 High\n1-4 Low");
    expect(validateCustomOracleEntries(rows)).toEqual({ ok: true, die: 8 });
  });

  it("rejects a table that does not start at 1", () => {
    const r = validateCustomOracleEntries(parseEntries("2-6 Something"));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/start at 1/);
  });

  it("rejects gaps, naming the uncovered range", () => {
    const r = validateCustomOracleEntries(parseEntries("1-3 Low\n7 Critical\n9-10 High"));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Nothing covers 4-6/);
  });

  it("names a single-value gap without a range", () => {
    const r = validateCustomOracleEntries(parseEntries("1-3 Low\n5-6 High"));
    expect(r.error).toMatch(/Nothing covers 4 /);
  });

  it("rejects overlaps", () => {
    const r = validateCustomOracleEntries(parseEntries("1-4 Low\n3-6 High"));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/overlap/);
  });

  it("rejects an empty table and a zero minimum", () => {
    expect(validateCustomOracleEntries([]).ok).toBe(false);
    expect(validateCustomOracleEntries([{ min: 0, max: 4, result: "x" }]).ok).toBe(false);
  });
});

describe("custom tables roll their own die", () => {
  it("a d6 table rolls 1..6 and always lands on an entry", () => {
    registerOracleTable("quirk", { name: "Quirk", table: D6 });
    for (let i = 0; i < 200; i += 1) {
      const r = rollOracle("quirk");
      expect(r.die).toBe(6);
      expect(r.roll).toBeGreaterThanOrEqual(1);
      expect(r.roll).toBeLessThanOrEqual(6);
      expect(r.result).not.toBe("—");
    }
  });

  it("built-in tables still roll a d100", () => {
    const r = rollOracle("action");
    expect(r.die).toBe(100);
    expect(r.roll).toBeGreaterThanOrEqual(1);
    expect(r.roll).toBeLessThanOrEqual(100);
  });

  it('"Roll twice" on a custom table re-rolls with the table\'s own die', () => {
    registerOracleTable("twice", {
      name: "Twice",
      table: [{ min: 1, max: 1, result: "Roll twice" }, { min: 2, max: 4, result: "Plain" }],
    });
    // Forced 1 → directive; the two sub-rolls use a d4 so they never miss.
    for (let i = 0; i < 50; i += 1) {
      const r = rollOracle("twice", { roll: 1 });
      expect(r.result).not.toContain("—");
    }
  });
});

describe("registerOracleTable / unregisterOracleTable — custom vs built-in", () => {
  it("re-registering a custom id overwrites it", () => {
    registerOracleTable("quirk", { name: "Quirk", table: D6 });
    registerOracleTable("quirk", { name: "Quirk v2", table: [{ min: 1, max: 4, result: "x" }] });
    expect(ORACLE_TABLES.quirk.name).toBe("Quirk v2");
    expect(ORACLE_TABLES.quirk.die).toBe(4);
  });

  it("never overwrites a built-in table", () => {
    expect(() => registerOracleTable("action", { name: "Hijack", table: D6 }))
      .toThrow(/built-in/);
    expect(ORACLE_TABLES.action.name).toBe("Action");
  });

  it("never unregisters a built-in table", () => {
    expect(unregisterOracleTable("action")).toBe(false);
    expect(ORACLE_TABLES.action).toBeDefined();
    expect(globalThis.getCapturedWarns().join("\n")).toMatch(/built-in table — not removed/);
  });
});

describe("saveCustomOracle", () => {
  it("registers, persists and posts a card that names the die and !oracle", async () => {
    expect(await saveCustomOracle("quirk", "Ship Quirk", D6)).toBe(true);
    expect(ORACLE_TABLES.quirk.die).toBe(6);
    expect(game.settings.get(MODULE_ID, "campaignState").customOracles.quirk)
      .toEqual({ name: "Ship Quirk", entries: D6 });
    const card = lastCard();
    expect(card).toContain("registered");
    expect(card).toContain("d6");
    expect(card).toContain("!oracle quirk");
    expect(card).toContain("Custom Oracles panel");
    expect(card).not.toMatch(/once that form is implemented|code paths/);
  });

  it("re-defining an existing custom id overwrites it and says 'updated'", async () => {
    await saveCustomOracle("quirk", "Ship Quirk", D6);
    expect(await saveCustomOracle("quirk", "Ship Quirk II", parseEntries("1-2 A\n3-4 B"))).toBe(true);
    expect(ORACLE_TABLES.quirk.name).toBe("Ship Quirk II");
    expect(game.settings.get(MODULE_ID, "campaignState").customOracles.quirk.name).toBe("Ship Quirk II");
    expect(lastCard()).toContain("updated");
  });

  it("refuses a built-in id without persisting", async () => {
    expect(await saveCustomOracle("action", "Hijack", D6)).toBe(false);
    expect(lastCard()).toMatch(/built-in/);
    expect(game.settings.get(MODULE_ID, "campaignState").customOracles).toBeUndefined();
  });

  it("rejects a gapped table with the validation message and does not register it", async () => {
    expect(await saveCustomOracle("gappy", "Gappy", parseEntries("1-3 Low\n7 Critical"))).toBe(false);
    expect(lastCard()).toMatch(/not saved/);
    expect(lastCard()).toMatch(/Nothing covers 4-6/);
    expect(ORACLE_TABLES.gappy).toBeUndefined();
  });

  it("rejects an id with spaces (unrollable from chat)", async () => {
    expect(await saveCustomOracle("bad id", "Bad", D6)).toBe(false);
    expect(lastCard()).toMatch(/letters, numbers and underscores/);
  });

  it("rejects an empty entry list", async () => {
    expect(await saveCustomOracle("empty", "Empty", [])).toBe(false);
    expect(lastCard()).toMatch(/No valid entries/);
  });
});

describe("syncCustomOraclesFromState — every client mirrors campaignState", () => {
  it("registers new, re-registers changed and unregisters removed custom tables", () => {
    registerOracleTable("stale", { name: "Stale", table: D6 });
    const first = syncCustomOraclesFromState({
      customOracles: { quirk: { name: "Quirk", entries: D6 } },
    });
    expect(first).toEqual({ registered: ["quirk"], removed: ["stale"] });
    expect(ORACLE_TABLES.stale).toBeUndefined();

    // Unchanged → no-op.
    expect(syncCustomOraclesFromState({ customOracles: { quirk: { name: "Quirk", entries: D6 } } }))
      .toEqual({ registered: [], removed: [] });

    // Edited → re-registered.
    const edited = syncCustomOraclesFromState({
      customOracles: { quirk: { name: "Quirk", entries: [{ min: 1, max: 2, result: "x" }] } },
    });
    expect(edited.registered).toEqual(["quirk"]);
    expect(ORACLE_TABLES.quirk.die).toBe(2);
  });

  it("never touches built-ins, and warns once on a stored built-in collision", () => {
    _resetCustomOracleSyncHookForTests();
    const state = { customOracles: { action: { name: "Hijack", entries: D6 } } };
    syncCustomOraclesFromState(state);
    syncCustomOraclesFromState(state);   // every campaignState write re-syncs
    expect(ORACLE_TABLES.action.name).toBe("Action");
    const warns = globalThis.getCapturedWarns().filter(w => /could not register "action"/.test(w));
    expect(warns).toHaveLength(1);
  });

  it("still registers a legacy gapped table but warns about it", () => {
    syncCustomOraclesFromState({
      customOracles: { old: { name: "Old", entries: parseEntries("1-3 Low\n7 Critical") } },
    });
    expect(ORACLE_TABLES.old).toBeDefined();
    expect(globalThis.getCapturedWarns().join("\n")).toMatch(/"old" has invalid entries/);
  });

  it("the updateSetting hook re-syncs when campaignState changes (player client)", async () => {
    _resetCustomOracleSyncHookForTests();
    const before = (Hooks._handlers.get("updateSetting") ?? []).length;
    registerCustomOracleSyncHook();
    registerCustomOracleSyncHook();   // idempotent
    expect((Hooks._handlers.get("updateSetting") ?? []).length).toBe(before + 1);

    await game.settings.set(MODULE_ID, "campaignState", {
      customOracles: { quirk: { name: "Quirk", entries: D6 } },
    });
    Hooks.call("updateSetting", { key: `${MODULE_ID}.campaignState` });
    expect(ORACLE_TABLES.quirk?.die).toBe(6);

    // Other settings are ignored.
    await game.settings.set(MODULE_ID, "campaignState", {});
    Hooks.call("updateSetting", { key: `${MODULE_ID}.somethingElse` });
    expect(ORACLE_TABLES.quirk).toBeDefined();

    // Removal propagates.
    Hooks.call("createSetting", { key: `${MODULE_ID}.campaignState` });
    expect(ORACLE_TABLES.quirk).toBeUndefined();
  });

  it("rehydrateCustomOracles registers saved tables and installs the hook", async () => {
    _resetCustomOracleSyncHookForTests();
    await game.settings.set(MODULE_ID, "campaignState", {
      customOracles: { quirk: { name: "Quirk", entries: D6 } },
    });
    const before = (Hooks._handlers.get("updateSetting") ?? []).length;
    rehydrateCustomOracles();
    expect(ORACLE_TABLES.quirk?.category).toBe("custom");
    expect((Hooks._handlers.get("updateSetting") ?? []).length).toBe(before + 1);
  });
});

describe("postCustomOracleRoll / removeCustomOracle", () => {
  it("prints the table's die on the card and carries oracle-memory flags", async () => {
    registerOracleTable("quirk", { name: "Quirk", table: D6 });
    const r = await postCustomOracleRoll("quirk");
    const msg = ChatMessage._created.at(-1);
    expect(msg.content).toContain(`d6 = <strong>${r.roll}</strong>`);
    expect(msg.flags[MODULE_ID]).toMatchObject({
      customOracleCard: true,
      oracleTableId:    "quirk",
      oracleMemory:     { name: "Quirk", answer: r.result },
    });
  });

  it("removeCustomOracle drops the table from memory and campaignState", async () => {
    await saveCustomOracle("quirk", "Quirk", D6);
    await removeCustomOracle("quirk");
    expect(ORACLE_TABLES.quirk).toBeUndefined();
    expect(game.settings.get(MODULE_ID, "campaignState").customOracles.quirk).toBeUndefined();
  });
});

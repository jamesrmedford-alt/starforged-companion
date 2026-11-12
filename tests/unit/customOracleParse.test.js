/**
 * STARFORGED COMPANION
 * tests/unit/customOracleParse.test.js
 *
 * Issue #322 V28 (the audit's customOracleParse probe): parseEntries kept a
 * line only if it matched an ASCII-hyphen range, and dropped anything else
 * without a word. validateCustomOracleEntries then checked the survivors tile
 * 1..(highest max), and the die was that highest max — so when the lost line
 * was the table's top row (an en-dash range pasted from the rulebook, "5–6
 * Hostile", or percentile "00" for 100, "96-00 Roll twice") the table saved as
 * a d4 or a d95 with a success card, and the lost row could never be rolled.
 * Other dashes and "00" read now, and a line that still does not read refuses
 * the save, naming it.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  parseEntries, unparsedEntryLines, validateCustomOracleEntries, saveCustomOracle,
} from "../../src/oracles/customOracles.js";
import { ORACLE_TABLES, unregisterOracleTable } from "../../src/oracles/roller.js";

const MODULE_ID = "starforged-companion";

describe("custom-oracle entry parsing never silently loses the top of a table", () => {
  it('an en-dash range on the last line ("5–6 Hostile") is kept: a d6', () => {
    const entries = parseEntries("1-2 Calm\n3-4 Wary\n5–6 Hostile");
    expect(entries.at(-1)).toEqual({ min: 5, max: 6, result: "Hostile" });
    expect(validateCustomOracleEntries(entries)).toEqual({ ok: true, die: 6 });
  });

  it('a percentile "00" top row ("96-00 Roll twice") is 96–100: a d100', () => {
    const entries = parseEntries(["1-50 Calm", "51-95 Wary", "96-00 Roll twice"].join("\n"));
    expect(entries.at(-1)).toEqual({ min: 96, max: 100, result: "Roll twice" });
    expect(validateCustomOracleEntries(entries)).toEqual({ ok: true, die: 100 });
  });

  it.each(["—", "‒", "−", "‐"])("a range written with %s reads as one", (dash) => {
    expect(parseEntries(`1${dash}3 Result`)).toEqual([{ min: 1, max: 3, result: "Result" }]);
  });

  it("a line that still does not read is named; comments and blank lines are not", () => {
    const raw = "# my table\n1-2 Calm\n\nthree-four Wary\n5-6Hostile\n";
    expect(unparsedEntryLines(raw)).toEqual(["three-four Wary", "5-6Hostile"]);
    expect(unparsedEntryLines("1-3 A\n4-6 B")).toEqual([]);
  });
});

describe("saving a table with a line that did not read is refused, naming it", () => {
  beforeEach(() => {
    ChatMessage._reset();
    game.settings._store.set(`${MODULE_ID}.campaignState`, {});
    if (ORACLE_TABLES.mood_v28) unregisterOracleTable("mood_v28");
  });

  it("refused: nothing registered or stored, and the card lists the line", async () => {
    const raw = "1-2 Calm\n3-4 Wary\nHostile: 5-6";
    const saved = await saveCustomOracle("mood_v28", "Mood", parseEntries(raw), { unparsed: unparsedEntryLines(raw) });
    expect(saved).toBe(false);
    expect(ORACLE_TABLES.mood_v28).toBeUndefined();
    expect(game.settings._store.get(`${MODULE_ID}.campaignState`).customOracles).toBeUndefined();
    const card = ChatMessage._created.at(-1).content;
    expect(card).toMatch(/Custom oracle not saved/);
    expect(card).toContain("<code>Hostile: 5-6</code>");
  });

  it("control: a table whose every line reads is saved with its whole die", async () => {
    const raw = "1-2 Calm\n3-4 Wary\n5–6 Hostile";
    expect(await saveCustomOracle("mood_v28", "Mood", parseEntries(raw), { unparsed: unparsedEntryLines(raw) })).toBe(true);
    expect(ChatMessage._created.at(-1).content).toMatch(/d6, 3 entries/);
    unregisterOracleTable("mood_v28");
  });
});

// CUSTOM-ORACLE-TO-RANGES: "3 to 4 Wary" read as the single row 3 with the
// result "to 4 Wary" — neither refused nor read as a range.
describe('a range written with "to"', () => {
  it('"3 to 4 Wary" is the range 3–4, "Wary"', () => {
    expect(parseEntries("3 to 4 Wary")).toEqual([{ min: 3, max: 4, result: "Wary" }]);
  });

  it('a table written with "to" tiles its die', () => {
    const entries = parseEntries("1 to 2 Calm\n3 TO 4 Wary\n5 to 6 Hostile");
    expect(entries).toEqual([
      { min: 1, max: 2, result: "Calm" },
      { min: 3, max: 4, result: "Wary" },
      { min: 5, max: 6, result: "Hostile" },
    ]);
    expect(validateCustomOracleEntries(entries)).toEqual({ ok: true, die: 6 });
  });

  it('control: "to" with no number after it stays part of the result', () => {
    expect(parseEntries("7 to the stars")).toEqual([{ min: 7, max: 7, result: "to the stars" }]);
  });
});

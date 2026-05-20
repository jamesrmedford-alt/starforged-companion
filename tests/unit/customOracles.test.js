/**
 * STARFORGED COMPANION
 * tests/unit/customOracles.test.js
 */

import { describe, it, expect } from "vitest";
import { parseEntries } from "../../src/oracles/customOracles.js";


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

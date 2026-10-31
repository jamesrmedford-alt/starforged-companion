/**
 * PROBE (oracles audit) — `!oracle-add` silently drops lines it cannot parse,
 * and a dropped LAST line shrinks the die instead of failing validation.
 *
 * parseEntries (src/oracles/customOracles.js) keeps a line only if it matches
 * /^(\d+)(?:\s*-\s*(\d+))?\s+(.+)$/ (ASCII hyphen) with max >= min; anything
 * else is skipped without a word. validateCustomOracleEntries then checks the
 * survivors tile 1..(highest max) and the die is that highest max
 * (dieSizeForTable). So when the line that was lost is the top of the table —
 * an en-dash range pasted from the rulebook ("5–6 Hostile"), or percentile
 * "00" for 100 ("96-00 Roll twice") — the table is saved as a d4 / d95 with a
 * success card, and the lost entry can never be rolled.
 */

import { describe, it, expect } from "vitest";
import { parseEntries, validateCustomOracleEntries } from "../../../src/oracles/customOracles.js";

describe("PROBE: custom-oracle entry parsing never silently loses the top of a table", () => {
  it('an en-dash range on the last line ("5–6 Hostile") is kept, or the table is refused', () => {
    const entries = parseEntries("1-2 Calm\n3-4 Wary\n5–6 Hostile");
    const check = validateCustomOracleEntries(entries);
    // Correct: either the en dash parses (a d6 with Hostile on 5–6) or saving is refused.
    const keptHostile = check.ok && check.die === 6 && entries.some(e => e.result === "Hostile");
    expect(keptHostile || !check.ok).toBe(true);   // FAILS today: ok, d4, "Hostile" gone
  });

  it('a percentile "00" top row ("96-00 Roll twice") is kept, or the table is refused', () => {
    const raw = ["1-50 Calm", "51-95 Wary", "96-00 Roll twice"].join("\n");
    const entries = parseEntries(raw);
    const check = validateCustomOracleEntries(entries);
    const keptTop = check.ok && check.die === 100;
    expect(keptTop || !check.ok).toBe(true);       // FAILS today: ok, d95
  });
});

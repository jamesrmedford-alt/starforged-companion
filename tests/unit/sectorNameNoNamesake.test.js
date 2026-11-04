/**
 * Issue #330 D14 — a new sector never takes a stored sector's name.
 *
 * Two sectors of one rolled name shared their Actor, NPC and Journal folders
 * (keyed by name) and `!sector <name>` only ever reached the older one;
 * `generateSectorName` never checked the stored names. Decided (option B): a
 * name already stored is rolled again at creation, and numbered when the
 * rolls keep landing on taken names.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/entities/finalize.js", () => ({
  finalizeEntityArtOnly: vi.fn(),
}));

import { generateSectorName, generateSector } from "../../src/sectors/sectorGenerator.js";
import { SECTOR_NAME_PREFIX, SECTOR_NAME_SUFFIX } from "../../src/oracles/tables/space.js";

const MODULE_ID = "starforged-companion";
const first = `${SECTOR_NAME_PREFIX[0].result} ${SECTOR_NAME_SUFFIX[0].result}`;
const last  = `${SECTOR_NAME_PREFIX.at(-1).result} ${SECTOR_NAME_SUFFIX.at(-1).result}`;

/** Math.random answers: each value is one d100 (0 → 1, 0.995 → 100). */
function rollsOf(...values) {
  const queue = [...values];
  return vi.spyOn(Math, "random").mockImplementation(() => (queue.length ? queue.shift() : 0.5));
}

beforeEach(() => {
  game.settings._store.set(`${MODULE_ID}.campaignState`, { sectors: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

describe("issue #330 D14 — a sector name already stored is rolled again", () => {
  it("a rolled name a stored sector holds is rolled again", () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      sectors: [{ id: "sec-1", name: first }],
    });
    rollsOf(0, 0, 0.995, 0.995);   // the first pair is taken, the second free
    const name = generateSectorName();
    expect(name.full).toBe(last);
    expect(name.full).not.toBe(first);
  });

  it("the stored name is matched case-blind", () => {
    rollsOf(0, 0, 0.995, 0.995);
    const name = generateSectorName([first.toUpperCase()]);
    expect(name.full).toBe(last);
  });

  it("when every roll lands on a taken name, the last one is numbered", () => {
    rollsOf(...Array(200).fill(0));   // always the first pair
    const name = generateSectorName([first, `${first} II`]);
    expect(name.full).toBe(`${first} III`);
    expect(name.prefix).toBe(SECTOR_NAME_PREFIX[0].result);
  });

  it("generateSector checks the world's stored sectors — the Sector Creator's and the quickstart's path", () => {
    const sectors = [];
    for (const p of SECTOR_NAME_PREFIX) {
      for (const s of SECTOR_NAME_SUFFIX) sectors.push({ id: `sec-${sectors.length}`, name: `${p.result} ${s.result}` });
    }
    game.settings._store.set(`${MODULE_ID}.campaignState`, { sectors });
    const taken = new Set(sectors.map(s => s.name.toLowerCase()));

    const sector = generateSector("expanse");
    expect(taken.has(sector.name.toLowerCase())).toBe(false);
    expect(sector.name).toMatch(/ II$/);
  });

  it("control: with no stored sectors the first roll stands", () => {
    rollsOf(0, 0);
    expect(generateSectorName().full).toBe(first);
  });
});

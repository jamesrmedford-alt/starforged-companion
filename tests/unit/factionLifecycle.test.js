/**
 * STARFORGED COMPANION
 * tests/unit/factionLifecycle.test.js
 *
 * Faction-lifecycle fixes (2026-07 audit): the attitude→relationship
 * mapping (entity record canonical), name lookup, record sync, and the
 * merged faction landscape the narrator now receives.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  ATTITUDE_TO_RELATIONSHIP,
  findFactionByName,
  applyAttitudeToFactionRecord,
  mergeFactionLandscape,
} from "../../src/entities/faction.js";

const MODULE_ID = "starforged-companion";

// Minimal faction entity journal mock — the shape getFaction/updateFaction read.
function makeFactionEntry(id, record) {
  const page = {
    flags: { [MODULE_ID]: { faction: { ...record } } },
    setFlag: async (mod, key, val) => { page.flags[mod] = { ...(page.flags[mod] ?? {}), [key]: val }; },
  };
  return { id, name: record.name, pages: { contents: [page] }, update: async () => {} };
}

let _entries;
let _origGet;

beforeEach(() => {
  _entries = new Map();
  _origGet = global.game.journal?.get;
  global.game.journal = global.game.journal ?? {};
  global.game.journal.get = (id) => _entries.get(id) ?? null;
});

afterEach(() => {
  if (_origGet) global.game.journal.get = _origGet;
});

describe("ATTITUDE_TO_RELATIONSHIP", () => {
  it("maps the WJ vocabulary onto Starforged stances and omits unknown", () => {
    expect(ATTITUDE_TO_RELATIONSHIP.hostile).toBe("antagonistic");
    expect(ATTITUDE_TO_RELATIONSHIP.allied).toBe("open_alliance");
    expect(ATTITUDE_TO_RELATIONSHIP.neutral).toBe("apathetic");
    expect(ATTITUDE_TO_RELATIONSHIP.unknown).toBeUndefined();
  });
});

describe("findFactionByName", () => {
  it("matches case-insensitively across campaignState.factionIds", () => {
    _entries.set("f1", makeFactionEntry("f1", { name: "Iron Syndicate" }));
    const cs = { factionIds: ["f1"] };
    expect(findFactionByName("iron syndicate", cs)?.id).toBe("f1");
    expect(findFactionByName("Unknown Cartel", cs)).toBeNull();
    expect(findFactionByName("", cs)).toBeNull();
    expect(findFactionByName("Iron Syndicate", {})).toBeNull();
  });
});

describe("applyAttitudeToFactionRecord", () => {
  it("writes the mapped stance onto the record", async () => {
    _entries.set("f1", makeFactionEntry("f1", { name: "Iron Syndicate", relationship: "unknown" }));
    const cs = { factionIds: ["f1"] };
    const updated = await applyAttitudeToFactionRecord("Iron Syndicate", "hostile", cs);
    expect(updated?.relationship).toBe("antagonistic");
  });

  it("no-ops for unknown attitudes, unmapped values, and missing records", async () => {
    _entries.set("f1", makeFactionEntry("f1", { name: "Iron Syndicate", relationship: "warring" }));
    const cs = { factionIds: ["f1"] };
    expect(await applyAttitudeToFactionRecord("Iron Syndicate", "unknown", cs)).toBeNull();
    expect(await applyAttitudeToFactionRecord("Iron Syndicate", "confused", cs)).toBeNull();
    expect(await applyAttitudeToFactionRecord("No Such Faction", "hostile", cs)).toBeNull();
    // Established stance untouched by the no-ops.
    expect(_entries.get("f1").pages.contents[0].flags[MODULE_ID].faction.relationship).toBe("warring");
  });

  it("skips the write when the stance already matches", async () => {
    _entries.set("f1", makeFactionEntry("f1", { name: "Iron Syndicate", relationship: "antagonistic" }));
    const cs = { factionIds: ["f1"] };
    expect(await applyAttitudeToFactionRecord("Iron Syndicate", "hostile", cs)).toBeNull();
  });
});

describe("mergeFactionLandscape", () => {
  it("records win, WJ-only entries append, deduped by name, capped", () => {
    const records = [
      { name: "Iron Syndicate", relationship: "warring", type: "Guild", subtype: "Mercenaries", projects: ["Blockade the tether"] },
      { name: "The Lattice", relationship: "unknown", type: "Fringe Group" },
    ];
    const wj = [
      { factionName: "Iron Syndicate", attitude: "allied", knownGoal: "stale goal" },  // dup — record wins
      { factionName: "Circle of Iron", attitude: "hostile", knownGoal: "expand the reach" },
      { factionName: "Nameless", attitude: "unknown" },
    ];
    const out = mergeFactionLandscape(records, wj);
    expect(out.map(e => e.name)).toEqual(["Iron Syndicate", "The Lattice", "Circle of Iron", "Nameless"]);
    expect(out[0].stance).toBe("warring");
    expect(out[0].detail).toMatch(/Guild: Mercenaries/);
    expect(out[0].detail).toMatch(/project: Blockade the tether/);
    expect(out[1].stance).toBe("");                       // unknown hidden
    expect(out[2].stance).toBe("hostile");
    expect(out[2].detail).toBe("goal: expand the reach");
    expect(mergeFactionLandscape(records, wj, 2)).toHaveLength(2);
  });

  it("tolerates empty inputs", () => {
    expect(mergeFactionLandscape([], [])).toEqual([]);
    expect(mergeFactionLandscape(null, undefined)).toEqual([]);
  });
});

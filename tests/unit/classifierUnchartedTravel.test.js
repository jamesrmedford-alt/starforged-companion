/**
 * STARFORGED COMPANION
 * tests/unit/classifierUnchartedTravel.test.js
 *
 * Issue #348 PT05 — the pacing classifier offers a roll for travel to an
 * unknown place. PR #350 gave it the recent scene; what remained:
 *   - travel intent toward an uncharted or unknown destination is at least
 *     NARRATIVE_WITH_MOVE_AVAILABLE with undertake_an_expedition, hazard or
 *     not (the MOVEMENT WITH STAKES rule fired only on an established hazard
 *     or time pressure);
 *   - a time skip across a journey not yet made ("wake me when we get there")
 *     is travel, not downtime (it was read as downtime, dial 1, and narrated
 *     with no move offered);
 *   - to tell an uncharted destination from a charted one, the classifier is
 *     told the charted places — never the unexplored sites.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { buildClassifierContext } from "../../src/pacing/classifier.js";

const MODULE_ID = "starforged-companion";
const DIALS = { dials: { combat: 5, investigation: 5, exploration: 5, social: 5, downtime: 1 } };

function context(campaignState = {}, playerText = "Wake me when we get there.") {
  return buildClassifierContext({
    playerText, campaignState, character: { name: "Isaac" },
    recentMoveDensity: { count: 0, window: 5 }, pacingConfig: DIALS,
  });
}

describe("the classifier's travel rules (PT05)", () => {
  it("travel toward an uncharted destination is at least NWMA with undertake_an_expedition, hazard or not", () => {
    const { systemPrompt } = context();
    expect(systemPrompt).toContain("TRAVEL TO AN UNCHARTED DESTINATION");
    expect(systemPrompt).toMatch(/is an expedition by the rules, hazard or not/);
    expect(systemPrompt).toMatch(/at minimum\s+NARRATIVE_WITH_MOVE_AVAILABLE with suggestedMove undertake_an_expedition/);
    expect(systemPrompt).toMatch(/even when the player says "set a course"/);
  });

  it("a time skip across a journey not yet made is travel, not downtime", () => {
    const { systemPrompt } = context();
    expect(systemPrompt).toContain("A TIME SKIP IS NOT DOWNTIME");
    expect(systemPrompt).toMatch(/"wake me when we get there"[\s\S]*is travel \(category exploration\), never downtime/);
    expect(systemPrompt).toMatch(/downtime:[\s\S]*Never a journey\s+still to be made/);
  });

  it("Set a Course is a known route to a charted place", () => {
    const { systemPrompt } = context();
    expect(systemPrompt).toContain("- set_a_course: follow a known route to a charted place");
  });
});

describe("the charted places the classifier is told of (PT05)", () => {
  beforeEach(() => {
    global.game.actors._reset();
    const add = (id, type, record) => {
      const actor = global.makeTestActor({ id, type: "location", name: record.name,
        flags: { [MODULE_ID]: { entityType: type, [type]: record } } });
      global.game.actors._set(id, actor);
    };
    add("a-bleak", "settlement", { name: "Bleakhold", sectorId: "sec-1" });
    add("a-far",   "settlement", { name: "Far Port",  sectorId: "sec-0" });
    add("a-vault", "location",   { name: "The Hollow Vault", status: "unexplored", sectorId: "sec-1" });
    add("a-wreck", "location",   { name: "Kovash Hulk", status: "visited", sectorId: "sec-1" });
  });

  it("lists the tracked places, the active sector's first, and never an unexplored site", () => {
    const { userMessage } = context({
      activeSectorId: "sec-1",
      settlementIds: ["a-far", "a-bleak"], locationIds: ["a-vault", "a-wreck"],
    });
    const line = userMessage.split("\n").find(l => l.startsWith("Charted places:"));
    expect(line).toBe("Charted places: Bleakhold, Kovash Hulk, Far Port");
    expect(userMessage).not.toContain("Hollow Vault");
  });

  it("says so when none is recorded", () => {
    expect(context({}).userMessage).toContain("Charted places: (none recorded)");
  });
});

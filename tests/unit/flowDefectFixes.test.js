/**
 * STARFORGED COMPANION
 * tests/unit/flowDefectFixes.test.js
 *
 * Regressions for the 2026-07 flow-audit fixes that live in index.js:
 *   - addLegacyTicks awards XP for newly filled legacy boxes (LEGACY-XP-DEAD:
 *     ticks used to accrue with no XP ever awarded — the awarding path
 *     required a consequence field no resolver set).
 *   - resolveVowItemCopies resolves payoffs vowId-first with the name ladder
 *     (VOW-RENAME-PAYOFF: exact-name-only matching meant a renamed vow rolled
 *     hits that completed nothing and paid nothing).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { addLegacyTicks, resolveVowItemCopies } from "../../src/index.js";

const MODULE_ID = "starforged-companion";

beforeEach(() => {
  game.actors._reset();
  globalThis.ChatMessage = { create: vi.fn(async (d) => d) };
});

describe("addLegacyTicks — legacy boxes award XP (LEGACY-XP-DEAD)", () => {
  it("awards 2 XP per newly filled box to every PC and posts the earned-XP note", async () => {
    const a1 = makeTestActor({ id: "xp1", type: "character", system: { xp: 0 } });
    const a2 = makeTestActor({ id: "xp2", type: "character", system: { xp: 3 } });
    game.actors._setAll([a1, a2]);

    const cs = {};
    const { boxes, xp } = addLegacyTicks(cs, "bonds", 8); // 0 → 8 ticks = 2 boxes

    expect(boxes).toBe(2);
    expect(xp).toBe(4);
    expect(cs.legacyTracks.bonds).toEqual({ ticks: 8, cleared: false, cycles: 0 });
    // The award is fire-and-forget and sequential — wait for both to land.
    await vi.waitFor(() => {
      expect(a1.system.xp).toBe(4);
      expect(a2.system.xp).toBe(7);
    });
    expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      flags: expect.objectContaining({
        [MODULE_ID]: expect.objectContaining({ legacyXpCard: true, track: "bonds", boxes: 2, xp: 4 }),
      }),
    }));
  });

  // Issue #309 N01: a legacy box's XP crossed or started above 30 — the old
  // 30-point cap wrote 30, erasing earned XP.
  it("awards a box's XP past 30, and never lowers XP already above it", async () => {
    const a1 = makeTestActor({ id: "xp30a", type: "character", system: { xp: 29 } });
    const a2 = makeTestActor({ id: "xp30b", type: "character", system: { xp: 42 } });
    game.actors._setAll([a1, a2]);
    expect(addLegacyTicks({}, "quests", 4)).toMatchObject({ boxes: 1, xp: 2 });
    await vi.waitFor(() => {
      expect(a1.system.xp).toBe(31);
      expect(a2.system.xp).toBe(44);
    });
  });

  it("awards nothing when no box fills", async () => {
    game.actors._setAll([makeTestActor({ id: "xp3", type: "character", system: { xp: 0 } })]);
    const cs = { legacyTracks: { quests: { ticks: 2, cleared: false } } };
    expect(addLegacyTicks(cs, "quests", 1).boxes).toBe(0); // 3 ticks — still box 0
    await new Promise((r) => setTimeout(r, 0));
    expect(game.actors.get("xp3").system.xp).toBe(0);
    expect(ChatMessage.create).not.toHaveBeenCalled();
  });

  it("pays 1 XP per box once the track has been cleared (rule 1.12)", async () => {
    const a = makeTestActor({ id: "xp4", type: "character", system: { xp: 0 } });
    game.actors._setAll([a]);
    const cs = { legacyTracks: { quests: { ticks: 0, cleared: true } } };
    expect(addLegacyTicks(cs, "quests", 4)).toEqual({ boxes: 1, xp: 1, cleared: false });
    await vi.waitFor(() => expect(a.system.xp).toBe(1));
  });

  // Issue #316 T02: the track used to cap at 40 ticks, so the tenth box never
  // cleared it and every later mark was lost.
  it("the tenth box clears the track: the overflow carries on from the first box at 1 XP a box", async () => {
    const a = makeTestActor({ id: "xp5", type: "character", system: { xp: 0 } });
    game.actors._setAll([a]);
    const cs = { legacyTracks: { discoveries: { ticks: 39, cleared: false } } };
    // 39 + 10: the tenth box (2 XP), the track clears, 9 ticks over — two more boxes at 1 XP each.
    expect(addLegacyTicks(cs, "discoveries", 10)).toEqual({ boxes: 3, xp: 4, cleared: true });
    expect(cs.legacyTracks.discoveries).toEqual({ ticks: 9, cleared: true, cycles: 1 });
    // The award is fire-and-forget: the note follows the XP write.
    await vi.waitFor(() => expect(ChatMessage.create).toHaveBeenCalled());
    expect(a.system.xp).toBe(4);
    expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringMatching(/filled and cleared/),
      flags: expect.objectContaining({
        [MODULE_ID]: expect.objectContaining({ legacyXpCard: true, track: "discoveries", boxes: 3, xp: 4, cleared: true }),
      }),
    }));
  });
});

describe("resolveVowItemCopies — vowId-first payoff resolution (VOW-RENAME-PAYOFF)", () => {
  const vowItem = (over = {}) => ({
    id: over.id ?? "v1", type: "progress",
    name: over.name ?? "Rescue the settlers",
    system: { subtype: "vow", rank: "formidable", completed: false, ...(over.system ?? {}) },
    flags: over.flags ?? { [MODULE_ID]: { vowId: "vid-1", sharedVow: true } },
  });

  it("collects every shared copy by vowId even when a sibling was renamed on its sheet", () => {
    const c1 = vowItem({ id: "a" });
    const c2 = vowItem({ id: "b", name: "Save them all (renamed)" });
    game.actors._setAll([
      makeTestActor({ id: "pc-r1", items: { contents: [c1] } }),
      makeTestActor({ id: "pc-r2", items: { contents: [c2] } }),
    ]);
    const { primary, copies } = resolveVowItemCopies("Rescue the settlers");
    expect(primary.item.id).toBe("a");
    expect(copies.map(c => c.item.id).sort()).toEqual(["a", "b"]);
  });

  it("substring-resolves a stale snapshot name (victory-card / combat-track linkedVowName)", () => {
    game.actors._setAll([makeTestActor({ id: "pc-r3", items: { contents: [vowItem({})] } })]);
    expect(resolveVowItemCopies("rescue the").primary?.item.id).toBe("v1");
  });

  it("falls back to the sole open vow — even for a fully renamed target (the house ladder)", () => {
    game.actors._setAll([makeTestActor({ id: "pc-r4", items: { contents: [vowItem({})] } })]);
    expect(resolveVowItemCopies(null).primary?.item.id).toBe("v1");
    expect(resolveVowItemCopies("Completely different name").primary?.item.id).toBe("v1");
  });

  it("returns null when several open vows are ambiguous, and skips completed vows", () => {
    const done = vowItem({ id: "d", system: { subtype: "vow", completed: true } });
    const v2   = vowItem({ id: "e", name: "Find the cure", flags: { [MODULE_ID]: { vowId: "vid-2" } } });
    game.actors._setAll([makeTestActor({ id: "pc-r5", items: { contents: [vowItem({}), v2, done] } })]);
    expect(resolveVowItemCopies("zzz").primary).toBeNull();
    // A completed copy still collects by vowId (so payoff bookkeeping sees it),
    // but never resolves as the primary.
    expect(resolveVowItemCopies("Find the cure").primary?.item.id).toBe("e");
  });
});

describe("waypointOracleFor — Explore a Waypoint match follow-up buttons", () => {
  it("offers Make a Discovery on a strong hit with a match", async () => {
    const { waypointOracleFor } = await import("../../src/index.js");
    expect(waypointOracleFor({ moveId: "explore_a_waypoint", outcome: "strong_hit", isMatch: true }))
      .toBe("make_a_discovery");
  });

  it("offers Confront Chaos on a miss with a match", async () => {
    const { waypointOracleFor } = await import("../../src/index.js");
    expect(waypointOracleFor({ moveId: "explore_a_waypoint", outcome: "miss", isMatch: true }))
      .toBe("confront_chaos");
  });

  it("offers nothing without a match, on weak hits, or for other moves", async () => {
    const { waypointOracleFor } = await import("../../src/index.js");
    expect(waypointOracleFor({ moveId: "explore_a_waypoint", outcome: "strong_hit", isMatch: false })).toBeNull();
    expect(waypointOracleFor({ moveId: "explore_a_waypoint", outcome: "weak_hit", isMatch: true })).toBeNull();
    expect(waypointOracleFor({ moveId: "face_danger", outcome: "strong_hit", isMatch: true })).toBeNull();
  });
});

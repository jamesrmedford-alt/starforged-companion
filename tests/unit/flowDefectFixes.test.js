/**
 * STARFORGED COMPANION
 * tests/unit/flowDefectFixes.test.js
 *
 * Regressions for the 2026-07 flow-audit fixes that live in index.js:
 *   - addLegacyTicks earns XP for newly filled legacy boxes (LEGACY-XP-DEAD:
 *     ticks used to accrue with no XP ever awarded — the awarding path
 *     required a consequence field no resolver set). The mark is owed by the
 *     copy the ticks were marked on and paid once its save has landed
 *     (awardSavedLegacyXp — issue #326 W52), which these tests stand in for;
 *     since issue #326 D3 it is paid by writing the shared track to each PC's
 *     sheet, where the XP shows.
 *   - resolveVowItemCopies resolves payoffs vowId-first with the name ladder
 *     (VOW-RENAME-PAYOFF: exact-name-only matching meant a renamed vow rolled
 *     hits that completed nothing and paid nothing).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { addLegacyTicks, awardSavedLegacyXp, resolveVowItemCopies } from "../../src/index.js";

const MODULE_ID = "starforged-companion";

beforeEach(() => {
  game.actors._reset();
  globalThis.ChatMessage = { create: vi.fn(async (d) => d) };
});

// Issue #326 D3: the shared track is written through to each PC's sheet
// (`system.legacies.<track>`, ticks ever marked), where the Starforged sheet
// shows the boxes and the XP they earn; `system.xp` is no longer written.
// The mirror reads the track as stored, so each test saves its copy first —
// what the copy's writer does before awardSavedLegacyXp.
const saveCopy = (cs) => game.settings._store.set(`${MODULE_ID}.campaignState`, cs);

describe("addLegacyTicks — legacy boxes earn XP on the sheet (LEGACY-XP-DEAD, issue #326 D3)", () => {
  it("a saved mark reaches every PC's sheet, whose two filled boxes earn 4 XP, and posts the earned-XP note", async () => {
    const a1 = makeTestActor({ id: "xp1", type: "character" });
    const a2 = makeTestActor({ id: "xp2", type: "character", system: { legacies: { bondsXpSpent: 2 } } });
    game.actors._setAll([a1, a2]);

    const cs = {};
    const { boxes, xp } = addLegacyTicks(cs, "bonds", 8); // 0 → 8 ticks = 2 boxes

    expect(boxes).toBe(2);
    expect(xp).toBe(4);
    expect(cs.legacyTracks.bonds).toEqual({ ticks: 8, cleared: false, cycles: 0 });
    expect(a1.system.legacies.bonds).toBe(0);    // owed, not paid: the ticks are not saved yet
    saveCopy(cs);
    await awardSavedLegacyXp(cs);                 // the copy's save has landed
    await vi.waitFor(() => {
      expect(a1.system.legacies.bonds).toBe(8);
      expect(a2.system.legacies.bonds).toBe(8);
    });
    expect(a2.system.legacies.bondsXpSpent).toBe(2);   // each PC's XP spent stays their own
    expect(ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringMatching(/Legacies tab/),
      flags: expect.objectContaining({
        [MODULE_ID]: expect.objectContaining({ legacyXpCard: true, track: "bonds", boxes: 2, xp: 4 }),
      }),
    }));
  });

  it("no longer writes system.xp, the classic sheet's field", async () => {
    const a1 = makeTestActor({ id: "xp30a", type: "character", system: { xp: 29 } });
    game.actors._setAll([a1]);
    const cs = {};
    expect(addLegacyTicks(cs, "quests", 4)).toMatchObject({ boxes: 1, xp: 2 });
    saveCopy(cs);
    await awardSavedLegacyXp(cs);
    await vi.waitFor(() => expect(a1.system.legacies.quests).toBe(4));
    expect(a1.system.xp).toBe(29);
  });

  it("a mark that fills no box still reaches the sheets, with no earned-XP note", async () => {
    game.actors._setAll([makeTestActor({ id: "xp3", type: "character" })]);
    const cs = { legacyTracks: { quests: { ticks: 2, cleared: false } } };
    expect(addLegacyTicks(cs, "quests", 1).boxes).toBe(0); // 3 ticks — still box 0
    saveCopy(cs);
    await awardSavedLegacyXp(cs);
    await vi.waitFor(() => expect(game.actors.get("xp3").system.legacies.quests).toBe(3));
    expect(ChatMessage.create).not.toHaveBeenCalled();
  });

  it("a cleared track reaches the sheet as ticks ever marked, where a box earns 1 XP (rule 1.12)", async () => {
    const a = makeTestActor({ id: "xp4", type: "character" });
    game.actors._setAll([a]);
    const cs = { legacyTracks: { quests: { ticks: 0, cleared: true } } };
    expect(addLegacyTicks(cs, "quests", 4)).toEqual({ boxes: 1, xp: 1, cleared: false });
    saveCopy(cs);
    await awardSavedLegacyXp(cs);
    await vi.waitFor(() => expect(a.system.legacies.quests).toBe(44));   // one cycle (40) + 4
  });

  // Issue #316 T02: the track used to cap at 40 ticks, so the tenth box never
  // cleared it and every later mark was lost.
  it("the tenth box clears the track: the overflow carries on from the first box at 1 XP a box", async () => {
    const a = makeTestActor({ id: "xp5", type: "character" });
    game.actors._setAll([a]);
    const cs = { legacyTracks: { discoveries: { ticks: 39, cleared: false } } };
    // 39 + 10: the tenth box (2 XP), the track clears, 9 ticks over — two more boxes at 1 XP each.
    expect(addLegacyTicks(cs, "discoveries", 10)).toEqual({ boxes: 3, xp: 4, cleared: true });
    expect(cs.legacyTracks.discoveries).toEqual({ ticks: 9, cleared: true, cycles: 1 });
    // Paid once the copy is saved: the note follows the sheet write.
    saveCopy(cs);
    await awardSavedLegacyXp(cs);
    await vi.waitFor(() => expect(ChatMessage.create).toHaveBeenCalled());
    expect(a.system.legacies.discoveries).toBe(49);
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

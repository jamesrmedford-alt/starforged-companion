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
    const newBoxes = addLegacyTicks(cs, "bonds", 8); // 0 → 8 ticks = 2 boxes

    expect(newBoxes).toBe(2);
    expect(cs.legacyTracks.bonds.ticks).toBe(8);
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

  it("awards nothing when no box fills", async () => {
    game.actors._setAll([makeTestActor({ id: "xp3", type: "character", system: { xp: 0 } })]);
    const cs = { legacyTracks: { quests: { ticks: 2, cleared: false } } };
    expect(addLegacyTicks(cs, "quests", 1)).toBe(0); // 3 ticks — still box 0
    await new Promise((r) => setTimeout(r, 0));
    expect(game.actors.get("xp3").system.xp).toBe(0);
    expect(ChatMessage.create).not.toHaveBeenCalled();
  });

  it("pays 1 XP per box once the track has been cleared (rule 1.12)", async () => {
    const a = makeTestActor({ id: "xp4", type: "character", system: { xp: 0 } });
    game.actors._setAll([a]);
    const cs = { legacyTracks: { quests: { ticks: 0, cleared: true } } };
    expect(addLegacyTicks(cs, "quests", 4)).toBe(1);
    await vi.waitFor(() => expect(a.system.xp).toBe(1));
  });

  it("caps the track at 40 ticks and counts only the boxes actually gained", () => {
    game.actors._setAll([makeTestActor({ id: "xp5", type: "character" })]);
    const cs = { legacyTracks: { discoveries: { ticks: 39, cleared: false } } };
    expect(addLegacyTicks(cs, "discoveries", 10)).toBe(1); // 39 → 40: box 9 → 10
    expect(cs.legacyTracks.discoveries.ticks).toBe(40);
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

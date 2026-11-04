/**
 * Issue #330 D6 — Overcome Destruction and Continue a Legacy score the
 * crew's shared legacy tracks.
 *
 * Overcome Destruction is a progress move the module rolls, but
 * PROGRESS_TICK_SOURCES had no source for it ("roll against the player's own
 * legacy tracks, which the module doesn't store — a deliberate no-op"), so
 * its score was 0 and every roll a miss. The reason no longer held: the
 * shared legacy tracks are stored (`campaignState.legacyTracks`) and since
 * issue #326 D3 mirrored to every PC's sheet. Continue a Legacy had the same
 * gap. Decided (option A): score from the bonds track — `ticks`, 40 (10
 * progress) once the track has been cleared — and Continue a Legacy from the
 * track it names.
 */

import { describe, it, expect, vi } from "vitest";
import { enrichProgressTicks } from "../../src/moves/statEnrichment.js";
import { resolveMove } from "../../src/moves/resolver.js";

const tracks = (over = {}) => ({
  quests:      { ticks: 0, cleared: false, cycles: 0 },
  bonds:       { ticks: 0, cleared: false, cycles: 0 },
  discoveries: { ticks: 0, cleared: false, cycles: 0 },
  ...over,
});
const deps = (legacy) => ({
  readLegacyTracks: async () => legacy,
  listTracks: async () => [], readAllVows: async () => [], listConnections: async () => [],
});
const interp = (moveId, moveTarget = null) => ({
  moveId, moveName: moveId, isProgressMove: true, moveTarget, statValue: 0, progressTicks: 0,
});

describe("issue #330 D6 — Overcome Destruction scores the bonds legacy track", () => {
  it("with 24 bonds ticks (6 boxes) statValue carries 24 ticks", async () => {
    const i = interp("overcome_destruction");
    const r = await enrichProgressTicks(i, deps(tracks({ bonds: { ticks: 24, cleared: false, cycles: 0 } })));
    expect(r).toMatchObject({ ticks: 24, source: "legacy", label: "Bonds legacy" });
    expect(i.statValue).toBe(24);
  });

  it("a bonds track already cleared is rolled as if at 10 progress", async () => {
    const i = interp("overcome_destruction");
    await enrichProgressTicks(i, deps(tracks({ bonds: { ticks: 8, cleared: true, cycles: 1 } })));
    expect(i.statValue).toBe(40);
  });

  it("an empty bonds track is a real 0, not a missing source", async () => {
    const i = interp("overcome_destruction");
    const r = await enrichProgressTicks(i, deps({}));
    expect(r).toMatchObject({ ticks: 0, source: "legacy" });
  });

  it("the score reaches the roll: 6 boxes beat challenge dice of 3 and 5", async () => {
    const i = interp("overcome_destruction");
    await enrichProgressTicks(i, deps(tracks({ bonds: { ticks: 24, cleared: false, cycles: 0 } })));
    const dice = [0.25, 0.45];                       // d10s of 3 and 5
    const rng = vi.spyOn(Math, "random").mockImplementation(() => dice.shift() ?? 0.5);
    try {
      const res = resolveMove(i, {});
      expect(res.progressScore).toBe(6);
      expect(res.outcome).toBe("strong_hit");
    } finally { rng.mockRestore(); }
  });
});

describe("issue #330 D6 — Continue a Legacy scores the legacy track it names", () => {
  const legacy = tracks({
    quests:      { ticks: 12, cleared: false, cycles: 0 },
    bonds:       { ticks: 30, cleared: false, cycles: 0 },
    discoveries: { ticks: 4,  cleared: true,  cycles: 1 },
  });

  it.each([
    ["quests", 12], ["the bonds legacy", 30], ["Discoveries", 40], ["my connections", 30], ["quest legacy", 12],
  ])("%s → %i ticks", async (target, ticks) => {
    const i = interp("continue_a_legacy", target);
    await enrichProgressTicks(i, deps(legacy));
    expect(i.statValue).toBe(ticks);
  });
});

describe("control", () => {
  it("Fulfill Your Vow still scores from the vow Item", async () => {
    const i = { moveId: "fulfill_your_vow", moveName: "Fulfill Your Vow", isProgressMove: true, moveTarget: "Find the beacon", statValue: 0 };
    await enrichProgressTicks(i, {
      ...deps(tracks()),
      readAllVows: async () => [{ id: "v1", name: "Find the beacon", rank: 2, ticks: 24, completed: false, actorId: "pc-1" }],
      rollerActorId: "pc-1",
    });
    expect(i.statValue).toBe(24);
  });
});

/**
 * PROBE (moves audit) — FULFIL-UNNAMED-SCORES-ZERO.
 *
 * Fulfill Your Vow is scored by enrichProgressTicks: every PC's vow Items
 * (index.js readAllVows, speaker first) through selectMilestoneVow, whose
 * fallback for an unnamed vow is "the sole open vow". A shared vow is one
 * Item copy per PC, so with two PCs and nothing but their shared vow the
 * unnamed fulfil is "ambiguous": no vow resolves, the score is 0 and the
 * roll is a certain miss ("Vow undone by complication… Forsake or recommit").
 * The move card's "🏁 Attempt to Fulfill Vow" button always posts the move
 * with no target (index.js wireAttemptFulfillVowButton) — unlike "⚑ Mark
 * Progress on Vow", which reads the roller's own vows and posts a picker when
 * several are open.
 */

import { describe, it, expect } from "vitest";
import { enrichProgressTicks } from "../../../src/moves/statEnrichment.js";

const shared = (actorId, id) => ({
  id, name: "Rescue Dani", rank: "formidable", ticks: 32, completed: false, actorId,
});

describe("FULFIL-UNNAMED-SCORES-ZERO", () => {
  it("control: one PC, one open vow — the unnamed fulfil scores it", async () => {
    const interp = { moveId: "fulfill_your_vow", isProgressMove: true, moveTarget: null, statValue: 0 };
    const info = await enrichProgressTicks(interp, {
      readAllVows: async () => [shared("pc1", "v1")], listTracks: async () => [],
    });
    expect(info.ticks).toBe(32);
  });

  it("two PCs whose only vow is their shared vow — the unnamed fulfil scores that vow, not 0", async () => {
    const interp = { moveId: "fulfill_your_vow", isProgressMove: true, moveTarget: null, statValue: 0 };
    const info = await enrichProgressTicks(interp, {
      readAllVows: async () => [shared("pc1", "v1"), shared("pc2", "v2")], listTracks: async () => [],
    });
    expect(info.ticks).toBe(32);          // today: 0 — a certain miss
    expect(interp.statValue).toBe(32);
  });

  it("two PCs, each with their own single vow — the clicker's (speaker-first) vow is scored, not 0", async () => {
    const interp = { moveId: "fulfill_your_vow", isProgressMove: true, moveTarget: null, statValue: 0 };
    const info = await enrichProgressTicks(interp, {
      // readAllVows lists the speaker's (pc1's) vows first
      readAllVows: async () => [
        { id: "v1", name: "Find my sister",    rank: "dangerous", ticks: 24, completed: false, actorId: "pc1" },
        { id: "v9", name: "Repay the Syndicate", rank: "extreme", ticks: 4,  completed: false, actorId: "pc2" },
      ],
      listTracks: async () => [],
    });
    expect(info.ticks).toBe(24);          // today: 0 — a certain miss
  });
});

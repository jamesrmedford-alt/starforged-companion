/**
 * PROBE — RULES-03 OVERCOME-DESTRUCTION-SCORES-ZERO
 * (src/moves/statEnrichment.js PROGRESS_TICK_SOURCES:477-483 + enrichProgressTicks:516-522;
 *  scored by src/moves/resolver.js resolveMove:1251-1259 from `statValue`)
 *
 * What the user does: the command vehicle is destroyed; a player rolls
 * Overcome Destruction (a progress move the module lists: schemas.js
 * `overcome_destruction: progressMove: true`).
 *
 * What happens: enrichProgressTicks has no tick source for the move ("roll
 * against the player's own legacy tracks, which the module doesn't store —
 * those stay a deliberate no-op"), so the score is 0 and the roll is a miss
 * against any challenge dice — every time: "as with the weak hit result, but
 * this quest is against your nature, forces you to Forsake Your Vow on
 * another quest, or is in the service of an enemy". The stated reason is no
 * longer true: the module stores the crew's shared legacy tracks
 * (`campaignState.legacyTracks.bonds`, decisions.md "Legacy XP pays at the
 * tick write") and since issue #326 D3 mirrors them to every PC's
 * `system.legacies.bonds`.
 *
 * What should happen (vendored Overcome Destruction): "roll the challenge
 * dice and compare to the progress on your bonds legacy track" — the score is
 * the bonds track's filled boxes; once the track has been cleared, "If you
 * make a progress roll against this track, resolve the outcome as if at 10
 * progress" (Earn Experience). Continue a Legacy (one roll per track) has the
 * same gap.
 *
 * The deps shape is the fix's to choose: the probe offers the legacy tracks
 * both as `deps.campaignState.legacyTracks` and as `deps.readLegacyTracks()`.
 *
 * Control: Fulfill Your Vow still scores from the vow Item.
 */

import { describe, it, expect } from "vitest";
import { enrichProgressTicks } from "../../../src/moves/statEnrichment.js";

const legacyTracks = (bonds) => ({ quests: { ticks: 0, cleared: false, cycles: 0 }, bonds, discoveries: { ticks: 0, cleared: false, cycles: 0 } });
const deps = (bonds) => ({
  campaignState:    { legacyTracks: legacyTracks(bonds) },
  readLegacyTracks: async () => legacyTracks(bonds),
  listTracks: async () => [], readAllVows: async () => [], listConnections: async () => [],
});
const interp = () => ({ moveId: "overcome_destruction", moveName: "Overcome Destruction", isProgressMove: true, moveTarget: null, statValue: 0, progressTicks: 0 });

describe("RULES-03 Overcome Destruction scores the bonds legacy track", () => {
  it("control: Fulfill Your Vow scores from the vow Item", async () => {
    const i = { moveId: "fulfill_your_vow", moveName: "Fulfill Your Vow", isProgressMove: true, moveTarget: "Find the beacon", statValue: 0 };
    await enrichProgressTicks(i, { ...deps({ ticks: 0 }), readAllVows: async () => [{ id: "v1", name: "Find the beacon", rank: 2, ticks: 24, completed: false, actorId: "pc-1" }], rollerActorId: "pc-1" });
    expect(i.statValue).toBe(24);
  });

  it("with 24 bonds ticks (6 boxes) the score is 6 — statValue carries 24 ticks", async () => {
    const i = interp();
    const r = await enrichProgressTicks(i, deps({ ticks: 24, cleared: false, cycles: 0 }));
    expect.soft(r?.ticks, "enrichProgressTicks resolves a source for the move").toBe(24);   // actual: null (no source)
    expect.soft(i.statValue).toBe(24);                                                        // actual: 0
  });

  it("a cleared bonds track resolves as if at 10 progress (40 ticks)", async () => {
    const i = interp();
    await enrichProgressTicks(i, deps({ ticks: 8, cleared: true, cycles: 1 }));
    expect(i.statValue).toBe(40);                                                             // actual: 0
  });
});

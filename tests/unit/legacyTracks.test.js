/**
 * STARFORGED COMPANION
 * tests/unit/legacyTracks.test.js
 *
 * The legacy tracks' arithmetic (src/moves/legacyTracks.js — issue #316 T02):
 * filling the tenth box clears the track, which starts again with the
 * overflow; a box earns 2 XP, or 1 once the track has been cleared, at the
 * rate of the cycle it filled in; two copies of a track merge by progress,
 * so a clear is never undone by a higher pre-clear tick count.
 */

import { describe, it, expect } from "vitest";
import {
  markLegacyTrack,
  mergeLegacyTrack,
  legacyProgress,
  normaliseLegacyTrack,
  LEGACY_CYCLE_TICKS,
} from "../../src/moves/legacyTracks.js";

describe("markLegacyTrack", () => {
  it("fills boxes at 2 XP each before the first clear", () => {
    expect(markLegacyTrack(undefined, 8)).toEqual({
      track: { ticks: 8, cleared: false, cycles: 0 }, boxes: 2, xp: 4, cleared: false,
    });
    expect(markLegacyTrack({ ticks: 2, cleared: false }, 1).boxes).toBe(0);
  });

  it("exact completion: 38 + 2 fills the tenth box for 2 XP and clears the track to 0", () => {
    expect(markLegacyTrack({ ticks: 38, cleared: false }, 2)).toEqual({
      track: { ticks: 0, cleared: true, cycles: 1 }, boxes: 1, xp: 2, cleared: true,
    });
  });

  it("after the clear, the marks carry on from the first box at 1 XP a box", () => {
    const first  = markLegacyTrack({ ticks: 0, cleared: true, cycles: 1 }, 2);
    expect(first).toEqual({ track: { ticks: 2, cleared: true, cycles: 1 }, boxes: 0, xp: 0, cleared: false });
    const second = markLegacyTrack(first.track, 2);
    expect(second).toEqual({ track: { ticks: 4, cleared: true, cycles: 1 }, boxes: 1, xp: 1, cleared: false });
  });

  it("an overflow across the tenth box pays the boxes before the clear at 2 and after it at 1", () => {
    // 38 + 12 (an epic reward): the tenth box (2 XP), clear, 10 over → two boxes (1 XP each).
    expect(markLegacyTrack({ ticks: 38, cleared: false }, 12)).toEqual({
      track: { ticks: 10, cleared: true, cycles: 1 }, boxes: 3, xp: 4, cleared: true,
    });
  });

  it("a second clear counts its cycle; every box of a cleared track is 1 XP", () => {
    expect(markLegacyTrack({ ticks: 36, cleared: true, cycles: 1 }, 8)).toEqual({
      track: { ticks: 4, cleared: true, cycles: 2 }, boxes: 2, xp: 2, cleared: true,
    });
  });

  it("a mark that fills several whole cycles resolves each", () => {
    expect(markLegacyTrack(undefined, 84)).toEqual({
      track: { ticks: 4, cleared: true, cycles: 2 }, boxes: 21, xp: 20 + 10 + 1, cleared: true,
    });
  });

  it("a track the old cap froze at 40 clears on its next mark, its tenth box already paid", () => {
    expect(markLegacyTrack({ ticks: 40, cleared: false }, 2)).toEqual({
      track: { ticks: 2, cleared: true, cycles: 1 }, boxes: 0, xp: 0, cleared: true,
    });
  });

  it("a record marked `cleared` before cycles were counted is one cycle in", () => {
    expect(normaliseLegacyTrack({ ticks: 6, cleared: true })).toEqual({ ticks: 6, cleared: true, cycles: 1 });
    expect(markLegacyTrack({ ticks: 6, cleared: true }, 2).xp).toBe(1);
  });

  it("adds nothing for a non-positive or non-numeric amount, and does not mutate its input", () => {
    const input = { ticks: 7, cleared: false };
    expect(markLegacyTrack(input, 0).track).toEqual({ ticks: 7, cleared: false, cycles: 0 });
    expect(markLegacyTrack(input, -3).track.ticks).toBe(7);
    expect(markLegacyTrack(input, "two").track.ticks).toBe(7);
    expect(input).toEqual({ ticks: 7, cleared: false });
  });
});

describe("legacyProgress and mergeLegacyTrack", () => {
  it("progress counts the cleared cycles with the current ticks", () => {
    expect(legacyProgress(undefined)).toBe(0);
    expect(legacyProgress({ ticks: 38, cleared: false })).toBe(38);
    expect(legacyProgress({ ticks: 2, cleared: true, cycles: 1 })).toBe(LEGACY_CYCLE_TICKS + 2);
    expect(legacyProgress({ ticks: 0, cleared: true })).toBe(LEGACY_CYCLE_TICKS);
  });

  it("the cleared record wins over a higher pre-clear tick count", () => {
    const store   = { ticks: 38, cleared: false };
    const working = { ticks: 2, cleared: true, cycles: 1 };
    expect(mergeLegacyTrack(store, working)).toEqual(working);
    expect(mergeLegacyTrack(working, store)).toEqual(working);
  });

  it("within one cycle the higher tick count wins; a frozen 40 and its clear to 0 are the clear", () => {
    expect(mergeLegacyTrack({ ticks: 3, cleared: false }, { ticks: 5, cleared: false }))
      .toEqual({ ticks: 5, cleared: false, cycles: 0 });
    expect(mergeLegacyTrack({ ticks: 40, cleared: false }, { ticks: 0, cleared: true, cycles: 1 }))
      .toEqual({ ticks: 0, cleared: true, cycles: 1 });
  });

  it("a record on one side only is kept as it is; none on either is null", () => {
    const only = { ticks: 3, cleared: false };
    expect(mergeLegacyTrack(only, undefined)).toBe(only);
    expect(mergeLegacyTrack(null, only)).toBe(only);
    expect(mergeLegacyTrack(null, undefined)).toBeNull();
  });
});

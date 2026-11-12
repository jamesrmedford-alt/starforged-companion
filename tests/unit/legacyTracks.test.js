/**
 * STARFORGED COMPANION
 * tests/unit/legacyTracks.test.js
 *
 * The legacy tracks' arithmetic (src/moves/legacyTracks.js — issue #316 T02):
 * filling the tenth box clears the track, which starts again with the
 * overflow; a box earns 2 XP, or 1 once the track has been cleared, at the
 * rate of the cycle it filled in; a working copy's marks are applied to the
 * stored track on its persist, so a clear is never undone by a higher
 * pre-clear tick count, and a track lowered on a sheet meanwhile stays
 * lowered (LEGACY-SHEET-DECREASE — the merge kept the record further along).
 */

import { describe, it, expect } from "vitest";
import {
  markLegacyTrack,
  markLegacyOnCopy,
  legacyTracksWithCopyMarks,
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

describe("legacyProgress and legacyTracksWithCopyMarks", () => {
  it("progress counts the cleared cycles with the current ticks", () => {
    expect(legacyProgress(undefined)).toBe(0);
    expect(legacyProgress({ ticks: 38, cleared: false })).toBe(38);
    expect(legacyProgress({ ticks: 2, cleared: true, cycles: 1 })).toBe(LEGACY_CYCLE_TICKS + 2);
    expect(legacyProgress({ ticks: 0, cleared: true })).toBe(LEGACY_CYCLE_TICKS);
  });

  it("a copy's marks applied to the store clear the track past 40 — the clear is never undone", () => {
    const store = { discoveries: { ticks: 38, cleared: false } };
    const copy  = { legacyTracks: { discoveries: { ticks: 38, cleared: false } } };
    markLegacyOnCopy(copy, "discoveries", 4);
    expect(copy.legacyTracks.discoveries).toEqual({ ticks: 2, cleared: true, cycles: 1 });
    expect(legacyTracksWithCopyMarks(store, copy.legacyTracks, copy).discoveries)
      .toEqual({ ticks: 2, cleared: true, cycles: 1 });
  });

  it("a track lowered on a sheet since the copy was read stays lowered — the copy's marks land on it", () => {
    const copy = { legacyTracks: { bonds: { ticks: 20, cleared: false }, quests: { ticks: 12, cleared: false } } };
    markLegacyOnCopy(copy, "bonds", 2);                               // the copy's own mark: 22
    const store = { bonds: { ticks: 8, cleared: false }, quests: { ticks: 4, cleared: false } };   // both lowered meanwhile
    expect(legacyTracksWithCopyMarks(store, copy.legacyTracks, copy)).toEqual({
      bonds:  { ticks: 10, cleared: false, cycles: 0 },               // was 22: the stale 20, raised again
      quests: { ticks: 4, cleared: false, cycles: 0 },                // was 12
    });
  });

  it("a concurrent mark in the store is kept beside the copy's", () => {
    const copy = { legacyTracks: { bonds: { ticks: 2, cleared: false } } };
    markLegacyOnCopy(copy, "bonds", 2);
    const store = { bonds: { ticks: 4, cleared: false } };             // `!bond` +2 meanwhile
    expect(legacyTracksWithCopyMarks(store, copy.legacyTracks, copy).bonds).toEqual({ ticks: 6, cleared: false, cycles: 0 });
  });

  it("a track the store does not hold is the copy's; none on either is null", () => {
    const only = { ticks: 3, cleared: false };
    expect(legacyTracksWithCopyMarks({}, { quests: only }, null).quests).toBe(only);
    expect(legacyTracksWithCopyMarks(null, undefined, null)).toBeNull();
  });
});

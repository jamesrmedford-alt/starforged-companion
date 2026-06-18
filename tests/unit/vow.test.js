/**
 * STARFORGED COMPANION
 * tests/unit/vow.test.js — pure-helper coverage for vow.js
 */

import { describe, it, expect, vi } from 'vitest';
import { selectVowTrack, finishVow, VOW_RANKS } from '../../src/moves/vow.js';

const OPEN_VOWS = [
  { id: "v1", type: "vow", label: "Rescue the Colonists",  rank: "dangerous",  completed: false },
  { id: "v2", type: "vow", label: "Expose the Conspiracy", rank: "formidable", completed: false },
  { id: "v3", type: "vow", label: "Closed vow",            rank: "dangerous",  completed: true  },
];

describe("selectVowTrack", () => {
  it("exact label match wins over substring", () => {
    const tracks = [
      { id: "a", type: "vow", label: "Rescue the Colonists", rank: "dangerous", completed: false },
      { id: "b", type: "vow", label: "Rescue",               rank: "epic",      completed: false },
    ];
    expect(selectVowTrack(tracks, "Rescue").id).toBe("b");
    expect(selectVowTrack(tracks, "Rescue the Colonists").id).toBe("a");
  });

  it("falls back to substring match", () => {
    expect(selectVowTrack(OPEN_VOWS, "Conspiracy").id).toBe("v2");
  });

  it("returns the sole open track when label is null", () => {
    const single = [OPEN_VOWS[0]];
    expect(selectVowTrack(single, null).id).toBe("v1");
  });

  it("returns null when multiple open tracks and no label match", () => {
    expect(selectVowTrack(OPEN_VOWS, null)).toBeNull();
    expect(selectVowTrack(OPEN_VOWS, "no match")).toBeNull();
  });

  it("ignores completed tracks", () => {
    expect(selectVowTrack([OPEN_VOWS[2]], "Closed vow")).toBeNull();
  });

  it("returns null on empty list", () => {
    expect(selectVowTrack([], "anything")).toBeNull();
  });
});

describe("finishVow", () => {
  function makeTrack(rank = "dangerous") {
    return { id: "v1", type: "vow", label: "Test Vow", rank, completed: false };
  }

  it("completes the track and returns legacy ticks for dangerous rank", async () => {
    const track = makeTrack("dangerous");
    const completed = { ...track, completed: true };
    const deps = {
      listTracks: vi.fn().mockResolvedValue([track]),
      completeTrack: vi.fn().mockResolvedValue(completed),
    };
    const result = await finishVow({ moveTarget: "Test Vow", ranksDown: 0 }, deps);
    expect(deps.completeTrack).toHaveBeenCalledWith("v1");
    expect(result.legacyTicks).toBe(2);   // dangerous → 2 ticks
    expect(result.track.completed).toBe(true);
  });

  it("applies ranksDown for weak hit (dangerous → troublesome = 1 tick)", async () => {
    const track = makeTrack("dangerous");
    const deps = {
      listTracks: vi.fn().mockResolvedValue([track]),
      completeTrack: vi.fn().mockResolvedValue(track),
    };
    const result = await finishVow({ moveTarget: null, ranksDown: 1 }, deps);
    expect(result.legacyTicks).toBe(1);   // one rank lower: troublesome → 1 tick
  });

  it("returns 0 ticks when ranksDown exceeds rank (troublesome weak hit)", async () => {
    const track = makeTrack("troublesome");
    const deps = {
      listTracks: vi.fn().mockResolvedValue([track]),
      completeTrack: vi.fn().mockResolvedValue(track),
    };
    const result = await finishVow({ moveTarget: null, ranksDown: 1 }, deps);
    expect(result.legacyTicks).toBe(0);
  });

  it("returns null when no open vow track found", async () => {
    const deps = {
      listTracks: vi.fn().mockResolvedValue([]),
      completeTrack: vi.fn(),
    };
    expect(await finishVow({ moveTarget: "anything" }, deps)).toBeNull();
    expect(deps.completeTrack).not.toHaveBeenCalled();
  });

  it("returns null when deps are missing", async () => {
    expect(await finishVow({ moveTarget: null }, null)).toBeNull();
    expect(await finishVow({ moveTarget: null }, {})).toBeNull();
  });

  it("covers the full legacy reward scale", async () => {
    const EXPECTED = { troublesome: 1, dangerous: 2, formidable: 4, extreme: 8, epic: 12 };
    for (const [rank, ticks] of Object.entries(EXPECTED)) {
      const track = makeTrack(rank);
      const deps = {
        listTracks: vi.fn().mockResolvedValue([track]),
        completeTrack: vi.fn().mockResolvedValue(track),
      };
      const result = await finishVow({ moveTarget: null, ranksDown: 0 }, deps);
      expect(result.legacyTicks).toBe(ticks);
    }
  });
});

describe("VOW_RANKS", () => {
  it("contains all five rank levels", () => {
    expect(VOW_RANKS).toEqual(["troublesome", "dangerous", "formidable", "extreme", "epic"]);
  });
});

/**
 * STARFORGED COMPANION
 * tests/unit/combat.test.js
 *
 * Combat lifecycle (audit 3.24–3.27) — resolve-or-create combat track,
 * mark progress, complete on fight end. Pure orchestration over injected deps.
 */

import { describe, it, expect, vi } from "vitest";
import {
  normalizeCombatRank,
  selectCombatTrack,
  applyCombatProgress,
  finishCombat,
  COMBAT_RANKS,
  DEFAULT_COMBAT_RANK,
} from "../../src/moves/combat.js";

const cbt = (over = {}) => ({
  id: "c1", label: "Corsair Raiders", type: "combat", rank: "dangerous",
  ticks: 0, completed: false, ...over,
});

// ─── normalizeCombatRank ──────────────────────────────────────────────────────

describe("normalizeCombatRank", () => {
  it("passes through all valid ranks", () => {
    for (const r of COMBAT_RANKS) expect(normalizeCombatRank(r)).toBe(r);
  });
  it("falls back to dangerous on null/garbage", () => {
    expect(normalizeCombatRank(null)).toBe(DEFAULT_COMBAT_RANK);
    expect(normalizeCombatRank("boss")).toBe(DEFAULT_COMBAT_RANK);
    expect(normalizeCombatRank(42)).toBe(DEFAULT_COMBAT_RANK);
  });
  it("falls back to dangerous on empty string", () => {
    expect(normalizeCombatRank("")).toBe(DEFAULT_COMBAT_RANK);
  });
});

// ─── selectCombatTrack ───────────────────────────────────────────────────────

describe("selectCombatTrack", () => {
  it("returns null when no open combat tracks", () => {
    expect(selectCombatTrack([], "Corsair Raiders")).toBeNull();
    expect(selectCombatTrack([cbt({ completed: true })], null)).toBeNull();
  });

  it("exact label match (ignores leading 'the')", () => {
    const tracks = [cbt({ id: "c1", label: "The Raiders" }), cbt({ id: "c2", label: "Security Bots" })];
    expect(selectCombatTrack(tracks, "Raiders")?.id).toBe("c1");
    expect(selectCombatTrack(tracks, "the raiders")?.id).toBe("c1");
  });

  it("substring match when no exact", () => {
    const tracks = [cbt({ id: "c1", label: "Corsair Captain Vel" })];
    expect(selectCombatTrack(tracks, "Corsair")?.id).toBe("c1");
  });

  it("falls back to single open track when no label given", () => {
    const tracks = [cbt()];
    expect(selectCombatTrack(tracks, null)?.id).toBe("c1");
  });

  it("returns null when ambiguous (multiple open, no label match)", () => {
    const tracks = [cbt({ id: "c1", label: "Raiders" }), cbt({ id: "c2", label: "Security Bots" })];
    expect(selectCombatTrack(tracks, "Void Reavers")).toBeNull();
    expect(selectCombatTrack(tracks, null)).toBeNull();
  });
});

// ─── applyCombatProgress ─────────────────────────────────────────────────────

describe("applyCombatProgress", () => {
  function makeDeps(existingTracks = [], markedTrack = null) {
    const created = [];
    return {
      listTracks:   vi.fn(async () => existingTracks),
      createTrack:  vi.fn(async (data) => {
        const t = cbt({ id: `new-${created.length}`, label: data.label, rank: data.rank });
        created.push(t);
        existingTracks.push(t);
        return t;
      }),
      markProgress: vi.fn(async (id) => markedTrack ?? existingTracks.find(t => t.id === id) ?? null),
      created,
    };
  }

  it("creates track when none exists, marks once (markCount=1)", async () => {
    const deps = makeDeps();
    const r = await applyCombatProgress({ moveTarget: "Corsair Captain", combatRank: "formidable", markCount: 1 }, deps);
    expect(deps.createTrack).toHaveBeenCalledWith(expect.objectContaining({ label: "Corsair Captain", type: "combat", rank: "formidable" }));
    expect(deps.markProgress).toHaveBeenCalledTimes(1);
    expect(r.created).toBe(true);
    expect(r.marksApplied).toBe(1);
  });

  it("reuses existing open combat track, marks twice", async () => {
    const existing = [cbt({ id: "existing", label: "Corsair Captain" })];
    const deps = makeDeps(existing);
    const r = await applyCombatProgress({ moveTarget: "Corsair Captain", markCount: 2 }, deps);
    expect(deps.createTrack).not.toHaveBeenCalled();
    expect(deps.markProgress).toHaveBeenCalledTimes(2);
    expect(r.created).toBe(false);
    expect(r.marksApplied).toBe(2);
  });

  it("creates track with default rank when combatRank is null", async () => {
    const deps = makeDeps();
    await applyCombatProgress({ moveTarget: "Unknown Foe", combatRank: null, markCount: 0 }, deps);
    expect(deps.createTrack).toHaveBeenCalledWith(expect.objectContaining({ label: "Unknown Foe", type: "combat", rank: DEFAULT_COMBAT_RANK }));
  });

  it("markCount=0 creates track without marking (Enter the Fray path)", async () => {
    const deps = makeDeps();
    const r = await applyCombatProgress({ moveTarget: "Enemy Ship", markCount: 0 }, deps);
    expect(deps.createTrack).toHaveBeenCalled();
    expect(deps.markProgress).not.toHaveBeenCalled();
    expect(r.created).toBe(true);
    expect(r.marksApplied).toBe(0);
  });

  it("uses 'Combat' label when moveTarget is null/empty", async () => {
    const deps = makeDeps();
    await applyCombatProgress({ moveTarget: null, markCount: 1 }, deps);
    expect(deps.createTrack).toHaveBeenCalledWith(expect.objectContaining({ label: "Combat" }));
  });
});

// ─── finishCombat ────────────────────────────────────────────────────────────

describe("finishCombat", () => {
  it("finds open combat track and completes it", async () => {
    const track = cbt({ id: "c1", label: "Corsair Captain" });
    const deps = {
      listTracks:    vi.fn(async () => [track]),
      completeTrack: vi.fn(async (id) => ({ ...track, id, completed: true, completedAt: 1 })),
    };
    const r = await finishCombat({ moveTarget: "Corsair Captain" }, deps);
    expect(deps.completeTrack).toHaveBeenCalledWith("c1");
    expect(r?.track.completed).toBe(true);
  });

  it("returns null when no open combat track found", async () => {
    const deps = {
      listTracks:    vi.fn(async () => [cbt({ completed: true })]),
      completeTrack: vi.fn(),
    };
    const r = await finishCombat({ moveTarget: null }, deps);
    expect(r).toBeNull();
    expect(deps.completeTrack).not.toHaveBeenCalled();
  });

  it("falls back to sole open track when label is null", async () => {
    const track = cbt({ id: "solo" });
    const deps = {
      listTracks:    vi.fn(async () => [track]),
      completeTrack: vi.fn(async (id) => ({ ...track, id, completed: true })),
    };
    const r = await finishCombat({ moveTarget: null }, deps);
    expect(r?.track.id).toBe("solo");
  });
});

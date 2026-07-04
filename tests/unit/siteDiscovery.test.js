/**
 * STARFORGED COMPANION
 * tests/unit/siteDiscovery.test.js
 *
 * Reveal-orchestration coverage for precursor-vault / derelict site discovery.
 * revealSectorSite is dependency-injected, so the flip + side-effects test
 * without a live game.
 */

import { describe, it, expect, vi } from "vitest";
import { revealSectorSite } from "../../src/sectors/siteDiscovery.js";

function buildState() {
  return {
    sectors: [
      {
        id: "sec-1",
        sceneId: "scene-1",
        mapData: {
          discoveries: [
            { id: "site-a", type: "vault",    name: "Precursor Vault — Monument", discovered: false, actorId: "loc-a" },
            { id: "site-b", type: "derelict", name: "Derelict Starship",          discovered: false, actorId: "loc-b" },
          ],
        },
      },
    ],
  };
}

function deps(state, over = {}) {
  return {
    getState:  () => state,
    setState:  vi.fn(async () => {}),
    getScene:  vi.fn(() => ({ id: "scene-1" })),
    updateLoc: vi.fn(async () => {}),
    restyle:   vi.fn(async () => true),
    ...over,
  };
}

describe("revealSectorSite", () => {
  it("flips the matched site, marks the location visited, restyles, and persists", async () => {
    const state = buildState();
    const d = deps(state);
    const result = await revealSectorSite("monument", d);

    expect(result?.site?.id).toBe("site-a");
    expect(state.sectors[0].mapData.discoveries[0].discovered).toBe(true);
    expect(d.updateLoc).toHaveBeenCalledWith("loc-a", { status: "visited" });
    expect(d.restyle).toHaveBeenCalledTimes(1);
    expect(d.setState).toHaveBeenCalledTimes(1);
  });

  it("resolves a bare type keyword to the sole undiscovered site of that type", async () => {
    const state = buildState();
    const result = await revealSectorSite("the derelict", deps(state));
    expect(result?.site?.id).toBe("site-b");
  });

  it("returns null and does not persist when nothing matches", async () => {
    // Two undiscovered sites of different types and a label that matches no
    // name and no type keyword → ambiguous, no reveal.
    const state = buildState();
    const d = deps(state);
    const result = await revealSectorSite("asteroid belt", d);
    expect(result).toBeNull();
    expect(d.setState).not.toHaveBeenCalled();
  });

  it("skips already-discovered sites", async () => {
    const state = buildState();
    state.sectors[0].mapData.discoveries[0].discovered = true;   // vault already found
    const result = await revealSectorSite("vault", deps(state));
    // "vault" no longer substring-matches an undiscovered site; the only
    // undiscovered one is the derelict, which "vault" doesn't name-match,
    // and it isn't the sole-of-type for vault → falls through to sole
    // undiscovered (the derelict).
    expect(result?.site?.id).toBe("site-b");
  });

  it("does not throw when the location update fails", async () => {
    const state = buildState();
    const d = deps(state, { updateLoc: vi.fn(async () => { throw new Error("boom"); }) });
    const result = await revealSectorSite("monument", d);
    expect(result?.site?.id).toBe("site-a");
    expect(d.setState).toHaveBeenCalledTimes(1);   // still persists the flip
  });
});


describe("revealSectorSite — stored siteId link (expedition→site FK)", () => {
  it("reveals exactly the linked site, bypassing the name ladder", async () => {
    const state = { sectors: [{ id: "sec", sceneId: null, mapData: { discoveries: [
      { id: "d1", name: "Precursor Vault — Sunken Choir", type: "vault", discovered: false, actorId: null },
      { id: "d2", name: "Derelict Starship", type: "derelict", discovered: false, actorId: null },
    ] } }] };
    const result = await revealSectorSite("totally unrelated label", {
      siteId: "d2",
      getState: () => state,
      setState: () => {},
      getScene: () => null,
      updateLoc: async () => {},
    });
    expect(result?.site?.id).toBe("d2");
    expect(state.sectors[0].mapData.discoveries[1].discovered).toBe(true);
    expect(state.sectors[0].mapData.discoveries[0].discovered).toBe(false);
  });

  it("falls back to the label ladder when the linked site is already discovered", async () => {
    const state = { sectors: [{ id: "sec", sceneId: null, mapData: { discoveries: [
      { id: "d1", name: "Precursor Vault — Sunken Choir", type: "vault", discovered: false, actorId: null },
      { id: "d2", name: "Derelict Starship", type: "derelict", discovered: true, actorId: null },
    ] } }] };
    const result = await revealSectorSite("sunken choir", {
      siteId: "d2",
      getState: () => state,
      setState: () => {},
      getScene: () => null,
      updateLoc: async () => {},
    });
    expect(result?.site?.id).toBe("d1");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// clearSectorSite — mark a discovered site fully explored (SITE-NO-COMPLETION)
// ─────────────────────────────────────────────────────────────────────────────

import { clearSectorSite } from "../../src/sectors/siteDiscovery.js";

// Two DISCOVERED sites so keyword targeting is exercised without the
// sole-eligible fallback (which mirrors the reveal ladder).
function clearedState() {
  return {
    sectors: [
      {
        id: "sec-1",
        mapData: {
          discoveries: [
            { id: "site-a", type: "vault",    name: "Precursor Vault — Monument", discovered: true, cleared: false, actorId: "loc-a" },
            { id: "site-b", type: "derelict", name: "Derelict Starship",          discovered: true, cleared: false, actorId: "loc-b" },
          ],
        },
      },
    ],
  };
}

describe("clearSectorSite", () => {
  it("marks the keyword-matched discovered site cleared and sets its status", async () => {
    const state = clearedState();
    const updateLoc = vi.fn(async () => {});
    const setState  = vi.fn(async () => {});
    const result = await clearSectorSite("monument", { getState: () => state, setState, updateLoc });

    expect(result?.site?.id).toBe("site-a");
    expect(state.sectors[0].mapData.discoveries[0].cleared).toBe(true);
    expect(state.sectors[0].mapData.discoveries[1].cleared).toBe(false);
    expect(updateLoc).toHaveBeenCalledWith("loc-a", { status: "cleared" });
    expect(setState).toHaveBeenCalledTimes(1);
  });

  it("targets the derelict by type keyword, leaving the vault untouched", async () => {
    const state = clearedState();
    const result = await clearSectorSite("derelict", { getState: () => state, setState: vi.fn(async () => {}), updateLoc: vi.fn(async () => {}) });
    expect(result?.site?.id).toBe("site-b");
    expect(state.sectors[0].mapData.discoveries[1].cleared).toBe(true);
    expect(state.sectors[0].mapData.discoveries[0].cleared).toBe(false);
  });

  it("never clears an UNDISCOVERED site (not yet revealed)", async () => {
    const state = clearedState();
    state.sectors[0].mapData.discoveries[0].discovered = false; // vault back to hidden
    state.sectors[0].mapData.discoveries[1].discovered = false; // derelict back to hidden
    const result = await clearSectorSite("monument", { getState: () => state, setState: vi.fn(async () => {}), updateLoc: vi.fn(async () => {}) });
    expect(result).toBeNull();
    expect(state.sectors[0].mapData.discoveries.every(d => !d.cleared)).toBe(true);
  });

  it("returns null when the only discovered site is already cleared", async () => {
    const state = clearedState();
    state.sectors[0].mapData.discoveries[1].discovered = false; // only the vault is discovered
    state.sectors[0].mapData.discoveries[0].cleared = true;
    const result = await clearSectorSite("monument", { getState: () => state, setState: vi.fn(async () => {}), updateLoc: vi.fn(async () => {}) });
    expect(result).toBeNull();
  });
});

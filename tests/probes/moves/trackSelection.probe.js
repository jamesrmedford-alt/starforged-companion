/**
 * PROBE (moves audit) — resolve-or-create on an ambiguous target.
 *
 *  AMBIGUOUS-TRACK-CREATES-PHANTOM — applyCombatProgress (Strike / Clash
 *    marks, index.js applyOutcomeEffects) and applyExpeditionProgress
 *    (Undertake an Expedition) resolve the move's track with the select*
 *    ladder, and on null CREATE a new track. null also means "ambiguous": two
 *    or more open fights (or expeditions) and a target the interpreter left
 *    null (its prompt asks for no moveTarget on Strike / Clash) or named
 *    loosely. So a Strike in an ongoing fight while a second one is open
 *    creates a fresh dangerous "Combat" track and marks it twice; the move's
 *    position is then written to that phantom (moveFight); every later Strike
 *    makes another.
 */

import { describe, it, expect, vi } from "vitest";
import { applyCombatProgress } from "../../../src/moves/combat.js";
import { applyExpeditionProgress } from "../../../src/moves/expedition.js";

function deps(tracks) {
  return {
    listTracks:   vi.fn(async () => tracks),
    createTrack:  vi.fn(async (data) => ({ id: "new-track", ticks: 0, completed: false, ...data })),
    markProgress: vi.fn(async (id) => ({ ...(tracks.find(t => t.id === id) ?? { id, label: "?" }) })),
  };
}

describe("AMBIGUOUS-TRACK-CREATES-PHANTOM — combat", () => {
  it("control: with one fight open, an unnamed Strike marks that fight", async () => {
    const d = deps([{ id: "f1", type: "combat", label: "Pirate raiders", rank: "dangerous", ticks: 8, completed: false }]);
    const res = await applyCombatProgress({ moveTarget: null, markCount: 2 }, d);
    expect(res.created).toBe(false);
    expect(d.markProgress).toHaveBeenCalledWith("f1");
  });

  it("with two fights open and no target named, a Strike creates no new fight", async () => {
    const d = deps([
      { id: "f1", type: "combat", label: "Pirate raiders",     rank: "dangerous", ticks: 8, completed: false },
      { id: "f2", type: "combat", label: "Rogue drone swarm", rank: "formidable", ticks: 4, completed: false },
    ]);
    const res = await applyCombatProgress({ moveTarget: null, markCount: 2 }, d);
    expect(d.createTrack).not.toHaveBeenCalled();        // today: creates "Combat" (dangerous)
    expect(res?.created).not.toBe(true);
  });
});

describe("AMBIGUOUS-TRACK-CREATES-PHANTOM — expedition", () => {
  it("with two expeditions open and no destination named, Undertake an Expedition creates no new expedition", async () => {
    const d = deps([
      { id: "e1", type: "expedition", label: "The Vault of Tears", rank: "formidable", ticks: 12, completed: false },
      { id: "e2", type: "expedition", label: "Bleakhold survey",   rank: "dangerous",  ticks: 8,  completed: false },
    ]);
    const res = await applyExpeditionProgress({ moveTarget: null, expeditionRank: null }, d);
    expect(d.createTrack).not.toHaveBeenCalled();        // today: creates "Expedition" (dangerous)
    expect(res?.created).not.toBe(true);
  });
});

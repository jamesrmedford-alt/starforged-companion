/**
 * STARFORGED COMPANION
 * tests/unit/spotlightFrameNames.test.js
 *
 * Issue #322 V20 (the audit's spotlightFrameNames probe): selectSpotlight
 * counted a PC present only when the scene frame listed its exact full name.
 * The frame often lists the cast by first name — "Kira, Ren" for Kira Voss
 * and Ren Tal — so such a scene rotated nobody for as long as it lasted
 * (addSceneFrameCast resolves the same names through a first/last-name
 * ladder; the spotlight did not). A frame name now stands for a PC by its
 * full name, or by a first or last name no other PC shares.
 */

import { describe, it, expect } from "vitest";
import { selectSpotlight } from "../../src/narration/spotlight.js";

const KIRA = { id: "a-kira", name: "Kira Voss" };
const REN  = { id: "b-ren",  name: "Ren Tal" };

describe("spotlight — PCs the frame lists by first or last name are in the scene", () => {
  it("rotates between two present PCs the frame names by first name", () => {
    const selection = selectSpotlight({
      roster: [KIRA, REN], presentNames: ["Kira", "Ren", "Dockmaster Vale"], lastActorId: "a-kira",
    });
    expect(selection?.nextActorId).toBe("b-ren");
  });

  it("a last name counts too, whatever the case and spacing", () => {
    const selection = selectSpotlight({ roster: [KIRA, REN], presentNames: ["voss", "  TAL "], lastActorId: "b-ren" });
    expect(selection?.nextActorId).toBe("a-kira");
  });

  it("a name two PCs share names neither", () => {
    const roster = [KIRA, REN, { id: "c-ren", name: "Ren Okafor" }];
    const selection = selectSpotlight({ roster, presentNames: ["Kira", "Ren"], lastActorId: null });
    expect(selection).toBeNull();      // only Kira is surely present — no rotation to imply
  });

  it("control: full names still match, and a PC the frame does not name is left out", () => {
    const roster = [KIRA, REN, { id: "c-ash", name: "Ash Moreno" }];
    const selection = selectSpotlight({ roster, presentNames: ["Kira Voss", "Ren Tal"], lastActorId: "a-kira" });
    expect(selection.candidates.map(c => c.id)).toEqual(["a-kira", "b-ren"]);
  });
});

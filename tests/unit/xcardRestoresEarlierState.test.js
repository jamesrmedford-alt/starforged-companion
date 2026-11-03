// tests/unit/xcardRestoresEarlierState.test.js
// The X-Card takes out what the removed narration contributed to the scene
// state, and nothing more (issue #326 W41). applySidecar stored a state
// change by replacing the subject + attribute entry in place, keeping
// nothing of the value it superseded; retractNarrations then removed the
// X-carded narration's entry, so narration A's value — which the X-Card did
// not touch — was gone too: the dockmaster had no location after the
// resume, and his card's LAST KNOWN was not updated from A at scene end.
// A state entry now keeps the value it superseded (`previous`, a bounded
// chain) and the X-Card restores it. (The frame half — a frame the removed
// narration wrote is cleared — is decided: tests/unit/xcardNarratorMemory.)

import { describe, it, expect } from "vitest";
import { applySidecar, applySceneFrame, retractNarrations } from "../../src/factContinuity/ledgers.js";

function narrate(cs, narrationId, sidecar) {
  applySidecar(sidecar, { campaignState: cs, narrationId });
  if (sidecar.sceneFrame) applySceneFrame(sidecar.sceneFrame, cs, { narrationId });
}
const moves = (value) => ({ newTruths: [], stateChanges: [{ subject: "the dockmaster", attribute: "location", value }] });
const A = {
  ...moves("the cargo bay"),
  sceneFrame: { location: "the docking ring", present: ["the dockmaster"], situation: "Haggling over berths" },
};
const B = {
  ...moves("the interrogation cell"),
  sceneFrame: { location: "the interrogation cell", present: ["the dockmaster"], situation: "The torch comes out" },
};
const freshScene = () => ({ currentSceneId: "sc-1", sceneTruths: [], sceneState: { bySubject: {}, sceneId: "sc-1" } });
const location = (cs) => cs.sceneState.bySubject["the dockmaster"];

describe("the X-Card on narration B leaves narration A's state in place (issue #326 W41)", () => {
  it("control: B's own values are gone after the X-Card", () => {
    const cs = freshScene();
    narrate(cs, "nar-A", A);
    narrate(cs, "nar-B", B);
    retractNarrations(cs, ["nar-B"]);
    expect(JSON.stringify(cs.sceneState)).not.toMatch(/interrogation cell/);
    expect(cs.sceneFrame?.location ?? null).not.toBe("the interrogation cell");
  });

  it("the dockmaster's location is A's again, not erased", () => {
    const cs = freshScene();
    narrate(cs, "nar-A", A);
    narrate(cs, "nar-B", B);
    retractNarrations(cs, ["nar-B"]);   // what the X-Card's pause write does (applyXCardToNarratorMemory)
    expect(location(cs)).toEqual([expect.objectContaining({ value: "the cargo bay", narrationId: "nar-A" })]);
  });

  it("control: a value no earlier narration set is removed outright", () => {
    const cs = freshScene();
    narrate(cs, "nar-B", B);
    retractNarrations(cs, ["nar-B"]);
    expect(location(cs)).toBeUndefined();
  });

  it("a later value can never fall back to one the X-Card removed", () => {
    const cs = freshScene();
    narrate(cs, "nar-A", A);
    narrate(cs, "nar-B", B);
    narrate(cs, "nar-C", moves("the bridge"));
    retractNarrations(cs, ["nar-B"]);                       // B is out of C's chain …
    expect(location(cs)).toEqual([expect.objectContaining({ value: "the bridge" })]);
    expect(JSON.stringify(cs.sceneState)).not.toMatch(/interrogation cell/);
    retractNarrations(cs, ["nar-C"]);                       // … so retracting C restores A, not B
    expect(location(cs)).toEqual([expect.objectContaining({ value: "the cargo bay" })]);
  });

  it("a beat of two narrations restores what stood before both", () => {
    const cs = freshScene();
    narrate(cs, "nar-A", A);
    narrate(cs, "nar-paced", moves("the airlock"));
    narrate(cs, "nar-move", B);
    retractNarrations(cs, ["nar-paced", "nar-move"]);
    expect(location(cs)).toEqual([expect.objectContaining({ value: "the cargo bay" })]);
  });

  it("an entry keeps a bounded chain of the values it superseded", () => {
    const cs = freshScene();
    for (let i = 0; i < 12; i++) narrate(cs, `nar-${i}`, moves(`deck ${i}`));
    let depth = 0;
    for (let cur = location(cs)[0]; cur; cur = cur.previous) depth += 1;
    expect(depth).toBeLessThanOrEqual(5);
    expect(location(cs)[0]).toMatchObject({ value: "deck 11", previous: { value: "deck 10" } });
  });
});

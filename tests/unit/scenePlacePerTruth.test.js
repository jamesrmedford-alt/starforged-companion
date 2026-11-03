/**
 * STARFORGED COMPANION
 * tests/unit/scenePlacePerTruth.test.js
 *
 * A scene truth is filed on the place it was asserted at (issue #326 D2).
 *
 * endScene filed every scene-subject truth on the frame's location at the END
 * of the scene. A scene spans travel — scenes end only at `!scene end`, End a
 * Session, the re-mint and closeWorld — so "the bar is called the Rusty
 * Lantern", recorded at Bleakhold, landed on Ironway's card. Decided: each
 * truth records the frame's location when it is asserted (`sceneLocation`);
 * scene end files it there; a truth with no stamp (older, or asserted before
 * any frame stood) falls back to the place the scene ended at.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/world/worldJournal.js", () => ({
  archiveSceneTruth: vi.fn(async (truth) => ({ pageId: `page-${truth?.id ?? "auto"}`, journalId: "journal-lore" })),
}));
vi.mock("../../src/entities/entityExtractor.js", () => ({
  appendMigratedTruthToTier: vi.fn(async () => true),
}));

import { endScene } from "../../src/factContinuity/sceneLifecycle.js";
import { applySidecar, applySceneFrame, setTruth, replaceTruth } from "../../src/factContinuity/ledgers.js";
import { appendMigratedTruthToTier } from "../../src/entities/entityExtractor.js";
import { archiveSceneTruth } from "../../src/world/worldJournal.js";

const MODULE_ID = "starforged-companion";

function addPlace(id, name) {
  const actor = globalThis.makeTestActor({
    id, name, type: "location",
    flags: { [MODULE_ID]: { entityType: "settlement", settlement: { _id: `rec-${id}`, name } } },
  });
  global.game.actors._set(id, actor);
}

function sessionScene() {
  addPlace("act-bleak", "Bleakhold");
  addPlace("act-iron",  "Ironway");
  return {
    currentSessionId: "sess-1", sessionNumber: 3, currentSceneId: "sc-1",
    settlementIds: ["act-bleak", "act-iron"], dismissedEntities: [],
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: "sc-1" }, sceneFrame: null,
  };
}

/** One narration as the narrator applies it: the sidecar (its frame inside) once. */
function narrate(cs, location, truths = [], narrationId = null) {
  const sidecar = { newTruths: truths, stateChanges: [], sceneFrame: { location, present: [], situation: `At ${location}` } };
  applySidecar(sidecar, { campaignState: cs, narrationId });
  applySceneFrame(sidecar.sceneFrame, cs, { narrationId });
}

const RUSTY = { subject: "scene", fact: "the bar is called the Rusty Lantern" };
const TOLL  = { subject: "scene", fact: "the toll gate takes only salvage" };
const filedOn = (placeId, fact = RUSTY.fact) => appendMigratedTruthToTier.mock.calls
  .filter(([id, , entry]) => id === placeId && entry?.detail === fact);

beforeEach(() => {
  global.game.actors._reset();
  appendMigratedTruthToTier.mockClear();
  archiveSceneTruth.mockClear();
});

describe("a scene truth is filed on the place it was asserted at (issue #326 D2)", () => {
  it("control: a scene that stays at Bleakhold files the truth on Bleakhold", async () => {
    const cs = sessionScene();
    narrate(cs, "Bleakhold", [RUSTY], "nar-1");
    await endScene(cs, { reason: "session_close" });
    expect(filedOn("act-bleak")).toHaveLength(1);
  });

  it("a truth asserted at Bleakhold stays Bleakhold's when the scene ends at Ironway", async () => {
    const cs = sessionScene();
    narrate(cs, "Bleakhold", [RUSTY], "nar-1");
    narrate(cs, "Ironway", [TOLL], "nar-2");          // Set a Course; the frame moves on
    expect(cs.sceneTruths.map(t => t.sceneLocation)).toEqual(["Bleakhold", "Ironway"]);
    await endScene(cs, { reason: "session_close" });
    expect(filedOn("act-bleak")).toHaveLength(1);
    expect(filedOn("act-iron")).toHaveLength(0);
    expect(filedOn("act-iron", TOLL.fact)).toHaveLength(1);
  });

  it("a narration that moves the scene stamps its truths with its own frame", () => {
    const cs = sessionScene();
    narrate(cs, "Bleakhold", [], "nar-1");
    // The narration arriving at Ironway asserts a truth: its sidecar's frame says Ironway.
    applySidecar({ newTruths: [TOLL], stateChanges: [], sceneFrame: { location: "Ironway" } }, { campaignState: cs, narrationId: "nar-2" });
    expect(cs.sceneTruths[0].sceneLocation).toBe("Ironway");
  });

  it("a caller that applies the truths before the frame still stamps them with that narration's frame", () => {
    const cs = sessionScene();
    applySidecar({ newTruths: [RUSTY], stateChanges: [] }, { campaignState: cs, narrationId: "nar-1" });
    expect(cs.sceneTruths[0].sceneLocation).toBeNull();
    applySceneFrame({ location: "Bleakhold" }, cs, { narrationId: "nar-1" });
    applySceneFrame({ location: "Ironway" }, cs, { narrationId: "nar-2" });   // a later narration's frame does not restamp it
    expect(cs.sceneTruths[0].sceneLocation).toBe("Bleakhold");
  });

  it("an older truth with no stamp falls back to the place the scene ended at", async () => {
    const cs = sessionScene();
    narrate(cs, "Ironway", [], "nar-1");
    cs.sceneTruths.push({ id: "t-old", subject: { kind: "scene", sceneId: "sc-1" }, fact: RUSTY.fact,
      sessionId: "sess-1", sceneId: "sc-1", retracted: false, migratedTo: null });   // recorded before stamping
    await endScene(cs, { reason: "session_close" });
    expect(filedOn("act-iron")).toHaveLength(1);
  });

  it("a truth asserted at an unrecorded place is lore titled with that place — not filed where the scene ended", async () => {
    const cs = sessionScene();
    narrate(cs, "the derelict's spine corridor", [RUSTY], "nar-1");
    narrate(cs, "Ironway", [], "nar-2");
    await endScene(cs, { reason: "session_close" });
    expect(filedOn("act-iron")).toHaveLength(0);
    expect(archiveSceneTruth).toHaveBeenCalledWith(expect.objectContaining({ fact: RUSTY.fact }), expect.anything(),
      expect.objectContaining({ placeLabel: "the derelict's spine corridor" }));
  });

  it("!truth set stamps the frame in place; a Replace keeps its original's place", () => {
    const cs = sessionScene();
    narrate(cs, "Bleakhold", [], "nar-1");
    const set = setTruth({ kind: "scene", sceneId: "sc-1" }, RUSTY.fact, cs, { actor: "gm" });
    expect(set.sceneLocation).toBe("Bleakhold");
    narrate(cs, "Ironway", [], "nar-2");
    const { replacement } = replaceTruth(set.id, { fact: "the bar is called the Rusted Lantern" }, cs, { actor: "gm", isGM: true });
    expect(replacement.sceneLocation).toBe("Bleakhold");
  });
});

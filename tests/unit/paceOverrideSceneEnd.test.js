/**
 * STARFORGED COMPANION
 * tests/unit/paceOverrideSceneEnd.test.js
 *
 * Issue #322 V21 (traced): `!pace hot` / `!pace quiet` are documented as
 * shifting the pacing dials "for the current scene", but the override
 * (`campaignState.pacing.sceneOverride`) was cleared only by `!pace clear` —
 * it outlived every scene. endScene clears it now, on the store's own pacing
 * block (so `!roll`'s pending flag stays), whatever ended the scene: `!scene
 * end`, a new scene the narrator opened, End a Session.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/world/worldJournal.js", () => ({ archiveSceneTruth: vi.fn(async () => ({ pageId: null })) }));
vi.mock("../../src/entities/entityExtractor.js", () => ({ appendMigratedTruthToTier: vi.fn(async () => false) }));

import { startScene, endScene } from "../../src/factContinuity/sceneLifecycle.js";
import { applyPaceCommand } from "../../src/pacing/router.js";

const MODULE_ID = "starforged-companion";
const CS = `${MODULE_ID}.campaignState`;
const stored = () => game.settings._store.get(CS);

beforeEach(() => {
  game.settings._store.set(CS, {
    currentSessionId: "s1", currentSceneId: "sc-1", sceneTruths: [], sceneState: { bySubject: {}, sceneId: "sc-1" },
    pacing: { sceneOverride: null, forceNextAsMove: false },
  });
});

describe("a pacing scene override lasts for its scene", () => {
  it("`!pace hot`, then the scene ends: the override is gone, and `!roll`'s flag is kept", async () => {
    await applyPaceCommand(structuredClone(stored()), "hot");
    expect(stored().pacing.sceneOverride).toMatchObject({ modifier: 3 });
    game.settings._store.set(CS, { ...stored(), pacing: { ...stored().pacing, forceNextAsMove: true } });   // a `!roll` landed

    await endScene(structuredClone(stored()), { reason: "scene_command" });

    expect(stored().pacing).toEqual({ sceneOverride: null, forceNextAsMove: true });
    expect(stored().currentSceneId).toBeNull();
  });

  it("a new scene started over the old one ends it — and its override", async () => {
    await applyPaceCommand(structuredClone(stored()), "quiet");
    expect(stored().pacing.sceneOverride).toMatchObject({ modifier: -3 });

    const newSceneId = await startScene(structuredClone(stored()), { reason: "test" });   // sc-1 is still open

    expect(newSceneId).not.toBe("sc-1");
    expect(stored().pacing.sceneOverride).toBeNull();
  });

  it("control: a scene ending with no override leaves the pacing block alone", async () => {
    const before = stored().pacing;
    await endScene(structuredClone(stored()), { reason: "scene_command" });
    expect(stored().pacing).toBe(before);                 // not rewritten
  });
});

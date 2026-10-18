/**
 * STARFORGED COMPANION
 * tests/unit/persistResolutionMerge.test.js
 *
 * Review finding #16 — the move pipeline reads campaignState at its start,
 * awaits the confirm dialog and the narrator call, then persistResolution
 * wrote a deep clone of that stale copy back wholesale. Every world write
 * that landed in between was reverted: a relayed X-Card (the card said
 * "Scene paused" while xCardActive was false again), Take a Break's +1, Set
 * a Flag, Private Lines, `!bond` legacy ticks, `!truth` corrections, oracle
 * memory, clocks. persistResolution now re-reads the store right before its
 * write and merges per field (see mergeWithLatestState).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { persistResolution } from "../../src/moves/persistResolution.js";
import { runGmAction } from "../../src/multiplayer/gmRelay.js";

const MODULE_ID = "starforged-companion";
const KEY       = `${MODULE_ID}.campaignState`;

function resolution(overrides = {}) {
  return {
    _id: "res-1", moveId: "face_danger", outcome: "strong_hit",
    consequences: { momentumChange: 0, healthChange: 0, spiritChange: 0, supplyChange: 0 },
    ...overrides,
  };
}

function stored() { return game.settings._store.get(KEY); }

/** The pipeline's working copy: a separate object read before the await gap. */
function pipelineSnapshot() { return JSON.parse(JSON.stringify(stored())); }

beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(KEY, {
    currentSessionId: "sess-1",
    sessionLogs:      { "sess-1": [{ resolutionId: "old", moveId: "gather_information" }] },
    xCardActive:      false,
    pendingMove:      true,
    safety:           { lines: ["L"], veils: [], privateLines: [] },
    connectionIds:    ["c-1"],
    legacyTracks:     { bonds: { ticks: 2, cleared: false } },
    currentSceneId:   "sc-1",
    sceneTruths:      [{ id: "t-1", fact: "The door is sealed.", retracted: false }],
  });
});

describe("persistResolution — concurrent writes survive the stale working copy", () => {
  it("a relayed X-Card that lands mid-pipeline is not reverted", async () => {
    const snapshot = pipelineSnapshot();
    // Player B types !x while player A's move is being narrated.
    await runGmAction("xcard.activate", {}, { requesterId: "pl-2" });
    expect(stored().xCardActive).toBe(true);

    await persistResolution(resolution(), snapshot);

    expect(stored().xCardActive).toBe(true);
    // The pipeline's own write still lands: the session log entry.
    expect(stored().sessionLogs["sess-1"].map(e => e.resolutionId)).toEqual(["old", "res-1"]);
  });

  it("keeps relay / hook writes the pipeline does not own", async () => {
    const snapshot = pipelineSnapshot();
    Object.assign(stored(), {
      nextMoveAdd:     { value: 1, source: "take_a_break" },
      safetyFlags:     [{ text: "too intense" }],
      safety:          { lines: ["L"], veils: [], privateLines: [{ playerId: "pl-2", lines: ["heights"] }] },
      questFocus:      "Find the beacon",
      connectionFocus: "Rook",
      customOracles:   [{ id: "co-1" }],
      recentOracles:   [{ name: "Action", answer: "Defend" }],
      clocks:          [{ id: "k-1", filled: 3 }],
      pacing:          { sceneOverride: { modifier: 1 }, forceNextAsMove: false },
    });

    const out = await persistResolution(resolution(), snapshot);

    for (const s of [stored(), out.campaignState]) {
      expect(s.nextMoveAdd).toEqual({ value: 1, source: "take_a_break" });
      expect(s.safetyFlags).toEqual([{ text: "too intense" }]);
      expect(s.safety.privateLines).toEqual([{ playerId: "pl-2", lines: ["heights"] }]);
      expect(s.questFocus).toBe("Find the beacon");
      expect(s.connectionFocus).toBe("Rook");
      expect(s.customOracles).toEqual([{ id: "co-1" }]);
      expect(s.recentOracles).toEqual([{ name: "Action", answer: "Defend" }]);
      expect(s.clocks).toEqual([{ id: "k-1", filled: 3 }]);
      expect(s.pacing.sceneOverride).toEqual({ modifier: 1 });
    }
  });

  it("a store-side deletion of a store-owned field is honoured (consumed +1 is not resurrected)", async () => {
    stored().nextMoveAdd = { value: 1 };
    const snapshot = pipelineSnapshot();
    delete stored().nextMoveAdd;           // consumed on the store (clearPersistedNextMoveAdd)
    await persistResolution(resolution(), snapshot);
    expect(stored().nextMoveAdd).toBeUndefined();
  });

  it("does not re-claim a move lock that was released on the store", async () => {
    const snapshot = pipelineSnapshot();
    stored().pendingMove = false;
    await persistResolution(resolution(), snapshot);
    expect(stored().pendingMove).toBe(false);
  });

  it("keeps the pipeline's own working-copy writes (arrival location)", async () => {
    const snapshot = pipelineSnapshot();
    snapshot.currentLocationId   = "loc-9";
    snapshot.currentLocationType = "settlement";
    await persistResolution(resolution(), snapshot);
    expect(stored().currentLocationId).toBe("loc-9");
    expect(stored().currentLocationType).toBe("settlement");
  });

  it("unions entity id lists from both sides", async () => {
    const snapshot = pipelineSnapshot();
    snapshot.connectionIds.push("c-pipeline");   // narrator auto-created connection
    stored().connectionIds = ["c-1", "c-gm"];    // GM confirmed a draft card meanwhile
    await persistResolution(resolution(), snapshot);
    expect(stored().connectionIds).toEqual(["c-1", "c-gm", "c-pipeline"]);
  });

  it("legacy ticks from a concurrent `!bond` are not reverted", async () => {
    const snapshot = pipelineSnapshot();
    snapshot.legacyTracks.quests = { ticks: 4, cleared: false };   // pipeline: fulfil a vow
    stored().legacyTracks = { bonds: { ticks: 3, cleared: false } }; // `!bond` +1 meanwhile
    await persistResolution(resolution(), snapshot);
    expect(stored().legacyTracks).toEqual({
      bonds:  { ticks: 3, cleared: false },
      quests: { ticks: 4, cleared: false },
    });
  });

  it("merges scene truths: the pipeline's new truths and a concurrent `!truth` retraction both land", async () => {
    const snapshot = pipelineSnapshot();
    snapshot.sceneTruths.push({ id: "t-2", fact: "Alarms blare.", retracted: false });
    stored().sceneTruths = [{ id: "t-1", fact: "The door is sealed.", retracted: true, correctedTo: "t-3" },
                            { id: "t-3", fact: "The door is open.", retracted: false }];
    await persistResolution(resolution(), snapshot);
    expect(stored().sceneTruths.map(t => [t.id, t.retracted])).toEqual([
      ["t-1", true], ["t-3", false], ["t-2", false],
    ]);
  });

  it("a scene change that landed mid-pipeline wins wholesale", async () => {
    const snapshot = pipelineSnapshot();
    snapshot.sceneTruths.push({ id: "t-2", fact: "Old-scene truth." });
    Object.assign(stored(), {
      currentSceneId: null, sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null,
    });
    await persistResolution(resolution(), snapshot);
    expect(stored().currentSceneId).toBeNull();
    expect(stored().sceneTruths).toEqual([]);
  });

  it("logs into the live session when the session id changed meanwhile", async () => {
    const snapshot = pipelineSnapshot();
    stored().currentSessionId = "sess-2";
    stored().sessionLogs["sess-2"] = [];
    await persistResolution(resolution(), snapshot);
    expect(stored().sessionLogs["sess-2"].map(e => e.resolutionId)).toEqual(["res-1"]);
    expect(stored().sessionLogs["sess-1"]).toHaveLength(1);
  });

  it("keeps the newer rolling session summary", async () => {
    const snapshot = pipelineSnapshot();
    snapshot.sessionSummary = { text: "old",   updatedAt: "2026-10-17T10:00:00.000Z" };
    stored().sessionSummary = { text: "newer", updatedAt: "2026-10-17T10:05:00.000Z" };
    await persistResolution(resolution(), snapshot);
    expect(stored().sessionSummary.text).toBe("newer");
  });
});

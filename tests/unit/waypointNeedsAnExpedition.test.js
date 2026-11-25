/**
 * STARFORGED COMPANION
 * tests/unit/waypointNeedsAnExpedition.test.js
 *
 * Overhaul 4, "moves as contracts" (D6) — Explore a Waypoint is made from an
 * expedition, or at a site; it never begins an expedition. Found on the way:
 * its strong hit's "Mark expedition progress", picked with no expedition
 * open, made an unnamed one (sufferDialog.js — WAYPOINT-PROGRESS-NOOP's
 * fix), though the move's trigger is "When you divert from an expedition".
 * Now the gate refuses an Explore a Waypoint with neither (EXPEDITION_OR_SITE,
 * Undertake an Expedition offered); at a site with none open the strong hit
 * offers no expedition progress; and a mark with none open makes nothing —
 * said on the card, never a silent skip.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/ui/progressTracks.js", async (importOriginal) => ({
  ...(await importOriginal()),
  listProgressTracks: vi.fn(async () => []),
  markProgressById: vi.fn(async (id) => ({ id })),
  addProgressTrack: vi.fn(async (data) => ({ id: "made", ...data })),
}));

import { runSufferResolution } from "../../src/moves/sufferDialog.js";
import { listProgressTracks, markProgressById, addProgressTrack } from "../../src/ui/progressTracks.js";
import { readMoveSituation } from "../../src/moves/situation.js";
import { checkMove } from "../../src/moves/contracts/gate.js";
import { addLocationEntity } from "../helpers/fullStateFixture.js";

beforeEach(() => {
  vi.clearAllMocks();
  game.actors._reset();
  game.actors._set("pc-mira", makeTestActor({ id: "pc-mira", name: "Mira Kestrel" }));
  listProgressTracks.mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

describe("the waypoint's \"Mark expedition progress\" with no expedition open", () => {
  it("marks nothing and makes no expedition — the card is told why", async () => {
    silenceConsoleErrors();
    const [result] = await runSufferResolution([{ kind: "expedition-progress", count: 1 }], game.actors.get("pc-mira"), {});
    expect(result).toMatchObject({ kind: "expedition-progress", skipped: true, ok: false, reason: "no-expedition" });
    expect(addProgressTrack).not.toHaveBeenCalled();
    expect(markProgressById).not.toHaveBeenCalled();
  });

  it("control: the one open expedition is marked", async () => {
    listProgressTracks.mockResolvedValue([{ id: "e1", type: "expedition", label: "To the Drift", completed: false }]);
    const [result] = await runSufferResolution([{ kind: "expedition-progress", count: 1 }], game.actors.get("pc-mira"), {});
    expect(result).toMatchObject({ kind: "expedition-progress", trackId: "e1" });
    expect(markProgressById).toHaveBeenCalledWith("e1");
  });
});

describe("the gate: an expedition, or a site", () => {
  const verdict = async (campaignState) => checkMove("explore_a_waypoint", await readMoveSituation("pc-mira", { campaignState }), {});

  it("neither: refused outright, Undertake an Expedition offered", async () => {
    expect(await verdict({ currentLocationType: "star" })).toMatchObject({ ok: false, code: "expedition-or-site", hard: true, offer: "undertake_an_expedition" });
  });

  it("inside a derelict with no expedition: made — its strong hit offers no expedition progress (movePipeline.js)", async () => {
    const wreck = addLocationEntity(null, { name: "The Hollow Wreck", type: "derelict" });
    expect(await verdict({ currentLocationType: "location", currentLocationId: wreck.journalId })).toMatchObject({ ok: true });
  });

  it("an expedition under way: made", async () => {
    listProgressTracks.mockResolvedValue([{ id: "e1", type: "expedition", label: "To the Drift", completed: false }]);
    expect(await verdict({})).toMatchObject({ ok: true });
  });
});

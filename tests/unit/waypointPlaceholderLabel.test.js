/**
 * STARFORGED COMPANION
 * tests/unit/waypointPlaceholderLabel.test.js
 *
 * WAYPOINT-PLACEHOLDER-LITERAL: Explore a Waypoint's "mark expedition
 * progress" pick, with no expedition open, began one under the label every
 * unnamed expedition has (expedition.js UNNAMED_EXPEDITION_LABEL). Overhaul 4
 * (D6) retired that path with the unnamed expedition it made: a waypoint is
 * explored on an expedition or at a site (the move gate's EXPEDITION_OR_SITE),
 * and the pick with none open begins nothing — under any label. The constant
 * is still mocked to a different value, so a placeholder of either name fails.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/moves/expedition.js", async (importOriginal) => ({
  ...(await importOriginal()),
  UNNAMED_EXPEDITION_LABEL: "Unnamed Journey",
}));

vi.mock("../../src/moves/sufferExecutor.js", async (importOriginal) => ({
  ...(await importOriginal()),
  executeSuffer:              vi.fn(async () => ({})),
  SUFFER_EXECUTORS:           {},
  rollImpactTable:            vi.fn(async () => null),
  offerAtZeroChoiceAfterMiss: vi.fn(async () => null),
  clearUnprepared:            vi.fn(async () => null),
  crewClearedNote:            vi.fn(() => ""),
  overflowToMomentum:         vi.fn(async () => null),
}));

const trackState = { tracks: [], marked: [], created: [] };
vi.mock("../../src/ui/progressTracks.js", () => ({
  listProgressTracks: vi.fn(async () => trackState.tracks),
  markProgressById:   vi.fn(async (id) => { trackState.marked.push(id); return null; }),
  addProgressTrack:   vi.fn(async (data) => {
    const t = { id: `new-${trackState.created.length + 1}`, ticks: 0, completed: false, ...data };
    trackState.created.push(t);
    return t;
  }),
}));

import { runSufferResolution } from "../../src/moves/sufferDialog.js";

beforeEach(() => {
  trackState.tracks  = [];
  trackState.marked  = [];
  trackState.created = [];
  globalThis.ChatMessage = { create: vi.fn(async (d) => d) };
});

describe("WAYPOINT-PLACEHOLDER-LITERAL — retired with its path (overhaul 4, D6)", () => {
  it("the pick with no expedition open begins none, under either name, and marks nothing", async () => {
    const r = await runSufferResolution([{ kind: "expedition-progress", count: 1 }], { id: "pc1" });
    expect(trackState.created).toEqual([]);
    expect(trackState.marked).toEqual([]);
    expect(r[0]).toMatchObject({ kind: "expedition-progress", skipped: true, reason: "no-expedition" });
  });
});

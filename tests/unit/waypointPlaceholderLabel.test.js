/**
 * STARFORGED COMPANION
 * tests/unit/waypointPlaceholderLabel.test.js
 *
 * WAYPOINT-PLACEHOLDER-LITERAL: Explore a Waypoint's "mark expedition
 * progress" pick, with no expedition open, begins one under the label every
 * unnamed expedition has — expedition.js UNNAMED_EXPEDITION_LABEL, which the
 * arrival and the finish read as "no destination named" — not a copy of its
 * value. The constant is mocked to a different value here, so a literal copy
 * fails.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/moves/expedition.js", () => ({
  UNNAMED_EXPEDITION_LABEL: "Unnamed Journey",
}));

vi.mock("../../src/moves/sufferExecutor.js", () => ({
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

describe("WAYPOINT-PLACEHOLDER-LITERAL — the placeholder expedition's label", () => {
  it("is UNNAMED_EXPEDITION_LABEL, not a literal copy of it", async () => {
    const r = await runSufferResolution([{ kind: "expedition-progress", count: 1 }], { id: "pc1" });
    expect(trackState.created).toHaveLength(1);
    expect(trackState.created[0].label).toBe("Unnamed Journey");
    expect(trackState.marked).toEqual([trackState.created[0].id]);
    expect(r[0]).toMatchObject({ kind: "expedition-progress", created: true });
  });
});

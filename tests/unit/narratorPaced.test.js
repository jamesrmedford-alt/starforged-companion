// tests/unit/narratorPaced.test.js
// Coverage for the Group C paced-narrative detection wire-up in
// src/narration/narrator.js. The narrator's Claude call is mocked via
// the api-proxy boundary; entityExtractor exports are spied so we can
// assert the sentinel + options bag without running real prompts.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({
  apiPost: vi.fn(),
}));

vi.mock("../../src/entities/entityExtractor.js", async () => {
  const actual = await vi.importActual("../../src/entities/entityExtractor.js");
  return {
    ...actual,
    runCombinedDetectionPass: vi.fn(),
    routeWorldJournalResults: vi.fn(async () => {}),
    routeEntityDrafts:        vi.fn(async () => ({ created: [], queued: [] })),
  };
});

import { schedulePacedDetection, runPacedDetection } from "../../src/narration/narrator.js";
import {
  runCombinedDetectionPass,
  routeWorldJournalResults,
  routeEntityDrafts,
  PACED_NARRATIVE_MOVE_ID,
  PACED_NARRATIVE_OUTCOME,
} from "../../src/entities/entityExtractor.js";

const BASE_STATE = { currentSessionId: "test-session", sessionNumber: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  runCombinedDetectionPass.mockResolvedValue({
    entities:     [{ type: "connection", name: "Maren", description: "wiry", confidence: "high" }],
    worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// schedulePacedDetection — mischief-dial gating (§C3)
// ---------------------------------------------------------------------------

describe("schedulePacedDetection() — mischief-dial gating", () => {
  it("does not call runCombinedDetectionPass on Lawful", async () => {
    schedulePacedDetection("text", BASE_STATE, "lawful");
    await vi.runAllTimersAsync();
    expect(runCombinedDetectionPass).not.toHaveBeenCalled();
  });

  it("does not call runCombinedDetectionPass on the 'serious' alias", async () => {
    schedulePacedDetection("text", BASE_STATE, "serious");
    await vi.runAllTimersAsync();
    expect(runCombinedDetectionPass).not.toHaveBeenCalled();
  });

  it("calls runCombinedDetectionPass on Balanced (after the async delay)", async () => {
    schedulePacedDetection("text", BASE_STATE, "balanced");
    expect(runCombinedDetectionPass).not.toHaveBeenCalled();   // not synchronous
    await vi.runAllTimersAsync();
    expect(runCombinedDetectionPass).toHaveBeenCalledTimes(1);
  });

  it("calls runCombinedDetectionPass on Chaotic", async () => {
    schedulePacedDetection("text", BASE_STATE, "chaotic");
    await vi.runAllTimersAsync();
    expect(runCombinedDetectionPass).toHaveBeenCalledTimes(1);
  });

  it("defaults to Balanced (runs detection) when dial is null / omitted", async () => {
    schedulePacedDetection("text", BASE_STATE, null);
    await vi.runAllTimersAsync();
    expect(runCombinedDetectionPass).toHaveBeenCalledTimes(1);
  });

  it("treats unknown dial values as Balanced", async () => {
    schedulePacedDetection("text", BASE_STATE, "wild");
    await vi.runAllTimersAsync();
    expect(runCombinedDetectionPass).toHaveBeenCalledTimes(1);
  });
});


// ---------------------------------------------------------------------------
// runPacedDetection — sentinel + options invariants (§C1, §C2)
// ---------------------------------------------------------------------------

describe("runPacedDetection() — sentinel + routing invariants", () => {
  it("calls runCombinedDetectionPass with the paced sentinel pair", async () => {
    await runPacedDetection("Maren leans against the bulkhead.", BASE_STATE);
    expect(runCombinedDetectionPass).toHaveBeenCalledTimes(1);
    const args = runCombinedDetectionPass.mock.calls[0];
    expect(args[1]).toBe(PACED_NARRATIVE_MOVE_ID);   // moveId
    expect(args[2]).toBe(PACED_NARRATIVE_OUTCOME);    // outcome
  });

  it("routes WJ results through routeWorldJournalResults", async () => {
    await runPacedDetection("text", BASE_STATE);
    expect(routeWorldJournalResults).toHaveBeenCalledTimes(1);
  });

  it("calls routeEntityDrafts with autoCreateConnection: false", async () => {
    await runPacedDetection("text", BASE_STATE);
    expect(routeEntityDrafts).toHaveBeenCalledTimes(1);
    const opts = routeEntityDrafts.mock.calls[0][2];
    expect(opts.autoCreateConnection).toBe(false);
  });

  it("passes source: 'paced_narrative' to routeEntityDrafts for telemetry", async () => {
    await runPacedDetection("text", BASE_STATE);
    const opts = routeEntityDrafts.mock.calls[0][2];
    expect(opts.source).toBe("paced_narrative");
  });

  it("passes the campaign sessionId to routeEntityDrafts", async () => {
    await runPacedDetection("text", { ...BASE_STATE, currentSessionId: "abc-123" });
    const opts = routeEntityDrafts.mock.calls[0][2];
    expect(opts.sessionId).toBe("abc-123");
  });

  it("does not throw when the detection call rejects", async () => {
    expectConsoleError(/runPacedDetection failed/);
    runCombinedDetectionPass.mockRejectedValueOnce(new Error("API down"));
    await expect(runPacedDetection("text", BASE_STATE)).resolves.toBeUndefined();
    expect(routeEntityDrafts).not.toHaveBeenCalled();
  });
});

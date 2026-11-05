/**
 * STARFORGED COMPANION
 * tests/unit/telemetryFlagCopy.test.js
 *
 * Issue #331 X42 (TELEMETRY-FLAG-CACHED-MUTATE). Every pacing decision,
 * consistency check and narrator call appends a record to a "Pacing
 * Telemetry" page: the writer took `prev.entries` from page.getFlag(...) —
 * the page's own stored array, by reference — pushed the record (and shifted
 * the oldest past 200), and only then called setFlag. A refused flag write
 * left this client's page holding an entry the world never took and, at the
 * cap, missing one the world still has. The record is appended on a copy now.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { logPacingDecision, logConsistencyDecision, logNarratorUsage } from "../../src/pacing/telemetry.js";

const MODULE_ID    = "starforged-companion";
const JOURNAL_NAME = "Pacing Telemetry";

/** The telemetry journal with one existing page whose flag holds `entries`. */
function installJournal(pageName, flagKey, entries, { refuse = false } = {}) {
  const flags = { [`${MODULE_ID}.${flagKey}`]: { entries, sessionNumber: 1, sessionId: "s1" } };
  const page = {
    id: "p1", name: pageName,
    getFlag: (m, k) => flags[`${m}.${k}`],
    setFlag: vi.fn(async (m, k, v) => {
      if (refuse) throw new Error("test: the world refused the flag write");
      flags[`${m}.${k}`] = v;
    }),
    update: vi.fn(async () => {}),
  };
  const journal = {
    id: "j1", name: JOURNAL_NAME,
    pages: { contents: [page] },
    createEmbeddedDocuments: vi.fn(async () => []),
  };
  const prevGetName = game.journal.getName;
  game.journal.getName = (n) => (n === JOURNAL_NAME ? journal : prevGetName(n));
  return {
    page,
    stored: () => flags[`${MODULE_ID}.${flagKey}`],
    restore: () => { game.journal.getName = prevGetName; },
  };
}

const seedEntries = (n) => Array.from({ length: n }, (_, i) => ({ ts: `t${i}`, decision: "NARRATIVE", text: `line ${i}` }));

describe("X42 — a telemetry record is appended on a copy of the page's entries", () => {
  let installed = null;
  beforeEach(() => { game.user.isGM = true; });
  afterEach(() => { installed?.restore(); installed = null; });

  it("logPacingDecision: a refused page write leaves the page's cached entries as the world holds them", async () => {
    const entries = seedEntries(1);
    installed = installJournal("Session 1", "pacingTelemetry", entries, { refuse: true });
    await logPacingDecision({ sessionNumber: 1, decision: "MOVE", category: "combat", playerText: "I strike.", reasoning: "" });
    expect(installed.page.setFlag).toHaveBeenCalledTimes(1);
    // The world refused the record (it was pushed onto the live array before the write).
    expect(installed.stored().entries).toHaveLength(1);
    expect(entries).toHaveLength(1);
  });

  it("logPacingDecision at the cap: a refused write does not drop the oldest entry from the client's copy", async () => {
    const entries = seedEntries(200);
    installed = installJournal("Session 1", "pacingTelemetry", entries, { refuse: true });
    await logPacingDecision({ sessionNumber: 1, decision: "MOVE", category: "combat", playerText: "I strike.", reasoning: "" });
    // The oldest record still first: the world still has it (it was shifted off locally).
    expect(installed.stored().entries[0]?.ts).toBe("t0");
    expect(installed.stored().entries).toHaveLength(200);
  });

  it("logConsistencyDecision: a refused page write leaves the page's cached entries as the world holds them", async () => {
    const entries = seedEntries(1);
    installed = installJournal("Consistency Check", "consistencyCheckTelemetry", entries, { refuse: true });
    await logConsistencyDecision({ sceneId: "sc-1", prose: "The hatch sighs.", contradictions: [], dispatched: false });
    expect(installed.page.setFlag).toHaveBeenCalledTimes(1);
    expect(installed.stored().entries).toHaveLength(1);
  });

  it("logNarratorUsage: a refused page write leaves the page's cached entries as the world holds them", async () => {
    const entries = seedEntries(1);
    installed = installJournal("Narrator Usage", "narratorUsageTelemetry", entries, { refuse: true });
    await logNarratorUsage({ label: "narrate", inputTokens: 10, outputTokens: 5, elapsedMs: 12 });
    expect(installed.page.setFlag).toHaveBeenCalledTimes(1);
    expect(installed.stored().entries).toHaveLength(1);
  });

  it("control: a page write the world takes lands the record", async () => {
    installed = installJournal("Session 1", "pacingTelemetry", seedEntries(1));
    await logPacingDecision({ sessionNumber: 1, decision: "MOVE", category: "combat", playerText: "I strike.", reasoning: "" });
    expect(installed.page.setFlag).toHaveBeenCalledTimes(1);
    expect(installed.stored().entries).toHaveLength(2);
    expect(installed.stored().entries[1].decision).toBe("MOVE");
  });

  it("at the cap, a write the world takes drops the oldest from the written copy", async () => {
    installed = installJournal("Session 1", "pacingTelemetry", seedEntries(200));
    await logPacingDecision({ sessionNumber: 1, decision: "MOVE", category: "combat", playerText: "I strike.", reasoning: "" });
    expect(installed.stored().entries).toHaveLength(200);
    expect(installed.stored().entries[0].ts).toBe("t1");
    expect(installed.stored().entries.at(-1).decision).toBe("MOVE");
  });
});

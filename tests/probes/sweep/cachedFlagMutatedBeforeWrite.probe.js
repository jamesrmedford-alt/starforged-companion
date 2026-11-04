/**
 * PROBE — SWEEP-01 TELEMETRY-FLAG-CACHED-MUTATE (sweep auditor, family 1:
 * cached-by-reference mutation before a refusable write — on a Document flag)
 *
 * What the user does: plays normally on the GM's client. The pacing router,
 * the consistency check and every narrator call each append a telemetry
 * record to a page of the "Pacing Telemetry" journal.
 *
 * What happens: src/pacing/telemetry.js:66-70 (logPacingDecision), :126-130
 * (logConsistencyDecision) and :195-199 (writeNarratorUsage, through
 * logNarratorUsage) read the page's flag with `existing.getFlag(MODULE_ID, …)`,
 * take `prev.entries` — the page document's own stored array, BY REFERENCE —
 * `push` the new record onto it (and `shift()` the oldest off past 200), and
 * only then `setFlag`. A refused setFlag (a server error, a dropped socket)
 * leaves this client's copy of the page holding an entry the world never took
 * (the next successful write carries it in anyway) and, past the cap, missing
 * an entry the world still has. rules/foundry-api.md's cached-by-reference
 * rule (issue #321 U58, #326 W51: "a refusable write changes a copy") applies
 * to a Document's flags exactly as to `game.settings.get`: `getFlag` returns
 * the stored object by reference.
 *
 * What should happen: the record is appended to a copy (`[...entries, record]`)
 * so a refused write leaves the page's flag as the world holds it.
 *
 * Controls: a page whose setFlag succeeds gains the record (the write lands).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sweep/cachedFlagMutatedBeforeWrite.probe.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { logPacingDecision, logConsistencyDecision, logNarratorUsage } from "../../../src/pacing/telemetry.js";

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

describe("PROBE SWEEP-01 TELEMETRY-FLAG-CACHED-MUTATE", () => {
  let installed = null;
  beforeEach(() => { game.user.isGM = true; });
  afterEach(() => { installed?.restore(); installed = null; });

  it("logPacingDecision: a refused page write leaves the page's cached entries as the world holds them", async () => {
    const entries = seedEntries(1);
    installed = installJournal("Session 1", "pacingTelemetry", entries, { refuse: true });
    await logPacingDecision({ sessionNumber: 1, decision: "MOVE", category: "combat", playerText: "I strike.", reasoning: "" });
    expect(installed.page.setFlag).toHaveBeenCalledTimes(1);
    // Expected: 1 (the world refused the record). Today: 2 — pushed onto the live array before the write.
    expect.soft(installed.stored().entries).toHaveLength(1);
    expect.soft(entries).toHaveLength(1);
  });

  it("logPacingDecision at the cap: a refused write does not drop the oldest entry from the client's copy", async () => {
    const entries = seedEntries(200);
    installed = installJournal("Session 1", "pacingTelemetry", entries, { refuse: true });
    await logPacingDecision({ sessionNumber: 1, decision: "MOVE", category: "combat", playerText: "I strike.", reasoning: "" });
    // Expected: the oldest record still first (the world still has it). Today: shifted off locally.
    expect.soft(installed.stored().entries[0]?.ts).toBe("t0");
    expect.soft(installed.stored().entries).toHaveLength(200);
  });

  it("logConsistencyDecision: a refused page write leaves the page's cached entries as the world holds them", async () => {
    const entries = seedEntries(1);
    installed = installJournal("Consistency Check", "consistencyCheckTelemetry", entries, { refuse: true });
    await logConsistencyDecision({ sceneId: "sc-1", prose: "The hatch sighs.", contradictions: [], dispatched: false });
    expect(installed.page.setFlag).toHaveBeenCalledTimes(1);
    expect.soft(installed.stored().entries).toHaveLength(1);
  });

  it("logNarratorUsage: a refused page write leaves the page's cached entries as the world holds them", async () => {
    const entries = seedEntries(1);
    installed = installJournal("Narrator Usage", "narratorUsageTelemetry", entries, { refuse: true });
    await logNarratorUsage({ label: "narrate", inputTokens: 10, outputTokens: 5, elapsedMs: 12 });
    expect(installed.page.setFlag).toHaveBeenCalledTimes(1);
    expect.soft(installed.stored().entries).toHaveLength(1);
  });

  it("control: a page write the world takes lands the record", async () => {
    installed = installJournal("Session 1", "pacingTelemetry", seedEntries(1));
    await logPacingDecision({ sessionNumber: 1, decision: "MOVE", category: "combat", playerText: "I strike.", reasoning: "" });
    expect(installed.page.setFlag).toHaveBeenCalledTimes(1);
    expect(installed.stored().entries).toHaveLength(2);
    expect(installed.stored().entries[1].decision).toBe("MOVE");
  });
});

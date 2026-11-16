/**
 * MOVA-07 · TELEMETRY-JOURNAL-BY-NAME (DEAD write / IDENTITY-BY-NAME)
 *
 * Scenario: the first pacing decision of a world creates the "Pacing
 * Telemetry" journal and stamps it `flags.starforged-companion
 * .pacingTelemetryRoot: true` (pacing/telemetry.js getOrCreateJournal). A GM
 * renames the journal — "Telemetry (campaign 2)", or just files it under
 * another title. The next decision, consistency check or narrator call is
 * logged.
 *
 * Correct: the journal the module stamped is found by that stamp, and the new
 * record joins it (rules/reachability.md §6 — identity by a stable id, the
 * name a fallback; the Progress Tracks journal is found by its flag since
 * issue #345 AA62).
 *
 * Today: `findJournal` looks the journal up by its name alone
 * (`game.journal.getName("Pacing Telemetry")`); nothing reads
 * `pacingTelemetryRoot` (a write with no reader). After the rename a second
 * "Pacing Telemetry" journal is created and the Narrator Usage, Consistency
 * Check and per-session pacing pages split across the two — the cache-read
 * share and the median call time the usage page reports restart from zero.
 *
 * Production functions: pacing/telemetry.js logPacingDecision / logNarratorUsage,
 * against a journal collection stub that keeps each created journal's flags.
 */

/* global structuredClone */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { logPacingDecision, logNarratorUsage } from "../../../src/pacing/telemetry.js";

const MODULE_ID = "starforged-companion";

let created, savedJournal, savedJournalEntry;

function makeJournal(data) {
  const docFlags = structuredClone(data.flags ?? {});
  const j = {
    name: data.name, flags: docFlags, pages: { contents: [] },
    getFlag: (scope, key) => docFlags[scope]?.[key],
    createEmbeddedDocuments: async (_type, docs) => {
      for (const doc of docs) {
        const flags = structuredClone(doc.flags ?? {});
        j.pages.contents.push({
          name: doc.name,
          getFlag: (scope, key) => flags[scope]?.[key],
          setFlag: async (scope, key, value) => { (flags[scope] ??= {})[key] = structuredClone(value); },
          update: async () => {},
        });
      }
    },
  };
  return j;
}

const decision = (text) => ({
  playerText: text, decision: "NARRATIVE", suggestedMove: null, category: "exploration",
  confidence: 0.8, reasoning: "test", fallback: false, sessionId: "s1", sessionNumber: 1,
});
const pacingEntries = (j) => j.pages.contents.flatMap(p => p.getFlag(MODULE_ID, "pacingTelemetry")?.entries ?? []);

beforeEach(() => {
  created = [];
  savedJournal = game.journal;
  savedJournalEntry = globalThis.JournalEntry;
  game.user.isGM = true;
  game.journal = {
    getName: (name) => created.find(j => j.name === name) ?? null,
    find:    (fn)   => created.find(fn) ?? null,
  };
  globalThis.JournalEntry = { create: async (data) => { const j = makeJournal(data); created.push(j); return j; } };
});
afterEach(() => { game.journal = savedJournal; globalThis.JournalEntry = savedJournalEntry; });

describe("MOVA-07 — the telemetry journal is the one the module stamped, whatever it is called", () => {
  it("control: the journal is stamped when it is made, and a second record joins it", async () => {
    await logPacingDecision(decision("I scan the hull."));
    expect(created).toHaveLength(1);
    expect(created[0].getFlag(MODULE_ID, "pacingTelemetryRoot")).toBe(true);
    await logPacingDecision(decision("I hail the station."));
    expect(created).toHaveLength(1);
    expect(pacingEntries(created[0])).toHaveLength(2);
  });

  it("renamed by the GM: the next records still go to it — no second journal is made", async () => {
    await logPacingDecision(decision("I scan the hull."));
    created[0].name = "Telemetry (campaign 2)";

    await logPacingDecision(decision("I hail the station."));
    await logNarratorUsage({ label: "narrateResolution", model: "m", usage: { input_tokens: 10 }, elapsedMs: 5 });

    expect(created.map(j => j.name)).toEqual(["Telemetry (campaign 2)"]);
    expect(pacingEntries(created[0])).toHaveLength(2);
  });
});

/**
 * PROBE — SESSION-07 TELEMETRY-JOURNAL-DUPLICATED (ninth audit, area session)
 *
 * What the user does: two players type at the same moment in a world that has
 * no "Pacing Telemetry" journal yet (the first session, or after the GM
 * deleted it). The classifier runs for both lines — it runs freely, before
 * the move lock (src/pacing/router.js header "Concurrency") — and each
 * decision is logged (`logPacingDecision`, src/pacing/telemetry.js:40-85).
 *
 * What happens: `getOrCreateJournal` (:226-249) looks the journal up, finds
 * none, and `await JournalEntry.create(...)`; the second call looks it up
 * during the first's round trip, finds none too, and creates a second
 * "Pacing Telemetry" journal. From then on `findJournal` (`getName`) returns
 * whichever Foundry lists first, so the session's decisions, the consistency
 * checks and the narrator-usage records are split across two journals and the
 * GM tuning the dials reads half a log. The narrator-usage writer serialises
 * itself for exactly this reason (`_usageWrites`, :146-167) — the pacing
 * writer does not, and the two writers are not serialised with each other
 * either.
 *
 * What should happen: one journal — get-or-create is keyed and serialised
 * (rules/reachability.md §7: "a 'create the folder / entity' path must be
 * get-or-create keyed on a stable id, never an unconditional create").
 *
 * Control: two sequential decisions create one journal with two entries
 * (today: passes).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/session/pacingTelemetryJournalRace.probe.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { logPacingDecision } from '../../../src/pacing/telemetry.js';

const MODULE_ID = 'starforged-companion';

let created;
let savedJournal;
let savedJournalEntry;

function makeJournal(name) {
  const j = {
    name, pages: { contents: [] },
    createEmbeddedDocuments: async (_type, docs) => {
      for (const doc of docs) {
        const flags = structuredClone(doc.flags ?? {});
        j.pages.contents.push({
          name: doc.name, content: doc.text?.content ?? '',
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
  playerText: text, decision: 'NARRATIVE', suggestedMove: null, category: 'exploration',
  confidence: 0.8, reasoning: 'test', fallback: false, sessionId: 's1', sessionNumber: 1,
});
const entries = () => created.flatMap(j => j.pages.contents.flatMap(p => p.getFlag(MODULE_ID, 'pacingTelemetry')?.entries ?? []));

beforeEach(() => {
  created = [];
  savedJournal = game.journal;
  savedJournalEntry = globalThis.JournalEntry;
  game.user.isGM = true;
  game.journal = {
    getName: (name) => created.find(j => j.name === name) ?? null,
    find:    (fn)   => created.find(fn) ?? null,
  };
  // Foundry: a document create is a server round trip.
  globalThis.JournalEntry = { create: async (data) => { await new Promise(r => setTimeout(r, 0)); const j = makeJournal(data.name); created.push(j); return j; } };
});
afterEach(() => { game.journal = savedJournal; globalThis.JournalEntry = savedJournalEntry; });

describe('SESSION-07 two classifier decisions logged together create the telemetry journal twice', () => {
  it('two concurrent decisions: one "Pacing Telemetry" journal, both entries in it', async () => {
    await Promise.all([logPacingDecision(decision('I scan the hull.')), logPacingDecision(decision('I hail the station.'))]);
    // FAILS today: two journals named "Pacing Telemetry", one entry each.
    expect(created.map(j => j.name)).toEqual(['Pacing Telemetry']);
    expect(entries().map(e => e.text).sort()).toEqual(['I hail the station.', 'I scan the hull.']);
  });

  it('control: two sequential decisions share one journal and one page', async () => {
    await logPacingDecision(decision('I scan the hull.'));
    await logPacingDecision(decision('I hail the station.'));
    expect(created).toHaveLength(1);
    expect(created[0].pages.contents.map(p => p.name)).toEqual(['Session 1']);
    expect(entries()).toHaveLength(2);
  });
});

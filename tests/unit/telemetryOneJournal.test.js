/**
 * STARFORGED COMPANION
 * tests/unit/telemetryOneJournal.test.js
 *
 * Issue #331 X39 (TELEMETRY-JOURNAL-DUPLICATED). Two lines typed together in
 * a world with no "Pacing Telemetry" journal: the classifier ran for both
 * before the move lock, each logPacingDecision → getOrCreateJournal found
 * none and created one — two journals of that name, and getName returns
 * whichever Foundry lists first, so pacing decisions, consistency checks and
 * narrator usage split across them. The usage writer serialised itself; the
 * pacing writer did not, and the three were not serialised with each other.
 * One queue now runs every telemetry write in turn.
 */

/* global structuredClone */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { logPacingDecision, logConsistencyDecision, logNarratorUsage } from '../../src/pacing/telemetry.js';

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

describe('X39 — telemetry written together goes to one journal', () => {
  it('two concurrent decisions: one "Pacing Telemetry" journal, both entries in it', async () => {
    await Promise.all([logPacingDecision(decision('I scan the hull.')), logPacingDecision(decision('I hail the station.'))]);
    // It made two journals named "Pacing Telemetry", one entry each.
    expect(created.map(j => j.name)).toEqual(['Pacing Telemetry']);
    expect(entries().map(e => e.text).sort()).toEqual(['I hail the station.', 'I scan the hull.']);
    expect(created[0].pages.contents.map(p => p.name)).toEqual(['Session 1']);   // one page too
  });

  it('the three writers together: one journal, each page once', async () => {
    await Promise.all([
      logPacingDecision(decision('I scan the hull.')),
      logConsistencyDecision({ sceneId: 'sc-1', sessionId: 's1', prose: 'The hull holds.', contradictions: [] }),
      logNarratorUsage({ label: 'narrateResolution', model: 'm', usage: { input_tokens: 10 }, elapsedMs: 5 }),
      logPacingDecision(decision('I hail the station.')),
    ]);
    expect(created.map(j => j.name)).toEqual(['Pacing Telemetry']);
    expect(created[0].pages.contents.map(p => p.name).sort()).toEqual(['Consistency Check', 'Narrator Usage', 'Session 1']);
    expect(entries()).toHaveLength(2);
  });

  it('control: two sequential decisions share one journal and one page', async () => {
    await logPacingDecision(decision('I scan the hull.'));
    await logPacingDecision(decision('I hail the station.'));
    expect(created).toHaveLength(1);
    expect(created[0].pages.contents.map(p => p.name)).toEqual(['Session 1']);
    expect(entries()).toHaveLength(2);
  });
});

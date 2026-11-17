/**
 * STARFORGED COMPANION
 * tests/unit/telemetryJournalFoundByFlag.test.js
 *
 * Issue #362 AC47 TELEMETRY-JOURNAL-BY-NAME — the first pacing decision of a
 * world creates the "Pacing Telemetry" journal and stamps it
 * `pacingTelemetryRoot`. The stamp had no reader: the journal was found again
 * by its name alone, so after a GM renamed it the next decision, consistency
 * check or narrator call made a second "Pacing Telemetry" journal, splitting
 * the usage, consistency and per-session pacing pages across the two. It is
 * now found by the stamp, the name a fallback (rules/reachability.md §6; the
 * Progress Tracks journal's rule, issue #345 AA62).
 *
 * Production functions: logPacingDecision / logNarratorUsage, against a
 * journal collection stub that keeps each created journal's flags.
 */

/* global structuredClone */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { logPacingDecision, logNarratorUsage } from '../../src/pacing/telemetry.js';

const MODULE_ID = 'starforged-companion';

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
  playerText: text, decision: 'NARRATIVE', suggestedMove: null, category: 'exploration',
  confidence: 0.8, reasoning: 'test', fallback: false, sessionId: 's1', sessionNumber: 1,
});
const pacingEntries = (j) => j.pages.contents.flatMap(p => p.getFlag(MODULE_ID, 'pacingTelemetry')?.entries ?? []);

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

describe('issue #362 AC47 — the telemetry journal is the one the module stamped, whatever it is called', () => {
  it('control: the journal is stamped when it is made, and a second record joins it', async () => {
    await logPacingDecision(decision('I scan the hull.'));
    expect(created).toHaveLength(1);
    expect(created[0].getFlag(MODULE_ID, 'pacingTelemetryRoot')).toBe(true);
    await logPacingDecision(decision('I hail the station.'));
    expect(created).toHaveLength(1);
    expect(pacingEntries(created[0])).toHaveLength(2);
  });

  it('renamed by the GM: the next records still go to it — no second journal is made', async () => {
    await logPacingDecision(decision('I scan the hull.'));
    created[0].name = 'Telemetry (campaign 2)';

    await logPacingDecision(decision('I hail the station.'));
    await logNarratorUsage({ label: 'narrateResolution', model: 'm', usage: { input_tokens: 10 }, elapsedMs: 5 });

    expect(created.map(j => j.name)).toEqual(['Telemetry (campaign 2)']);
    expect(pacingEntries(created[0])).toHaveLength(2);
    expect(created[0].pages.contents.map(p => p.name).sort()).toEqual(['Narrator Usage', 'Session 1']);
  });

  it('control: a journal of the name made before the stamp is still found by its name', async () => {
    created.push(makeJournal({ name: 'Pacing Telemetry' }));   // no stamp
    await logPacingDecision(decision('I scan the hull.'));
    expect(created).toHaveLength(1);
    expect(pacingEntries(created[0])).toHaveLength(1);
  });

  it('a stamped journal wins over an unstamped one of the name; among stamped copies the default-named one leads', async () => {
    created.push(makeJournal({ name: 'Pacing Telemetry' }));                                                    // a GM's own notes, unstamped
    created.push(makeJournal({ name: 'Telemetry (copy)', flags: { [MODULE_ID]: { pacingTelemetryRoot: true } } }));
    created.push(makeJournal({ name: 'Pacing Telemetry', flags: { [MODULE_ID]: { pacingTelemetryRoot: true } } }));
    await logPacingDecision(decision('I scan the hull.'));
    expect(created).toHaveLength(3);
    expect(created.map(pacingEntries).map(e => e.length)).toEqual([0, 0, 1]);
  });
});

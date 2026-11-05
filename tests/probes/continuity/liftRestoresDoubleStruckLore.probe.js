/**
 * PROBE — CONT-06 LIFT-RESTORES-LORE-ANOTHER-STRIKE-STILL-RETRACTS
 *
 * What the user does: the narrator establishes two facts about Vance — "Is
 * dead" and "His body was dumped at Bleakhold" — and the detection pass
 * records one confirmed Lore entry, "Vance's fate", stating both. The GM
 * strikes both facts (`!truth strike …` twice), then changes their mind about
 * the first only: `!truth set "Vance" Is dead` (issue #326 W60: the set lifts
 * that strike; issue #331 X31: the lift restores the lore the strike
 * retracted).
 *
 * What happens: the first strike retracted the entry and stamped it
 * `retractedByTruth: <T1>`; the second strike skipped it (retractSessionLore
 * passes over an entry already retracted — worldJournal.js:571), so the entry
 * remembers only the first strike. Lifting T1 restores the entry to confirmed
 * canon although T2 still stands: the next prompt carries "Vance's fate:
 * Vance is dead; his body was dumped at Bleakhold" under ESTABLISHED LORE and
 * "Vance — His body was dumped at Bleakhold … do NOT re-assert" under
 * CORRECTED — the conflict W60 exists to prevent.
 *
 * What should happen: a lifted strike restores only lore no other standing
 * strike retracts (rules/narrator-memory.md 6b: "so the two never render
 * together"; decisions "A strike reaches every copy of the fact") — either
 * restoreStruckLore re-checks the entry against the session's standing
 * strikes, or retractSessionLore records every strike that matches.
 *
 * Control: with only T1 struck, the lift restores the entry (X31).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/continuity/liftRestoresDoubleStruckLore.probe.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startScene } from '../../../src/factContinuity/sceneLifecycle.js';
import { applySidecar } from '../../../src/factContinuity/ledgers.js';
import { applyFactContinuityCommand } from '../../../src/factContinuity/chatCommands.js';
import { sessionRetractedFacts } from '../../../src/factContinuity/retractions.js';
import { getConfirmedLore, recordLoreDiscovery, JOURNAL_NAMES } from '../../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');

function makeJournal(name) {
  const pages = [];
  const journal = {
    id: `journal-${name}`, name, flags: {},
    pages: { get contents() { return pages; }, find: (fn) => pages.find(fn) },
    createEmbeddedDocuments: async (_type, docs) => { const created = docs.map(makePage); pages.push(...created); return created; },
    setFlag: async (mod, key, val) => { (journal.flags[mod] ??= {})[key] = val; },
    getFlag: (mod, key) => journal.flags?.[mod]?.[key],
  };
  return journal;
}
function makePage(doc) {
  const page = {
    id: `page-${doc.name}-${Math.random().toString(36).slice(2, 8)}`,
    name: doc.name, type: doc.type ?? 'text', text: doc.text ?? null,
    flags: JSON.parse(JSON.stringify(doc.flags ?? {})),
    setFlag: async (mod, key, val) => { (page.flags[mod] ??= {})[key] = val; },
    getFlag: (mod, key) => page.flags?.[mod]?.[key],
    update: async (data) => Object.assign(page, data),
    delete: async () => {},
  };
  return page;
}

let journals, orig;
beforeEach(() => {
  journals = new Map();
  orig = { get: game.journal.get, getName: game.journal.getName, find: game.journal.find, create: global.JournalEntry?.create, user: global.game.user };
  game.journal.get     = (id) => [...journals.values()].find(j => j.id === id) ?? null;
  game.journal.getName = (n) => journals.get(n) ?? null;
  game.journal.find    = (fn) => [...journals.values()].find(fn) ?? null;
  global.JournalEntry  = { create: async (data) => { const j = makeJournal(data.name); journals.set(data.name, j); return j; } };
  global.game.user = { ...(global.game.user ?? {}), isGM: true, name: 'Test GM' };
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: null,
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null, dismissedEntities: [],
  });
});
afterEach(() => {
  game.journal.get = orig.get; game.journal.getName = orig.getName; game.journal.find = orig.find;
  global.JournalEntry = { create: orig.create };
  global.game.user = orig.user;
});

const TITLE = "Vance's fate";
const loreEntry = () => journals.get(JOURNAL_NAMES.lore)?.pages.contents.find(p => p.name === TITLE)?.flags[MODULE_ID]?.loreEntry;
const canon = () => getConfirmedLore(stored()).map(e => e.title);
const truthFor = (fact) => stored().sceneTruths.find(t => t.fact === fact);
const gm = (text) => applyFactContinuityCommand({ text }, { requesterIsGM: true });

/** The narration asserts both facts; its capture records one confirmed lore entry stating both. */
async function narrateAndCapture() {
  await startScene(stored(), { reason: 'test' });
  applySidecar({ newTruths: [
    { subject: 'Vance', fact: 'Is dead' },
    { subject: 'Vance', fact: 'His body was dumped at Bleakhold' },
  ], stateChanges: [] }, { campaignState: stored(), narrationId: 'nar-1' });
  await recordLoreDiscovery(TITLE, {
    text: 'Vance is dead; his body was dumped at Bleakhold.', category: 'other',
    narratorAsserted: true, confirmed: true, narrationId: 'nar-1',
  }, stored());
  expect(canon()).toContain(TITLE);
}

describe('CONT-06 — a lifted strike restores only lore no other standing strike retracts', () => {
  it('control: with one strike, lifting it restores the entry (issue #331 X31)', async () => {
    await narrateAndCapture();
    await gm(`!truth strike ${truthFor('Is dead').id.slice(0, 8)}`);
    expect(loreEntry()).toMatchObject({ retracted: true, confirmed: false });
    await gm('!truth set "Vance" Is dead');
    expect(loreEntry()).toMatchObject({ retracted: false, confirmed: true });
    expect(canon()).toContain(TITLE);
  });

  it('with both facts struck, lifting the first leaves the entry retracted — the second strike still stands', async () => {
    await narrateAndCapture();
    await gm(`!truth strike ${truthFor('Is dead').id.slice(0, 8)}`);
    await gm(`!truth strike ${truthFor('His body was dumped at Bleakhold').id.slice(0, 8)}`);
    expect(loreEntry()).toMatchObject({ retracted: true });                                   // control: both struck, the entry is out

    await gm('!truth set "Vance" Is dead');
    // control: only the first strike is lifted; the second is still under CORRECTED
    expect(truthFor('Is dead')).toMatchObject({ retracted: true, correctedTo: expect.any(String) });
    expect(truthFor('His body was dumped at Bleakhold')).toMatchObject({ retracted: true, correctedTo: null });
    expect(sessionRetractedFacts(stored()).map(f => f.fact)).toEqual(['His body was dumped at Bleakhold']);

    expect.soft(loreEntry().confirmed, 'the entry confirmed').toBe(false);
    expect(canon(), 'ESTABLISHED LORE').not.toContain(TITLE);
  });
});

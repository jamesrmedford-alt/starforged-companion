/**
 * STARFORGED COMPANION
 * tests/unit/liftRestoresDoubleStruckLore.test.js
 *
 * Issue #336 Y32 (LIFT-RESTORES-LORE-ANOTHER-STRIKE-STILL-RETRACTS). The
 * narrator asserts "Vance — Is dead" and "Vance — His body was dumped at
 * Bleakhold"; the capture records one confirmed Lore entry, "Vance's fate",
 * stating both. The GM strikes both, then re-sets only the first
 * (`!truth set "Vance" Is dead` — issue #326 W60 lifts that strike, issue
 * #331 X31 restores the lore it retracted). The first strike retracted the
 * entry (`retractedByTruth: <T1>`); the second passed over it (already
 * retracted), so the entry remembered only T1, and the lift restored it to
 * confirmed canon while T2 still stood: the next prompt carried it under
 * ESTABLISHED LORE and T2 under CORRECTED "do NOT re-assert" — the conflict
 * W60 exists to prevent (rules/narrator-memory.md 6b: "so the two never
 * render together").
 *
 * A lifted strike now restores only lore no other standing strike of the
 * session states (the active scene's bare strikes and the earlier scenes'
 * `sessionRetractions`): restoreStruckLore skips an entry one of them still
 * matches. The stored shape is X31's single `retractedByTruth`, so a world
 * from before keeps working.
 *
 * (From the tenth audit's probe
 * tests/probes/continuity/liftRestoresDoubleStruckLore.probe.js.)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startScene } from '../../src/factContinuity/sceneLifecycle.js';
import { applySidecar } from '../../src/factContinuity/ledgers.js';
import { applyFactContinuityCommand } from '../../src/factContinuity/chatCommands.js';
import { sessionRetractedFacts } from '../../src/factContinuity/retractions.js';
import { getConfirmedLore, recordLoreDiscovery, JOURNAL_NAMES } from '../../src/world/worldJournal.js';

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
const DEAD  = 'Is dead';
const BODY  = 'His body was dumped at Bleakhold';
const loreEntry = () => journals.get(JOURNAL_NAMES.lore)?.pages.contents.find(p => p.name === TITLE)?.flags[MODULE_ID]?.loreEntry;
const canon = () => getConfirmedLore(stored()).map(e => e.title);
const truthFor = (fact) => stored().sceneTruths.find(t => t.fact === fact);
const gm = (text) => applyFactContinuityCommand({ text }, { requesterIsGM: true });

/** The narration asserts both facts; its capture records one confirmed lore entry stating both. */
async function narrateAndCapture() {
  await startScene(stored(), { reason: 'test' });
  applySidecar({ newTruths: [
    { subject: 'Vance', fact: DEAD },
    { subject: 'Vance', fact: BODY },
  ], stateChanges: [] }, { campaignState: stored(), narrationId: 'nar-1' });
  await recordLoreDiscovery(TITLE, {
    text: 'Vance is dead; his body was dumped at Bleakhold.', category: 'other',
    narratorAsserted: true, confirmed: true, narrationId: 'nar-1',
  }, stored());
  expect(canon()).toContain(TITLE);
}

describe('issue #336 Y32 — a lifted strike restores only lore no other standing strike retracts', () => {
  it('control: with one strike, lifting it restores the entry (issue #331 X31)', async () => {
    await narrateAndCapture();
    await gm(`!truth strike ${truthFor(DEAD).id.slice(0, 8)}`);
    expect(loreEntry()).toMatchObject({ retracted: true, confirmed: false });
    await gm(`!truth set "Vance" ${DEAD}`);
    expect(loreEntry()).toMatchObject({ retracted: false, confirmed: true });
    expect(canon()).toContain(TITLE);
  });

  it('with both facts struck, lifting the first leaves the entry retracted — the second strike still stands', async () => {
    await narrateAndCapture();
    await gm(`!truth strike ${truthFor(DEAD).id.slice(0, 8)}`);
    await gm(`!truth strike ${truthFor(BODY).id.slice(0, 8)}`);
    expect(loreEntry()).toMatchObject({ retracted: true });

    await gm(`!truth set "Vance" ${DEAD}`);
    // control: only the first strike is lifted; the second is still under CORRECTED
    expect(truthFor(DEAD)).toMatchObject({ retracted: true, correctedTo: expect.any(String) });
    expect(truthFor(BODY)).toMatchObject({ retracted: true, correctedTo: null });
    expect(sessionRetractedFacts(stored()).map(f => f.fact)).toEqual([BODY]);

    expect(loreEntry()).toMatchObject({ retracted: true, confirmed: false });
    expect(canon()).not.toContain(TITLE);
  });

  it.each([
    ['the first, then the second', [DEAD, BODY]],
    ['the second, then the first', [BODY, DEAD]],
  ])('lifting both strikes — %s — restores the entry as it stood before them', async (_order, lifts) => {
    await narrateAndCapture();
    await gm(`!truth strike ${truthFor(DEAD).id.slice(0, 8)}`);
    await gm(`!truth strike ${truthFor(BODY).id.slice(0, 8)}`);

    await gm(`!truth set "Vance" ${lifts[0]}`);
    expect(loreEntry()).toMatchObject({ retracted: true, confirmed: false });   // the other strike still stands
    await gm(`!truth set "Vance" ${lifts[1]}`);

    expect(sessionRetractedFacts(stored())).toEqual([]);
    expect(loreEntry()).toMatchObject({ retracted: false, confirmed: true });
    expect(canon()).toContain(TITLE);
  });

  it('an X-Card retraction that states the entry keeps it retracted — the lift never undoes the X-Card', async () => {
    await narrateAndCapture();
    await gm(`!truth strike ${truthFor(DEAD).id.slice(0, 8)}`);
    // The X-Card later removed the narration of the second fact (never lifted, U07).
    const body = truthFor(BODY);
    Object.assign(body, { retracted: true, retractedBy: 'xcard', retractedAt: 9 });
    await gm(`!truth set "Vance" ${DEAD}`);
    expect(loreEntry()).toMatchObject({ retracted: true, confirmed: false });
    expect(canon()).not.toContain(TITLE);
  });

  it("a strike from an earlier scene of the session that states the entry keeps it retracted too", async () => {
    await narrateAndCapture();
    await gm(`!truth strike ${truthFor(DEAD).id.slice(0, 8)}`);
    // An earlier scene's strike of the second fact, kept for the session (endScene → rememberSessionRetractions).
    const cs = stored();
    cs.sessionRetractions = { sessionId: 'sess-1', facts: [{ label: 'Vance', fact: BODY, sceneId: 'sc-old', at: 1 }] };
    await gm(`!truth set "Vance" ${DEAD}`);
    expect(loreEntry()).toMatchObject({ retracted: true, confirmed: false });
    expect(canon()).not.toContain(TITLE);
  });

  it("control: another standing strike about something else does not hold the entry", async () => {
    await narrateAndCapture();
    applySidecar({ newTruths: [{ subject: 'the dockmaster', fact: 'Is dead' }], stateChanges: [] },
      { campaignState: stored(), narrationId: 'nar-2' });
    const docks = stored().sceneTruths.find(t => t.subject?.text === 'the dockmaster');
    await gm(`!truth strike ${truthFor(DEAD).id.slice(0, 8)}`);
    await gm(`!truth strike ${docks.id.slice(0, 8)}`);              // the dockmaster's death — not Vance's
    await gm(`!truth set "Vance" ${DEAD}`);
    expect(loreEntry()).toMatchObject({ retracted: false, confirmed: true });
  });
});

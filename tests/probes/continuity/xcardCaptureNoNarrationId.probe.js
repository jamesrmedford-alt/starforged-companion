/**
 * PROBE — CONTINUITY-06 XCARD-CAPTURE-NO-NARRATION-ID
 * (src/entities/entityExtractor.js routeWorldJournalResults 1036–1109 — no
 *  narration id reaches it or the records it writes: recordLoreDiscovery /
 *  recordThreat / appendSessionLogBeat / appendMigratedTruthToTier;
 *  src/context/safety.js finishXCardRemoval 218–237 → retractions.js
 *  propagateRetraction 104–132, which reaches only lore / tier details that
 *  OVERLAP a retracted sidecar truth about the same subject)
 *
 * What the user does: a narration posts (the torch beat). Its capture — the
 * combined detection pass, about 2 s later — records what the prose
 * established: a Lore entry ("The interrogation rig", auto-confirmed), a
 * below-salience beat on the running Session Log page, a tier detail on an
 * NPC card. The table then plays the X-Card on that narration and the GM
 * resumes.
 *
 * What happens: the X-Card retracts the narration's sidecar entries by their
 * `narrationId` and runs propagateRetraction for each retracted TRUTH, which
 * takes out only lore / tier details that state that truth about its subject
 * (factsOverlap + the subject rule, issue #321 U39). The capture's records
 * carry no `narrationId` and most of them restate no sidecar truth — a lore
 * item about the rig, a scene-log beat, a tier detail about a bystander — so
 * they stay: the lore entry stays confirmed and is handed back to the narrator
 * as ESTABLISHED LORE ([4f], selectLoreForContext) on the next narration, and
 * the Session Log page keeps the removed beat's lines for every player who
 * opens it.
 *
 * What should happen: rules/narrator-memory.md 6b — "Anything a narration
 * writes outside the ledgers carries its `narrationId` so the X-Card can undo
 * it too — the command vehicle's position does (issue #325 W07)"; decisions.md
 * (issue #321 U07, maintainer: FULL exclusion — "a ledger fact or summary line
 * the removed narration wrote would bring the beat back"). What the capture
 * wrote from the removed prose leaves canon with it. (Known-issues
 * XCARD-LATE-CAPTURE names only the 2 s race — a capture that runs after the
 * card; this is the capture that ran before it, whose records nothing links to
 * the narration.)
 *
 * Controls: the capture's lore is confirmed canon before the X-Card; a lore
 * item that DOES restate the retracted truth about its subject is retracted
 * by the X-Card (the B6 path works where it reaches).
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../../src/narration/narrator.js';
import { suppressScene } from '../../../src/context/safety.js';
import { routeWorldJournalResults } from '../../../src/entities/entityExtractor.js';
import { getConfirmedLore, JOURNAL_NAMES } from '../../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };

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
  orig = { get: game.journal.get, getName: game.journal.getName, find: game.journal.find, create: global.JournalEntry?.create };
  game.journal.get     = (id) => [...journals.values()].find(j => j.id === id) ?? null;
  game.journal.getName = (n) => journals.get(n) ?? null;
  game.journal.find    = (fn) => [...journals.values()].find(fn) ?? null;
  global.JournalEntry  = { create: async (data) => { const j = makeJournal(data.name); journals.set(data.name, j); return j; } };

  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
    connectionIds: [], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
});
afterEach(() => {
  game.journal.get = orig.get; game.journal.getName = orig.getName; game.journal.find = orig.find;
  global.JournalEntry = { create: orig.create };
});

const TORCH = {
  newTruths:    [{ subject: 'the prisoner', fact: 'His hand was burned with a cutting torch' }],
  stateChanges: [],
  sceneFrame:   { location: 'the interrogation cell', present: ['the prisoner'], situation: 'The torch hovers over his hand' },
};

/** A narration as the narrator makes one: the sidecar applied with its id, then its card. */
async function narrate(narrationId, prose, sidecar) {
  const text = applyNarratorSidecar(`${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``, stored(), { narrationId, matchedEntityIds: [] });
  await postNarrationCard(text, { moveId: 'compel', outcome: 'weak_hit', _id: `res-${narrationId}` },
    stored(), { playerText: 'I press the prisoner for the code.', playerName: 'Kira', narrationId });
}

/** What the combined detection pass routes from that prose (the real writer of these records). */
const capture = () => routeWorldJournalResults({
  lore: [
    { title: 'The interrogation rig', text: 'The interrogator keeps a torch rig bolted to the cell floor.', category: 'other', salience: 'defining' },
    { title: "The prisoner's burned hand", text: "The prisoner's hand was burned with a cutting torch during questioning.", category: 'other', salience: 'defining' },
    { title: 'Guard rotation', text: 'Two guards rotate past the cell every hour.', category: 'other', salience: 'scene' },
  ],
  threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [],
}, stored());

const loreTitles = () => getConfirmedLore(stored()).map(e => e.title);
const sessionLogBeats = () => (journals.get(JOURNAL_NAMES.sessionLog)?.pages.contents ?? [])
  .flatMap(p => p.flags[MODULE_ID]?.sessionLogPage?.beats ?? []).map(b => b.title);

describe('CONTINUITY-06 what the capture wrote from an X-carded narration leaves canon with it', () => {
  it('control: before the X-Card the capture\'s lore is confirmed canon and its beat is on the Session Log', async () => {
    await narrate('nar-torch', "The interrogator lifts the cutting torch toward the prisoner's hand.", TORCH);
    await capture();
    expect(loreTitles()).toEqual(expect.arrayContaining(['The interrogation rig', "The prisoner's burned hand"]));
    expect(sessionLogBeats()).toContain('Guard rotation');
  });

  it('after the X-Card on the narration, its captured lore is out of ESTABLISHED LORE and its beat off the Session Log', async () => {
    await narrate('nar-torch', "The interrogator lifts the cutting torch toward the prisoner's hand.", TORCH);
    await capture();
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().sceneTruths.find(t => /cutting torch/.test(t.fact))).toMatchObject({ retracted: true, retractedBy: 'xcard' });
    // control: the lore that restates the retracted truth about the prisoner is reached (B6 / U07).
    expect(loreTitles()).not.toContain("The prisoner's burned hand");

    // Today: the rig lore stays confirmed — the next narration's ESTABLISHED
    // LORE hands the removed beat back — and the beat stays on the Session Log.
    expect(loreTitles()).not.toContain('The interrogation rig');
    expect.soft(sessionLogBeats()).not.toContain('Guard rotation');
  });
});

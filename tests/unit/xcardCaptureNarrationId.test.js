/**
 * STARFORGED COMPANION
 * tests/unit/xcardCaptureNarrationId.test.js
 *
 * Issue #329 X01 (XCARD-CAPTURE-NO-NARRATION-ID) — what the capture wrote
 * from an X-carded narration leaves canon with it.
 *
 * A narration posts; its capture (the combined detection pass, ~2 s later,
 * routeWorldJournalResults) records what the prose established — a confirmed
 * Lore entry, a below-salience beat on the Session Log page, a threat, a tier
 * detail. The X-Card retracted the sidecar's entries by `narrationId` and
 * reached lore only where it restated a retracted truth about its subject
 * (propagateRetraction), so the capture's records stayed: the lore was handed
 * back to the narrator as ESTABLISHED LORE and the Session Log kept the
 * removed beat. Now each record carries the narration's id (an entry the
 * capture rewrote keeps the version before), and the X-Card undoes them by
 * id (retractNarrationCapture): a rewritten entry is put back, a new lore
 * entry retracted, a new threat's page deleted, the beat taken off the page
 * and the tier detail dropped. rules/narrator-memory.md 6b.
 *
 * (Converted from the ninth audit's probe
 * tests/probes/continuity/xcardCaptureNoNarrationId.probe.js.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { routeWorldJournalResults, appendDetailToTier } from '../../src/entities/entityExtractor.js';
import {
  getConfirmedLore, getActiveThreats, recordLoreDiscovery, recordThreat, JOURNAL_NAMES,
} from '../../src/world/worldJournal.js';

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
    createEmbeddedDocuments: async (_type, docs) => { const created = docs.map(d => makePage(d, pages)); pages.push(...created); return created; },
    setFlag: async (mod, key, val) => { (journal.flags[mod] ??= {})[key] = val; },
    getFlag: (mod, key) => journal.flags?.[mod]?.[key],
  };
  return journal;
}
function makePage(doc, pages) {
  const page = {
    id: `page-${doc.name}-${Math.random().toString(36).slice(2, 8)}`,
    name: doc.name, type: doc.type ?? 'text', text: doc.text ?? null,
    flags: JSON.parse(JSON.stringify(doc.flags ?? {})),
    setFlag: async (mod, key, val) => { (page.flags[mod] ??= {})[key] = val; },
    getFlag: (mod, key) => page.flags?.[mod]?.[key],
    update: async (data) => Object.assign(page, data),
    delete: async () => { const i = pages.indexOf(page); if (i >= 0) pages.splice(i, 1); },
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

/** What the combined detection pass routes from that prose (the real writer of these records), with the narration's id as the narrator's capture passes it. */
const capture = (narrationId = 'nar-torch') => routeWorldJournalResults({
  lore: [
    { title: 'The interrogation rig', text: 'The interrogator keeps a torch rig bolted to the cell floor.', category: 'other', salience: 'defining' },
    { title: "The prisoner's burned hand", text: "The prisoner's hand was burned with a cutting torch during questioning.", category: 'other', salience: 'defining' },
    { title: 'Guard rotation', text: 'Two guards rotate past the cell every hour.', category: 'other', salience: 'scene' },
  ],
  threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [],
}, stored(), { narrationId });

const loreTitles = () => getConfirmedLore(stored()).map(e => e.title);
const sessionLogBeats = () => (journals.get(JOURNAL_NAMES.sessionLog)?.pages.contents ?? [])
  .flatMap(p => p.flags[MODULE_ID]?.sessionLogPage?.beats ?? []).map(b => b.title);

describe('issue #329 X01 — what the capture wrote from an X-carded narration leaves canon with it', () => {
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

    // The rig lore leaves canon (the next narration's ESTABLISHED LORE would
    // hand the removed beat back) and the beat leaves the Session Log.
    expect(loreTitles()).not.toContain('The interrogation rig');
    expect(sessionLogBeats()).not.toContain('Guard rotation');
  });
});

describe('issue #329 X01 — the X-Card undoes the capture by narration id', () => {
  const loreEntry = (title) => (journals.get(JOURNAL_NAMES.lore)?.pages.contents ?? [])
    .map(p => p.flags[MODULE_ID]?.loreEntry).find(e => e?.title === title) ?? null;

  it('a lore entry the X-carded capture rewrote is put back as it was, still canon', async () => {
    await recordLoreDiscovery('The interrogation rig', {
      text: 'A rusted rig nobody has used in years.', confirmed: true, narratorAsserted: true,
    }, stored());
    await narrate('nar-torch', "The interrogator lifts the cutting torch toward the prisoner's hand.", TORCH);
    await capture();
    expect(loreEntry('The interrogation rig')).toMatchObject({
      text: 'The interrogator keeps a torch rig bolted to the cell floor.', narrationId: 'nar-torch',
    });
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(loreEntry('The interrogation rig')).toMatchObject({
      text: 'A rusted rig nobody has used in years.', confirmed: true, retracted: false, narrationId: null, previous: null,
    });
    expect(loreTitles()).toContain('The interrogation rig');
  });

  it('a threat the X-carded capture made leaves the journal; one it rewrote is put back', async () => {
    await recordThreat('The warden', { severity: 'looming', summary: 'Watches from the gantry.' }, stored());
    await narrate('nar-torch', "The interrogator lifts the cutting torch toward the prisoner's hand.", TORCH);
    await routeWorldJournalResults({
      lore: [],
      threats: [
        { name: 'The torturer', severity: 'immediate', summary: 'Heats the torch.', salience: 'defining' },
        { name: 'The warden',   severity: 'active',    summary: 'Orders the torch lit.', salience: 'defining' },
      ],
      factionUpdates: [], locationUpdates: [], stateTransitions: [],
    }, stored(), { narrationId: 'nar-torch' });
    expect(getActiveThreats().map(t => t.name).sort()).toEqual(['The torturer', 'The warden']);
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    const threats = getActiveThreats();
    expect(threats.map(t => t.name)).toEqual(['The warden']);
    expect(threats[0]).toMatchObject({ severity: 'looming', summary: 'Watches from the gantry.' });
  });

  it("a tier detail the X-carded narration added leaves the card; another narration's stays", async () => {
    const vex = makeTestActor({ id: 'npc-vex', name: 'Vex', type: 'character', hasPlayerOwner: false,
      flags: { [MODULE_ID]: { entityType: 'connection', connection: { name: 'Vex', generativeTier: [] } } } });
    game.actors._set(vex.id, vex);
    const ref = { journalId: 'npc-vex', type: 'connection', record: vex.getFlag(MODULE_ID, 'connection') };
    expect(await appendDetailToTier(ref, 'Owes the dockmaster a favour.', SESSION, 7, { narrationId: 'nar-earlier' })).toBe(true);
    await narrate('nar-torch', "The interrogator lifts the cutting torch toward the prisoner's hand.", TORCH);
    expect(await appendDetailToTier(ref, 'Held the prisoner down for the torch.', SESSION, 7, { narrationId: 'nar-torch' })).toBe(true);
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    const tier = vex.getFlag(MODULE_ID, 'connection').generativeTier.map(e => e.detail);
    expect(tier).toEqual(['Owes the dockmaster a favour.']);
  });

  it('nothing an earlier narration captured is touched', async () => {
    await narrate('nar-earlier', 'The cell door clangs shut behind the guards.', { newTruths: [], stateChanges: [] });
    await routeWorldJournalResults({
      lore: [{ title: 'The cell block', text: 'Twelve cells line the corridor.', category: 'other', salience: 'defining' }],
      threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [],
    }, stored(), { narrationId: 'nar-earlier' });
    // A player speaks: the X-Card's beat begins after their message.
    await ChatMessage.create({ content: 'Kira leans in close to the prisoner.' });
    await narrate('nar-torch', "The interrogator lifts the cutting torch toward the prisoner's hand.", TORCH);
    await capture();
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(loreTitles()).toContain('The cell block');
    expect(loreTitles()).not.toContain('The interrogation rig');
  });
});

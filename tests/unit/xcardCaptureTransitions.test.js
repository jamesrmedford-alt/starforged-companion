/**
 * STARFORGED COMPANION
 * tests/unit/xcardCaptureTransitions.test.js
 *
 * Known-issues XCARD-CAPTURE-TRANSITIONS — the state transitions an X-carded
 * narration's capture applied to World Journal entries it did not make are
 * undone with it.
 *
 * Issue #329 X01 stamped what the capture WRITES with the narration's id —
 * a new lore, threat, faction or place entry, a Session Log beat, a tier
 * detail — and the X-Card undoes those by id. The detection pass also
 * applies state transitions to entries already there: a threat resolved or
 * escalated (updateThreatSeverity), a lore entry confirmed
 * (promoteLoreToConfirmed), a faction's attitude shifted
 * (recordFactionIntelligence, which moves the stance on the faction's
 * record — the canonical stance home). Those writes carried no id, so the
 * X-Card left them: the threat stayed resolved, the lore confirmed and the
 * faction hostile in every later prompt. Now each is stamped like the
 * capture's own records, and the X-Card puts the entry back — and the
 * record's stance, where the record still holds what the narration set.
 */

/* global structuredClone */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { routeWorldJournalResults } from '../../src/entities/entityExtractor.js';
import {
  getConfirmedLore, getActiveThreats, recordLoreDiscovery, recordThreat, recordFactionIntelligence,
  updateThreatSeverity, JOURNAL_NAMES,
} from '../../src/world/worldJournal.js';
import { getFaction, updateFaction } from '../../src/entities/faction.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
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
    update: async (data) => Object.assign(journal, data),
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

const SYNDICATE = 'The Iron Syndicate';
let journals, orig, factionId;
beforeEach(async () => {
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

  // The Iron Syndicate's faction record — its stance is canonical there.
  const host = makeJournal(`Faction: ${SYNDICATE}`);
  host.pages.contents.push(makePage({ name: SYNDICATE, flags: { [MODULE_ID]: {
    faction: { _id: 'fac-1', name: SYNDICATE, relationship: 'apathetic', createdAt: 'then' } } } }, host.pages.contents));
  journals.set(host.name, host);
  factionId = host.id;

  game.settings._store.set(KEY, {
    currentSessionId: 'sess-7', sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
    connectionIds: [], factionIds: [factionId], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });

  // What stood before the narration: a looming threat, a lore entry the
  // narrator asserted but nobody confirmed, the Syndicate's neutral entry.
  await recordThreat('The warden', { severity: 'looming', summary: 'Watches from the gantry.' }, stored());
  await recordLoreDiscovery('The sealed vault', { text: 'A vault no one has opened.', narratorAsserted: true, confirmed: false }, stored());
  await recordFactionIntelligence(SYNDICATE, { attitude: 'neutral', summary: 'Trades with everyone.' }, stored());
});
afterEach(() => {
  game.journal.get = orig.get; game.journal.getName = orig.getName; game.journal.find = orig.find;
  global.JournalEntry = { create: orig.create };
});

const TRANSITIONS = [
  { entryType: 'threat',  name: 'The warden',      change: 'resolved' },
  { entryType: 'lore',    name: 'The sealed vault', change: 'confirmed' },
  { entryType: 'faction', name: SYNDICATE,          change: 'attitudeShift', newValue: 'hostile', summary: 'They turned on the crew.' },
];

/** A narration as the narrator makes one, then its capture's transitions, with its id. */
async function narrateAndCapture(narrationId, transitions = TRANSITIONS) {
  const text = applyNarratorSidecar(`The warden falls; the vault yawns open; the Syndicate turns.\n\`\`\`json\n${JSON.stringify({ newTruths: [], stateChanges: [] })}\n\`\`\``,
    stored(), { narrationId, matchedEntityIds: [] });
  await postNarrationCard(text, { moveId: 'strike', outcome: 'strong_hit', _id: `res-${narrationId}` },
    stored(), { playerText: 'I strike.', playerName: 'Kira', narrationId });
  await routeWorldJournalResults({ lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: transitions },
    stored(), { narrationId });
}

const warden    = () => getActiveThreats().find(t => t.name === 'The warden') ?? null;
const wardenRaw = () => journals.get(JOURNAL_NAMES.threats).pages.contents.find(p => p.name === 'The warden').flags[MODULE_ID].threatEntry;
const confirmedLore = () => getConfirmedLore(stored()).map(e => e.title);
const syndicateEntry = () => journals.get(JOURNAL_NAMES.factions).pages.contents.find(p => p.name === SYNDICATE).flags[MODULE_ID].factionEntry;
const stance = () => getFaction(factionId).relationship;

describe('XCARD-CAPTURE-TRANSITIONS — the X-Card undoes the transitions its narration\'s capture applied', () => {
  it('control: the capture resolves the threat, confirms the lore and turns the Syndicate hostile', async () => {
    await narrateAndCapture('nar-turn');
    expect(warden()).toBeNull();                                   // resolved threats are not active
    expect(confirmedLore()).toContain('The sealed vault');
    expect(syndicateEntry().attitude).toBe('hostile');
    expect(stance()).toBe('antagonistic');
  });

  it('after the X-Card the threat is looming again, the lore unconfirmed, the Syndicate neutral — entry and record', async () => {
    const historyBefore = structuredClone(wardenRaw().history);
    await narrateAndCapture('nar-turn');
    expect(wardenRaw().history).toHaveLength(historyBefore.length + 1);   // control: the transition's line
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(warden()).toMatchObject({ severity: 'looming', summary: 'Watches from the gantry.' });   // was "resolved"
    expect(wardenRaw().history).toEqual(historyBefore);
    expect(confirmedLore()).not.toContain('The sealed vault');                                       // was confirmed
    expect(syndicateEntry()).toMatchObject({ attitude: 'neutral', narrationId: null, recordStance: null });
    expect(stance()).toBe('apathetic');                                                              // was "antagonistic"
  });

  it('a stance changed on the record since the narration stands', async () => {
    await narrateAndCapture('nar-turn');
    await updateFaction(factionId, { relationship: 'open_war' });   // the GM's own ruling
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stance()).toBe('open_war');
  });

  it('two X-carded narrations that each moved the stance put back the one before both', async () => {
    await narrateAndCapture('nar-a', [{ entryType: 'faction', name: SYNDICATE, change: 'attitudeShift', newValue: 'hostile' }]);
    await narrateAndCapture('nar-b', [{ entryType: 'faction', name: SYNDICATE, change: 'attitudeShift', newValue: 'allied' }]);
    expect(stance()).toBe('open_alliance');
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);   // the beat holds both narrations
    expect(stance()).toBe('apathetic');
    expect(syndicateEntry().attitude).toBe('neutral');
  });

  it('control: an earlier narration\'s transitions are untouched; a GM\'s own change owns the entry', async () => {
    await narrateAndCapture('nar-earlier', [{ entryType: 'lore', name: 'The sealed vault', change: 'confirmed' }]);
    await ChatMessage.create({ content: 'Kira steadies her breath.' });   // the X-Card's beat begins after a player's line
    await narrateAndCapture('nar-turn', [{ entryType: 'threat', name: 'The warden', change: 'escalated', newValue: 'immediate' }]);
    await updateThreatSeverity('The warden', 'active', stored());   // the GM's panel, after the narration
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(confirmedLore()).toContain('The sealed vault');
    expect(warden()).toMatchObject({ severity: 'active' });
  });
});

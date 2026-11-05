/**
 * STARFORGED COMPANION
 * tests/unit/draftFactionSurfaceUndo.test.js
 *
 * Issue #335 Y02 (XCARD-FACTION-SURFACE-UNSTAMPED, the narration side) — a
 * narration introduces "the Velvet Knife"; ~2 s later the detection pass
 * surfaces it to the World Journal — Factions page (routeEntityDrafts'
 * auto-surface) and queues its draft for the GM; the table then plays the
 * X-Card. The page must carry the narration's id and leave the journal with
 * it, as a faction routed through `factionUpdates` does (issue #329 X01:
 * "a threat, faction or place it made" is deleted) — FACTION LANDSCAPE
 * ([4e], getFactionLandscape) used to hand the removed faction back, with the
 * removed prose's description as its summary.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import { applyNarratorSidecar, postNarrationCard, runPacedDetection } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { getFactionLandscape, getFactionEntry, JOURNAL_NAMES } from '../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };

const GM = { id: 'gm-1', isGM: true, active: true };
const PL = { id: 'pl-1', isGM: false, active: true };

const PROSE = "The dockmaster names the Velvet Knife — a smugglers' cartel that owns the lower docks — and says the prisoner was theirs.";
const SIDECAR = {
  newTruths:    [{ subject: 'the prisoner', fact: 'Belonged to the Velvet Knife' }],
  stateChanges: [],
  sceneFrame:   { location: 'the lower docks', present: ['the dockmaster'], situation: 'A name is given' },
};
const DETECTION = {
  entities: [{ type: 'faction', name: 'The Velvet Knife', description: "A smugglers' cartel that owns the lower docks.", confidence: 'high' }],
  renames:  [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
};
// The same narration, its faction routed through factionUpdates instead (the stamped path).
const DETECTION_VIA_UPDATES = {
  entities: [],
  renames:  [],
  worldJournal: {
    lore: [], threats: [],
    factionUpdates: [{ name: 'The Velvet Knife', attitude: 'hostile', summary: "A smugglers' cartel that owns the lower docks.", isNew: true }],
    locationUpdates: [], stateTransitions: [],
  },
};

const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

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

let journals, orig, detection;
beforeEach(() => {
  journals = new Map();
  orig = { get: game.journal.get, getName: game.journal.getName, find: game.journal.find, create: global.JournalEntry?.create };
  game.journal.get     = (id) => [...journals.values()].find(j => j.id === id) ?? null;
  game.journal.getName = (n) => journals.get(n) ?? null;
  game.journal.find    = (fn) => [...journals.values()].find(fn) ?? null;
  global.JournalEntry  = { create: async (data) => { const j = makeJournal(data.name); journals.set(data.name, j); return j; } };

  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([GM, PL], { get: (id) => [GM, PL].find(u => u.id === id) ?? null });
  global.game.user = GM;
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
    connectionIds: [], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
  detection = DETECTION;
  apiPost.mockImplementation(async (_url, _headers, body) => {
    const user = String(body?.messages?.[0]?.content ?? '');
    if (/You are analysing an Ironsworn: Starforged narration/.test(user)) return reply(JSON.stringify(detection));
    return reply('{"contradictions":[]}');
  });
});
afterEach(() => {
  game.journal.get = orig.get; game.journal.getName = orig.getName; game.journal.find = orig.find;
  global.JournalEntry = { create: orig.create };
});

/** A narration as the narrator makes one: the sidecar applied with its id, then its card. */
async function narrate(narrationId) {
  const text = applyNarratorSidecar(`${PROSE}\n\`\`\`json\n${JSON.stringify(SIDECAR)}\n\`\`\``, stored(), { narrationId, matchedEntityIds: [] });
  await postNarrationCard(text, { moveId: 'gather_information', outcome: 'strong_hit', _id: `res-${narrationId}` },
    stored(), { playerText: 'I ask who the prisoner worked for.', playerName: 'Kira', narrationId });
}

const landscape = () => getFactionLandscape(stored()).map(f => f.factionName ?? f.name);
const draftCard = () => ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.draftEntityCard);

describe('issue #335 Y02 — the faction a removed narration\'s capture surfaced leaves with it', () => {
  it("the X-Card on the narration takes the faction its capture surfaced off the Factions journal", async () => {
    await narrate('nar-knife');
    await runPacedDetection(PROSE, stored(), { narrationId: 'nar-knife' });
    // The capture surfaced the faction — it is on the landscape and queued for review.
    expect(landscape()).toContain('The Velvet Knife');
    expect(draftCard()?.flags?.[MODULE_ID]?.drafts?.[0]).toMatchObject({ name: 'The Velvet Knife', status: 'pending' });
    // The entry carries the narration it came from.
    expect(getFactionEntry('The Velvet Knife')?.narrationId).toBe('nar-knife');
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().sceneTruths.find(t => /Velvet Knife/.test(t.fact))).toMatchObject({ retracted: true, retractedBy: 'xcard' });
    // The removed narration's faction is gone from FACTION LANDSCAPE and the journal.
    expect(landscape()).not.toContain('The Velvet Knife');
    expect(journals.get(JOURNAL_NAMES.factions)?.pages.contents.map(p => p.name) ?? []).toEqual([]);
  });

  it("control: a faction the same capture routes through factionUpdates is stamped and leaves with the X-Card", async () => {
    detection = DETECTION_VIA_UPDATES;
    await narrate('nar-knife');
    await runPacedDetection(PROSE, stored(), { narrationId: 'nar-knife' });
    expect(landscape()).toContain('The Velvet Knife');
    expect(getFactionEntry('The Velvet Knife')?.narrationId).toBe('nar-knife');
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(landscape()).not.toContain('The Velvet Knife');
    expect(journals.get(JOURNAL_NAMES.factions)?.pages.contents.map(p => p.name) ?? []).toEqual([]);
  });
});

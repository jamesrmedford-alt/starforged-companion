/**
 * STARFORGED COMPANION
 * tests/unit/xcardFactionSurfaceUnstamped.test.js
 *
 * Issue #335 Y02 (XCARD-FACTION-SURFACE-UNSTAMPED) — the X-Card removes the
 * faction page the removed narration's capture surfaced, and the placeholder
 * name it revealed.
 *
 * A paced narration introduces a faction the detection pass reports only as
 * a new entity ("The Ashen Covenant"): routeEntityDrafts surfaces it to the
 * World Journal — Factions page at once and queues it on the GM's draft card.
 * runDiscoveryDetection / runPacedDetection handed routeEntityDrafts no
 * `narrationId`, so the page was unstamped and FACTION LANDSCAPE handed it
 * back after an X-Card. Every capture writer takes the id from its caller
 * (issue #329 X01; rules/narrator-memory.md 6b) — routeEntityDrafts and
 * applyEntityRenames now do too.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const probe = vi.hoisted(() => ({ detection: null }));
vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const prompt = String(body?.messages?.[0]?.content ?? '');
    const text = prompt.includes('ENTITY TYPES TO DETECT')
      ? JSON.stringify(probe.detection ?? {})
      : '{"contradictions":[]}';
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn' };
  }),
}));

import { applyNarratorSidecar, postNarrationCard, runPacedDetection } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { getFactionLandscape, JOURNAL_NAMES } from '../../src/world/worldJournal.js';
import { mergeFactionLandscape, listFactions } from '../../src/entities/faction.js';

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
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-probe');   // the detection pass's Haiku call
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [], sectors: [],
    connectionIds: [], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
});
afterEach(() => {
  game.journal.get = orig.get; game.journal.getName = orig.getName; game.journal.find = orig.find;
  global.JournalEntry = { create: orig.create };
});

const PROSE = 'A hooded figure of the Ashen Covenant watches the crew from the gantry; the cult burns heretics on this station.';
const ASH = { type: 'faction', name: 'The Ashen Covenant', description: 'A cult that burns heretics', confidence: 'high' };
const emptyWj = { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] };

/** A paced narration as the narrator posts one, then its capture — the real detection path, its reply scripted. */
async function narrateAndCapture(narrationId, detection, prose = PROSE) {
  const text = applyNarratorSidecar(`${prose}\n\`\`\`json\n${JSON.stringify({ newTruths: [], stateChanges: [] })}\n\`\`\``,
    stored(), { narrationId, matchedEntityIds: [] });
  await postNarrationCard(text, { moveId: 'paced_narrative', outcome: 'n/a', _id: `res-${narrationId}` },
    stored(), { playerText: 'I scan the gantry.', playerName: 'Kira', narrationId });
  probe.detection = detection;
  await runPacedDetection(text, stored(), { narrationId });
}

const factionPages = () => (journals.get(JOURNAL_NAMES.factions)?.pages.contents ?? []).map(p => p.name);
const factionEntry = (name) => journals.get(JOURNAL_NAMES.factions)?.pages.contents
  .find(p => p.name === name)?.flags?.[MODULE_ID]?.factionEntry ?? null;
const landscape    = () => mergeFactionLandscape(listFactions(stored()), getFactionLandscape(stored())).map(e => e.name);

describe('issue #335 Y02 — the X-Card removes the faction page the removed narration\'s capture surfaced', () => {
  it('control: a faction reported under factionUpdates is stamped and its page leaves with the narration', async () => {
    await narrateAndCapture('nar-ash', { entities: [], renames: [], worldJournal: { ...emptyWj,
      factionUpdates: [{ name: 'The Ashen Covenant', attitude: 'hostile', summary: 'They burn heretics.', isNew: true }] } });
    expect(factionPages()).toEqual(['The Ashen Covenant']);
    expect(landscape()).toContain('The Ashen Covenant');
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(factionPages()).toEqual([]);
    expect(landscape()).not.toContain('The Ashen Covenant');
  });

  it('a faction reported only as a new entity is surfaced stamped, and leaves FACTION LANDSCAPE with the X-Card', async () => {
    await narrateAndCapture('nar-ash', { entities: [ASH], renames: [], worldJournal: emptyWj });
    // The auto-surface happened, and the draft card queued the faction for the GM.
    expect(factionPages()).toEqual(['The Ashen Covenant']);
    const draftCard = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.draftEntityCard);
    expect(draftCard?.flags?.[MODULE_ID]?.drafts?.map(d => d.name)).toEqual(['The Ashen Covenant']);
    expect(factionEntry('The Ashen Covenant')?.narrationId ?? null, 'the page\'s narration stamp').toBe('nar-ash');
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardedNarrationIds).toContain('nar-ash');   // the X-Card picked the narration
    expect.soft(landscape(), 'FACTION LANDSCAPE after the X-Card').not.toContain('The Ashen Covenant');
    expect(factionPages(), 'Factions journal after the X-Card').toEqual([]);
  });

  it('a placeholder figure the removed narration named gets its placeholder name back', async () => {
    const figure = makeTestActor({ id: 'npc-fig', name: 'Unknown Suited Figure', type: 'character', hasPlayerOwner: false,
      flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-fig', name: 'Unknown Suited Figure', generativeTier: [] } } } });
    game.actors._set(figure.id, figure);
    game.settings._store.set(KEY, { ...stored(), connectionIds: ['npc-fig'] });

    await narrateAndCapture('nar-vex', { entities: [], renames: [{ from: 'Unknown Suited Figure', to: 'Vex' }], worldJournal: emptyWj },
      'The suited figure lowers her hood: "Call me Vex."');
    expect(figure.name).toBe('Vex');
    expect(figure.getFlag(MODULE_ID, 'connection')).toMatchObject({ name: 'Vex',
      renamedBy: { narrationId: 'nar-vex', from: 'Unknown Suited Figure', to: 'Vex' } });
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(figure.name).toBe('Unknown Suited Figure');
    expect(figure.getFlag(MODULE_ID, 'connection')).toMatchObject({ name: 'Unknown Suited Figure', renamedBy: null });
  });

  it('control: a name the GM gave the card since the rename stands', async () => {
    const figure = makeTestActor({ id: 'npc-fig', name: 'Unknown Suited Figure', type: 'character', hasPlayerOwner: false,
      flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-fig', name: 'Unknown Suited Figure', generativeTier: [] } } } });
    game.actors._set(figure.id, figure);
    game.settings._store.set(KEY, { ...stored(), connectionIds: ['npc-fig'] });

    await narrateAndCapture('nar-vex', { entities: [], renames: [{ from: 'Unknown Suited Figure', to: 'Vex' }], worldJournal: emptyWj },
      'The suited figure lowers her hood: "Call me Vex."');
    const { updateConnection } = await import('../../src/entities/connection.js');
    await updateConnection('npc-fig', { name: 'Vex Arran' });
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(figure.name).toBe('Vex Arran');
  });
});

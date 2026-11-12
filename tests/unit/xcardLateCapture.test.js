/**
 * STARFORGED COMPANION
 * tests/unit/xcardLateCapture.test.js
 *
 * XCARD-LATE-CAPTURE (known-issues, the issue #338 open items' sharper form).
 * A narration's capture — the combined detection pass and the tier pass —
 * runs about 2 s after the narration posts (schedulePacedDetection,
 * schedulePacedTierUpdate, runPostNarrationPasses' timers,
 * scheduleNarrationCapture) and then waits on a Claude call. The X-Card
 * undoes what was captured BEFORE it was played (retractNarrationCapture, by
 * the narration's id, issue #329 X01), but a capture still running when it was
 * played went on to write lore, a Session Log beat, a faction page, a stamped
 * draft card, a Make a Connection's connection and tier details from the
 * removed prose — after the undo had run, so nothing took them back.
 *
 * Every capture write now checks the STORED `xCardedNarrationIds` right
 * before writing (after any Claude call has returned) and writes nothing for
 * an X-carded narration; a pass whose narration is already removed when its
 * timer fires makes no Claude call. These run the real passes with scripted
 * detection and tier replies, the X-Card played between the narration and
 * the capture.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const script = vi.hoisted(() => ({ onDetection: null, onTier: null, calls: { detection: 0, tier: 0 } }));
vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/art/openRouterImage.js', () => ({ generateOpenRouterImage: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import { generateOpenRouterImage } from '../../src/art/openRouterImage.js';
import { routeEntityDrafts } from '../../src/entities/entityExtractor.js';
import {
  applyNarratorSidecar, postNarrationCard, runPostNarrationPasses, runPacedDetection,
  schedulePacedDetection, schedulePacedTierUpdate, runNarrationTierUpdate,
} from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { listConnections } from '../../src/entities/connection.js';
import { getConfirmedLore, JOURNAL_NAMES } from '../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-5';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => {
  const contents = ChatMessage._created.slice();
  global.game.messages = { contents, get: (id) => contents.find(m => m.id === id) ?? null };
};

const GM = { id: 'gm-1', isGM: true, active: true };
const PL = { id: 'pl-1', isGM: false, active: true };

const PROSE = 'Brother Calloway of the Ember Choir shows Vex his branded palm; she burns the ledger without a word.';
const DETECTION = {
  entities: [
    { type: 'connection', name: 'Brother Calloway', description: 'A cultist with a branded palm.', pronouns: 'he/him', confidence: 'high' },
    { type: 'faction', name: 'The Ember Choir', description: 'A cult that brands its faithful.', confidence: 'high' },
  ],
  renames: [],
  worldJournal: {
    lore: [
      { title: 'The branding rite', text: 'The Ember Choir brands the palms of its faithful.', category: 'other', salience: 'defining' },
      { title: 'Choir hymns', text: 'The faithful hum while they work.', category: 'other', salience: 'trivial' },
    ],
    threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [],
  },
};
const TIER = { updates: [{ entityId: 'npc-vex', detail: 'Burned the ledger to hide the Choir\'s debt', salience: 'significant' }] };
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

// ── World journals ────────────────────────────────────────────────────────────
let journals, afterPageCreate;
function makeJournal(name) {
  const pages = [];
  const journal = {
    id: `journal-${name}`, name, flags: {},
    pages: { get contents() { return pages; }, find: (fn) => pages.find(fn) },
    createEmbeddedDocuments: async (_type, docs) => {
      const created = docs.map(d => makePage(d, pages));
      pages.push(...created);
      if (afterPageCreate) await afterPageCreate(name, created);
      return created;
    },
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

let vex, orig;
beforeEach(() => {
  vi.clearAllMocks();
  script.onDetection = null; script.onTier = null;
  script.calls = { detection: 0, tier: 0 };
  afterPageCreate = null;
  journals = new Map();
  orig = { get: game.journal.get, getName: game.journal.getName, find: game.journal.find, create: global.JournalEntry?.create, actorCreate: global.Actor.create };
  game.journal.get     = (id) => [...journals.values()].find(j => j.id === id) ?? null;
  game.journal.getName = (n) => journals.get(n) ?? null;
  game.journal.find    = (fn) => [...journals.values()].find(fn) ?? null;
  global.JournalEntry  = { create: async (data) => { const j = makeJournal(data.name); journals.set(data.name, j); return j; } };
  global.Actor.create = async (data) => {
    const actor = await orig.actorCreate(data);
    actor.delete = async () => { game.actors._setAll(game.actors.contents.filter(a => a !== actor)); };
    return actor;
  };

  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [], get: () => null };
  global.game.users = Object.assign([GM, PL], { get: (id) => [GM, PL].find(u => u.id === id) ?? null, filter: (fn) => [GM, PL].filter(fn) });
  global.game.user = GM;
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 5, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [], sectors: [],
    connectionIds: ['npc-vex'], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
  // Vex — a recorded connection the narration develops (the tier pass's subject).
  vex = makeTestActor({ id: 'npc-vex', name: 'Vex', type: 'character', hasPlayerOwner: false,
    flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-vex', name: 'Vex', generativeTier: [] } } } });
  game.actors._set(vex.id, vex);

  apiPost.mockImplementation(async (_url, _headers, body) => {
    const user = String(body?.messages?.[0]?.content ?? '');
    if (/You are analysing an Ironsworn: Starforged narration/.test(user)) {
      script.calls.detection += 1;
      if (script.onDetection) await script.onDetection();
      return reply(JSON.stringify(DETECTION));
    }
    if (/capture any SIGNIFICANT new development/.test(user)) {
      script.calls.tier += 1;
      if (script.onTier) await script.onTier();
      return reply(JSON.stringify(TIER));
    }
    return reply('{"contradictions":[]}');
  });
});
afterEach(() => {
  vi.useRealTimers();
  game.journal.get = orig.get; game.journal.getName = orig.getName; game.journal.find = orig.find;
  global.JournalEntry = { create: orig.create };
  global.Actor.create = orig.actorCreate;
});

/** A narration as the narrator makes one: its sidecar applied with its id, then its card. */
async function narrate(narrationId, resolution = { moveId: 'compel', outcome: 'weak_hit' }) {
  const text = applyNarratorSidecar(`${PROSE}\n\`\`\`json\n${JSON.stringify({ newTruths: [], stateChanges: [] })}\n\`\`\``,
    stored(), { narrationId, matchedEntityIds: ['npc-vex'] });
  await postNarrationCard(text, { _id: `res-${narrationId}`, ...resolution }, stored(),
    { playerText: 'I watch the cultist.', playerName: 'Kira', narrationId });
  syncChat();
  return text;
}
const playXCard = async () => { syncChat(); expect(await suppressScene({}, { local: true })).toBe(true); };

/** Let fire-and-forget work settle (real macrotask turns). */
async function settle(turns = 40) { for (let i = 0; i < turns; i++) await new Promise(r => setImmediate(r)); }

// ── What the capture can write ────────────────────────────────────────────────
const loreTitles   = () => getConfirmedLore(stored()).map(e => e.title);
const lorePages    = () => (journals.get(JOURNAL_NAMES.lore)?.pages.contents ?? []).map(p => p.name);
const factionPages = () => (journals.get(JOURNAL_NAMES.factions)?.pages.contents ?? []).map(p => p.name);
const logBeats     = () => (journals.get(JOURNAL_NAMES.sessionLog)?.pages.contents ?? [])
  .flatMap(p => p.flags[MODULE_ID]?.sessionLogPage?.beats ?? []).map(b => b.title);
const draftCards   = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.draftEntityCard);
const vexDetails   = () => (vex.getFlag(MODULE_ID, 'connection')?.generativeTier ?? []).map(e => e.detail);
const calloways    = () => listConnections(stored()).filter(c => c.name === 'Brother Calloway');

const loreEntry = (title) => (journals.get(JOURNAL_NAMES.lore)?.pages.contents ?? [])
  .map(p => p.flags?.[MODULE_ID]?.loreEntry).find(e => e?.title === title) ?? null;

/** Nothing the capture wrote is left — `loreUndone`: its first Lore page landed before the X-Card, which retracted it. */
function expectNothingCaptured({ loreUndone = false } = {}) {
  expect(loreTitles(), 'ESTABLISHED LORE').not.toContain('The branding rite');
  if (loreUndone) expect(loreEntry('The branding rite'), 'the X-Card retracted the page that landed first').toMatchObject({ retracted: true, confirmed: false });
  else expect(lorePages(), 'a Lore page').not.toContain('The branding rite');
  expect(logBeats(), 'a Session Log beat').toEqual([]);
  expect(factionPages(), 'a faction page').toEqual([]);
  expect(draftCards(), 'a ◈ New Entities card').toEqual([]);
  expect(vexDetails(), 'a tier detail on Vex').toEqual([]);
  expect(calloways(), 'a connection').toEqual([]);
}

describe('XCARD-LATE-CAPTURE — a capture still running when the X-Card is played writes nothing', () => {
  it('control: with no X-Card, the paced capture records lore, a beat, a faction page, a draft card and a tier detail', async () => {
    const text = await narrate('nar-1');
    await runPacedDetection(text, stored(), { narrationId: 'nar-1', actorId: null });
    await runNarrationTierUpdate(text, stored(), { narrationId: 'nar-1' });
    expect(loreTitles()).toContain('The branding rite');
    expect(logBeats()).toContain('Choir hymns');
    expect(factionPages()).toContain('The Ember Choir');
    expect(draftCards()).toHaveLength(1);
    expect(vexDetails()).toEqual(["Burned the ledger to hide the Choir's debt"]);
  });

  it('the X-Card played before the 2 s timers fire: no Claude call, nothing written', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const text = await narrate('nar-1');
    schedulePacedDetection(text, stored(), { narrationId: 'nar-1' });
    schedulePacedTierUpdate(text, ['npc-vex'], ['connection'], stored(), { narrationId: 'nar-1' });

    await playXCard();
    vi.advanceTimersByTime(2000);
    await settle();

    expect(script.calls).toEqual({ detection: 0, tier: 0 });
    expectNothingCaptured();
  });

  it('control: the timers fire as before for a narration the X-Card did not remove', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const text = await narrate('nar-1');
    schedulePacedDetection(text, stored(), { narrationId: 'nar-1' });
    schedulePacedTierUpdate(text, ['npc-vex'], ['connection'], stored(), { narrationId: 'nar-1' });
    vi.advanceTimersByTime(2000);
    for (let i = 0; i < 200 && !(draftCards().length && vexDetails().length); i++) await new Promise(r => setImmediate(r));
    expect(loreTitles()).toContain('The branding rite');
    expect(draftCards()).toHaveLength(1);
    expect(vexDetails()).toHaveLength(1);
  });

  it('the X-Card played while the detection call is out: its reply writes nothing', async () => {
    const text = await narrate('nar-1');
    script.onDetection = playXCard;
    await runPacedDetection(text, stored(), { narrationId: 'nar-1' });
    expect(script.calls.detection).toBe(1);
    expect(stored().xCardedNarrationIds).toEqual(['nar-1']);
    expectNothingCaptured();
  });

  it('the X-Card played while the tier call is out: no detail lands on the NPC\'s card', async () => {
    const text = await narrate('nar-1');
    script.onTier = playXCard;
    await runNarrationTierUpdate(text, stored(), { narrationId: 'nar-1' });
    expect(script.calls.tier).toBe(1);
    expect(vexDetails()).toEqual([]);
  });

  it('a Make a Connection hit: the X-Card during its detection call leaves no connection and no draft card', async () => {
    const resolution = { moveId: 'make_a_connection', outcome: 'strong_hit', playerNarration: 'I look for someone in the Choir.' };
    const text = await narrate('nar-mac', resolution);
    script.onDetection = playXCard;
    await runPostNarrationPasses(text, { _id: 'res-nar-mac', ...resolution },
      { resolvedClass: 'discovery', entityIds: [], entityTypes: [], matchedNames: [], needsClarification: false, referenceType: 'none' },
      stored(), { actorId: null, narrationId: 'nar-mac' });
    expect(script.calls.detection).toBe(1);
    expectNothingCaptured();
  });

  it('the X-Card played between two of the capture\'s writes: the first is undone, the rest are never written', async () => {
    const text = await narrate('nar-1');
    // The X-Card lands right after the capture's first Lore page does.
    afterPageCreate = async (journalName) => {
      if (journalName !== JOURNAL_NAMES.lore || stored().xCardActive) return;
      await playXCard();
    };
    await runPacedDetection(text, stored(), { narrationId: 'nar-1' });
    expect(stored().xCardedNarrationIds).toEqual(['nar-1']);
    expectNothingCaptured({ loreUndone: true });
  });

  it('control: an X-Card on a later narration leaves an earlier narration\'s capture alone', async () => {
    const text = await narrate('nar-1');
    await ChatMessage.create({ content: 'We follow him in.', flags: {} });   // someone spoke: a new beat
    await narrate('nar-2');
    await playXCard();
    expect(stored().xCardedNarrationIds).toEqual(['nar-2']);

    await runPacedDetection(text, stored(), { narrationId: 'nar-1' });
    await runNarrationTierUpdate(text, stored(), { narrationId: 'nar-1' });
    expect(loreTitles()).toContain('The branding rite');
    expect(draftCards()).toHaveLength(1);
    expect(vexDetails()).toHaveLength(1);
  });
});

// ── A Make a Connection's card is made over several awaits ───────────────────
// The card, the roller's bond Item, the ledger promote, (for a pending row)
// the row's status, and its paid portrait: an X-Card landing between them took
// the stamped card back (issue #338 D6(ii)), and the steps after it went on —
// a bond for a deleted NPC, an Art Cache entry nothing links to, a reopened
// row confirmed again. The portrait is started last and not awaited (issue
// #347 AB01: the capture held the move lock for it), so an X-Card during its
// image call lands after the capture has returned; the X-Card takes back the
// card and its bond, and the late portrait stores nothing.
describe('XCARD-LATE-CAPTURE — an X-Card during a Make a Connection\'s portrait call', () => {
  let kira, origItemCreate;
  const MAC = { moveId: 'make_a_connection', outcome: 'strong_hit', playerNarration: 'I look for Brother Calloway.' };
  const DISCOVERY = { resolvedClass: 'discovery', entityIds: [], entityTypes: [], matchedNames: [], needsClarification: false, referenceType: 'none' };
  const artEntries = () => [...journals.values()].filter(j => j.name?.startsWith('Art: '));
  const kiraBonds  = () => kira.items.contents.filter(i => i.system?.subtype === 'bond');

  beforeEach(() => {
    game.settings._store.set(`${MODULE_ID}.openRouterApiKey`, 'sk-or-v1-test');
    kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character', ownership: { 'pl-1': 3 } });
    game.actors._set('pc-kira', kira);
    origItemCreate = global.Item.create;
    global.Item.create = async (data, options) => {
      const item = await origItemCreate(data, options);
      item.delete = async () => {
        const list = options?.parent?.items?.contents;
        const i = list?.indexOf(item) ?? -1;
        if (i >= 0) list.splice(i, 1);
      };
      return item;
    };
    // The portrait call is where the X-Card lands.
    generateOpenRouterImage.mockImplementation(async () => { await playXCard(); return 'A'.repeat(400); });
  });
  afterEach(() => { global.Item.create = origItemCreate; });

  it('control: with no X-Card the hit makes Calloway with his portrait and a bond on the roller', async () => {
    generateOpenRouterImage.mockResolvedValue('A'.repeat(400));
    const text = await narrate('nar-mac', MAC);
    await runPostNarrationPasses(text, { _id: 'res-nar-mac', ...MAC }, DISCOVERY, stored(), { actorId: 'pc-kira', narrationId: 'nar-mac' });
    expect(calloways()).toHaveLength(1);
    expect(artEntries()).toHaveLength(1);
    expect(kiraBonds().map(i => i.name)).toEqual(['Brother Calloway']);
  });

  it('auto-created: no NPC card, no bond, no portrait left behind', async () => {
    const text = await narrate('nar-mac', MAC);
    await runPostNarrationPasses(text, { _id: 'res-nar-mac', ...MAC }, DISCOVERY, stored(), { actorId: 'pc-kira', narrationId: 'nar-mac' });
    await settle();   // the portrait the capture started, and the X-Card played during its image call
    expect(generateOpenRouterImage).toHaveBeenCalledTimes(1);
    expect(stored().xCardedNarrationIds).toEqual(['nar-mac']);
    expect(calloways(), 'the NPC card').toEqual([]);
    expect(kiraBonds(), 'a bond on the roller').toEqual([]);
    expect(artEntries(), 'an Art Cache entry').toEqual([]);
  });

  it('confirmed from an earlier narration\'s pending row: no NPC, no bond, no portrait, and the row stays pending', async () => {
    // The earlier narration queued Calloway, pending.
    await routeEntityDrafts([DETECTION.entities[0]], stored(), { narrationId: 'nar-0', actorId: 'pc-kira', sessionId: SESSION });
    syncChat();
    await ChatMessage.create({ content: 'I go looking for him.', flags: {} });
    // The hit's detection leaves the pending name out.
    const reDetect = apiPost.getMockImplementation();
    apiPost.mockImplementation(async (url, headers, body) => {
      const user = String(body?.messages?.[0]?.content ?? '');
      if (/You are analysing an Ironsworn: Starforged narration/.test(user)) {
        return reply(JSON.stringify({ entities: [], renames: [], worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] } }));
      }
      return reDetect(url, headers, body);
    });
    const text = await narrate('nar-mac', MAC);
    await runPostNarrationPasses(text, { _id: 'res-nar-mac', ...MAC }, DISCOVERY, stored(), { actorId: 'pc-kira', narrationId: 'nar-mac' });
    await settle();   // the portrait the confirm started, and the X-Card played during its image call
    syncChat();

    expect(generateOpenRouterImage).toHaveBeenCalledTimes(1);
    expect(calloways(), 'the NPC card').toEqual([]);
    expect(kiraBonds(), 'a bond on the roller').toEqual([]);
    expect(artEntries(), 'an Art Cache entry').toEqual([]);
    const row = game.messages.get(draftCards()[0].id).flags[MODULE_ID].drafts.find(d => d.name === 'Brother Calloway');
    expect(row.status, 'the row the X-Card reopened').toBe('pending');
  });
});

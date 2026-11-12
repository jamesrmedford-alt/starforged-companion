/**
 * STARFORGED COMPANION
 * tests/unit/xcardConnectionPortraitOrphan.test.js
 *
 * XCARD-CONNECTION-PORTRAIT-ORPHAN (issue #338's open items). A Make a
 * Connection hit's capture auto-creates Vex, and her creation generates her
 * portrait (postCreationEnrichment → generatePortrait): an "Art: …" journal
 * entry in the Art Cache folder holding the image, indexed in
 * `campaignState.artAssetIds`, linked as the record's `portraitId`. The
 * X-Card on that narration deletes the unused Vex (issue #338 D6(ii)) — but
 * left her portrait's journal entry and index entry behind, an orphan nothing
 * links to. The portrait now goes with the card: its journal entries (a
 * superseded one too) are deleted and the index entries dropped, on a copy of
 * the latest store — a refused index write is logged, never thrown — and only
 * on the canonical GM.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/art/openRouterImage.js', () => ({ generateOpenRouterImage: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import { generateOpenRouterImage } from '../../src/art/openRouterImage.js';
import { applyNarratorSidecar, postNarrationCard, runPostNarrationPasses } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { listConnections } from '../../src/entities/connection.js';
import { deleteEntityArtAssets, storeArtAsset } from '../../src/art/storage.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => {
  const contents = ChatMessage._created.slice();
  global.game.messages = { contents, get: (id) => contents.find(m => m.id === id) ?? null };
};

const GM  = { id: 'gm-1', isGM: true, active: true };
const GM2 = { id: 'gm-2', isGM: true, active: true };
const PL  = { id: 'pl-1', isGM: false, active: true };

const PROSE = 'Vex meets you under the gantry — a smuggler who runs the lower docks, and who already knows your name.';
const SIDECAR = { newTruths: [{ subject: 'Vex', fact: 'Runs the lower docks' }], stateChanges: [], sceneFrame: null };
const DETECTION = {
  entities: [{ type: 'connection', name: 'Vex', description: 'A smuggler who runs the lower docks.', pronouns: 'she/her', role: 'smuggler', goal: null, confidence: 'high' }],
  renames:  [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
};
const RESOLUTION = { _id: 'res-vex', moveId: 'make_a_connection', outcome: 'strong_hit', playerNarration: 'I look for a smuggler who knows the docks.' };
const RELEVANCE  = { resolvedClass: 'discovery', entityIds: [], entityTypes: [], matchedNames: [], needsClarification: false, referenceType: 'none' };
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

/** World journal entries, with the flags and pages the art store writes. */
let journals;
function makeJournal(data) {
  const pages = [];
  const entry = {
    id: `je-${Math.random().toString(36).slice(2, 10)}`, name: data.name, folder: data.folder ?? null,
    flags: JSON.parse(JSON.stringify(data.flags ?? {})),
    pages: { get contents() { return pages; }, find: (fn) => pages.find(fn) },
    createEmbeddedDocuments: async (_type, docs) => {
      const created = docs.map(d => ({
        id: `jp-${Math.random().toString(36).slice(2, 10)}`, name: d.name, type: d.type, text: d.text,
        flags: JSON.parse(JSON.stringify(d.flags ?? {})),
        setFlag: async function (mod, key, val) { (this.flags[mod] ??= {})[key] = val; },
        update: async function (u) { Object.assign(this, u); },
      }));
      pages.push(...created);
      return created;
    },
    setFlag: async (mod, key, val) => { (entry.flags[mod] ??= {})[key] = val; },
    getFlag: (mod, key) => entry.flags?.[mod]?.[key],
    delete: async () => { const i = journals.indexOf(entry); if (i >= 0) journals.splice(i, 1); },
  };
  return entry;
}

let kira, orig;
beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [], get: () => null };
  global.game.users = Object.assign([GM, PL], { get: (id) => [GM, PL].find(u => u.id === id) ?? null, filter: (fn) => [GM, PL].filter(fn) });
  global.game.user = GM;
  global.ui = { notifications: { warn: () => {}, info: () => {}, error: () => {} } };

  journals = [];
  orig = { journal: global.game.journal, create: global.JournalEntry.create, actorCreate: global.Actor.create, itemCreate: global.Item.create };
  global.game.journal = {
    get contents() { return journals; },
    get: (id) => journals.find(j => j.id === id) ?? null,
    getName: (n) => journals.find(j => j.name === n) ?? null,
    find: (fn) => journals.find(fn) ?? null,
    filter: (fn) => journals.filter(fn),
    [Symbol.iterator]: () => journals[Symbol.iterator](),
  };
  global.JournalEntry.create = async (data) => { const j = makeJournal(data); journals.push(j); return j; };

  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.openRouterApiKey`, 'sk-or-v1-test');
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [], artAssetIds: { 'art-other': 'Art: ship ship-1 art-other' },
    connectionIds: [], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
  kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character', ownership: { 'pl-1': 3 } });
  game.actors._set('pc-kira', kira);
  apiPost.mockImplementation(async (_url, _headers, body) => {
    const user = String(body?.messages?.[0]?.content ?? '');
    if (/You are analysing an Ironsworn: Starforged narration/.test(user)) return reply(JSON.stringify(DETECTION));
    return reply('{"contradictions":[]}');
  });
  generateOpenRouterImage.mockResolvedValue('A'.repeat(400));   // a "generated" portrait

  global.Actor.create = async (data) => {
    const actor = await orig.actorCreate(data);
    actor.delete = async () => { game.actors._setAll(game.actors.contents.filter(a => a !== actor)); };
    return actor;
  };
  global.Item.create = async (data, options) => {
    const item = await orig.itemCreate(data, options);
    item.delete = async () => {
      const list = options?.parent?.items?.contents;
      const i = list?.indexOf(item) ?? -1;
      if (i >= 0) list.splice(i, 1);
    };
    return item;
  };
});
afterEach(() => {
  global.game.journal = orig.journal;
  global.JournalEntry.create = orig.create;
  global.Actor.create = orig.actorCreate;
  global.Item.create = orig.itemCreate;
});

/**
 * The Make a Connection narration and its synchronous capture (the hit creates
 * Vex), then her portrait — which the capture starts and does not wait for
 * (issue #347 AB01).
 */
async function makeAConnection() {
  const cs = stored();
  const text = applyNarratorSidecar(`${PROSE}\n\`\`\`json\n${JSON.stringify(SIDECAR)}\n\`\`\``, cs, { narrationId: 'nar-vex', matchedEntityIds: [] });
  await postNarrationCard(text, RESOLUTION, cs, { playerText: RESOLUTION.playerNarration, playerName: 'Kira', narrationId: 'nar-vex' });
  await runPostNarrationPasses(text, RESOLUTION, RELEVANCE, cs, { actorId: 'pc-kira', narrationId: 'nar-vex' });
  syncChat();
  await vi.waitFor(() => { if (!vexRecord()?.portraitId) throw new Error("Vex's portrait is not linked yet"); });
}

const vexRecord = () => listConnections(stored()).find(c => c.name === 'Vex') ?? null;
const vexActors = () => game.actors.contents.filter(a => a.flags?.[MODULE_ID]?.entityType === 'connection');
const artEntries = () => journals.filter(j => j.flags?.[MODULE_ID]?.entityType === 'artAsset');
const kiraBonds = () => kira.items.contents.filter(i => i.system?.subtype === 'bond');

describe('XCARD-CONNECTION-PORTRAIT-ORPHAN — the X-Card deletes the portrait with the connection', () => {
  it('control: Vex\'s creation stores her portrait — an Art entry, indexed and linked', async () => {
    await makeAConnection();
    const portraitId = vexRecord().portraitId;
    expect(portraitId).toBeTruthy();
    expect(artEntries().map(e => e.flags[MODULE_ID].assetId)).toEqual([portraitId]);
    expect(Object.keys(stored().artAssetIds)).toEqual(['art-other', portraitId]);
  });

  it('the X-Card that deletes the unused Vex deletes her portrait\'s journal entry and its index entry', async () => {
    await makeAConnection();
    const portraitId = vexRecord().portraitId;

    expect(await suppressScene({}, { local: true })).toBe(true);

    expect(vexActors()).toEqual([]);                                  // control: D6(ii) deleted her
    expect(artEntries(), 'the Art: journal entry').toEqual([]);
    expect(stored().artAssetIds, 'the art index').toEqual({ 'art-other': 'Art: ship ship-1 art-other' });
    expect(stored().artAssetIds[portraitId]).toBeUndefined();
  });

  it('a superseded portrait of hers (a regeneration) goes too; another entity\'s stays', async () => {
    await makeAConnection();
    const record = vexRecord();
    // An older, superseded portrait of Vex, and a ship's.
    await storeArtAsset({ _id: 'art-vex-old', entityType: 'connection', entityId: record._id, b64: 'B', superseded: true }, stored());
    await storeArtAsset({ _id: 'art-ship', entityType: 'ship', entityId: 'ship-9', b64: 'C' }, stored());
    expect(artEntries()).toHaveLength(3);

    expect(await suppressScene({}, { local: true })).toBe(true);

    expect(artEntries().map(e => e.flags[MODULE_ID].assetId)).toEqual(['art-ship']);
    expect(Object.keys(stored().artAssetIds).sort()).toEqual(['art-other', 'art-ship']);
  });

  it('control: a Vex the table has used stays, and so does her portrait', async () => {
    await makeAConnection();
    kiraBonds()[0].system.current = 4;
    const portraitId = vexRecord().portraitId;

    expect(await suppressScene({}, { local: true })).toBe(true);

    expect(vexActors()).toHaveLength(1);
    expect(artEntries().map(e => e.flags[MODULE_ID].assetId)).toEqual([portraitId]);
    expect(stored().artAssetIds[portraitId]).toBeTruthy();
  });

  it('a refused index write is logged, not thrown — the card and its entry are gone, the cached index untouched', async () => {
    await makeAConnection();
    const portraitId = vexRecord().portraitId;
    const set = game.settings.set;
    game.settings.set = async (mod, key, val) => {
      if (key === 'campaignState' && val?.artAssetIds && !(portraitId in val.artAssetIds)) throw new Error('refused');
      return set(mod, key, val);
    };
    try {
      expect(await suppressScene({}, { local: true })).toBe(true);
    } finally {
      game.settings.set = set;
    }
    expect(vexActors()).toEqual([]);
    expect(artEntries()).toEqual([]);
    expect(stored().artAssetIds[portraitId], 'the cache keeps what the world kept').toBeTruthy();
    expect(getCapturedWarns().some(w => /art index/i.test(w))).toBe(true);
  });

  it('only the canonical GM deletes: a second GM\'s call deletes nothing', async () => {
    await makeAConnection();
    const record = vexRecord();
    global.game.users = Object.assign([GM, GM2, PL], { get: (id) => [GM, GM2, PL].find(u => u.id === id) ?? null, filter: (fn) => [GM, GM2, PL].filter(fn) });
    global.game.user = GM2;   // gm-1 is the canonical GM (lowest id)

    expect(await deleteEntityArtAssets('connection', record._id, { portraitId: record.portraitId })).toBe(0);
    expect(artEntries()).toHaveLength(1);
    expect(stored().artAssetIds[record.portraitId]).toBeTruthy();
  });
});

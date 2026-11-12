/**
 * STARFORGED COMPANION
 * tests/unit/xcardStruckFactsAfterSceneEnd.test.js
 *
 * Issue #347 residual XCARD-STRUCK-FACTS-AFTER-SCENE-END (D2's). A miss is
 * narrated (the prisoner's hand is burned with a torch); the roller burns
 * momentum, the miss narration is struck (`burnSuperseded`, its truths
 * retracted `superseded`) and the upgraded outcome re-narrated. D2 made an
 * X-Card on that beat take the struck narration too: its facts become the
 * X-Card's, blocked. But when the scene ended between the burn and the
 * X-Card, the struck narration's truths were gone: the scene end kept the
 * scene's live narration truths for a later X-Card
 * (`sessionRetractions.narrated`) and dropped the superseded ones, so nothing
 * stopped the narrator re-asserting the fact the table had just X-Carded.
 * The scene end keeps superseded truths on that list too.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { supersedeOriginalNarration } from '../../src/moves/burnMomentum.js';
import { endScene } from '../../src/factContinuity/sceneLifecycle.js';

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

  const vex = makeTestActor({ id: 'npc-vex', name: 'Vex', type: 'character', hasPlayerOwner: false,
    flags: { [MODULE_ID]: { entityType: 'connection', connection: { name: 'Vex', generativeTier: [] } } } });
  game.actors._set(vex.id, vex);

  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
    connectionIds: ['npc-vex'], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
});
afterEach(() => {
  game.journal.get = orig.get; game.journal.getName = orig.getName; game.journal.find = orig.find;
  global.JournalEntry = { create: orig.create };
});

const TORCH = 'His hand was burned with a cutting torch';
const CODE  = 'Gave up the door code';
const MISS = { newTruths: [{ subject: 'the prisoner', fact: TORCH }], stateChanges: [] };
const HIT  = { newTruths: [{ subject: 'the prisoner', fact: CODE }], stateChanges: [] };
const RES_ID = 'res-compel-1';
const MISS_RES   = { moveId: 'compel', outcome: 'miss', _id: RES_ID };
const BURNED_RES = { moveId: 'compel', outcome: 'strong_hit', _id: 'res-compel-1-burned', upgradeOf: RES_ID };
const LATER_RES  = { moveId: 'compel', outcome: 'weak_hit', _id: 'res-later' };

/** A narration as the narrator makes one: the sidecar applied with its id, then its card. */
async function narrate(narrationId, prose, sidecar, resolution) {
  const text = applyNarratorSidecar(`${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``, stored(),
    { narrationId, matchedEntityIds: ['npc-vex'] });
  await postNarrationCard(text, resolution, stored(),
    { playerText: 'I press the prisoner for the code.', playerName: 'Kira', narrationId });
  await new Promise(r => setTimeout(r, 0));   // the chained sidecar persist lands
}
const someoneSpeaks = () => ChatMessage.create({ content: 'I press the prisoner for the code.', flags: {} });
const liveTruths = (fact) => stored().sceneTruths.filter(t => t.fact === fact && !t.retracted);
const playXCard = async () => { syncChat(); expect(await suppressScene({}, { local: true })).toBe(true); };
const resume = () => { game.settings._store.set(KEY, { ...stored(), xCardActive: false }); };
/** What `!scene start` does to the scene in progress: it ends, and a new one opens. */
const nextScene = async () => {
  await endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });
  game.settings._store.set(KEY, { ...stored(), currentSceneId: 'sc-2', sceneState: { bySubject: {}, sceneId: 'sc-2' } });
};

/** The miss narrated, Burn Momentum's strike, the upgraded outcome re-narrated — then the scene ends. */
async function burnThenSceneEnd() {
  await someoneSpeaks();
  await narrate('nar-miss', 'Vex pins his wrist while the torch comes down.', MISS, MISS_RES);
  syncChat();
  await supersedeOriginalNarration({ resolutionId: RES_ID }, { kind: 'burn' });
  await narrate('nar-hit', 'The prisoner breaks before the torch touches him again, and talks.', HIT, BURNED_RES);
  expect(stored().sceneTruths.find(t => t.fact === TORCH), 'setup: the burn superseded the miss narration')
    .toMatchObject({ retracted: true, retractedBy: 'superseded' });
  await nextScene();
  expect(stored().sceneTruths).toEqual([]);
}

describe('an X-Card after the scene ended, on a beat a Burn Momentum upgraded (issue #347 residual)', () => {
  it('the struck narration\'s fact is blocked for the rest of the session', async () => {
    await burnThenSceneEnd();
    await playXCard();
    resume();
    expect(stored().xCardedNarrationIds).toEqual(['nar-miss', 'nar-hit']);
    expect(stored().sessionRetractions.blocked.map(b => b.fact)).toEqual(expect.arrayContaining([TORCH, CODE]));

    await someoneSpeaks();
    await narrate('nar-later', 'The prisoner flexes his ruined hand.', MISS, LATER_RES);
    expect(liveTruths(TORCH), 'the narrator re-asserting the X-Carded fact is refused').toEqual([]);
  });

  it('control: the re-narration\'s own fact, live when the scene ended, is blocked as before', async () => {
    await burnThenSceneEnd();
    await playXCard();
    resume();
    await someoneSpeaks();
    await narrate('nar-later', 'The prisoner mutters the code again.', HIT, LATER_RES);
    expect(liveTruths(CODE)).toEqual([]);
  });

  it('control: before any X-Card, a superseded fact kept at scene end is no bar to a later narration restating it', async () => {
    await burnThenSceneEnd();
    expect(stored().sessionRetractions.blocked ?? []).toEqual([]);
    await someoneSpeaks();
    await narrate('nar-later', 'The prisoner flexes his ruined hand.', MISS, LATER_RES);
    expect(liveTruths(TORCH)).toHaveLength(1);
  });
});

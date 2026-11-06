/**
 * STARFORGED COMPANION
 * tests/unit/xcardDuringSceneEndMigrates.test.js
 *
 * XCARD-DURING-SCENE-END-MIGRATES (found while fixing XCARD-DURING-SCENE-END-
 * RACE). endScene migrates the closing scene's truths from its copy across
 * awaits — the entity truth to Vex's card, the text truth to a confirmed Lore
 * page, Vex's location to LAST KNOWN. An X-Card played on the narration while
 * that runs took back what had landed (retractNarrationCapture, issue #335
 * Y01), but the scene end went on writing from its copy, which still held
 * the beat live: the removed fact landed afterwards as a narrator-added
 * detail, as confirmed lore (ESTABLISHED LORE) and as LAST KNOWN. Each
 * migration write now checks the X-Card right before it writes, and takes
 * back its copy when the card landed while it was being written — the
 * capture writers' shape (XCARD-LATE-CAPTURE).
 *
 * Harness: xcardAfterSceneEnd.test.js's (Y01).
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { endScene } from '../../src/factContinuity/sceneLifecycle.js';
import { getConfirmedLore, recordLoreDiscovery, JOURNAL_NAMES } from '../../src/world/worldJournal.js';

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
    createEmbeddedDocuments: async (_type, docs) => { pagesCreated.push(...docs.map(d => d.name)); const created = docs.map(d => makePage(d, pages)); pages.push(...created); return created; },
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

let journals, orig, vex;
// Every page created and every write to Vex's card after the hold, in order.
let pagesCreated = [], vexWrites = [];
beforeEach(() => {
  pagesCreated = [];
  vexWrites = [];
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

  // Vex — a recorded connection (an NPC card), with no narrator-added details yet.
  vex = makeTestActor({ id: 'npc-vex', name: 'Vex', type: 'character', hasPlayerOwner: false,
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

const TORCH = {
  newTruths: [
    { subject: 'Vex',          fact: 'Held the prisoner down for the torch' },
    { subject: 'the prisoner', fact: 'His hand was burned with a cutting torch' },
  ],
  stateChanges: [{ subject: 'Vex', attribute: 'location', value: 'the interrogation cell' }],
  sceneFrame:   { location: 'the interrogation cell', present: ['Vex', 'the prisoner'], situation: 'The torch hovers over his hand' },
};

/** A narration as the narrator makes one: the sidecar applied with its id (on the canonical GM), then its card. */
async function narrate(narrationId, sidecar = TORCH) {
  const text = applyNarratorSidecar(
    `Vex pins the prisoner's wrist while the torch comes down.\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``,
    stored(), { narrationId, matchedEntityIds: ['npc-vex'] },
  );
  await postNarrationCard(text, { moveId: 'compel', outcome: 'weak_hit', _id: `res-${narrationId}` },
    stored(), { playerText: 'I press the prisoner for the code.', playerName: 'Kira', narrationId });
}

/** A person's chat line: the X-Card's beat begins after it. */
const someoneSpeaks = () => ChatMessage.create({ content: 'I keep pushing.', flags: {} });

/** `!scene end` / End a Session: endScene on a working copy of the store (issue #329 X10). */
const endTheScene = () => endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });

const vexRecord  = () => vex.getFlag(MODULE_ID, 'connection');
const vexDetails = () => (vexRecord().generativeTier ?? []).map(e => e.detail);
const loreTitles = () => getConfirmedLore(stored()).map(e => e.title);
const loreEntry  = (title) => (journals.get(JOURNAL_NAMES.lore)?.pages.contents ?? [])
  .map(p => p.flags?.[MODULE_ID]?.loreEntry).find(e => e?.title === title) ?? null;
const ARCHIVED   = 'the prisoner: His hand was burned with a cutting torch';


/** Vex's next card write waits on the returned release while `during` runs. */
async function holdVexWriteWhile(during) {
  const setFlag = vex.setFlag;
  let release;
  const gate = new Promise((r) => { release = r; });
  let reached;
  const atWrite = new Promise((r) => { reached = r; });
  let held = false;
  vex.setFlag = async (...args) => {
    if (!held) { held = true; reached(); await gate; }
    vexWrites.push(structuredClone(args[2] ?? null));
    return setFlag.apply(vex, args);
  };
  const ending = endTheScene();
  await atWrite;
  await during();
  release();
  await ending;
  vex.setFlag = setFlag;
}

const playXCard = async () => { syncChat(); expect(await suppressScene({}, { local: true })).toBe(true); };

describe('XCARD-DURING-SCENE-END-MIGRATES — an X-Card played while the scene end migrates the beat', () => {
  it('control: no X-Card — the scene end files the beat on Vex\'s card, as lore and as LAST KNOWN', async () => {
    await narrate('nar-torch');
    await holdVexWriteWhile(async () => {});
    expect(vexDetails()).toEqual(['Held the prisoner down for the torch']);
    expect(loreTitles()).toContain(ARCHIVED);
    expect(vexRecord().lastKnown?.location?.value).toBe('the interrogation cell');
  });

  it('the X-Card lands while Vex\'s detail is being written: nothing of the beat is left on the card, in ESTABLISHED LORE or in LAST KNOWN', async () => {
    await narrate('nar-torch');
    await holdVexWriteWhile(playXCard);
    expect(stored().xCardedNarrationIds).toEqual(['nar-torch']);    // control: the X-Card landed mid-end

    expect(vexDetails(), "Narrator-added details on Vex's card").toEqual([]);          // was: the detail written after the X-Card's undo
    expect(loreTitles(), 'ESTABLISHED LORE').not.toContain(ARCHIVED);                   // was: archived from the copy
    expect(vexRecord().lastKnown?.location?.value ?? null, 'LAST KNOWN').toBeNull();   // was: the removed whereabouts

    // Each write checks the card first: what landed after it was never written at all.
    expect(pagesCreated).not.toContain(ARCHIVED);
    expect(vexWrites.some(w => w?.lastKnown?.location?.value === 'the interrogation cell')).toBe(false);
  });

  it("control: a kept narration's truths still migrate when another narration is X-carded meanwhile", async () => {
    await narrate('nar-dock', { newTruths: [{ subject: 'the courier', fact: 'Must reach Ironway by dawn' }], stateChanges: [] });
    await someoneSpeaks();
    await narrate('nar-torch');
    await holdVexWriteWhile(playXCard);
    expect(stored().xCardedNarrationIds).toEqual(['nar-torch']);
    expect(loreTitles()).toContain('the courier: Must reach Ironway by dawn');
    expect(loreTitles()).not.toContain(ARCHIVED);
  });
});

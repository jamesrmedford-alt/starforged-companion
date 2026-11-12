/**
 * STATE-CORRECTION-DURING-SCENE-END-LOST (known-issues; found while fixing
 * the eleventh audit's open items). endScene keeps each recorded character's
 * whereabouts on their card as LAST KNOWN (keepLastKnownWhereabouts, issue
 * #286 C1) from its copy of the scene, across awaits — each archive page,
 * each card write. A `!state strike` (or `!state set`, or the correction
 * dialog's state Strike) landing meanwhile was lost: the copy still held the
 * struck location, so the card's LAST KNOWN said where the table had just
 * said the NPC was not, and the late pass re-kept only the attributes the
 * store still held. The values are now the store's while it holds the scene,
 * and a record is written again — from its LAST KNOWN as the end found it —
 * when the store's values changed while it was written.
 *
 * Harness: xcardDuringSceneEndMigrates.test.js's (a held card write, a held
 * page creation).
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar } from '../../src/narration/narrator.js';
import { endScene } from '../../src/factContinuity/sceneLifecycle.js';
import { applyFactContinuityCommand } from '../../src/factContinuity/chatCommands.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');

/** A held page creation: set to make the next lore page creation wait. */
let holdNextCreate = null;

function makeJournal(name) {
  const pages = [];
  const journal = {
    id: `journal-${name}`, name, flags: {},
    pages: { get contents() { return pages; }, find: (fn) => pages.find(fn) },
    createEmbeddedDocuments: async (_type, docs) => {
      const hold = holdNextCreate;
      if (hold) { holdNextCreate = null; hold.reached(); await hold.release; }
      const created = docs.map(makePage); pages.push(...created); return created;
    },
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

const EARLIER = { value: 'the docks', sessionNum: 6, at: 1, narrationId: null, previous: null };

let journals, orig, vex;
beforeEach(() => {
  holdNextCreate = null;
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

  // Vex — a recorded connection, last known (an earlier scene) at the docks.
  vex = makeTestActor({ id: 'npc-vex', name: 'Vex', type: 'character', hasPlayerOwner: false,
    flags: { [MODULE_ID]: { entityType: 'connection', connection: { name: 'Vex', generativeTier: [], lastKnown: { location: { ...EARLIER } } } } } });
  game.actors._set(vex.id, vex);

  game.settings._store.set(KEY, {
    currentSessionId: 'sess-7', sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
    connectionIds: ['npc-vex'], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
});
afterEach(() => {
  game.journal.get = orig.get; game.journal.getName = orig.getName; game.journal.find = orig.find;
  global.JournalEntry = { create: orig.create };
});

/** The narration: Vex in the interrogation cell, wounded; a lore fact (archived first at scene end). */
function narrate() {
  applyNarratorSidecar(
    `Vex leans in the doorway of the cell.\n\`\`\`json\n${JSON.stringify({
      newTruths: [{ subject: 'the prisoner', fact: 'Knows the vault code' }],
      stateChanges: [
        { subject: 'Vex', attribute: 'location', value: 'the interrogation cell' },
        { subject: 'Vex', attribute: 'condition', value: 'wounded' },
      ],
    })}\n\`\`\``,
    stored(), { narrationId: 'nar-cell', matchedEntityIds: ['npc-vex'] },
  );
}

const gm = (text) => applyFactContinuityCommand({ text }, { requesterIsGM: true });
const lastKnown = () => vex.getFlag(MODULE_ID, 'connection').lastKnown ?? {};
const endTheScene = () => endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });

/** `during` runs while the scene end's first lore page waits — before any LAST KNOWN is kept. */
async function whileLorePageHeld(during) {
  let release, reached;
  const gate = new Promise((r) => { release = r; });
  const atCreate = new Promise((r) => { reached = r; });
  holdNextCreate = { reached, release: gate };
  const ending = endTheScene();
  await atCreate;
  await during();
  release();
  await ending;
}

/** `during` runs while Vex's LAST KNOWN write waits. */
async function whileVexWriteHeld(during) {
  const setFlag = vex.setFlag;
  let release, reached;
  const gate = new Promise((r) => { release = r; });
  const atWrite = new Promise((r) => { reached = r; });
  let held = false;
  vex.setFlag = async (...args) => {
    if (!held) { held = true; reached(); await gate; }
    return setFlag.apply(vex, args);
  };
  const ending = endTheScene();
  await atWrite;
  await during();
  release();
  await ending;
  vex.setFlag = setFlag;
}

describe('STATE-CORRECTION-DURING-SCENE-END-LOST — a state correction made while the scene end keeps LAST KNOWN', () => {
  it('control: no correction — the scene\'s location and condition become LAST KNOWN', async () => {
    narrate();
    await endTheScene();
    expect(lastKnown().location?.value).toBe('the interrogation cell');
    expect(lastKnown().condition?.value).toBe('wounded');
  });

  it('a `!state strike` landing before LAST KNOWN is kept: the struck location is not kept — the earlier one stands', async () => {
    narrate();
    await whileLorePageHeld(() => gm('!state strike Vex location'));
    expect(lastKnown().location?.value).toBe('the docks');           // was: the interrogation cell
    expect(lastKnown().condition?.value).toBe('wounded');
  });

  it('a `!state strike` landing while Vex\'s LAST KNOWN is written: written again without it', async () => {
    narrate();
    await whileVexWriteHeld(() => gm('!state strike Vex location'));
    expect(lastKnown().location?.value).toBe('the docks');           // was: the interrogation cell
    expect(lastKnown().condition?.value).toBe('wounded');
  });

  it('every value struck meanwhile: LAST KNOWN goes back to what it was', async () => {
    narrate();
    await whileVexWriteHeld(async () => {
      await gm('!state strike Vex location');
      await gm('!state strike Vex condition');
    });
    expect(lastKnown().location?.value).toBe('the docks');
    expect(lastKnown().condition ?? null).toBeNull();
  });

  it('a `!state set` landing meanwhile: its value is the one kept', async () => {
    narrate();
    await whileVexWriteHeld(() => gm('!state set Vex location=the brig'));
    expect(lastKnown().location?.value).toBe('the brig');
  });
});

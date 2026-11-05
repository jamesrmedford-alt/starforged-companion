/**
 * STARFORGED COMPANION
 * tests/unit/xcardAfterSceneEnd.test.js
 *
 * Issue #335 Y01 (XCARD-AFTER-SCENE-END-KEEPS-MIGRATED-FACTS) — an X-Card
 * played after the scene ended still removes what the scene end kept.
 *
 * A narration posts (Vex holds the prisoner down for the torch; the
 * prisoner's hand is burned; Vex is in the cell) and the GM ends the scene:
 * the entity truth migrates to Vex's generative tier, the text truth to a
 * confirmed Lore page, Vex's location to LAST KNOWN. A player then plays the
 * X-Card on the narration still on screen. The ledger is empty by then, so
 * the migrated copies must carry the truth's `narrationId` (and LAST KNOWN
 * the value it superseded) for retractNarrationCapture to undo them
 * (rules/narrator-memory.md 6b; issue #329 X01; U07 full exclusion).
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

let journals, orig, vex;
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

describe('issue #335 Y01 — an X-Card played after the scene ended still removes what the scene end migrated', () => {
  it('control: the scene end migrates the beat — Vex\'s card, the Lore journal and LAST KNOWN hold it', async () => {
    await narrate('nar-torch');
    await endTheScene();
    expect(stored().currentSceneId ?? null).toBeNull();
    expect(vexDetails()).toEqual(['Held the prisoner down for the torch']);
    expect(loreTitles()).toContain(ARCHIVED);
    expect(vexRecord().lastKnown?.location?.value).toBe('the interrogation cell');
  });

  it('each migrated copy carries the narration id its ledger truth carried', async () => {
    await narrate('nar-torch');
    await endTheScene();
    expect(vexRecord().generativeTier[0].narrationId).toBe('nar-torch');
    expect(loreEntry(ARCHIVED)?.narrationId).toBe('nar-torch');
    expect(vexRecord().lastKnown?.location).toMatchObject({ value: 'the interrogation cell', narrationId: 'nar-torch', previous: null });
  });

  it('control: the X-Card BEFORE the scene end keeps the beat out of every store', async () => {
    await narrate('nar-torch');
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().sceneTruths.every(t => t.retracted && t.retractedBy === 'xcard')).toBe(true);

    await endTheScene();
    expect(vexDetails()).toEqual([]);
    expect(loreTitles()).not.toContain(ARCHIVED);
    expect(vexRecord().lastKnown?.location?.value ?? null).toBeNull();
  });

  it('the X-Card AFTER `!scene end` takes the beat off Vex\'s card, out of ESTABLISHED LORE and out of LAST KNOWN', async () => {
    await narrate('nar-torch');
    await endTheScene();
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    // The X-Card did pick the narration: its card is flagged removed.
    const card = game.messages.contents.find(m => m.flags?.[MODULE_ID]?.narrationId === 'nar-torch');
    expect(card?.flags?.[MODULE_ID]?.xCarded, 'the narration card is flagged xCarded').toBe(true);
    expect(stored().xCardedNarrationIds).toContain('nar-torch');

    expect.soft(loreTitles(), 'ESTABLISHED LORE').not.toContain(ARCHIVED);
    expect.soft(vexRecord().lastKnown?.location?.value ?? null, 'LAST KNOWN on Vex\'s card').not.toBe('the interrogation cell');
    expect(vexDetails(), 'Narrator-added details on Vex\'s card').toEqual([]);
  });

  it('LAST KNOWN falls back to what a kept narration of the scene set, then to the earlier scene\'s value', async () => {
    // An earlier scene left Vex at Bleakhold.
    await narrate('nar-dock', { newTruths: [], stateChanges: [{ subject: 'Vex', attribute: 'location', value: 'Bleakhold' }] });
    await endTheScene();
    expect(vexRecord().lastKnown.location.value).toBe('Bleakhold');

    // This scene: a kept narration puts her in the cargo bay; the removed one moves her to the cell.
    game.settings._store.set(KEY, { ...stored(), currentSceneId: 'sc-2', sceneState: { bySubject: {}, sceneId: 'sc-2' } });
    await someoneSpeaks();
    await narrate('nar-bay', { newTruths: [], stateChanges: [{ subject: 'Vex', attribute: 'location', value: 'the cargo bay' }] });
    await someoneSpeaks();
    await narrate('nar-torch');
    await endTheScene();
    expect(vexRecord().lastKnown.location.value).toBe('the interrogation cell');

    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardedNarrationIds).toEqual(['nar-torch']);
    expect(vexRecord().lastKnown.location).toMatchObject({ value: 'the cargo bay', narrationId: 'nar-bay' });
    expect(vexRecord().lastKnown.location.previous.map(v => v.value)).toEqual(['Bleakhold']);
  });

  it('a Lore page the archive rewrote is put back as it was, not retracted', async () => {
    await recordLoreDiscovery(ARCHIVED, { text: 'An older account.', confirmed: true }, stored());
    await narrate('nar-torch');
    await endTheScene();
    expect(loreEntry(ARCHIVED)?.narrationId).toBe('nar-torch');

    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    const entry = loreEntry(ARCHIVED);
    expect(entry).toMatchObject({ text: 'An older account.', confirmed: true, narrationId: null });
    expect(entry.retracted).not.toBe(true);
  });

  it('a narration that persisted while the scene was ending (the late migration) is undone too', async () => {
    const LATE = 'the courier: Must reach Ironway by dawn';
    await narrate('nar-torch', { newTruths: [{ subject: 'Vex', fact: 'Lit the torch' }], stateChanges: [] });
    // The narration lands during the scene end's first record write.
    const setFlag = vex.setFlag;
    let landed = false;
    vex.setFlag = async (...args) => {
      await setFlag(...args);
      if (landed) return;
      landed = true;
      await someoneSpeaks();
      await narrate('nar-late', { newTruths: [{ subject: 'the courier', fact: 'Must reach Ironway by dawn' }],
        stateChanges: [{ subject: 'Vex', attribute: 'location', value: 'the airlock' }] });
    };
    await endTheScene();
    vex.setFlag = setFlag;
    expect(loreTitles()).toContain(LATE);
    expect(vexRecord().lastKnown.location.value).toBe('the airlock');

    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardedNarrationIds).toEqual(['nar-late']);
    expect(loreTitles()).not.toContain(LATE);
    expect(vexRecord().lastKnown.location ?? null).toBeNull();
    expect(vexDetails()).toEqual(['Lit the torch']);
  });

  it('what a GM set with `!truth set` carries no narration id: the X-Card leaves its archive and takes the narration\'s', async () => {
    await narrate('nar-torch');
    const cs = foundry.utils.deepClone(stored());
    cs.sceneTruths.push({ id: 'tr-gm', subject: { kind: 'text', text: 'the code' }, fact: 'Is 7-4-1', sessionId: SESSION,
      sessionNum: 7, sceneId: 'sc-1', asserter: 'gm', source: 'manual_truth_cmd', retracted: false, migratedTo: null });
    await game.settings.set(MODULE_ID, 'campaignState', cs);
    await endTheScene();
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(loreTitles()).toContain('the code: Is 7-4-1');
    expect(loreTitles()).not.toContain(ARCHIVED);
  });
});

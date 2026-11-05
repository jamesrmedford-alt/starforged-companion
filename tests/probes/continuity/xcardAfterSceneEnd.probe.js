/**
 * PROBE — CONT-01 XCARD-AFTER-SCENE-END-KEEPS-MIGRATED-FACTS
 *
 * What the user does: the narrator posts a beat — Vex (a recorded connection)
 * holds the prisoner down for the torch, the prisoner's hand is burned, Vex is
 * in the interrogation cell. The GM types `!scene end` (or End a Session —
 * both run endScene), which migrates the beat's facts out of the ledger: the
 * entity truth to Vex's card, the text truth to the Lore journal, Vex's
 * location to LAST KNOWN. A player then plays the X-Card on the narration
 * still on screen.
 *
 * What happens: the X-Card picks the narration (xCardedNarrationCards) and
 * runs retractNarrationCapture by its narration id, but the scene-end
 * migration dropped the id each ledger truth carried: the tier detail
 * (sceneLifecycle.js safeMigrateToEntityTier builds `tierEntry` without it),
 * the archived Lore page (archiveSceneTruth → recordLoreDiscovery passes
 * none) and LAST KNOWN (keepLastKnownWhereabouts) carry no `narrationId`, and
 * the ledger — now empty — holds nothing to retract. The removed beat stays
 * on Vex's card under Narrator-added details, in ESTABLISHED LORE and as LAST
 * KNOWN, and every later prompt reads it.
 *
 * What should happen: the X-Card takes the beat out of every store its
 * narration wrote (rules/narrator-memory.md 6b: "Anything a narration writes
 * outside the ledgers carries its `narrationId` so the X-Card can undo it
 * too"; issue #329 X01 / U07 full exclusion). The migrated detail, the
 * archived lore and the kept whereabouts carry the truth's `narrationId` and
 * leave with the narration.
 *
 * Control: the X-Card played BEFORE the scene ends retracts the truths and
 * removes the state value in the ledger, and the migration skips them —
 * nothing reaches the tier, the lore or LAST KNOWN.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/continuity/xcardAfterSceneEnd.probe.js
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../../src/narration/narrator.js';
import { suppressScene } from '../../../src/context/safety.js';
import { endScene } from '../../../src/factContinuity/sceneLifecycle.js';
import { getConfirmedLore } from '../../../src/world/worldJournal.js';

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
async function narrate(narrationId) {
  const text = applyNarratorSidecar(
    `Vex pins the prisoner's wrist while the torch comes down.\n\`\`\`json\n${JSON.stringify(TORCH)}\n\`\`\``,
    stored(), { narrationId, matchedEntityIds: ['npc-vex'] },
  );
  await postNarrationCard(text, { moveId: 'compel', outcome: 'weak_hit', _id: `res-${narrationId}` },
    stored(), { playerText: 'I press the prisoner for the code.', playerName: 'Kira', narrationId });
}

/** `!scene end` / End a Session: endScene on a working copy of the store (issue #329 X10). */
const endTheScene = () => endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });

const vexRecord  = () => vex.getFlag(MODULE_ID, 'connection');
const vexDetails = () => (vexRecord().generativeTier ?? []).map(e => e.detail);
const loreTitles = () => getConfirmedLore(stored()).map(e => e.title);
const ARCHIVED   = 'the prisoner: His hand was burned with a cutting torch';

describe('CONT-01 — an X-Card played after the scene ended still removes what the scene end migrated', () => {
  it('control: the scene end migrates the beat — Vex\'s card, the Lore journal and LAST KNOWN hold it', async () => {
    await narrate('nar-torch');
    await endTheScene();
    expect(stored().currentSceneId ?? null).toBeNull();
    expect(vexDetails()).toEqual(['Held the prisoner down for the torch']);
    expect(loreTitles()).toContain(ARCHIVED);
    expect(vexRecord().lastKnown?.location?.value).toBe('the interrogation cell');
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

    // The migrated copies carry no narration id, so nothing undoes them.
    expect.soft(loreTitles(), 'ESTABLISHED LORE').not.toContain(ARCHIVED);
    expect.soft(vexRecord().lastKnown?.location?.value ?? null, 'LAST KNOWN on Vex\'s card').not.toBe('the interrogation cell');
    expect(vexDetails(), 'Narrator-added details on Vex\'s card').toEqual([]);
  });
});

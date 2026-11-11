/**
 * STARFORGED COMPANION — bug-audit probe (area: fact continuity / X-Card)
 * tests/probes/cont/xcardAfterUpgradeSupersede.probe.js
 *
 * CONT — an X-Card played after a Burn Momentum / Improve Result leaves what
 * the superseded (pre-upgrade) narration's capture recorded.
 *
 * A miss is narrated (the prisoner's hand is burned with a torch; Vex held him
 * down). About two seconds later its capture records what the prose
 * established: a confirmed World Journal lore entry and a detail on Vex's
 * card, both stamped with the narration's id (issue #329 X01). The roller
 * burns momentum: the pre-burn card is struck through (`burnSuperseded`) and
 * the re-narration posts under it. A player then plays the X-Card on the beat
 * on screen.
 *
 * `xCardedNarrationCards` (narrator.js) walks the beat but takes only cards
 * still "in narrator memory" — a `burnSuperseded` card is skipped — so
 * `suppressScene` → `finishXCardRemoval` (src/context/safety.js) undoes the
 * re-narration alone: the struck card's narration id is never passed to
 * `retractNarrationCapture`, and its lore and tier detail go on reaching
 * every later prompt (ESTABLISHED LORE, the NPC's card).
 *
 * Correct behaviour asserted here: the X-Card takes the whole beat on screen
 * out of the stores its captures wrote — the superseded narration's too.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../../src/narration/narrator.js';
import { suppressScene } from '../../../src/context/safety.js';
import { getConfirmedLore, JOURNAL_NAMES } from '../../../src/world/worldJournal.js';
import { routeWorldJournalResults } from '../../../src/entities/entityExtractor.js';
import { supersedeOriginalNarration } from '../../../src/moves/burnMomentum.js';

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

const MISS = {
  newTruths: [{ subject: 'the prisoner', fact: 'His hand was burned with a cutting torch' }],
  stateChanges: [],
  sceneFrame: { location: 'the interrogation cell', present: ['Vex', 'the prisoner'], situation: 'The torch hovers over his hand' },
};
const HIT = {
  newTruths: [{ subject: 'the prisoner', fact: 'Gave up the door code' }],
  stateChanges: [],
  sceneFrame: { location: 'the interrogation cell', present: ['Vex', 'the prisoner'], situation: 'The prisoner talks' },
};
const RES_ID = 'res-compel-1';
const TORCH_LORE = 'The Torch Room';

/** A narration as the narrator makes one: the sidecar applied with its id, then its card. */
async function narrate(narrationId, prose, sidecar) {
  const text = applyNarratorSidecar(`${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``, stored(),
    { narrationId, matchedEntityIds: ['npc-vex'] });
  await postNarrationCard(text, { moveId: 'compel', outcome: 'miss', _id: RES_ID }, stored(),
    { playerText: 'I press the prisoner for the code.', playerName: 'Kira', narrationId });
  // let the chained sidecar persist land
  await new Promise(r => setTimeout(r, 0));
}

/** The narration's capture (runDiscoveryDetection → routeWorldJournalResults), ~2 s after its card: world lore and a fact for Vex's card. */
const capture = (narrationId) => routeWorldJournalResults({
  lore: [
    { title: TORCH_LORE, text: 'Vex burned the prisoner\'s hand with a cutting torch to get the code.' },
    { title: 'Vex and the torch', text: 'Held the prisoner down for the torch', entityName: 'Vex' },
  ],
}, stored(), { narrationId });

const someoneSpeaks = () => ChatMessage.create({ content: 'I press the prisoner for the code.', flags: {} });
const loreTitles = () => getConfirmedLore(stored()).map(e => e.title);
const loreEntry  = (title) => (journals.get(JOURNAL_NAMES.lore)?.pages.contents ?? [])
  .map(p => p.flags?.[MODULE_ID]?.loreEntry).find(e => e?.title === title) ?? null;
const vexDetails = () => (vex.getFlag(MODULE_ID, 'connection').generativeTier ?? []).map(e => e.detail);
const cardOf     = (narrationId) => ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.narrationId === narrationId);

describe('CONT — the X-Card after a Burn Momentum / Improve Result', () => {
  it('control: an X-Card on the miss narration itself (no burn) undoes what its capture recorded', async () => {
    await someoneSpeaks();
    await narrate('nar-miss', 'Vex pins his wrist while the torch comes down.', MISS);
    await capture('nar-miss');
    expect(loreTitles()).toContain(TORCH_LORE);
    expect(loreEntry(TORCH_LORE).narrationId).toBe('nar-miss');
    expect(vexDetails()).toEqual(['Held the prisoner down for the torch']);

    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardedNarrationIds).toEqual(['nar-miss']);
    expect(loreTitles()).not.toContain(TORCH_LORE);
    expect(vexDetails()).toEqual([]);
  });

  it('control: the burn strikes the miss narration and takes it out of the ring; its capture\'s records stand (issue #338 D8)', async () => {
    await someoneSpeaks();
    await narrate('nar-miss', 'Vex pins his wrist while the torch comes down.', MISS);
    await capture('nar-miss');
    syncChat();
    await supersedeOriginalNarration({ resolutionId: RES_ID }, { kind: 'burn' });
    expect(cardOf('nar-miss').flags[MODULE_ID].burnSuperseded).toBe(true);
    expect(stored().sceneTruths.find(t => t.narrationId === 'nar-miss')).toMatchObject({ retracted: true, retractedBy: 'superseded' });
    expect(loreTitles()).toContain(TORCH_LORE);
  });

  it('the X-Card on the beat on screen — the struck miss narration and its re-narration — removes the miss narration\'s lore and NPC detail too', async () => {
    await someoneSpeaks();
    await narrate('nar-miss', 'Vex pins his wrist while the torch comes down.', MISS);
    await capture('nar-miss');

    // Burn Momentum: the miss narration is superseded, the upgraded outcome re-narrated under it.
    syncChat();
    await supersedeOriginalNarration({ resolutionId: RES_ID }, { kind: 'burn' });
    await narrate('nar-hit', 'The prisoner breaks before the torch touches him again, and talks.', HIT);

    // A player plays the X-Card: both cards of the beat are on screen.
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(cardOf('nar-hit').flags[MODULE_ID].xCarded, 'the re-narration is removed').toBe(true);

    expect.soft(stored().xCardedNarrationIds, 'the narrations the X-Card removed').toContain('nar-miss');
    expect.soft(loreTitles(), 'ESTABLISHED LORE after the X-Card').not.toContain(TORCH_LORE);
    expect(vexDetails(), 'Narrator-added details on Vex\'s card after the X-Card').toEqual([]);
  });
});

/**
 * STARFORGED COMPANION
 * tests/unit/strikeDuringSceneEnd.test.js
 *
 * STRIKE-DURING-SCENE-END-LOST (found while fixing XCARD-DURING-SCENE-END-
 * RACE). endScene migrates the closing scene's truths from its copy across
 * awaits — each archive page, each card detail. A `!truth strike` (or a
 * correction dialog's Replace) landing meanwhile was lost: the copy still held
 * the truth live, so the scene end archived it as confirmed lore and kept it
 * for a later X-Card instead of as the session's strike — not named under
 * CORRECTED, not blocking the narrator restating it. The struck fact came
 * back as ESTABLISHED LORE the same session. Each migration now re-reads the
 * truth's entry in the store first, and after its write takes back the copy
 * when the correction landed while it was written (the correction's own
 * propagation, re-run); the scene end's write keeps the scene's truths as the
 * store holds them (a retraction there sticks).
 *
 * Harness: xcardRetractionOutlivesScene.test.js's (a held page creation).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../src/narration/narrator.js';
import { endScene } from '../../src/factContinuity/sceneLifecycle.js';
import { applyFactContinuityCommand } from '../../src/factContinuity/chatCommands.js';
import { sessionRetractedFacts, propagateRetraction } from '../../src/factContinuity/retractions.js';
import { replaceTruth } from '../../src/factContinuity/ledgers.js';
import { persistSceneLedgerFields } from '../../src/factContinuity/sceneLifecycle.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';
import { getConfirmedLore } from '../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-4';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');

/** A held page creation: a test sets `holdNextCreate` to make the next page creation wait on it. */
let holdNextCreate = null;
/** Every page created, by name, in order. */
let pagesCreated = [];

function makeJournal(name) {
  const pages = [];
  const journal = {
    id: `journal-${name}`, name, flags: {},
    pages: { get contents() { return pages; }, find: (fn) => pages.find(fn) },
    createEmbeddedDocuments: async (_type, docs) => {
      const hold = holdNextCreate;
      if (hold) { holdNextCreate = null; hold.reached(); await hold.release; }
      pagesCreated.push(...docs.map(d => d.name));
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

let journals, orig;
beforeEach(() => {
  holdNextCreate = null;
  pagesCreated = [];
  journals = new Map();
  orig = { get: game.journal.get, getName: game.journal.getName, find: game.journal.find, create: global.JournalEntry?.create };
  game.journal.get     = (id) => [...journals.values()].find(j => j.id === id) ?? null;
  game.journal.getName = (n) => journals.get(n) ?? null;
  game.journal.find    = (fn) => [...journals.values()].find(fn) ?? null;
  global.JournalEntry  = { create: async (data) => { const j = makeJournal(data.name); journals.set(data.name, j); return j; } };

  ChatMessage._reset();
  game.settings._store.clear();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 4, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
  });
});
afterEach(() => {
  game.journal.get = orig.get; game.journal.getName = orig.getName; game.journal.find = orig.find;
  global.JournalEntry = { create: orig.create };
});

const DEAD = 'Is dead';

/** A narration as the narrator makes one: the sidecar applied with its id (on the canonical GM), then its card. */
async function narrate(narrationId, newTruths) {
  const text = applyNarratorSidecar(
    `The airlock cycles.\n\`\`\`json\n${JSON.stringify({ newTruths, stateChanges: [] })}\n\`\`\``,
    stored(), { narrationId },
  );
  await postNarrationCard(text, { moveId: 'compel', outcome: 'weak_hit', _id: `res-${narrationId}` },
    stored(), { playerText: 'I press on.', playerName: 'Kira', narrationId });
}

/** A person's chat line: the X-Card's beat begins after it. */
const someoneSpeaks = () => ChatMessage.create({ content: 'I look around.', flags: {} });
const gm = (text) => applyFactContinuityCommand({ text }, { requesterIsGM: true });
const truthFor = (fact, narrationId) => stored().sceneTruths.find(t => t.fact === fact && (!narrationId || t.narrationId === narrationId));
const liveTruths = (fact) => stored().sceneTruths.filter(t => t.fact === fact && !t.retracted);
const strike = (fact, narrationId) => gm(`!truth strike ${truthFor(fact, narrationId).id.slice(0, 8)}`);
const named = () => sessionRetractedFacts(stored()).map(f => `${f.label} — ${f.fact}`);
const corrected = () => buildLedgerBlock(stored(), {}).combined;
const canon = () => getConfirmedLore(stored()).map(e => e.title);
const SHUTTLE = 'Took the shuttle';

/** End the scene (`!scene start`'s end), holding it at its first page creation while `during` runs. */
async function endSceneWhile(during) {
  let release;
  const reached = new Promise((resolve) => {
    holdNextCreate = { reached: resolve, release: new Promise((r) => { release = r; }) };
  });
  const ending = endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });
  await reached;
  await during();
  release();
  await ending;
  game.settings._store.set(KEY, { ...stored(), currentSceneId: 'sc-2', sceneState: { bySubject: {}, sceneId: 'sc-2' } });
}

/** The correction dialog's Replace, as it applies one: on a copy of the store, its propagation, the ledger persisted. */
async function replace(fact, next) {
  const working = foundry.utils.deepClone(stored());
  const replaced = replaceTruth(truthFor(fact).id, { fact: next }, working, { isGM: true, actor: 'gm' });
  await propagateRetraction(replaced.struck, working);
  await persistSceneLedgerFields(working, ['sceneTruths'], 'test replace');
}

describe('STRIKE-DURING-SCENE-END-LOST — a correction that lands while the scene ends sticks', () => {
  it('control: no correction — both truths are archived as lore, and nothing is named', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }, { subject: 'Kira', fact: SHUTTLE }]);
    await endSceneWhile(async () => {});
    expect(canon()).toEqual(expect.arrayContaining(['Vance: Is dead', 'Kira: Took the shuttle']));
    expect(named()).toEqual([]);
  });

  it("a strike of a truth not yet migrated: it is the session's strike — named, not archived, not restated", async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }, { subject: 'Kira', fact: SHUTTLE }]);
    await endSceneWhile(() => strike(SHUTTLE));                   // lands while Vance's page is written

    expect(named()).toEqual(['Kira — Took the shuttle']);          // was: [] — the strike lost
    expect(corrected()).toContain(SHUTTLE);
    expect(canon()).not.toContain('Kira: Took the shuttle');       // was: archived as confirmed lore
    expect(pagesCreated).not.toContain('Kira: Took the shuttle');  // read first: never written at all
    expect(canon()).toContain('Vance: Is dead');                   // control: the other truth migrates
    await someoneSpeaks();
    await narrate('nar-2', [{ subject: 'Kira', fact: SHUTTLE }]);
    expect(liveTruths(SHUTTLE)).toEqual([]);                       // was: recorded again
  });

  it('a strike of the truth whose page is being written: the page is taken back out of canon, and the strike kept', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await endSceneWhile(() => strike(DEAD));                       // lands while Vance's own page is written

    expect(named()).toEqual(['Vance — Is dead']);
    expect(canon()).not.toContain('Vance: Is dead');               // was: confirmed canon, the strike's propagation past
  });

  it("a Replace while the scene ends: the replacement stands, the original is neither archived nor named", async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }, { subject: 'Kira', fact: SHUTTLE }]);
    await endSceneWhile(() => replace(SHUTTLE, 'Took the freighter'));

    expect(canon()).not.toContain('Kira: Took the shuttle');       // was: archived as confirmed lore
    expect(pagesCreated).not.toContain('Kira: Took the shuttle');
    expect(canon()).toContain('Kira: Took the freighter');         // the GM's replacement, archived as canon
    expect(named()).toEqual([]);                                    // a Replace is no bare strike
  });
});

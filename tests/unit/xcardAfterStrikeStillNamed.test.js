/**
 * STARFORGED COMPANION
 * tests/unit/xcardAfterStrikeStillNamed.test.js
 *
 * XCARD-AFTER-STRIKE-STILL-NAMED (issue #338's open items). The narrator
 * asserts "Vance — Is dead"; the GM strikes it (`!truth strike`); a player
 * then plays the X-Card on that narration. `retractNarrations` passed over the
 * truth — already retracted — so it kept `retractedBy: "gm"`: the CORRECTED
 * block and the rolling summary's leave-out list (both `sessionRetractedFacts`)
 * named it for the rest of the session, handing the narrator the content the
 * table removed (issue #321 U07), and a `!truth set` lifted it, restoring the
 * lore the strike had retracted (issue #326 W60 / #331 X31 — an X-Card's
 * retraction is never lifted). Once the scene had ended, the strike lived on
 * in `sessionRetractions`, which the X-Card never touched.
 *
 * The X-Card now relabels a removed narration's bare strike as its own
 * (`retractedBy: "xcard"`, `retractedAt` kept) and drops the strike's
 * `sessionRetractions` entry (kept with the truth's `narrationId`); a
 * `!truth set` restores the struck lore only for a lift its persist kept.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { endScene } from '../../src/factContinuity/sceneLifecycle.js';
import { applySidecar, retractNarrations, SUPERSEDED_RETRACTED_BY } from '../../src/factContinuity/ledgers.js';
import { applyFactContinuityCommand } from '../../src/factContinuity/chatCommands.js';
import { sessionRetractedFacts } from '../../src/factContinuity/retractions.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';
import { getConfirmedLore, recordLoreDiscovery, JOURNAL_NAMES } from '../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-4';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };

/** Held page writes: a test sets `holdNextWrite` to make the next setFlag wait on it. */
let holdNextWrite = null;

function makeJournal(name) {
  const pages = [];
  const journal = {
    id: `journal-${name}`, name, flags: {},
    pages: { get contents() { return pages; }, find: (fn) => pages.find(fn) },
    createEmbeddedDocuments: async (_type, docs) => { const created = docs.map(makePage); pages.push(...created); return created; },
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
    setFlag: async (mod, key, val) => {
      const hold = holdNextWrite;
      if (hold) { holdNextWrite = null; hold.reached(); await hold.release; }
      (page.flags[mod] ??= {})[key] = val;
    },
    getFlag: (mod, key) => page.flags?.[mod]?.[key],
    update: async (data) => Object.assign(page, data),
    delete: async () => {},
  };
  return page;
}

let journals, orig;
beforeEach(() => {
  holdNextWrite = null;
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

const DEAD  = 'Is dead';
const DEBT  = 'Owes the crew a favour';

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
const strike = (fact, narrationId) => gm(`!truth strike ${truthFor(fact, narrationId).id.slice(0, 8)}`);
const playXCard = async () => { syncChat(); expect(await suppressScene({}, { local: true })).toBe(true); };
const named = () => sessionRetractedFacts(stored()).map(f => `${f.label} — ${f.fact}`);
const corrected = () => buildLedgerBlock(stored(), {}).combined;
const endTheScene = () => endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });

const LORE = "Vance's death";
const loreEntry = () => (journals.get(JOURNAL_NAMES.lore)?.pages.contents ?? [])
  .map(p => p.flags?.[MODULE_ID]?.loreEntry).find(e => e?.title === LORE) ?? null;
const canon = () => getConfirmedLore(stored()).map(e => e.title);

/** An earlier, kept narration's capture recorded the same fact as confirmed lore. */
const recordEarlierLore = () => recordLoreDiscovery(LORE, {
  text: 'Vance is dead — shot at the dock.', category: 'other', narratorAsserted: true, confirmed: true, narrationId: 'nar-0',
}, stored());

describe('XCARD-AFTER-STRIKE-STILL-NAMED — the X-Card takes over a strike of the narration it removes', () => {
  it('control: a GM strike is named under CORRECTED and in the summary\'s leave-out list', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await strike(DEAD);
    expect(named()).toEqual(['Vance — Is dead']);
    expect(corrected()).toContain('Vance — Is dead');
  });

  it('the X-Card on the struck narration relabels its strike the X-Card\'s — named nowhere, still blocking a re-assertion', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await strike(DEAD);
    const struckAt = truthFor(DEAD).retractedAt;

    await playXCard();

    expect(truthFor(DEAD)).toMatchObject({ retracted: true, retractedBy: 'xcard', retractedAt: struckAt, correctedTo: null });
    expect(named(), 'CORRECTED / the leave-out list').toEqual([]);
    expect(corrected()).not.toContain('Is dead');

    // The narrator re-asserting it is still refused by the ledger.
    applySidecar({ newTruths: [{ subject: 'Vance', fact: DEAD }], stateChanges: [] }, { campaignState: stored(), narrationId: 'nar-2' });
    expect(stored().sceneTruths.filter(t => t.fact === DEAD)).toHaveLength(1);
  });

  it('control: a strike of a kept narration stays the GM\'s and stays named', async () => {
    await narrate('nar-0', [{ subject: 'the dockmaster', fact: DEBT }]);
    await someoneSpeaks();
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await strike(DEBT);
    await strike(DEAD);

    await playXCard();

    expect(truthFor(DEBT)).toMatchObject({ retracted: true, retractedBy: 'gm' });
    expect(truthFor(DEAD)).toMatchObject({ retracted: true, retractedBy: 'xcard' });
    expect(named()).toEqual(['the dockmaster — Owes the crew a favour']);
  });

  it('`!truth set` after the X-Card cannot lift it: the strike stays the X-Card\'s and its lore stays out of canon', async () => {
    await recordEarlierLore();
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await strike(DEAD);
    expect(loreEntry()).toMatchObject({ retracted: true, retractedByTruth: truthFor(DEAD).id });

    await playXCard();
    await gm(`!truth set "Vance" ${DEAD}`);

    const removed = truthFor(DEAD, 'nar-1');
    expect(removed).toMatchObject({ retracted: true, retractedBy: 'xcard', correctedTo: null });
    expect(loreEntry()).toMatchObject({ retracted: true, confirmed: false });
    expect(canon()).not.toContain(LORE);
    const card = ChatMessage._created.at(-1).content;
    expect(card).not.toContain('The strike on it is lifted');
  });

  it('after the scene ended, the X-Card drops the strike the session kept (sessionRetractions)', async () => {
    await narrate('nar-0', [{ subject: 'the dockmaster', fact: DEBT }]);
    await someoneSpeaks();
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await strike(DEBT);
    await strike(DEAD);
    await endTheScene();
    expect(stored().sceneTruths).toEqual([]);
    expect(named()).toEqual(['the dockmaster — Owes the crew a favour', 'Vance — Is dead']);
    expect(stored().sessionRetractions.facts.map(f => f.narrationId)).toEqual(['nar-0', 'nar-1']);

    await playXCard();

    expect(stored().xCardedNarrationIds).toEqual(['nar-1']);
    expect(named(), 'the kept narration\'s strike stays; the removed one\'s goes').toEqual(['the dockmaster — Owes the crew a favour']);
    expect(corrected()).not.toContain('Is dead');
  });

  it('control: a superseded narration (Burn Momentum / Improve Result) leaves a GM strike of its truth the GM\'s', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await strike(DEAD);
    const cs = { ...stored() };
    retractNarrations(cs, ['nar-1'], { by: SUPERSEDED_RETRACTED_BY });
    expect(cs.sceneTruths.find(t => t.fact === DEAD)).toMatchObject({ retracted: true, retractedBy: 'gm' });
    expect(sessionRetractedFacts(cs).map(f => f.fact)).toEqual([DEAD]);
  });

  it('a `!truth set` the X-Card overtakes leaves the ledger and the lore agreeing — the lore is canon only if the lift stood', async () => {
    await recordEarlierLore();
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await strike(DEAD);
    const struckId = truthFor(DEAD).id;

    // The set's first lore write waits; the X-Card is played meanwhile.
    let release;
    const reached = new Promise((resolve) => {
      holdNextWrite = { reached: resolve, release: new Promise((r) => { release = r; }) };
    });
    const setting = gm(`!truth set "Vance" ${DEAD}`);
    await reached;
    await playXCard();
    release();
    await setting;

    const original = stored().sceneTruths.find(t => t.id === struckId);
    const live = stored().sceneTruths.filter(t => t.fact === DEAD && !t.retracted);
    const liftStood = !!original.correctedTo && live.some(t => t.id === original.correctedTo);
    expect(liftStood, 'the set landed before the X-Card, so its lift stands').toBe(true);
    expect(canon().includes(LORE)).toBe(liftStood);
    expect(loreEntry().retracted).toBe(!liftStood);
  });
});

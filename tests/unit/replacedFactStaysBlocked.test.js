/**
 * Issue #345 AA05 REPLACED-FACT-UNBLOCKED-NEXT-SCENE (the twelfth audit's
 * R2M-1, with round 1's CONT-3 — the X-Card-on-a-Replaced-truth variant).
 *
 * The correction dialog's Replace… retracts the original (`retractedBy`
 * 'gm', `correctedTo` the replacement) and, inside its scene, the retracted
 * entry blocks a restatement (findEquivalentTruth reads retracted entries).
 * A scene end kept nothing of it: rememberSessionRetractions kept bare
 * strikes (a Replace's original carries `correctedTo`, so it is not one) and
 * X-Card retractions (the X-Card relabels only a bare strike), and
 * rememberNarratedTruths keeps live truths only. So in the next scene of the
 * session — the ring still carrying the prose that stated it — the
 * narrator's restatement of the replaced wording was recorded live and
 * binding, and the next scene end archived it as canon beside the GM's
 * replacement; and the X-Card's block on a truth the GM had Replaced ended
 * with the scene too ("for the rest of the session … in that scene or a
 * later one" — help, Safety System). Now a scene end keeps a Replace's
 * original on the session's unnamed blocks (`sessionRetractions.blocked`):
 * never named — the replacement stands — and blocking the restatement for the
 * rest of the session, as a kept strike and the X-Card's retraction do.
 *
 * Real producers: applyNarratorSidecar + postNarrationCard (the narrator's
 * sidecar apply and persist), the correction dialog's Replace… row button
 * (openCorrectionDialog → its 'replace-truth' action), `!truth strike` / `!truth
 * set` (the relay handler), suppressScene (the X-Card), endScene.
 */

/* global EventTarget */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { endScene } from '../../src/factContinuity/sceneLifecycle.js';
import { applyFactContinuityCommand } from '../../src/factContinuity/chatCommands.js';
import { openCorrectionDialog } from '../../src/factContinuity/correctionDialog.js';
import { sessionRetractedFacts } from '../../src/factContinuity/retractions.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';
import { getConfirmedLore } from '../../src/world/worldJournal.js';
import { parseHTML, setListenerResultSink } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-4';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };

class FakeDialogV2 extends EventTarget {
  static last = null;
  static promptAnswer = async () => '';
  constructor(options) { super(); this.options = options; this.element = null; FakeDialogV2.last = this; }
  async render() {
    this.element = parseHTML(`<div class="window-content">${this.options.content}</div>`);
    this.dispatchEvent(new Event('render'));
    return this;
  }
  static async prompt() { return FakeDialogV2.promptAnswer(); }
}

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
    setFlag: async (mod, key, val) => { (page.flags[mod] ??= {})[key] = val; },
    getFlag: (mod, key) => page.flags?.[mod]?.[key],
    update: async (data) => Object.assign(page, data),
    delete: async () => {},
  };
  return page;
}

let journals, orig, pending;
beforeEach(() => {
  pending = [];
  setListenerResultSink((p) => pending.push(p));
  FakeDialogV2.promptAnswer = async () => '';
  global.foundry.applications.api.DialogV2 = FakeDialogV2;
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
  setListenerResultSink(null);
  delete global.foundry.applications.api.DialogV2;
  game.journal.get = orig.get; game.journal.getName = orig.getName; game.journal.find = orig.find;
  global.JournalEntry = { create: orig.create };
});

const DEAD    = 'Is dead';
const WOUNDED = 'Is badly wounded';

/** A narration whose sidecar states the given truths, applied and posted as the narrator does. */
async function narrate(narrationId, newTruths) {
  const text = applyNarratorSidecar(
    `The airlock cycles.\n\`\`\`json\n${JSON.stringify({ newTruths, stateChanges: [] })}\n\`\`\``,
    stored(), { narrationId },
  );
  await postNarrationCard(text, { moveId: 'compel', outcome: 'weak_hit', _id: `res-${narrationId}` },
    stored(), { playerText: 'I press on.', playerName: 'Kira', narrationId });
}
const someoneSpeaks = () => ChatMessage.create({ content: 'I look around.', flags: {} });
const gm = (text) => applyFactContinuityCommand({ text }, { requesterIsGM: true });
const truthFor   = (fact) => stored().sceneTruths.find(t => t.fact === fact);
const liveTruths = (fact) => stored().sceneTruths.filter(t => t.fact === fact && !t.retracted);
const playXCard = async () => { syncChat(); expect(await suppressScene({}, { local: true })).toBe(true); };
const resume = () => { game.settings._store.set(KEY, { ...stored(), xCardActive: false }); };
/** The GM's `!scene end` then `!scene start`, as the scene command runs them (a copy each). */
const nextScene = async (sceneId = 'sc-2') => {
  await endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });
  game.settings._store.set(KEY, { ...stored(), currentSceneId: sceneId, sceneState: { bySubject: {}, sceneId } });
};
const named = () => {
  const block = buildLedgerBlock(stored(), { matchedEntityIds: [], currentLocationId: null, maxTokens: Infinity });
  return { corrected: block.corrections ?? '', leaveOut: sessionRetractedFacts(stored()).map(f => `${f.label} — ${f.fact}`) };
};

/** The GM corrects the truth with Correct Active Scene Facts → Replace… (the correction dialog's row button). */
async function gmReplaces(fact, wording) {
  await openCorrectionDialog({ flags: { [MODULE_ID]: { matchedEntityIds: [], contradictedTruthId: truthFor(fact).id } } });
  FakeDialogV2.promptAnswer = async () => wording;
  FakeDialogV2.last.element.querySelector('[data-action="replace-truth"]').click();
  await Promise.all(pending);
  expect(truthFor(fact)).toMatchObject({ retracted: true, retractedBy: 'gm' });   // setup: the Replace landed
  expect(truthFor(fact).correctedTo).toBeTruthy();
  expect(liveTruths(wording)).toHaveLength(1);
}

describe('issue #345 AA05 — a fact the GM Replaced stays blocked for the session, not only its scene', () => {
  it('control: with a bare Strike, the block outlives the scene (Z42)', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await gm(`!truth strike ${truthFor(DEAD).id.slice(0, 8)}`);
    await nextScene();
    await narrate('nar-2', [{ subject: 'Vance', fact: DEAD }]);
    expect(liveTruths(DEAD)).toEqual([]);
  });

  it("control: inside the Replace's own scene, the replaced wording is blocked", async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await gmReplaces(DEAD, WOUNDED);
    await narrate('nar-2', [{ subject: 'Vance', fact: DEAD }]);
    expect(liveTruths(DEAD)).toEqual([]);
  });

  it("Replace → scene end: the next scene's narration restating the replaced wording is not recorded live", async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await gmReplaces(DEAD, WOUNDED);
    await nextScene();
    // The replacement stood and left with its scene (archived) — the GM's correction.
    expect(getConfirmedLore(stored()).map(e => e.title)).toContain(`Vance: ${WOUNDED}`);
    // The ring still carries nar-1's prose; the model restates the old wording.
    await narrate('nar-2', [{ subject: 'Vance', fact: DEAD }]);
    expect(liveTruths(DEAD).map(t => `Vance — ${t.fact} (${t.narrationId})`)).toEqual([]);
  });

  it('…so the next scene end never files the replaced wording as canon beside the replacement', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await gmReplaces(DEAD, WOUNDED);
    await nextScene();
    await narrate('nar-2', [{ subject: 'Vance', fact: DEAD }]);
    await endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });
    const titles = getConfirmedLore(stored()).map(e => e.title);
    expect(titles).toContain(`Vance: ${WOUNDED}`);
    expect(titles).not.toContain(`Vance: ${DEAD}`);
  });

  it('the replaced wording is kept unnamed — never under CORRECTED or in the summary\'s leave-out list — and the replacement stays binding', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await gmReplaces(DEAD, WOUNDED);
    await nextScene();
    expect(stored().sessionRetractions?.blocked?.map(b => `${b.label} — ${b.fact}`)).toEqual([`Vance — ${DEAD}`]);
    expect(stored().sessionRetractions?.facts ?? []).toEqual([]);
    expect(named()).toEqual({ corrected: '', leaveOut: [] });
  });

  it("control: a GM's own `!truth set` of the replaced wording in the next scene is recorded — the GM's authority", async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await gmReplaces(DEAD, WOUNDED);
    await nextScene();
    await gm(`!truth set "Vance" ${DEAD}`);
    expect(liveTruths(DEAD).map(t => t.asserter)).toEqual(['gm']);
  });

  it("control: a strike the GM's `!truth set` lifted is no Replace — the next scene may restate the fact", async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await gm(`!truth strike ${truthFor(DEAD).id.slice(0, 8)}`);
    await gm(`!truth set "Vance" ${DEAD}`);                 // lifts the strike (linked by correctedTo, as a Replace is)
    expect(liveTruths(DEAD)).toHaveLength(1);
    await nextScene();
    expect(stored().sessionRetractions?.blocked ?? []).toEqual([]);
    await narrate('nar-2', [{ subject: 'Vance', fact: DEAD }]);
    expect(liveTruths(DEAD).map(t => t.narrationId)).toEqual(['nar-2']);
  });

  it('control: the block is the session\'s — in the next session the narrator may state the old wording', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await gmReplaces(DEAD, WOUNDED);
    await nextScene();
    game.settings._store.set(KEY, { ...stored(), currentSessionId: 'sess-5', sessionNumber: 5, currentSceneId: 'sc-9', sceneTruths: [] });
    await narrate('nar-3', [{ subject: 'Vance', fact: DEAD }]);
    expect(liveTruths(DEAD).map(t => t.narrationId)).toEqual(['nar-3']);
  });
});

describe('issue #345 AA05 (CONT-3) — an X-Card on a narration whose truth the GM had Replaced blocks it for the session', () => {
  it("control: inside the scene, the Replace's X-carded original still blocks the restatement", async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await gmReplaces(DEAD, WOUNDED);
    await playXCard();
    resume();
    await someoneSpeaks();
    await narrate('nar-2', [{ subject: 'Vance', fact: DEAD }]);
    expect(liveTruths(DEAD)).toEqual([]);
  });

  it('control: with a bare Strike instead of a Replace, the block outlives the scene', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await gm(`!truth strike ${truthFor(DEAD).id.slice(0, 8)}`);
    await playXCard();
    resume();
    await nextScene();
    await someoneSpeaks();
    await narrate('nar-2', [{ subject: 'Vance', fact: DEAD }]);
    expect(liveTruths(DEAD)).toEqual([]);
  });

  it('Replace → X-Card → scene end: in the next scene the narrator cannot record the X-carded fact again', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await gmReplaces(DEAD, WOUNDED);
    await playXCard();                                   // nar-1, the session's newest narration
    resume();
    expect(stored().xCardedNarrationIds).toEqual(['nar-1']);
    await nextScene();
    await someoneSpeaks();
    await narrate('nar-2', [{ subject: 'Vance', fact: DEAD }]);
    expect(liveTruths(DEAD).map(t => `Vance — ${t.fact} (${t.narrationId})`)).toEqual([]);
    expect(named()).toEqual({ corrected: '', leaveOut: [] });
  });

  it('Replace → scene end → X-Card: in the next scene the narrator cannot record the X-carded fact again', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await gmReplaces(DEAD, WOUNDED);
    await nextScene();
    await playXCard();                                   // nar-1 is still the session's newest narration
    resume();
    expect(stored().xCardedNarrationIds).toEqual(['nar-1']);
    await someoneSpeaks();
    await narrate('nar-2', [{ subject: 'Vance', fact: DEAD }]);
    expect(liveTruths(DEAD).map(t => `Vance — ${t.fact} (${t.narrationId})`)).toEqual([]);
    expect(named()).toEqual({ corrected: '', leaveOut: [] });
  });
});

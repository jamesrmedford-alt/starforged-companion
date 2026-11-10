/**
 * PROBE — CONT-3 XCARD-REPLACED-TRUTH-UNBLOCKED-NEXT-SCENE (SAFETY)
 *
 * The X-Card's block of what its narration said lasts the session
 * ("For the rest of the session the narrator cannot record those facts again,
 * in that scene or a later one" — help, Safety System; rules/narrator-memory.md
 * 6b; decisions.md → "What the X-Card removed stays blocked for the session").
 * A scene end keeps that block on sessionRetractions.blocked from two sources
 * only:
 *   - rememberSessionRetractions (retractions.js ~520): truths
 *     `retractedBy: "xcard"` — and retractNarrations relabels only a BARE
 *     table strike as the X-Card's (ledgers.js ~334 isBareTableStrike, which
 *     excludes `correctedTo`);
 *   - rememberNarratedTruths (~580) → narrated → blocked: LIVE truths only.
 * A truth of the X-carded narration that the GM had corrected with the
 * correction dialog's Replace… is neither: it stays `retractedBy: "gm"` with
 * `correctedTo`, which isNamedStrike also skips. Inside its scene the retracted
 * entry still blocks a restatement (findEquivalentTruth reads retracted
 * entries); once the scene ends nothing does — the narrator records the
 * X-carded fact again as a live binding truth. Both orders: Replace → X-Card →
 * scene end, and Replace → scene end → X-Card.
 * Controls: the same flows with a bare Strike instead of Replace stay blocked;
 * inside the scene the Replace's original still blocks.
 *
 * Harness: tests/unit/xcardRetractionOutlivesScene.test.js +
 * tests/unit/replaceAfterXCard.test.js (the correction dialog via a DialogV2 stand-in).
 */

/* global makeTestMessage, EventTarget */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../../src/narration/narrator.js';
import { suppressScene } from '../../../src/context/safety.js';
import { endScene } from '../../../src/factContinuity/sceneLifecycle.js';
import { applyFactContinuityCommand } from '../../../src/factContinuity/chatCommands.js';
import { openCorrectionDialog } from '../../../src/factContinuity/correctionDialog.js';
import { parseHTML, setListenerResultSink } from '../../helpers/cardDom.js';

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
const truthFor = (fact) => stored().sceneTruths.find(t => t.fact === fact);
const liveTruths = (fact) => stored().sceneTruths.filter(t => t.fact === fact && !t.retracted);
const playXCard = async () => { syncChat(); expect(await suppressScene({}, { local: true })).toBe(true); };
const resume = () => { game.settings._store.set(KEY, { ...stored(), xCardActive: false }); };
const nextScene = async () => {
  await endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });
  game.settings._store.set(KEY, { ...stored(), currentSceneId: 'sc-2', sceneState: { bySubject: {}, sceneId: 'sc-2' } });
};

/** The GM corrects the truth with Correct Active Scene Facts → Replace… (the correction dialog's row button). */
async function gmReplaces(fact, wording) {
  await openCorrectionDialog({ flags: { [MODULE_ID]: { matchedEntityIds: [], contradictedTruthId: truthFor(fact).id } } });
  FakeDialogV2.promptAnswer = async () => wording;
  FakeDialogV2.last.element.querySelector('[data-action="replace-truth"]').click();
  await Promise.all(pending);
  expect(truthFor(fact)).toMatchObject({ retracted: true, retractedBy: 'gm' });   // setup: the Replace landed
  expect(liveTruths(wording)).toHaveLength(1);
}

describe('CONT-3 — an X-Card on a narration whose truth the GM had Replaced blocks it only for the scene', () => {
  it('control: inside the scene, the Replace\'s X-carded original still blocks the restatement', async () => {
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

  it('Replace → X-Card → scene end: in the next scene the narrator records the X-carded fact again', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await gmReplaces(DEAD, WOUNDED);
    await playXCard();                                   // nar-1, the session's newest narration
    resume();
    expect(stored().xCardedNarrationIds).toEqual(['nar-1']);
    await nextScene();
    await someoneSpeaks();
    await narrate('nar-2', [{ subject: 'Vance', fact: DEAD }]);
    expect(liveTruths(DEAD).map(t => `Vance — ${t.fact} (${t.narrationId})`)).toEqual([]);
  });

  it('Replace → scene end → X-Card: in the next scene the narrator records the X-carded fact again', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await gmReplaces(DEAD, WOUNDED);
    await nextScene();
    await playXCard();                                   // nar-1 is still the session's newest narration
    resume();
    expect(stored().xCardedNarrationIds).toEqual(['nar-1']);
    await someoneSpeaks();
    await narrate('nar-2', [{ subject: 'Vance', fact: DEAD }]);
    expect(liveTruths(DEAD).map(t => `Vance — ${t.fact} (${t.narrationId})`)).toEqual([]);
  });
});

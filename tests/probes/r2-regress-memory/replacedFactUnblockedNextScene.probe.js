/**
 * PROBE — R2M-1 REPLACED-FACT-UNBLOCKED-NEXT-SCENE (LOSE-STATE / WRONG-DETAIL)
 * Sibling of issue #342 Z42 (SESSION-STRIKE-RENDER-ONLY) on the Replace path;
 * CONT-3 (round 1) is the X-Card-on-a-Replaced-truth variant — this one has no
 * X-Card at all and needs its own fix.
 *
 * Z42 made a bare Strike block the narrator re-asserting the struck fact for
 * the rest of the session: a scene end keeps the strike on
 * `sessionRetractions.facts` and applySidecar refuses a re-assertion that
 * findSessionStrike matches (ledgers.js ~102). Its reasoning: "the ring still
 * carries the prose that stated it" — so a later scene's narration re-emits the
 * fact, it was "recorded live beside CORRECTED, then archived as canon at the
 * next scene end".
 *
 * The correction dialog's Replace… retracts the original the same way
 * (ledgers.js replaceTruth ~699: retracted, retractedBy 'gm', correctedTo) and,
 * inside its scene, the retracted original blocks a restatement
 * (findEquivalentTruth reads retracted entries — applySidecar ~85). But a scene
 * end keeps nothing of it:
 *   - rememberSessionRetractions (retractions.js ~523) keeps isNamedStrike
 *     entries only — a Replace's original carries correctedTo, so it is not
 *     one ("a Replace's replacement stands, so it is not kept");
 *   - rememberNarratedTruths (~580) keeps live truths only.
 * So in the next scene of the same session the narrator's restatement of the
 * replaced wording is recorded as a live, binding truth, and the next scene
 * end archives it as confirmed canon — beside the GM's replacement, which the
 * first scene end archived. The GM's correction is undone in the narrator's
 * memory exactly as Z42's strike was before its fix.
 *
 * Real producers: applyNarratorSidecar + postNarrationCard (the narrator's
 * sidecar apply/persist), the correction dialog's Replace… row button
 * (openCorrectionDialog → handleRowAction 'replace-truth'), `!truth strike`
 * (the relay handler), endScene (the scene end).
 *
 * Harness copied from tests/probes/continuity/xcardReplacedTruthUnblocked.probe.js
 * and tests/unit/strikeAcrossScenes.test.js.
 */

/* global EventTarget */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../../src/narration/narrator.js';
import { endScene } from '../../../src/factContinuity/sceneLifecycle.js';
import { applyFactContinuityCommand } from '../../../src/factContinuity/chatCommands.js';
import { openCorrectionDialog } from '../../../src/factContinuity/correctionDialog.js';
import { getConfirmedLore } from '../../../src/world/worldJournal.js';
import { parseHTML, setListenerResultSink } from '../../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-4';
const stored = () => game.settings.get(MODULE_ID, 'campaignState');

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
const gm = (text) => applyFactContinuityCommand({ text }, { requesterIsGM: true });
const truthFor   = (fact) => stored().sceneTruths.find(t => t.fact === fact);
const liveTruths = (fact) => stored().sceneTruths.filter(t => t.fact === fact && !t.retracted);
/** The GM's `!scene end` then `!scene start`, as the scene command runs them (a copy each). */
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
  expect(truthFor(fact).correctedTo).toBeTruthy();
  expect(liveTruths(wording)).toHaveLength(1);
}

describe('R2M-1 — a fact the GM Replaced is blocked only for the scene; the next scene records it live again', () => {
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
});

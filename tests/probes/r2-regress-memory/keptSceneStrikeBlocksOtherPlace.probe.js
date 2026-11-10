/**
 * PROBE — R2M-3 KEPT-SCENE-STRIKE-BLOCKS-OTHER-PLACE (LOSE-STATE / WRONG-DETAIL)
 * A regression of issue #342 Z42 (SESSION-STRIKE-RENDER-ONLY).
 *
 * A scene-subject truth is a fact about the scene where it was asserted: it
 * carries its scene (resolveSubject → { kind: 'scene', sceneId }, ledgers.js
 * ~455) and the place it was asserted at (`sceneLocation`, issue #326 D2 —
 * decisions.md "A scene truth is filed where it was asserted"), and a scene
 * end files it on that place's card or as lore titled with that place.
 *
 * Z42 made a strike kept from an earlier scene block the narrator's
 * re-assertion (ledgers.js applySidecar ~102 → findSessionStrike ~805). Its
 * match is subject key + normalised fact, and a scene subject's key is the
 * bare string 'scene' (subjectKey ~597; the kept entry's label is 'scene' too)
 * — no scene id, no place. So once the GM strikes "scene — The lights are
 * out" at Bleakhold, every later scene of the session, anywhere, refuses to
 * record "The lights are out" as its own scene's truth: the narration at
 * Vantage Station says the lights are out, its sidecar's truth is dropped
 * ("narrator re-asserted a fact retracted earlier this session; append
 * blocked"), and that scene's ledger never holds the fact its prose
 * established — the binding-truth defense the ledger exists for is gone for
 * it, and nothing reaches the station's card or lore at that scene's end.
 * (The render half — CORRECTED naming "scene — The lights are out — do NOT
 * re-assert" in the other scene — predates Z42, issue #286 B6.)
 *
 * Real producers: applyNarratorSidecar (the narrator's sidecar apply/persist),
 * `!truth strike` (the relay handler), startScene (its implicit end keeps the
 * strike), endScene. Harness copied from tests/unit/strikeAcrossScenes.test.js.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyNarratorSidecar } from '../../../src/narration/narrator.js';
import { startScene } from '../../../src/factContinuity/sceneLifecycle.js';
import { applyFactContinuityCommand } from '../../../src/factContinuity/chatCommands.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const DARK = 'The lights are out';
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const copy = () => foundry.utils.deepClone(stored());
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

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

let journals, orig;
beforeEach(() => {
  journals = new Map();
  orig = { get: game.journal.get, getName: game.journal.getName, find: game.journal.find, create: global.JournalEntry?.create, user: global.game.user, users: global.game.users };
  game.journal.get     = (id) => [...journals.values()].find(j => j.id === id) ?? null;
  game.journal.getName = (n) => journals.get(n) ?? null;
  game.journal.find    = (fn) => [...journals.values()].find(fn) ?? null;
  global.JournalEntry  = { create: async (data) => { const j = makeJournal(data.name); journals.set(data.name, j); return j; } };
  const gmUser = { id: 'gm-1', name: 'Test GM', isGM: true, active: true };
  global.game.users = Object.assign([gmUser], { get: (id) => (id === 'gm-1' ? gmUser : null) });
  global.game.user = gmUser;
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: null,
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null, dismissedEntities: [],
  });
});
afterEach(() => {
  game.journal.get = orig.get; game.journal.getName = orig.getName; game.journal.find = orig.find;
  global.JournalEntry = { create: orig.create };
  global.game.user = orig.user;
  global.game.users = orig.users;
});

/** A narration at `place` whose sidecar states one scene truth, applied as the narrator applies it. */
async function narrateAt(place, fact, narrationId) {
  const raw = `The corridor stretches ahead.\n\`\`\`json\n${JSON.stringify({
    sceneFrame: { location: place, situation: 'searching the deck' },
    newTruths: [{ subject: 'scene', fact }], stateChanges: [],
  })}\n\`\`\``;
  applyNarratorSidecar(raw, copy(), { narrationId });
  await flush();
}
const liveScene = (fact) => (stored().sceneTruths ?? []).filter(t => t?.subject?.kind === 'scene' && t.fact === fact && !t.retracted);

/** Scene A at Bleakhold: the narration says the lights are out; the GM strikes it. */
async function bleakholdSceneWithStrike() {
  await startScene(copy(), { reason: 'test' });
  await narrateAt('Bleakhold', DARK, 'nar-1');
  const [t1] = liveScene(DARK);
  expect(t1).toBeDefined();
  expect(t1.sceneLocation).toBe('Bleakhold');
  await applyFactContinuityCommand({ text: `!truth strike ${t1.id.slice(0, 8)}` }, { requesterIsGM: true });
  expect(liveScene(DARK)).toHaveLength(0);
  // The GM's `!scene start` (a copy): its implicit end keeps the strike for the session.
  await startScene(copy(), { reason: 'scene_command' });
  expect(stored().sessionRetractions?.facts?.map(f => `${f.label} — ${f.fact}`)).toEqual([`scene — ${DARK}`]);
}

describe("R2M-3 — a scene fact struck at one place blocks the same words as another scene's own truth anywhere", () => {
  it('control (Z42): the next scene at the same place may not restate the struck scene fact', async () => {
    await bleakholdSceneWithStrike();
    await narrateAt('Bleakhold', DARK, 'nar-2');
    expect(liveScene(DARK)).toEqual([]);
  });

  it('control: the next scene, elsewhere, records its own scene facts', async () => {
    await bleakholdSceneWithStrike();
    await narrateAt('Vantage Station', 'Alarms are blaring', 'nar-2');
    expect(liveScene('Alarms are blaring').map(t => t.sceneLocation)).toEqual(['Vantage Station']);
  });

  it("a later scene at Vantage Station whose narration says the lights are out records it as that scene's truth", async () => {
    await bleakholdSceneWithStrike();
    await narrateAt('Vantage Station', DARK, 'nar-2');
    expect(liveScene(DARK).map(t => `${t.sceneLocation} — ${t.fact} (${t.narrationId})`))
      .toEqual([`Vantage Station — ${DARK} (nar-2)`]);
  });

  it("the lift half: the GM's `!truth set scene …` at Vantage Station does not lift the strike the GM made at Bleakhold", async () => {
    await bleakholdSceneWithStrike();
    await narrateAt('Vantage Station', 'Alarms are blaring', 'nar-2');   // the new scene stands at the station
    const line = await applyFactContinuityCommand({ text: `!truth set scene ${DARK}` }, { requesterIsGM: true });
    expect(liveScene(DARK)).toHaveLength(1);                              // the GM's own fact is recorded (setup)
    expect.soft(line, 'the GM is told').not.toMatch(/strike on it is lifted/);
    expect(stored().sessionRetractions?.facts?.map(f => `${f.label} — ${f.fact}`), "Bleakhold's kept strike").toEqual([`scene — ${DARK}`]);
  });
});

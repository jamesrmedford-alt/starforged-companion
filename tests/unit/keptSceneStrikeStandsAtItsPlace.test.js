/**
 * Issue #345 AA28 KEPT-SCENE-STRIKE-BLOCKS-OTHER-PLACE (the twelfth audit's
 * R2M-3 — a regression of issue #342 Z42).
 *
 * A scene-subject truth is a fact about the place it was asserted at (its
 * `sceneLocation`, issue #326 D2 — decisions.md "A scene truth is filed where
 * it was asserted"). Z42 made a strike an earlier scene kept block the
 * narrator's re-assertion and let a GM's `!truth set` lift it, matched by
 * subject key + fact — and a scene subject's key is the bare 'scene', with no
 * place. So once the GM struck "scene — The lights are out" at Bleakhold,
 * every later scene of the session, anywhere, refused to record those words as
 * its own scene's truth, CORRECTED named the strike there, and a GM's
 * `!truth set scene The lights are out` at Vantage Station "lifted" Bleakhold's
 * strike. Now a kept strike of a scene fact keeps its place: the write block,
 * the lift and the CORRECTED block all stand only at that place
 * (keptStrikeStandsAt), so the fact is never binding and "do NOT re-assert"
 * at once (W60). The X-Card's blocks keep no place — a removed scene fact
 * stays blocked anywhere.
 *
 * Real producers: applyNarratorSidecar (the narrator's sidecar apply and
 * persist), `!truth strike` / `!truth set` (the relay handler), startScene
 * (its implicit end keeps the strike), the correction dialog's Replace
 * (replaceTruth + persistSceneLedgerFields, as strikeDuringSceneEnd.test.js
 * drives it), the ledger block builder.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyNarratorSidecar } from '../../src/narration/narrator.js';
import { startScene, persistSceneLedgerFields } from '../../src/factContinuity/sceneLifecycle.js';
import { applyFactContinuityCommand } from '../../src/factContinuity/chatCommands.js';
import { replaceTruth, retractNarrations, keptStrikeStandsAt, withXCardBlocks } from '../../src/factContinuity/ledgers.js';
import { propagateRetraction, sessionRetractedFacts } from '../../src/factContinuity/retractions.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';

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
const ledger = () => buildLedgerBlock(stored(), { matchedEntityIds: [], currentLocationId: null, maxTokens: Infinity });
const kept = () => (stored().sessionRetractions?.facts ?? []).map(f => `${f.label} — ${f.fact}`);

/** Scene A at Bleakhold: the narration says the lights are out; the GM strikes it; the GM's `!scene start` keeps the strike. */
async function bleakholdSceneWithStrike() {
  await startScene(copy(), { reason: 'test' });
  await narrateAt('Bleakhold', DARK, 'nar-1');
  const [t1] = liveScene(DARK);
  expect(t1).toBeDefined();
  expect(t1.sceneLocation).toBe('Bleakhold');
  await applyFactContinuityCommand({ text: `!truth strike ${t1.id.slice(0, 8)}` }, { requesterIsGM: true });
  expect(liveScene(DARK)).toHaveLength(0);
  await startScene(copy(), { reason: 'scene_command' });
  expect(kept()).toEqual([`scene — ${DARK}`]);
}

describe('issue #345 AA28 — a scene fact struck at one place stands struck at that place, not at another', () => {
  it('control (Z42): the next scene at the same place may not restate the struck scene fact — and CORRECTED names it there', async () => {
    await bleakholdSceneWithStrike();
    await narrateAt('Bleakhold', DARK, 'nar-2');
    expect(liveScene(DARK)).toEqual([]);
    expect(ledger().corrections).toContain(`scene — ${DARK}`);
  });

  it('control: the same place worded otherwise by the frame ("the Bleakhold docks") still holds the strike', async () => {
    await bleakholdSceneWithStrike();
    await narrateAt('the Bleakhold docks', DARK, 'nar-2');
    expect(liveScene(DARK)).toEqual([]);
    expect(ledger().corrections).toContain(`scene — ${DARK}`);
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

  it("…and at Vantage Station the narrator is not told the station's own fact is struck — binding, not CORRECTED", async () => {
    await bleakholdSceneWithStrike();
    await narrateAt('Vantage Station', DARK, 'nar-2');
    const block = ledger();
    expect(block.truths).toContain(`scene — ${DARK}`);
    expect(block.corrections).not.toContain(DARK);
    // The summary covers the whole session, Bleakhold's scene included: its leave-out list still names the strike.
    expect(sessionRetractedFacts(stored()).map(f => `${f.label} — ${f.fact}`)).toEqual([`scene — ${DARK}`]);
  });

  it("the lift half: the GM's `!truth set scene …` at Vantage Station does not lift the strike the GM made at Bleakhold", async () => {
    await bleakholdSceneWithStrike();
    await narrateAt('Vantage Station', 'Alarms are blaring', 'nar-2');   // the new scene stands at the station
    const line = await applyFactContinuityCommand({ text: `!truth set scene ${DARK}` }, { requesterIsGM: true });
    expect(liveScene(DARK)).toHaveLength(1);                              // the GM's own fact is recorded (setup)
    expect(line, 'the GM is told').not.toMatch(/strike on it is lifted/);
    expect(kept(), "Bleakhold's kept strike").toEqual([`scene — ${DARK}`]);
    expect(ledger().corrections, 'binding and CORRECTED at once').not.toContain(DARK);
  });

  it("control: the GM's `!truth set scene …` back at Bleakhold lifts it (Z42)", async () => {
    await bleakholdSceneWithStrike();
    await narrateAt('Bleakhold', 'Alarms are blaring', 'nar-2');
    const line = await applyFactContinuityCommand({ text: `!truth set scene ${DARK}` }, { requesterIsGM: true });
    expect(line).toMatch(/strike on it is lifted/);
    expect(kept()).toEqual([]);
    expect(ledger().corrections).not.toContain(DARK);
  });

  it("a player's `!truth set scene …` at Vantage Station is the station's own fact — not refused over the GM's strike at Bleakhold", async () => {
    await bleakholdSceneWithStrike();
    await narrateAt('Vantage Station', 'Alarms are blaring', 'nar-2');
    const line = await applyFactContinuityCommand({ text: `!truth set scene ${DARK}` }, { requesterIsGM: false });
    expect(line).toMatch(/Truth recorded/);
    expect(kept()).toEqual([`scene — ${DARK}`]);
  });

  it('the same words struck at two places are both kept, each standing at its own', async () => {
    await bleakholdSceneWithStrike();
    await narrateAt('Vantage Station', DARK, 'nar-2');
    const [t2] = liveScene(DARK);
    expect(t2, "the station's own fact is recorded").toBeDefined();
    await applyFactContinuityCommand({ text: `!truth strike ${t2.id.slice(0, 8)}` }, { requesterIsGM: true });
    await startScene(copy(), { reason: 'scene_command' });
    expect(stored().sessionRetractions.facts.map(f => f.place)).toEqual(['Bleakhold', 'Vantage Station']);
    await narrateAt('Vantage Station', DARK, 'nar-3');
    expect(liveScene(DARK)).toEqual([]);
  });

  it('a scene fact the GM Replaced at Bleakhold: its old wording stays blocked there, and is the station\'s own fact at Vantage', async () => {
    await startScene(copy(), { reason: 'test' });
    await narrateAt('Bleakhold', DARK, 'nar-1');
    const working = copy();
    const replaced = replaceTruth(liveScene(DARK)[0].id, { fact: 'The emergency lights flicker' }, working, { isGM: true, actor: 'gm' });
    await propagateRetraction(replaced.struck, working);
    await persistSceneLedgerFields(working, ['sceneTruths'], 'test replace');
    await startScene(copy(), { reason: 'scene_command' });
    expect(stored().sessionRetractions.blocked.map(b => `${b.label} — ${b.fact} @ ${b.place}`)).toEqual([`scene — ${DARK} @ Bleakhold`]);

    await narrateAt('Vantage Station', DARK, 'nar-2');
    expect(liveScene(DARK).map(t => t.sceneLocation)).toEqual(['Vantage Station']);
    await startScene(copy(), { reason: 'scene_command' });
    await narrateAt('Bleakhold', DARK, 'nar-3');
    expect(liveScene(DARK)).toEqual([]);
  });

  it("control: the X-Card's block of a removed scene fact keeps no place — it stays blocked anywhere", async () => {
    await bleakholdSceneWithStrike();
    // The X-Card on nar-1 after its scene ended: the strike it takes over moves to the unnamed blocks.
    const cs = copy();
    retractNarrations(cs, ['nar-1']);
    expect(cs.sessionRetractions.facts).toEqual([]);
    expect(cs.sessionRetractions.blocked).toEqual([expect.objectContaining({ label: 'scene', fact: DARK })]);
    expect(cs.sessionRetractions.blocked[0].place).toBeUndefined();
    game.settings._store.set(KEY, cs);
    await narrateAt('Vantage Station', DARK, 'nar-2');
    expect(liveScene(DARK)).toEqual([]);
  });
});

describe('issue #345 AA28 — keptStrikeStandsAt and the blocks', () => {
  it('stands where either place is unknown, or one place names the other', () => {
    expect(keptStrikeStandsAt('Bleakhold', 'Bleakhold')).toBe(true);
    expect(keptStrikeStandsAt('Bleakhold', 'the Bleakhold docks')).toBe(true);
    expect(keptStrikeStandsAt('The cargo bay of the Wayfinder', 'cargo bay')).toBe(true);
    expect(keptStrikeStandsAt(null, 'Vantage Station')).toBe(true);
    expect(keptStrikeStandsAt('Bleakhold', '')).toBe(true);
    expect(keptStrikeStandsAt('Bleakhold', undefined)).toBe(true);
    expect(keptStrikeStandsAt('Bleakhold', 'Vantage Station')).toBe(false);
    expect(keptStrikeStandsAt('Bleak', 'Bleakhold')).toBe(false);   // whole words only
  });

  it('withXCardBlocks keeps one subject and fact once per place — a place-less block apart from a placed one', () => {
    const out = withXCardBlocks([], [
      { label: 'scene', fact: DARK, subjectKey: 'scene', place: 'Bleakhold' },
      { label: 'scene', fact: 'the lights are out.', subjectKey: 'scene', place: 'bleakhold' },
      { label: 'scene', fact: DARK, subjectKey: 'scene', place: 'Vantage Station' },
      { label: 'scene', fact: DARK, subjectKey: 'scene', place: null },
    ]);
    expect(out.map(b => b.place ?? '(anywhere)')).toEqual(['Bleakhold', 'Vantage Station', '(anywhere)']);
  });
});

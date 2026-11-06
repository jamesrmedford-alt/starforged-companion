/**
 * STARFORGED COMPANION
 * tests/unit/xcardRetractionOutlivesScene.test.js
 *
 * XCARD-RETRACTION-SCENE-SCOPED (found while fixing issue #342). An X-Card
 * retraction (`retractedBy: "xcard"`) blocks the narrator re-asserting the
 * removed fact as a strike does — but only while its scene lasts: the block
 * was the retracted entry in `sceneTruths`, which a scene end clears, and the
 * session's kept strikes (`sessionRetractions`, issue #342 Z42 — which block a
 * later scene's re-assertion) never hold an X-Card retraction, since by design
 * it is never named. So after `!scene start` the narrator could write the
 * removed fact back into the ledger as a binding truth, and the X-Card's
 * takeover of a strike an earlier scene kept (XCARD-AFTER-STRIKE-STILL-NAMED)
 * dropped that strike's block with its name. A lift's lore restore, too,
 * stopped counting an X-Card retraction once its scene ended.
 *
 * The scene end now keeps the scene's X-Card retractions on an unnamed list
 * (`sessionRetractions.blocked`) for the rest of the session, and the X-Card
 * moves a kept strike it takes over there: the narrator's re-assertion is
 * refused (applySidecar → findSessionStrike's write half), and a lift's lore
 * restore counts it (loreRetractionHolder). Never named — not under
 * CORRECTED, not in the summary's leave-out list — and never lifted.
 *
 * Harness: xcardAfterStrikeStillNamed.test.js's.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { endScene } from '../../src/factContinuity/sceneLifecycle.js';
import { applyFactContinuityCommand } from '../../src/factContinuity/chatCommands.js';
import { sessionRetractedFacts } from '../../src/factContinuity/retractions.js';
import { findSessionStrike, withXCardBlocks } from '../../src/factContinuity/ledgers.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';
import { getConfirmedLore, recordLoreDiscovery, JOURNAL_NAMES } from '../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-4';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };

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
const BODY = 'His body was dumped at Bleakhold';

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
const playXCard = async () => { syncChat(); expect(await suppressScene({}, { local: true })).toBe(true); };
const resume = () => { game.settings._store.set(KEY, { ...stored(), xCardActive: false }); };
const named = () => sessionRetractedFacts(stored()).map(f => `${f.label} — ${f.fact}`);
const corrected = () => buildLedgerBlock(stored(), {}).combined;
/** What `!scene start` does to the scene in progress: it ends (its truths migrated or kept), and a new one opens. */
const nextScene = async () => {
  await endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });
  game.settings._store.set(KEY, { ...stored(), currentSceneId: 'sc-2', sceneState: { bySubject: {}, sceneId: 'sc-2' } });
};

describe('XCARD-RETRACTION-SCENE-SCOPED — an X-Card retraction blocks a re-assertion for the rest of the session', () => {
  it('control: within its scene the narrator re-asserting the removed fact is refused', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await playXCard();
    resume();
    await someoneSpeaks();
    await narrate('nar-2', [{ subject: 'Vance', fact: DEAD }]);
    expect(liveTruths(DEAD)).toEqual([]);
  });

  it('after the scene ends, the narrator re-asserting the removed fact is still refused — and it is named nowhere', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await playXCard();
    resume();
    await nextScene();
    expect(stored().sceneTruths).toEqual([]);

    await someoneSpeaks();
    await narrate('nar-2', [{ subject: 'Vance', fact: DEAD }]);

    expect(liveTruths(DEAD)).toEqual([]);                          // was: a live, binding truth again
    expect(named(), 'CORRECTED / the leave-out list').toEqual([]);
    expect(corrected()).not.toContain(DEAD);
    // Not in any card either: the `!truth list` card names live truths only.
    await gm('!truth list');
    expect(ChatMessage._created.map(m => m.content ?? '').join('\n')).not.toMatch(/Vance — Is dead/);
  });

  it('a strike the scene kept and the X-Card then took over still blocks the re-assertion — still named nowhere', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await strike(DEAD);
    await nextScene();
    expect(named()).toEqual(['Vance — Is dead']);                  // control: kept and named for the session

    await playXCard();                                              // on nar-1, the session's newest narration
    resume();
    expect(named()).toEqual([]);                                    // XCARD-AFTER-STRIKE-STILL-NAMED
    await someoneSpeaks();
    await narrate('nar-2', [{ subject: 'Vance', fact: DEAD }]);

    expect(liveTruths(DEAD)).toEqual([]);                          // was: the takeover dropped the block with the name
    expect(corrected()).not.toContain(DEAD);
  });

  it("a GM's `!truth set` is the GM's own authority: recorded, lifting nothing, and the removed fact named nowhere", async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await playXCard();
    resume();
    await nextScene();

    await gm(`!truth set "Vance" ${DEAD}`);
    expect(ChatMessage._created.at(-1).content).not.toContain('The strike on it is lifted');
    expect(liveTruths(DEAD)).toHaveLength(1);                      // the GM's, by their own authority
    expect(named()).toEqual([]);
  });

  it('a lift restores no lore an earlier scene\'s X-Card retraction states — the X-carded fact stays out of canon', async () => {
    // An earlier, kept narration's capture recorded one confirmed lore entry stating both facts.
    await recordLoreDiscovery("Vance's fate", {
      text: 'Vance is dead; his body was dumped at Bleakhold.', category: 'other', narratorAsserted: true, confirmed: true, narrationId: 'nar-0',
    }, stored());
    const loreEntry = () => journals.get(JOURNAL_NAMES.lore)?.pages.contents.find(p => p.name === "Vance's fate")?.flags[MODULE_ID]?.loreEntry;
    const canon = () => getConfirmedLore(stored()).map(e => e.title);

    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await strike(DEAD);                                             // the GM strikes the death: the entry leaves canon
    expect(loreEntry()).toMatchObject({ retracted: true });
    await someoneSpeaks();
    await narrate('nar-2', [{ subject: 'Vance', fact: BODY }]);
    await playXCard();                                              // the X-Card removes the body's beat
    resume();
    expect(truthFor(BODY)).toMatchObject({ retracted: true, retractedBy: 'xcard' });
    await nextScene();

    await gm(`!truth set "Vance" ${DEAD}`);                        // lifts the kept strike of the death (Z42)
    expect(named()).toEqual([]);
    expect(loreEntry()).toMatchObject({ retracted: true, confirmed: false });   // was: restored, the X-carded body with it
    expect(canon()).not.toContain("Vance's fate");
  });

  it('control: the block is the session\'s — in the next session the narrator may state the fact', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await playXCard();
    resume();
    await nextScene();
    game.settings._store.set(KEY, { ...stored(), currentSessionId: 'sess-5', sessionNumber: 5 });

    await someoneSpeaks();
    await narrate('nar-2', [{ subject: 'Vance', fact: DEAD }]);
    expect(liveTruths(DEAD)).toHaveLength(1);
  });
});

describe('the session\'s X-Card blocks (sessionRetractions.blocked)', () => {
  const VANCE = { kind: 'text', text: 'Vance' };
  const cs = (blocked, sessionId = SESSION) => ({
    currentSessionId: SESSION,
    sessionRetractions: { sessionId, facts: [], blocked },
  });

  it("findSessionStrike's write half matches a block; the lift's lookup does not — an X-Card retraction is never lifted", () => {
    const state = cs([{ label: 'Vance', fact: DEAD, subjectKey: 'vance', narrationId: 'nar-1', truthId: 'tr-1' }]);
    expect(findSessionStrike(state, VANCE, 'is dead.', ['Vance'], { blocked: true })).toMatchObject({ truthId: 'tr-1' });
    expect(findSessionStrike(state, VANCE, DEAD, ['Vance'])).toBeNull();
    expect(findSessionStrike(state, { kind: 'text', text: 'Kira' }, DEAD, ['Kira'], { blocked: true })).toBeNull();   // another subject
    expect(findSessionStrike(cs(state.sessionRetractions.blocked, 'sess-3'), VANCE, DEAD, ['Vance'], { blocked: true })).toBeNull();   // another session's
  });

  it('withXCardBlocks keeps each subject and fact once, and the newest fifty', () => {
    const once = withXCardBlocks([], [
      { label: 'Vance', fact: DEAD, subjectKey: 'vance', narrationId: 'nar-1', truthId: 'tr-1' },
      { label: 'vance', fact: 'is dead.', subjectKey: 'vance', narrationId: 'nar-2', truthId: 'tr-2' },
      { label: 'Kira', fact: DEAD, subjectKey: 'kira', narrationId: 'nar-2', truthId: 'tr-3' },
      { label: 'Kira', fact: '   ' },
    ]);
    expect(once.map(b => `${b.label} — ${b.fact}`)).toEqual(['Vance — Is dead', 'Kira — Is dead']);
    const many = withXCardBlocks(once, Array.from({ length: 60 }, (_, i) => ({ label: `NPC ${i}`, fact: DEAD })));
    expect(many).toHaveLength(50);
    expect(many.at(-1)).toMatchObject({ label: 'NPC 59', subjectKey: null, narrationId: null, truthId: null });
  });
});

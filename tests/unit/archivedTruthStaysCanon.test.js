/**
 * STARFORGED COMPANION
 * tests/unit/archivedTruthStaysCanon.test.js
 *
 * Issue #331 X31 (ARCHIVED-TRUTH-STAYS-RETRACTED). In one scene the narrator
 * establishes "the dockmaster — Is dead"; the scene ends and the truth is
 * archived as the confirmed Lore page "the dockmaster: Is dead". In a later
 * scene of the same session the narrator re-asserts it; the GM strikes it
 * (`!truth strike`, which per #286 B6 also retracts that Lore page), then
 * re-establishes it with `!truth set` — issue #326 W60: "the set lifts the
 * strike". W60 lifted it in the ledger only: when the scene ended the live
 * truth was archived onto the same page, which kept the strike's `retracted:
 * true` — the fact the GM ruled canon reached no store the narrator reads.
 * The lift now restores the lore the strike retracted (restoreStruckLore,
 * retractSessionLore's inverse — the refuter's preferred fix, which never
 * un-retracts a page an X-Card retracted).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startScene, endScene } from '../../src/factContinuity/sceneLifecycle.js';
import { applySidecar } from '../../src/factContinuity/ledgers.js';
import { applyFactContinuityCommand } from '../../src/factContinuity/chatCommands.js';
import { getConfirmedLore, restoreStruckLore, JOURNAL_NAMES } from '../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');

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
  orig = { get: game.journal.get, getName: game.journal.getName, find: game.journal.find, create: global.JournalEntry?.create, user: global.game.user };
  game.journal.get     = (id) => [...journals.values()].find(j => j.id === id) ?? null;
  game.journal.getName = (n) => journals.get(n) ?? null;
  game.journal.find    = (fn) => [...journals.values()].find(fn) ?? null;
  global.JournalEntry  = { create: async (data) => { const j = makeJournal(data.name); journals.set(data.name, j); return j; } };
  global.game.user = { ...(global.game.user ?? {}), isGM: true, name: 'Test GM' };
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
});

const lorePage = () => journals.get(JOURNAL_NAMES.lore)?.pages.contents.find(p => p.name === 'the dockmaster: Is dead');
const loreEntry = () => lorePage()?.flags[MODULE_ID]?.loreEntry;
const narratorAsserts = (narrationId) => applySidecar(
  { newTruths: [{ subject: 'the dockmaster', fact: 'Is dead' }], stateChanges: [] },
  { campaignState: stored(), narrationId },
);

describe('X31 — a fact the GM re-established after a strike is canon after the scene ends', () => {
  it('the scene-end archive of the re-established truth is confirmed lore, not the retracted page it overwrote', async () => {
    // Scene 1: the narrator establishes it; the scene ends → archived, confirmed.
    await startScene(stored(), { reason: 'test' });
    narratorAsserts('nar-1');
    await endScene(stored(), { reason: 'scene_command' });
    expect(loreEntry()).toMatchObject({ confirmed: true, retracted: false });                     // control
    expect(getConfirmedLore(stored()).map(e => e.title)).toContain('the dockmaster: Is dead');

    // Scene 2: re-asserted; the GM strikes it — the strike reaches the archived copy (B6).
    await startScene(stored(), { reason: 'test' });
    narratorAsserts('nar-2');
    const struck = stored().sceneTruths.find(t => t.fact === 'Is dead');
    await applyFactContinuityCommand({ text: `!truth strike ${struck.id.slice(0, 8)}` }, { requesterIsGM: true });
    expect(stored().sceneTruths.find(t => t.id === struck.id)).toMatchObject({ retracted: true, retractedBy: 'gm' });
    expect(loreEntry()).toMatchObject({ retracted: true, confirmed: false });                     // control: B6 reached it

    // The GM re-establishes it: W60 lifts the strike in the ledger.
    await applyFactContinuityCommand({ text: '!truth set "the dockmaster" Is dead' }, { requesterIsGM: true });
    const live = stored().sceneTruths.filter(t => t.fact === 'Is dead' && !t.retracted);
    expect(live).toHaveLength(1);                                                                 // control: binding again
    expect(stored().sceneTruths.find(t => t.id === struck.id).correctedTo).toBe(live[0].id);

    // The scene ends: the live truth is archived onto the same page.
    await endScene(stored(), { reason: 'scene_command' });
    expect(stored().currentSceneId ?? null).toBeNull();

    // The page kept `retracted: true` (recordLoreDiscovery carries the stored
    // mark over), so the fact the GM ruled canon was in no store the narrator
    // reads — not the ledger (scene over), not ESTABLISHED LORE.
    expect(getConfirmedLore(stored()).map(e => e.title)).toContain('the dockmaster: Is dead');
    expect(loreEntry()).toMatchObject({ retracted: false, confirmed: true });
  });

  it("the lift restores the page as soon as the set is made, with the confirmation it had", async () => {
    await startScene(stored(), { reason: 'test' });
    narratorAsserts('nar-1');
    await endScene(stored(), { reason: 'scene_command' });
    await startScene(stored(), { reason: 'test' });
    narratorAsserts('nar-2');
    const struck = stored().sceneTruths.find(t => t.fact === 'Is dead');
    await applyFactContinuityCommand({ text: `!truth strike ${struck.id.slice(0, 8)}` }, { requesterIsGM: true });
    expect(loreEntry()).toMatchObject({ retracted: true, retractedByTruth: struck.id, confirmedBeforeStrike: true });

    await applyFactContinuityCommand({ text: '!truth set "the dockmaster" Is dead' }, { requesterIsGM: true });

    expect(loreEntry()).toMatchObject({ retracted: false, confirmed: true });
    expect(lorePage().text.content).not.toContain('Retracted by the table.');
  });

  it("restoreStruckLore touches only what that strike retracted", async () => {
    await startScene(stored(), { reason: 'test' });
    narratorAsserts('nar-1');
    await endScene(stored(), { reason: 'scene_command' });
    await startScene(stored(), { reason: 'test' });
    narratorAsserts('nar-2');
    const struck = stored().sceneTruths.find(t => t.fact === 'Is dead');
    await applyFactContinuityCommand({ text: `!truth strike ${struck.id.slice(0, 8)}` }, { requesterIsGM: true });

    expect(await restoreStruckLore('some-other-truth')).toBe(0);
    expect(loreEntry().retracted).toBe(true);
    expect(await restoreStruckLore(struck.id)).toBe(1);
    expect(loreEntry().retracted).toBe(false);
    expect(await restoreStruckLore(struck.id)).toBe(0);              // once
  });
});

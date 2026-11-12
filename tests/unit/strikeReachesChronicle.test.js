/**
 * STARFORGED COMPANION
 * tests/unit/strikeReachesChronicle.test.js
 *
 * STRIKE-CHRONICLE — a strike reaches the Chronicle.
 *
 * A Strike (or a Replace's struck original) reached the tier details, the
 * session's lore and the rolling summary (propagateRetraction, issue #286
 * B6), never the Chronicle — which the scribe writes from the same prose and
 * which feeds the campaign recap (issue #301 B04: an edited entry rebuilds
 * it) and, pinned, every CHARACTER block (issue #345 AA07). The struck fact
 * came back from there. Now the session's automatic entries that state it
 * about its subject (lore's match) are deleted through the canonical GM; a
 * pinned or player-edited entry stays, as a pinned tier detail does.
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { propagateRetraction } from '../../src/factContinuity/retractions.js';
import { strikeTruth, applySidecar } from '../../src/factContinuity/ledgers.js';
import {
  addChronicleEntry, getChronicleEntries, setChronicleEntryPinned, updateChronicleEntry,
} from '../../src/character/chronicle.js';
import { campaignRecapCacheKey } from '../../src/narration/narrator.js';

let journals, saved;
beforeEach(() => {
  journals = [];
  saved = { journal: game.journal, create: global.JournalEntry?.create };
  game.journal = {
    get contents() { return [...journals]; },
    getName: (n) => journals.find(j => j.name === n) ?? null,
    get: (id) => journals.find(j => j.id === id) ?? null,
    find: (fn) => journals.find(fn) ?? null,
    filter: (fn) => journals.filter(fn),
    [Symbol.iterator]: () => journals[Symbol.iterator](),
  };
  global.JournalEntry = { create: async (data) => {
    const journal = {
      id: `j-${journals.length + 1}`, name: data.name, flags: data.flags ?? {},
      pages: { contents: [], find: (fn) => journal.pages.contents.find(fn) },
      setFlag: async (mod, key, val) => { (journal.flags[mod] ??= {})[key] = val; },
      getFlag: (mod, key) => journal.flags?.[mod]?.[key],
      update: async (changes) => Object.assign(journal, changes),
      createEmbeddedDocuments: async (_type, docs) => docs.map(d => {
        const page = { ...d, flags: JSON.parse(JSON.stringify(d.flags ?? {})),
          setFlag: async (mod, key, val) => { (page.flags[mod] ??= {})[key] = val; },
          getFlag: (mod, key) => page.flags?.[mod]?.[key] };
        journal.pages.contents.push(page);
        return page;
      }),
    };
    journals.push(journal);
    return journal;
  } };
  game.settings._store.clear();
  game.actors._reset();
  game.actors._set('pc-1', makeTestActor({ id: 'pc-1', name: 'Kira' }));
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
});
afterEach(() => {
  game.journal = saved.journal;
  global.JournalEntry = { create: saved.create };
});

const cs = () => ({
  currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1',
  sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, connectionIds: [],
});
const auto = (text, extra = {}) => ({ type: 'moment', text, automated: true, sessionId: 'sess-1', ...extra });
const texts = async () => (await getChronicleEntries('pc-1')).map(e => e.text);

describe('STRIKE-CHRONICLE — a strike takes the session\'s scribe entries that state it', () => {
  it('the struck fact\'s entry goes; pinned, edited, other-session and other-subject entries stay', async () => {
    await addChronicleEntry('pc-1', auto('Vance walks with a limp since the crash.'));
    await addChronicleEntry('pc-1', auto('Vance walks with a limp, Kira noticed.'));
    await addChronicleEntry('pc-1', auto('Vance still walks with a limp after all these years.'));
    await addChronicleEntry('pc-1', auto('Vance walks with a limp — last session.', { sessionId: 'sess-0' }));
    await addChronicleEntry('pc-1', auto('The dockmaster walks with a limp.'));
    await addChronicleEntry('pc-1', auto('Vance has a scar across one eye.'));
    const [, pinned, edited] = await getChronicleEntries('pc-1');
    await setChronicleEntryPinned('pc-1', pinned.id, true);
    await updateChronicleEntry('pc-1', edited.id, 'Vance walks with a limp, Kira wrote.');
    const keyBefore = await campaignRecapCacheKey(cs());

    const state = cs();
    applySidecar({ newTruths: [{ subject: 'Vance', fact: 'walks with a limp' }], stateChanges: [] }, { campaignState: state });
    const struck = strikeTruth(state.sceneTruths.at(-1).id, state, { isGM: true, actor: 'gm' });
    expect(struck).toBeTruthy();

    const out = await propagateRetraction(struck, state);
    expect(out.chronicle).toBe(1);
    expect(await texts()).toEqual([
      'Vance walks with a limp, Kira noticed.',
      'Vance walks with a limp, Kira wrote.',
      'Vance walks with a limp — last session.',
      'The dockmaster walks with a limp.',
      'Vance has a scar across one eye.',
    ]);
    // The campaign recap's cache key follows the entries, so it is rebuilt (issue #301 B04).
    expect(await campaignRecapCacheKey(cs())).not.toEqual(keyBefore);
  });

  it('a player annotation is never touched', async () => {
    await addChronicleEntry('pc-1', { type: 'annotation', text: 'Vance walks with a limp.', automated: false, sessionId: 'sess-1' });
    const out = await propagateRetraction({ id: 'tr-1', subject: { kind: 'text', text: 'Vance' }, fact: 'walks with a limp', sessionId: 'sess-1' }, cs());
    expect(out.chronicle).toBe(0);
    expect(await texts()).toEqual(['Vance walks with a limp.']);
  });
});

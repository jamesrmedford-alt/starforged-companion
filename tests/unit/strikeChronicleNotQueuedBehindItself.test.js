/**
 * STARFORGED COMPANION
 * tests/unit/strikeChronicleNotQueuedBehindItself.test.js
 *
 * Issue #362 AC27 STRIKE-CHRONICLE-NESTED-RELAY — a `!truth strike <id>`
 * (typed by the GM, or relayed from a player) runs as the queued gmRelay
 * action "factContinuity.command" on the canonical GM. Its handler awaited
 * propagateRetraction, which awaited retractStruckChronicle, which deleted
 * each matching automatic Chronicle entry with requestChronicleEdit — a
 * second queued action ("chronicle.edit") enqueued from INSIDE the first. It
 * waited for the handler awaiting it until the handler's 60 s run budget ran
 * out; every relayed action of the table queued behind it meanwhile
 * (rules/reachability.md §8).
 *
 * Since issue #382 slice 4 the strike reaches the Chronicle through the
 * session record, and nothing the handler awaits: its ledger save records
 * `truth.struck`, and the record's listener on the canonical GM
 * (record/chronicleView.js) takes back the entries written from the beat
 * whose narration set the truth — on each actor's write chain, never through
 * the relay. Any other GM's save sends the event to the canonical GM.
 *
 * Real path: requestGmAction → runGmAction → enqueueGmAction →
 * applyFactContinuityCommand → persistSceneLedgerFields → recordLedgerChanges
 * → the record's write → chronicleView → retractChronicleOfNarrations.
 * Nothing is mocked but the journal collection (the Chronicle's and the
 * Session Log's store).
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requestGmAction, GM_ACTION_TIMEOUT_MS, GM_RELAY_SOCKET } from '../../src/multiplayer/gmRelay.js';
import { propagateRetraction } from '../../src/factContinuity/retractions.js';
import { applySidecar, strikeTruth } from '../../src/factContinuity/ledgers.js';
import { persistSceneLedgerFields } from '../../src/factContinuity/sceneLifecycle.js';
import { addChronicleEntry, getChronicleEntries } from '../../src/character/chronicle.js';
import { registerChronicleScribe } from '../../src/record/chronicleView.js';
import { recordSettled, _resetRecordForTests } from '../../src/record/record.js';
import { recordedEvent, seedSessionRecord } from '../helpers/sessionRecordSeed.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

let journals, saved;
beforeEach(() => {
  journals = [];
  saved = { journal: game.journal, create: global.JournalEntry?.create, user: global.game.user, users: global.game.users };
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
        const page = { id: `p-${journal.pages.contents.length + 1}`, ...d, flags: JSON.parse(JSON.stringify(d.flags ?? {})),
          setFlag: async (mod, key, val) => { (page.flags[mod] ??= {})[key] = val; },
          getFlag: (mod, key) => page.flags?.[mod]?.[key],
          // A Foundry update: dotted keys set one by one (the record's appends).
          update: async (changes) => {
            for (const [key, value] of Object.entries(changes)) {
              const path = key.split('.');
              let at = page;
              for (const part of path.slice(0, -1)) at = (at[part] ??= {});
              at[path.at(-1)] = value;
            }
            return page;
          } };
        journal.pages.contents.push(page);
        return page;
      }),
    };
    journals.push(journal);
    return journal;
  } };
  ChatMessage._reset?.();
  _resetRecordForTests();
  game.settings._store.clear();
  game.socket._reset?.();
  game.actors._reset();
  game.actors._set('pc-1', makeTestActor({ id: 'pc-1', name: 'Kira' }));
  const gm = { id: 'gm-1', name: 'Test GM', isGM: true, active: true };
  global.game.users = Object.assign([gm], { get: (id) => (id === 'gm-1' ? gm : null) });
  global.game.user = gm;
  registerChronicleScribe();
});
afterEach(() => {
  game.journal = saved.journal;
  global.JournalEntry = { create: saved.create };
  global.game.user = saved.user;
  global.game.users = saved.users;
});

/**
 * The scene's stored ledger with one live truth, "Vance — walks with a
 * limp", set by the narration `nar-limp` — and the session's record of that
 * beat: its telling and the truth it set. Returns the truth's id.
 */
async function storeSceneWithTruth() {
  const state = {
    currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    connectionIds: [], dismissedEntities: [],
  };
  applySidecar({ newTruths: [{ subject: 'Vance', fact: 'walks with a limp' }], stateChanges: [] }, { campaignState: state, narrationId: 'nar-limp' });
  game.settings._store.set(KEY, state);
  const truth = state.sceneTruths.at(-1);
  await seedSessionRecord('sess-1', [
    recordedEvent('sess-1', 'narration', { who: { actor: 'pc-1' }, ref: { nar: 'nar-limp' }, d: { mode: 'paced', actorId: 'pc-1' }, text: 'Vance limps to the window.' }),
    recordedEvent('sess-1', 'truth.set', { ref: { truth: truth.id, nar: 'nar-limp' }, d: { subject: truth.subject, fact: truth.fact, by: 'narrator' } }),
  ], { number: 2 });
  return truth.id;
}

const auto = (text, extra = {}) => ({ type: 'moment', text, automated: true, sessionId: 'sess-1', ...extra });
const texts = async () => (await getChronicleEntries('pc-1')).map(e => e.text);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/** What `promise` has done after `ms`: "settled", or "still waiting". */
async function within(promise, ms) {
  let state = 'still waiting';
  promise.then(() => { state = 'settled'; }, () => { state = 'settled'; });
  const until = Date.now() + ms;
  while (state !== 'settled' && Date.now() < until) await sleep(20);
  return state;
}

/** The record's writes have landed, and what they took back from the Chronicle with them. */
async function recordLanded() {
  await recordSettled();
  await sleep(50);
}

describe('issue #362 AC27 — a relayed strike that reaches the Chronicle does not wait for itself', () => {
  it('control: the strike command with no Chronicle entry from the struck truth\'s beat settles at once', async () => {
    const truthId = await storeSceneWithTruth();
    await addChronicleEntry('pc-1', auto('The dockmaster keeps a ledger of debts.', { narrationId: 'nar-ledger' }));

    const action = requestGmAction('factContinuity.command', { text: `!truth strike ${truthId}` });
    expect(await within(action, 3000)).toBe('settled');
    const struck = game.settings.get(MODULE_ID, 'campaignState').sceneTruths.find(t => t.id === truthId);
    expect(struck.retracted).toBe(true);
    await recordLanded();
    expect(await texts()).toEqual(['The dockmaster keeps a ledger of debts.']);
  });

  it('propagateRetraction no longer reaches the Chronicle: the record does (issue #382 slice 4)', async () => {
    const truthId = await storeSceneWithTruth();
    await addChronicleEntry('pc-1', auto('Vance walks with a limp since the crash.', { narrationId: 'nar-limp' }));
    const working = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
    const struck = strikeTruth(truthId, working, { isGM: true, actor: 'gm' });

    const out = await propagateRetraction(struck, working);
    expect(out).not.toHaveProperty('chronicle');
    expect(await texts()).toEqual(['Vance walks with a limp since the crash.']);
  });

  it('the strike command whose truth a Chronicle entry\'s beat set settles at once too — not after the relay\'s 60 s budget — and the entry goes', async () => {
    expect(GM_ACTION_TIMEOUT_MS).toBeGreaterThan(5000);   // the wait below is far inside the budget
    const truthId = await storeSceneWithTruth();
    await addChronicleEntry('pc-1', auto('Vance walks with a limp since the crash.', { narrationId: 'nar-limp' }));

    const action = requestGmAction('factContinuity.command', { text: `!truth strike ${truthId}` });
    expect(await within(action, 3000)).toBe('settled');
    const struck = game.settings.get(MODULE_ID, 'campaignState').sceneTruths.find(t => t.id === truthId);
    expect(struck.retracted).toBe(true);
    await recordLanded();
    expect(await texts()).toEqual([]);
  }, 15_000);

  it('…and the table\'s next relayed action is not held behind it', async () => {
    const truthId = await storeSceneWithTruth();
    await addChronicleEntry('pc-1', auto('Vance walks with a limp since the crash.', { narrationId: 'nar-limp' }));

    requestGmAction('factContinuity.command', { text: `!truth strike ${truthId}` }).catch(() => {});
    await sleep(300);   // the strike has run; its record write takes the entry back
    // Any other relayed action — here a player's Chronicle note — queues behind it.
    const next = requestGmAction('chronicle.edit', { actorId: 'pc-1', op: 'add', entry: { type: 'annotation', text: 'A note Kira wrote.', sessionId: 'sess-1' } });
    expect(await within(next, 3000)).toBe('settled');
    await recordLanded();
    expect(await texts()).toEqual(['A note Kira wrote.']);
  }, 15_000);

  it('control: a strike saved on a co-GM\'s client sends its `truth.struck` to the canonical GM, and asks for no Chronicle delete', async () => {
    const truthId = await storeSceneWithTruth();
    await addChronicleEntry('pc-1', auto('Vance walks with a limp since the crash.', { narrationId: 'nar-limp' }));
    // gm-1 (the lower id) is the canonical GM; this client is gm-2.
    const gm1 = { id: 'gm-1', name: 'Gina', isGM: true, active: true };
    const gm2 = { id: 'gm-2', name: 'Gus', isGM: true, active: true };
    global.game.users = Object.assign([gm1, gm2], { get: (id) => [gm1, gm2].find(u => u.id === id) ?? null });
    global.game.user = gm2;
    const working = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
    strikeTruth(truthId, working, { isGM: true, actor: 'gm' });

    await persistSceneLedgerFields(working, ['sceneTruths'], 'test strike');
    const relayed = (kind) => (game.socket._emitted ?? []).filter(e => e.event === GM_RELAY_SOCKET && e.payload?.kind === kind);
    await vi.waitFor(() => expect(relayed('gmRelay.record.append')).toHaveLength(1));
    expect(relayed('gmRelay.record.append')[0].payload.payload.events).toEqual([
      expect.objectContaining({ k: 'truth.struck', ref: { truth: truthId } }),
    ]);
    expect(relayed('gmRelay.chronicle.edit')).toEqual([]);
    // The co-GM's client did not write the GM's journal itself.
    expect(await texts()).toEqual(['Vance walks with a limp since the crash.']);
  });
});

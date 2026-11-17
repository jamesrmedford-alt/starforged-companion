/**
 * STARFORGED COMPANION
 * tests/unit/strikeChronicleNotQueuedBehindItself.test.js
 *
 * Issue #362 AC27 STRIKE-CHRONICLE-NESTED-RELAY — a `!truth strike <id>`
 * (typed by the GM, or relayed from a player) runs as the queued gmRelay
 * action "factContinuity.command" on the canonical GM. Its handler awaits
 * propagateRetraction, which awaits retractStruckChronicle, which deleted
 * each matching automatic Chronicle entry with requestChronicleEdit — a
 * second queued action ("chronicle.edit") enqueued from INSIDE the first. It
 * waited for the handler awaiting it until the handler's 60 s run budget ran
 * out; every relayed action of the table queued behind it meanwhile
 * (rules/reachability.md §8). On the canonical GM the entry is now deleted
 * directly, on the actor's write chain; any other GM still relays it.
 *
 * Real path: requestGmAction → runGmAction → enqueueGmAction →
 * applyFactContinuityCommand → propagateRetraction → retractStruckChronicle.
 * Nothing is mocked but the journal collection (the Chronicle's store).
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { requestGmAction, GM_ACTION_TIMEOUT_MS, GM_RELAY_SOCKET } from '../../src/multiplayer/gmRelay.js';
import { propagateRetraction } from '../../src/factContinuity/retractions.js';
import { applySidecar, strikeTruth } from '../../src/factContinuity/ledgers.js';
import { addChronicleEntry, getChronicleEntries } from '../../src/character/chronicle.js';

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
        const page = { ...d, flags: JSON.parse(JSON.stringify(d.flags ?? {})),
          setFlag: async (mod, key, val) => { (page.flags[mod] ??= {})[key] = val; },
          getFlag: (mod, key) => page.flags?.[mod]?.[key],
          update: async (changes) => Object.assign(page, changes) };
        journal.pages.contents.push(page);
        return page;
      }),
    };
    journals.push(journal);
    return journal;
  } };
  ChatMessage._reset?.();
  game.settings._store.clear();
  game.socket._reset?.();
  game.actors._reset();
  game.actors._set('pc-1', makeTestActor({ id: 'pc-1', name: 'Kira' }));
  const gm = { id: 'gm-1', name: 'Test GM', isGM: true, active: true };
  global.game.users = Object.assign([gm], { get: (id) => (id === 'gm-1' ? gm : null) });
  global.game.user = gm;
});
afterEach(() => {
  game.journal = saved.journal;
  global.JournalEntry = { create: saved.create };
  global.game.user = saved.user;
  global.game.users = saved.users;
});

/** The scene's stored ledger with one live truth: "Vance — walks with a limp". Returns its id. */
function storeSceneWithTruth() {
  const state = {
    currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    connectionIds: [], dismissedEntities: [],
  };
  applySidecar({ newTruths: [{ subject: 'Vance', fact: 'walks with a limp' }], stateChanges: [] }, { campaignState: state });
  game.settings._store.set(KEY, state);
  return state.sceneTruths.at(-1).id;
}

const auto = (text) => ({ type: 'moment', text, automated: true, sessionId: 'sess-1' });
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

describe('issue #362 AC27 — a relayed strike that reaches the Chronicle does not wait for itself', () => {
  it('control: the strike command with no Chronicle entry stating the fact settles at once', async () => {
    const truthId = storeSceneWithTruth();
    await addChronicleEntry('pc-1', auto('The dockmaster keeps a ledger of debts.'));

    const action = requestGmAction('factContinuity.command', { text: `!truth strike ${truthId}` });
    expect(await within(action, 3000)).toBe('settled');
    const struck = game.settings.get(MODULE_ID, 'campaignState').sceneTruths.find(t => t.id === truthId);
    expect(struck.retracted).toBe(true);
    expect(await texts()).toEqual(['The dockmaster keeps a ledger of debts.']);
  });

  it('control: the same propagation outside the relay queue deletes the entry at once', async () => {
    const truthId = storeSceneWithTruth();
    await addChronicleEntry('pc-1', auto('Vance walks with a limp since the crash.'));
    const working = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
    const struck = strikeTruth(truthId, working, { isGM: true, actor: 'gm' });

    const run = propagateRetraction(struck, working);
    expect(await within(run, 3000)).toBe('settled');
    expect((await run).chronicle).toBe(1);
    expect(await texts()).toEqual([]);
  });

  it('the strike command whose fact a Chronicle entry states settles at once too — not after the relay\'s 60 s budget', async () => {
    expect(GM_ACTION_TIMEOUT_MS).toBeGreaterThan(5000);   // the wait below is far inside the budget
    const truthId = storeSceneWithTruth();
    await addChronicleEntry('pc-1', auto('Vance walks with a limp since the crash.'));

    const action = requestGmAction('factContinuity.command', { text: `!truth strike ${truthId}` });
    expect(await within(action, 3000)).toBe('settled');
    expect(await texts()).toEqual([]);
    const struck = game.settings.get(MODULE_ID, 'campaignState').sceneTruths.find(t => t.id === truthId);
    expect(struck.retracted).toBe(true);
  }, 15_000);

  it('…and the table\'s next relayed action is not held behind it', async () => {
    const truthId = storeSceneWithTruth();
    await addChronicleEntry('pc-1', auto('Vance walks with a limp since the crash.'));

    requestGmAction('factContinuity.command', { text: `!truth strike ${truthId}` }).catch(() => {});
    await sleep(300);   // the strike is running: its handler has reached the Chronicle
    // Any other relayed action — here a player's Chronicle note — queues behind it.
    const next = requestGmAction('chronicle.edit', { actorId: 'pc-1', op: 'add', entry: { type: 'annotation', text: 'A note Kira wrote.', sessionId: 'sess-1' } });
    expect(await within(next, 3000)).toBe('settled');
    expect(await texts()).toContain('A note Kira wrote.');
  }, 15_000);

  it('control: a strike made on a co-GM\'s client asks the canonical GM for the delete and writes nothing itself', async () => {
    const truthId = storeSceneWithTruth();
    await addChronicleEntry('pc-1', auto('Vance walks with a limp since the crash.'));
    // gm-1 (the lower id) is the canonical GM; this client is gm-2.
    const gm1 = { id: 'gm-1', name: 'Gina', isGM: true, active: true };
    const gm2 = { id: 'gm-2', name: 'Gus', isGM: true, active: true };
    global.game.users = Object.assign([gm1, gm2], { get: (id) => [gm1, gm2].find(u => u.id === id) ?? null });
    global.game.user = gm2;
    const working = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
    const struck = strikeTruth(truthId, working, { isGM: true, actor: 'gm' });

    await propagateRetraction(struck, working);
    const relayed = (game.socket._emitted ?? []).filter(e => e.event === GM_RELAY_SOCKET
      && e.payload?.kind === 'gmRelay.chronicle.edit');
    expect(relayed.map(e => e.payload.payload)).toEqual([
      expect.objectContaining({ op: 'delete', actorId: 'pc-1' }),
    ]);
    // The co-GM's client did not write the GM's journal itself.
    expect(await texts()).toEqual(['Vance walks with a limp since the crash.']);
  });
});

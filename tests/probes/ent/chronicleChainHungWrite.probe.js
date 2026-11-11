/**
 * PROBE (thirteenth audit, area ENT) — ENT: one Chronicle page write the
 * server never answers wedges that character's Chronicle until the canonical
 * GM reloads — the per-actor write chain has no bound.
 *
 * src/character/chronicle.js writeChronicle serialises an actor's writes on
 * `_writeChains`: each write runs `.then()` of the one before it. A REJECTED
 * write is passed (`run.catch(() => {})`), but one that never settles —
 * `page.setFlag` whose socket ack is lost — is waited on for ever, and so is
 * every later write for that actor: the automatic entry after each narration
 * (always the first PC's — CHRONICLE-FIRST-PC), every panel add / pin / edit.
 * The module's two other serialisers bound exactly this wait
 * (campaignStateChain.js: 10 s, "so one hung write cannot hold every later
 * one"; gmRelay.js: the action's run budget). Each Chronicle edit also rides
 * the GM relay queue ("chronicle.edit", budget 60 s): once the chain is
 * wedged, every later edit holds that queue for its full budget.
 *
 * Scenario (one GM client; the handler called as the relay calls it):
 *   1. Kira's Chronicle holds one entry.
 *   2. An automatic entry's page write is never answered.
 *   3. Later, Kira's player adds a note; later still, pins the first entry.
 * Correct: the later edits land within a bounded wait.
 * Today: they never land, however long the table waits.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  addChronicleEntry,
  getChronicleEntries,
  applyChronicleEditFromRelay,
} from '../../../src/character/chronicle.js';

const owner = { id: 'pl-1', isGM: false };
const as = (user) => ({ requesterId: user.id, requester: user, requesterIsGM: user.isGM });

let journals, saved, hangNextPageWrite;

beforeEach(async () => {
  journals = [];
  hangNextPageWrite = false;
  saved = { journal: game.journal, create: JournalEntry.create };
  game.journal = {
    get contents() { return [...journals]; },
    getName: (n) => journals.find(j => j.name === n) ?? null,
    [Symbol.iterator]: () => journals[Symbol.iterator](),
  };
  JournalEntry.create = async (data) => {
    const journal = {
      id: `j-${journals.length + 1}`, name: data.name, flags: data.flags ?? {}, pages: { contents: [] },
      setFlag: async (mod, key, val) => { (journal.flags[mod] ??= {})[key] = val; },
      update: async (changes) => Object.assign(journal, changes),
      createEmbeddedDocuments: async (_type, docs) => docs.map(d => {
        const page = {
          ...d, flags: d.flags ?? {},
          setFlag: (mod, key, val) => {
            // The write the server never answers: neither resolves nor rejects.
            if (hangNextPageWrite) { hangNextPageWrite = false; return new Promise(() => {}); }
            (page.flags[mod] ??= {})[key] = val;
            return Promise.resolve(page);
          },
        };
        journal.pages.contents.push(page);
        return page;
      }),
    };
    journals.push(journal);
    return journal;
  };
  game.actors._reset();
  game.actors._set('pc-1', makeTestActor({ id: 'pc-1', name: 'Kira', ownership: { 'pl-1': 3 } }));
  await addChronicleEntry('pc-1', { type: 'moment', text: 'Original.', automated: true });
});

afterEach(() => {
  vi.useRealTimers();
  game.journal = saved.journal;
  JournalEntry.create = saved.create;
});

const texts = async () => (await getChronicleEntries('pc-1')).map(e => e.text);
const settledWithin = async (promise, ms) => {
  let state = 'pending';
  promise.then(() => { state = 'settled'; }, () => { state = 'rejected'; });
  await vi.advanceTimersByTimeAsync(ms);
  return state;
};

describe('ENT — the Chronicle\'s per-actor write chain and a write that never settles', () => {
  it('control: a REFUSED write does not hold the next one', async () => {
    silenceConsoleErrors();
    const page = journals[0].pages.contents[0];
    const realSetFlag = page.setFlag;
    page.setFlag = () => { page.setFlag = realSetFlag; return Promise.reject(new Error('The server refused the write (test fault)')); };

    await expect(addChronicleEntry('pc-1', { type: 'moment', text: 'Refused.', automated: true })).rejects.toThrow(/refused/);
    expect(await applyChronicleEditFromRelay({ actorId: 'pc-1', op: 'add', entry: { text: 'A note.' } }, as(owner)))
      .toEqual({ applied: true });
    expect(await texts()).toEqual(['Original.', 'A note.']);
  });

  it('a write the server never answers does not hold every later Chronicle edit for that character', async () => {
    silenceConsoleErrors();
    vi.useFakeTimers();
    const firstId = (await getChronicleEntries('pc-1'))[0].id;

    // 2. The automatic entry after a narration: its page write is never answered.
    hangNextPageWrite = true;
    const hung = addChronicleEntry('pc-1', { type: 'moment', text: 'Never answered.', automated: true });
    expect(await settledWithin(hung, 1_000), 'the hung write is still out (setup)').toBe('pending');

    // 3. Later edits — a note, then a pin — each a healthy write.
    const note = applyChronicleEditFromRelay({ actorId: 'pc-1', op: 'add', entry: { text: 'A note.' } }, as(owner));
    const pin  = applyChronicleEditFromRelay({ actorId: 'pc-1', op: 'pin', entryId: firstId, pinned: true }, as(owner));

    // Ten minutes of play later.
    const after = { note: await settledWithin(note, 10 * 60_000), pin: await settledWithin(pin, 1_000) };
    const entries = await getChronicleEntries('pc-1');

    expect({ ...after, texts: entries.map(e => e.text), firstPinned: entries[0]?.pinned === true },
      'ten minutes on, the edits made after the hung write have landed')
      .toEqual({ note: 'settled', pin: 'settled', texts: ['Original.', 'A note.'], firstPinned: true });
  });
});

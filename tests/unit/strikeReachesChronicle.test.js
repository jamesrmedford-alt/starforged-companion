/**
 * STARFORGED COMPANION
 * tests/unit/strikeReachesChronicle.test.js
 *
 * The Chronicle's automatic entries are written from the session record
 * (issue #382 slice 4, record/chronicleView.js), and a correction reaches
 * them through it.
 *
 *   - STRIKE-CHRONICLE: a strike of a truth a beat's narration set takes back
 *     the entry written from that beat — by its narration (`narrationId`) or
 *     the record's narration event (`eventId`), no longer by matching the
 *     entry's words — while a pinned entry, one a player edited, a player's
 *     own and another beat's stay. The campaign recap's source follows the
 *     entries, so it is made again (issue #301 B04).
 *   - A name the table changed since an automatic entry was written is read
 *     as the new one (chronicle.js getChronicleEntries); a player's own words
 *     are theirs, as written. Nothing stored is rewritten.
 *   - What the scribe is given for a narration is its beat: FACTS, the
 *     player's line, the narration, the PC, what lasted (scribeArgsFor); a
 *     Batch Mode round's every acting character with their words; nothing for
 *     a telling an upgrade superseded or the X-Card removed.
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const scribe = vi.hoisted(() => ({ requests: [] }));
vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    scribe.requests.push({ system: body.system[0].text, message: body.messages[0].content });
    return { content: [{ type: 'text', text: '{"type":"revelation","salience":"notable","text":"Vance limps since the crash."}' }] };
  }),
}));
vi.mock('../../src/character/chronicle.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requestChronicleEdit: vi.fn(async () => ({ ok: true, relayed: false, result: { applied: true } })),
}));

import {
  addChronicleEntry, getChronicleEntries, setChronicleEntryPinned, updateChronicleEntry,
} from '../../src/character/chronicle.js';
import { writeChronicleEntry } from '../../src/character/chronicleWriter.js';
import { campaignRecapCacheKey } from '../../src/narration/narrator.js';
import { scribeArgsFor, registerChronicleScribe } from '../../src/record/chronicleView.js';
import { readRecord } from '../../src/record/read.js';
import { recordEvent, recordSettled, _resetRecordForTests } from '../../src/record/record.js';
import { _resetSummaryViewForTests } from '../../src/record/summaryView.js';
import { seedSessionRecord, recordedEvent, playedBeats } from '../helpers/sessionRecordSeed.js';

const MODULE_ID = 'starforged-companion';
let journals, saved;

/** Journals that keep their pages, found by name, id and contents. */
function installJournals() {
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
        const page = { id: `p-${Math.random().toString(36).slice(2, 8)}`, ...d, flags: JSON.parse(JSON.stringify(d.flags ?? {})),
          setFlag: async (mod, key, val) => { (page.flags[mod] ??= {})[key] = val; },
          getFlag: (mod, key) => page.flags?.[mod]?.[key],
          update: async (changes) => {
            for (const [key, value] of Object.entries(changes)) {
              const path = key.split('.');
              let at = page;
              for (const p of path.slice(0, -1)) at = (at[p] ??= {});
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
}

beforeEach(() => {
  installJournals();
  _resetRecordForTests();
  _resetSummaryViewForTests();
  game.settings._store.clear();
  game.actors._reset();
  game.actors._set('pc-1', makeTestActor({ id: 'pc-1', name: 'Kira' }));
  game.actors._set('pc-2', makeTestActor({ id: 'pc-2', name: 'Ren' }));
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 'sess-1', sessionNumber: 2, sessionStartedId: 'sess-1' });
});
afterEach(() => {
  game.journal = saved.journal;
  global.JournalEntry = { create: saved.create };
});

const auto = (text, extra = {}) => ({ type: 'moment', text, automated: true, sessionId: 'sess-1', ...extra });
const texts = async () => (await getChronicleEntries('pc-1')).map(e => e.text);
const who = { actor: 'pc-1' };

/** Session 1's record: a move whose narration set a truth, and a second beat. */
async function sessionPlayed() {
  return seedSessionRecord('sess-1', [
    recordedEvent('sess-1', 'session.begun', { d: { number: 2 } }),
    recordedEvent('sess-1', 'line', { who, ref: { line: 'm1' }, d: { via: 'typed' }, text: 'I ask Vance about the crash.' }),
    recordedEvent('sess-1', 'move.resolved', { who, ref: { res: 'r1' }, d: { moveId: 'gather_information', moveName: 'Gather Information', statUsed: 'wits', outcome: 'strong_hit' } }),
    recordedEvent('sess-1', 'narration', { who, ref: { nar: 'nar-limp', res: 'r1' }, d: { mode: 'move' }, text: 'Vance limps to the window.' }),
    recordedEvent('sess-1', 'truth.set', { ref: { truth: 'tr-limp', nar: 'nar-limp' }, d: { subject: { kind: 'text', text: 'Vance' }, fact: 'walks with a limp', by: 'narrator' } }),
    ...playedBeats('sess-1', [{ said: 'I thank him.', told: 'Vance nods once.', actor: 'pc-1' }], { begun: false }),
  ], { number: 2 });
}

describe('STRIKE-CHRONICLE — a strike takes back the entry its beat wrote', () => {
  it('the entry of the beat that set the struck truth goes; pinned, edited, a player\'s own and another beat\'s stay', async () => {
    await sessionPlayed();
    await addChronicleEntry('pc-1', auto('Vance walks with a limp since the crash.', { narrationId: 'nar-limp' }));
    await addChronicleEntry('pc-1', auto('Kira saw Vance limp.', { narrationId: 'nar-limp' }));
    await addChronicleEntry('pc-1', auto('Vance limps — Kira will remember.', { narrationId: 'nar-limp' }));
    await addChronicleEntry('pc-1', auto('Vance nodded once.', { narrationId: 'nar-sess-1-1' }));
    await addChronicleEntry('pc-1', { type: 'annotation', text: 'Vance walks with a limp.', automated: false, sessionId: 'sess-1' });
    const [, pinned, edited] = await getChronicleEntries('pc-1');
    await setChronicleEntryPinned('pc-1', pinned.id, true);
    await updateChronicleEntry('pc-1', edited.id, 'Vance limps, Kira wrote.');
    const keyBefore = await campaignRecapCacheKey(game.settings.get(MODULE_ID, 'campaignState'));

    registerChronicleScribe();
    recordEvent('truth.struck', { session: 'sess-1', ref: { truth: 'tr-limp' }, d: { by: 'gm' } });
    await recordSettled();
    await vi.waitFor(async () => expect(await texts()).not.toContain('Vance walks with a limp since the crash.'));

    expect(await texts()).toEqual([
      'Kira saw Vance limp.',
      'Vance limps, Kira wrote.',
      'Vance nodded once.',
      'Vance walks with a limp.',
    ]);
    // The campaign recap's source follows the entries (and the strike), so it is made again (issue #301 B04).
    expect(await campaignRecapCacheKey(game.settings.get(MODULE_ID, 'campaignState'))).not.toEqual(keyBefore);
  });
});

describe('a name the table changed reaches the Chronicle at read', () => {
  it('an automatic entry is read with the new name; a player\'s words and an edited entry as written; nothing stored changes', async () => {
    await seedSessionRecord('sess-1', [
      recordedEvent('sess-1', 'session.begun', { d: { number: 2 } }),
      recordedEvent('sess-1', 'name.changed', { d: { from: 'Ashen Wake', to: 'Cinder Wren', how: 'corrected', about: 'raider cutter' } }),
    ], { number: 2 });
    await addChronicleEntry('pc-1', auto('Kira watched the Ashen Wake drift past the Wake\'s old berth.'));
    await addChronicleEntry('pc-1', { type: 'annotation', text: 'The Ashen Wake was always trouble.', automated: false });
    expect(await texts()).toEqual([
      'Kira watched the Cinder Wren drift past the Cinder Wren\'s old berth.',
      'The Ashen Wake was always trouble.',
    ]);
    const stored = journals.find(j => j.name.startsWith('Chronicle'))?.pages.contents[0].flags[MODULE_ID].chronicle;
    expect(stored[0].text).toBe('Kira watched the Ashen Wake drift past the Wake\'s old berth.');
  });
});

describe('what the scribe is given is the beat (scribeArgsFor)', () => {
  it('a move: the PC, the player\'s words, the move and its outcome, what changed and was established, what lasted', async () => {
    await sessionPlayed();
    const read = readRecord({ session: 'sess-1' });
    const narration = Object.values(journals.find(j => j.name.includes('Session Log')).pages.contents[0].flags[MODULE_ID].sessionRecord.events)
      .find(e => e.k === 'narration' && e.ref.nar === 'nar-limp');
    const args = scribeArgsFor(narration, read);
    expect(args).toMatchObject({
      kind: 'move', moveId: 'gather_information', outcome: 'strong_hit', actorId: 'pc-1',
      playerText: 'I ask Vance about the crash.', narrationText: 'Vance limps to the window.',
      narrationId: 'nar-limp', eventId: narration.id,
      facts: ['Gather Information (+wits), strong hit', 'established: Vance — walks with a limp'],
    });
    expect(args.sourceHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('a Batch Mode round: every acting character with their words, the round told once', async () => {
    const page = await seedSessionRecord('sess-1', [
      recordedEvent('sess-1', 'line', { who: { actor: 'pc-1' }, ref: { round: 'round-3' }, d: { via: 'round' }, text: 'I slip through the vent.' }),
      recordedEvent('sess-1', 'line', { who: { actor: 'pc-2' }, ref: { round: 'round-3' }, d: { via: 'round' }, text: 'I keep the corridor covered.' }),
      recordedEvent('sess-1', 'narration', { ref: { nar: 'nar-round', round: 'round-3' }, d: { mode: 'round' }, text: 'Kira slips through while Ren holds the corridor.' }),
    ], { number: 2 });
    const narration = Object.values(page.flags[MODULE_ID].sessionRecord.events).find(e => e.k === 'narration');
    const args = scribeArgsFor(narration, readRecord({ session: 'sess-1' }));
    expect(args).toMatchObject({ kind: 'round', narrationId: 'nar-round', narrationText: 'Kira slips through while Ren holds the corridor.' });
    expect(args.characters).toEqual([
      { actorId: 'pc-1', name: 'Kira', text: 'I slip through the vent.' },
      { actorId: 'pc-2', name: 'Ren', text: 'I keep the corridor covered.' },
    ]);
  });

  it('a telling that names what the table renamed is still its beat\'s — given with the new name', async () => {
    const page = await seedSessionRecord('sess-1', [
      recordedEvent('sess-1', 'name.changed', { d: { from: 'Ashen Wake', to: 'Cinder Wren', how: 'corrected', about: 'raider cutter' } }),
      recordedEvent('sess-1', 'line', { who, ref: { line: 'm9' }, d: { via: 'typed' }, text: 'I hail the Ashen Wake.' }),
      recordedEvent('sess-1', 'narration', { who, ref: { nar: 'nar-hail' }, d: { mode: 'paced', actorId: 'pc-1' }, text: 'The Ashen Wake answers with static.' }),
    ], { number: 2 });
    const narration = Object.values(page.flags[MODULE_ID].sessionRecord.events).find(e => e.k === 'narration');
    const args = scribeArgsFor(narration, readRecord({ session: 'sess-1' }));   // was: null — its text read as another telling's
    expect(args).toMatchObject({ narrationText: 'The Cinder Wren answers with static.', playerText: 'I hail the Cinder Wren.' });
  });

  it('nothing for a telling the X-Card removed, or one an upgrade superseded', async () => {
    const page = await sessionPlayed();
    const events = page.flags[MODULE_ID].sessionRecord.events;
    const narration = Object.values(events).find(e => e.k === 'narration' && e.ref.nar === 'nar-limp');
    const removed = recordedEvent('sess-1', 'narration.removed', { d: { narrationIds: ['nar-limp'], by: 'xcard' } });
    expect(scribeArgsFor(narration, readRecord({ session: 'sess-1' }, {
      pages: [{ pageId: 'p', sessionId: 'sess-1', number: 2, createdAt: 1, story: '', name: '',
        record: { ...page.flags[MODULE_ID].sessionRecord, events: { ...events, [removed.id]: removed } } }],
      currentSessionId: 'sess-1', nameOf: () => 'Kira', otherNames: [],
    }))).toBeNull();
    const superseded = recordedEvent('sess-1', 'narration.removed', { ref: { res: 'r1' }, d: { narrationIds: ['nar-limp'], by: 'superseded' } });
    const renarrated = recordedEvent('sess-1', 'narration', { ref: { nar: 'nar-hit', res: 'r1' }, d: { mode: 'move', upgradeOf: 'r1' }, text: 'Vance straightens, the limp forgotten.' });
    const source = { pages: [{ pageId: 'p', sessionId: 'sess-1', number: 2, createdAt: 1, story: '', name: '',
      record: { ...page.flags[MODULE_ID].sessionRecord, events: { ...events, [superseded.id]: superseded, [renarrated.id]: renarrated } } }],
      currentSessionId: 'sess-1', nameOf: () => 'Kira', otherNames: [] };
    expect(scribeArgsFor(narration, readRecord({ session: 'sess-1' }, source))).toBeNull();
    expect(scribeArgsFor(renarrated, readRecord({ session: 'sess-1' }, source))?.narrationText).toBe('Vance straightens, the limp forgotten.');
  });

  it('the scribe is sent FACTS, the player\'s line and the narration — and told NARRATION lends a word, never an event; the entry carries the event and its hash', async () => {
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    scribe.requests.length = 0;
    await sessionPlayed();
    const narration = Object.values(journals.find(j => j.name.includes('Session Log')).pages.contents[0].flags[MODULE_ID].sessionRecord.events)
      .find(e => e.k === 'narration' && e.ref.nar === 'nar-limp');
    const entry = await writeChronicleEntry(scribeArgsFor(narration, readRecord({ session: 'sess-1' })));
    expect(scribe.requests).toHaveLength(1);
    expect(scribe.requests[0].message).toMatch(/## FACTS\n\n- Gather Information \(\+wits\), strong hit\n- established: Vance — walks with a limp\n\n## PLAYER'S LINE\n\nI ask Vance about the crash\.\n\n## NARRATION\n\nVance limps to the window\./);
    expect(scribe.requests[0].system).toContain('The entry states what FACTS and the PLAYER\'S LINE say; NARRATION may lend a word, never an event.');
    expect(entry).toMatchObject({ text: 'Vance limps since the crash.', narrationId: 'nar-limp', eventId: narration.id, sessionId: 'sess-1' });
    expect(entry.sourceHash).toMatch(/^[0-9a-f]{8}$/);
  });
});

/**
 * STARFORGED COMPANION
 * tests/unit/sessionRecord.test.js — the session record's writer and store (issue #382, slice 1)
 *
 * `recordEvent(kind, payload)` is how anything enters the record: one event,
 * checked against RECORD_EVENTS, written by the canonical GM onto its
 * session's page of the Session Log journal as ONE dotted key of the page's
 * `sessionRecord` flag (decision D1 — an append sends one event, never the
 * session, and never touches campaignState). A co-GM relays; a player's
 * client records nothing; a stale page writes nothing. The X-Card is the one
 * edit of what is stored (decision D3): what the removed narration told is
 * blanked, its place in the record kept.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Whether this page's connection dropped (connectionWatch.js) — set by one test.
const stale = vi.hoisted(() => ({ value: false }));
vi.mock('../../src/multiplayer/connectionWatch.js', async (importOriginal) => ({
  ...(await importOriginal()),
  pageIsStale: () => stale.value,
}));
import {
  recordEvent, recordSettled, recordNarrationsRemoved, applyRecordAppendFromRelay, _resetRecordForTests,
} from '../../src/record/record.js';
import { writeRecordView, storedRecordView, _resetRecordStoreForTests } from '../../src/record/store.js';
import { RECORD_EVENTS } from '../../src/record/events.js';
import { readRecord } from '../../src/record/read.js';
import { JOURNAL_NAMES } from '../../src/world/worldJournal.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';

let journals;
let updates;            // every page.update the record made: { page, changes, options }

const logPages = () => journals.journals.get(JOURNAL_NAMES.sessionLog)?.pages.contents ?? [];
const recordOn = (page) => page?.flags?.[MODULE_ID]?.sessionRecord ?? null;
const eventsOn = (page) => Object.values(recordOn(page)?.events ?? {});
const pageOf = (sessionId) => logPages().find(p => p.flags?.[MODULE_ID]?.sessionLogPage?.sessionId === sessionId) ?? null;

/** Watch every Session Log page's updates (wrapped as each page is made). */
function watchPageUpdates() {
  const seen = new WeakSet();
  return () => {
    for (const page of logPages()) {
      if (seen.has(page)) continue;
      seen.add(page);
      const update = page.update;
      page.update = async (changes, options) => {
        updates.push({ page, changes: JSON.parse(JSON.stringify(changes)), options });
        return update(changes, options);
      };
    }
  };
}

// A session the table has not begun: the record opens with what it is given
// (a begun one whose record opens late gets a `session.begun` first — below).
function seedCampaign(extra = {}) {
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 7, currentSceneId: 'sc-1',
    sessionStartedId: null, sessionActive: true, xCardedNarrationIds: [],
    ...extra,
  });
}

let wrapPages;
beforeEach(async () => {
  journals = installJournalMock();
  updates = [];
  _resetRecordForTests();
  _resetRecordStoreForTests();
  stale.value = false;
  game.settings._store.clear();
  game.user = { isGM: true, id: 'test-user-gm' };
  game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  game.socket._reset();
  seedCampaign();
  wrapPages = watchPageUpdates();
  // A page made up front, so its update calls are watched from the first append.
  const { getOrCreateSessionLogPage } = await import('../../src/world/worldJournal.js');
  await getOrCreateSessionLogPage({ currentSessionId: SESSION, sessionNumber: 7 });
  wrapPages();
});
afterEach(() => {
  journals.restore();
  stale.value = false;
});

describe('the record is written on its session\'s page, one event a key', () => {
  it('an append is one dotted key of the page\'s flag and its counter — never the session\'s other events', async () => {
    recordEvent('line', { who: { user: 'u-1', actor: 'pc-1' }, ref: { line: 'msg-1' }, d: { via: 'typed' }, text: 'I hail the station.' });
    await recordSettled();
    recordEvent('line', { who: { user: 'u-1', actor: 'pc-1' }, ref: { line: 'msg-2' }, d: { via: 'typed' }, text: 'I dock.' });
    await recordSettled();

    const appends = updates.filter(u => Object.keys(u.changes).some(k => k.includes('.sessionRecord.events.')));
    expect(appends).toHaveLength(2);
    const second = Object.keys(appends[1].changes);
    // The second append carries only its own event and the counter.
    expect(second.filter(k => k.includes('.events.'))).toHaveLength(1);
    expect(second).toContain(`flags.${MODULE_ID}.sessionRecord.seq`);
    expect(second.some(k => k === `flags.${MODULE_ID}.sessionRecord` || k.endsWith('.sessionRecord.events'))).toBe(false);
    // Marked as the record's own write: page listeners that have nothing to do with it return on it.
    expect(appends[1].options).toEqual({ [MODULE_ID]: { recordWrite: true } });

    const page = pageOf(SESSION);
    expect(recordOn(page)).toMatchObject({ v: 1, sessionId: SESSION, seq: 2 });
    expect(eventsOn(page).map(e => [e.k, e.text, e.seq])).toEqual([['line', 'I hail the station.', 0], ['line', 'I dock.', 1]]);
    // campaignState is never written by the record.
    expect(game.settings.get(MODULE_ID, 'campaignState')).not.toHaveProperty('sessionRecord');
  });

  it('events queued in one tick go as one page update', async () => {
    recordEvent('line', { ref: { line: 'm-1' }, d: { via: 'typed' }, text: 'one' });
    recordEvent('line', { ref: { line: 'm-2' }, d: { via: 'typed' }, text: 'two' });
    recordEvent('line', { ref: { line: 'm-3' }, d: { via: 'typed' }, text: 'three' });
    await recordSettled();
    const appends = updates.filter(u => Object.keys(u.changes).some(k => k.includes('.events.')));
    expect(appends).toHaveLength(1);
    expect(Object.keys(appends[0].changes).filter(k => k.includes('.events.'))).toHaveLength(3);
  });

  it('keeps only the row\'s own facts and stable ids; an unknown kind records nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(recordEvent('move.resolved', {
      ref: { res: 'res-1', nar: 'not-a-move-ref', bogus: 'x' },
      d: { moveId: 'face_danger', outcome: 'miss', secretPlan: 'never on the record', target: { name: 'Tamsin', id: null } },
    })).toBe(true);
    expect(recordEvent('plan.made', { d: { plan: 'a hidden plan' } })).toBe(false);
    await recordSettled();
    const [e] = eventsOn(pageOf(SESSION));
    expect(e.k).toBe('move.resolved');
    expect(e.ref).toEqual({ res: 'res-1' });
    expect(e.d).toEqual({ moveId: 'face_danger', outcome: 'miss', target: { name: 'Tamsin', id: null } });
    expect(e).toMatchObject({ s: SESSION, scene: 'sc-1', who: { user: null, actor: null } });
    expect(warn.mock.calls.some(c => String(c[0]).includes('"plan.made" is not a row'))).toBe(true);
    warn.mockRestore();
  });

  it('a session with no page yet gets one, found again by its session id (get-or-create, rules/reachability.md §7)', async () => {
    recordEvent('line', { session: 'sess-other', ref: { line: 'm-9' }, d: { via: 'typed' }, text: 'elsewhere' });
    await recordSettled();
    recordEvent('line', { session: 'sess-other', ref: { line: 'm-10' }, d: { via: 'typed' }, text: 'again' });
    await recordSettled();
    const pages = logPages().filter(p => p.flags?.[MODULE_ID]?.sessionLogPage?.sessionId === 'sess-other');
    expect(pages).toHaveLength(1);
    expect(eventsOn(pages[0]).map(e => e.text).sort()).toEqual(['again', 'elsewhere']);
  });
});

describe('only the canonical GM writes the record', () => {
  it('a player\'s client records nothing', async () => {
    game.user = { isGM: false, id: 'pl-1' };
    expect(recordEvent('line', { d: { via: 'typed' }, text: 'a player line' })).toBe(false);
    await recordSettled();
    expect(eventsOn(pageOf(SESSION))).toEqual([]);
    expect(game.socket._emitted ?? []).toEqual([]);
  });

  it('a co-GM relays its event to the canonical GM (`record.append`), and writes nothing itself', async () => {
    game.users._set([{ id: 'gm-a', isGM: true, active: true }, { id: 'gm-b', isGM: true, active: true }]);
    game.user = { isGM: true, id: 'gm-b' };
    expect(recordEvent('name.changed', { d: { from: 'Ashen Wake', to: 'Cinder Wren', how: 'corrected' } })).toBe(true);
    for (let i = 0; i < 100 && !(game.socket._emitted ?? []).length; i++) await new Promise(r => setTimeout(r, 5));
    await recordSettled();
    expect(eventsOn(pageOf(SESSION))).toEqual([]);
    const sent = (game.socket._emitted ?? []).map(e => e.payload);
    expect(sent).toHaveLength(1);
    expect(sent[0].kind).toMatch(/record\.append$/);
    expect(sent[0].payload.events[0]).toMatchObject({ k: 'name.changed', d: { from: 'Ashen Wake', to: 'Cinder Wren', how: 'corrected' } });
  });

  it('the relay handler writes a GM\'s events, rebuilt against their rows — and refuses a player\'s', async () => {
    const event = { k: 'truth.struck', s: SESSION, at: 5, ref: { truth: 'tr-1', nar: 'smuggled' }, d: { by: 'gm', extra: 'dropped' }, who: { user: 'gm-b', actor: null } };
    expect(await applyRecordAppendFromRelay({ events: [event] }, { requesterIsGM: false })).toEqual({ recorded: 0 });
    expect(await applyRecordAppendFromRelay({ events: [event, { k: 'not.a.kind' }] }, { requesterIsGM: true })).toEqual({ recorded: 1 });
    await recordSettled();
    const [e] = eventsOn(pageOf(SESSION));
    expect(e).toMatchObject({ k: 'truth.struck', s: SESSION, at: 5, ref: { truth: 'tr-1' }, d: { by: 'gm' } });
    expect(e.ref).not.toHaveProperty('nar');
    expect(e.d).not.toHaveProperty('extra');
  });

  it('a page whose connection dropped writes nothing (its cache may lack what the table did since)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    recordEvent('line', { d: { via: 'typed' }, text: 'queued before the drop' });
    stale.value = true;
    await recordSettled();
    expect(eventsOn(pageOf(SESSION))).toEqual([]);
    warn.mockRestore();
  });
});

describe('a world upgraded in the middle of a session', () => {
  it('opens the session\'s record with a `session.begun` marked resumed, the table as it stands', async () => {
    seedCampaign({ sessionStartedId: SESSION });
    recordEvent('line', { d: { via: 'typed' }, text: 'the first line the record sees' });
    await recordSettled();
    const events = eventsOn(pageOf(SESSION)).sort((a, b) => a.seq - b.seq);
    expect(events.map(e => e.k)).toEqual(['session.begun', 'line']);
    expect(events[0].d).toMatchObject({ resumed: true, number: 7, pcs: [], vows: [] });
    expect(events[0].at).toBeLessThan(events[1].at);
  });

  it('no resumed `session.begun` for a session nobody has begun', async () => {
    recordEvent('line', { d: { via: 'typed' }, text: 'before Begin' });
    await recordSettled();
    expect(eventsOn(pageOf(SESSION)).map(e => e.k)).toEqual(['line']);
  });
});

describe('the X-Card blanks what it removed (decision D3); an upgrade\'s supersede is hidden at read', () => {
  async function narratedBeat() {
    recordEvent('move.resolved', { who: { actor: 'pc-1' }, ref: { res: 'res-1' }, d: { moveId: 'face_danger', moveName: 'Face Danger', outcome: 'miss', actionDie: 2 } });
    recordEvent('narration', { who: { actor: 'pc-1' }, ref: { nar: 'nar-1', res: 'res-1', card: 'card-1' }, d: { mode: 'move' }, text: 'The interrogator lifts the cutting torch.' });
    recordEvent('truth.set', { ref: { truth: 'tr-1', nar: 'nar-1' }, d: { subject: { kind: 'text', text: 'the prisoner' }, fact: 'has a burned hand', by: 'narrator', place: 'the brig' } });
    recordEvent('sheet.changed', { who: { actor: 'pc-1' }, ref: { res: 'res-1' }, d: { actorId: 'pc-1', what: 'spirit', from: 4, to: 3, cause: { kind: 'move', res: 'res-1' } } });
    await recordSettled();
  }

  it('the removed narration\'s prose and the truth it set are blanked in the flag; the move, its dice and the sheet change stay', async () => {
    await narratedBeat();
    await recordNarrationsRemoved(['nar-1'], { by: 'xcard' });
    await recordSettled();
    const flag = JSON.stringify(recordOn(pageOf(SESSION)));
    expect(flag).not.toMatch(/cutting torch/);
    expect(flag).not.toMatch(/burned hand/);
    expect(flag).not.toMatch(/the brig/);
    const byKind = Object.fromEntries(eventsOn(pageOf(SESSION)).map(e => [e.k, e]));
    expect(byKind.narration).toMatchObject({ removed: true, text: '', d: { mode: 'move' } });   // its place kept
    expect(byKind['truth.set']).toMatchObject({ removed: true, d: { subject: null, fact: null, place: null, by: 'narrator' } });
    expect(byKind['move.resolved'].d).toMatchObject({ outcome: 'miss', actionDie: 2 });
    expect(byKind['sheet.changed'].d).toMatchObject({ what: 'spirit', from: 4, to: 3 });
    expect(byKind['narration.removed'].d).toEqual({ narrationIds: ['nar-1'], by: 'xcard' });
  });

  it('an event of a narration already removed arrives blanked (a capture\'s late truth)', async () => {
    seedCampaign({ xCardedNarrationIds: ['nar-late'] });
    recordEvent('truth.set', { ref: { truth: 'tr-9', nar: 'nar-late' }, d: { subject: { kind: 'text', text: 'the cellar' }, fact: 'holds a body', by: 'narrator' } });
    await recordSettled();
    const [e] = eventsOn(pageOf(SESSION)).filter(x => x.k === 'truth.set');
    expect(e).toMatchObject({ removed: true, d: { fact: null, subject: null } });
    expect(JSON.stringify(recordOn(pageOf(SESSION)))).not.toMatch(/holds a body/);
  });

  it('a superseded narration is not blanked — the table did not object to it — and the read drops it', async () => {
    await narratedBeat();
    await recordNarrationsRemoved(['nar-1'], { by: 'superseded', res: 'res-1' });
    await recordSettled();
    expect(JSON.stringify(recordOn(pageOf(SESSION)))).toMatch(/cutting torch/);
    const read = readRecord({ session: SESSION });
    expect(JSON.stringify(read)).not.toMatch(/cutting torch|burned hand/);
  });
});

describe('a view\'s cache', () => {
  it('is stored on its session\'s page under a RECORD_VIEWS id, and refused under any other', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await writeRecordView(SESSION, 'log', { sourceHash: 'abc', renderedAt: 1 })).toBe(true);
    expect(storedRecordView(SESSION, 'log')).toMatchObject({ sourceHash: 'abc' });
    expect(await writeRecordView(SESSION, 'gossip', { sourceHash: 'x' })).toBe(false);
    expect(storedRecordView(SESSION, 'gossip')).toBeNull();
    warn.mockRestore();
  });
});

describe('the rows', () => {
  it('every row names its facts, its ids and at least one view that reads it', () => {
    for (const row of RECORD_EVENTS) {
      expect(row.readBy.length, row.id).toBeGreaterThan(0);
      for (const key of row.blank) expect(row.fields, `${row.id} blanks ${key}`).toContain(key);
    }
  });
});

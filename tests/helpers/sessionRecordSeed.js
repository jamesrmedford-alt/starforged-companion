/**
 * STARFORGED COMPANION
 * tests/helpers/sessionRecordSeed.js — a session's record on its Session Log page, for the tests of the views
 * made from it (issue #382).
 *
 * The views of the session record — the Session Log page, the campaign
 * recap, the session summary (STORY SO FAR, LAST SESSION) — read the events
 * stored on each session's page (record/store.js). A test of one of them
 * that is not about how the events got there seeds them here, in the shape
 * store.js keeps them; a test of the producers records them through the
 * real writers instead (sessionRecordComposition.test.js).
 *
 *   const journals = installJournalMock();
 *   await seedSessionRecord('sess-1', playedBeats('sess-1', ['I force the hatch.']), { number: 1 });
 */

import { JOURNAL_NAMES } from '../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';

let _n = 0;

/** One event as record.js stores it. */
export function recordedEvent(sessionId, k, { who = {}, ref = {}, d = {}, text, at } = {}) {
  _n += 1;
  return {
    id: `seed${String(_n).padStart(6, '0')}`, k, at: at ?? (Date.now() - 600_000 + _n), seq: _n, s: sessionId, scene: `sc-${sessionId}`,
    who: { user: who.user ?? null, actor: who.actor ?? null }, ref, d, ...(text !== undefined ? { text } : {}),
  };
}

/**
 * A session played as lines and their tellings: its `session.begun` (unless
 * `begun` is false — a session nobody began), then for each line the
 * player's typed words and the paced narration that told them — one beat each.
 *
 * @param {string} sessionId
 * @param {Array<string|{ said: string, told?: string, actor?: string }>} lines
 * @param {{ actor?: string, number?: number|null, begun?: boolean }} [opts]
 * @returns {Object[]}
 */
export function playedBeats(sessionId, lines, { actor = 'pc-kira', number = 1, begun = true } = {}) {
  const events = [];
  if (begun) events.push(recordedEvent(sessionId, 'session.begun', { d: { number, table: {} } }));
  lines.forEach((l, i) => {
    const { said, told, actor: who = actor } = typeof l === 'string' ? { said: l } : l;
    const nar = `nar-${sessionId}-${i + 1}`;
    events.push(recordedEvent(sessionId, 'line', { who: { actor: who }, ref: { line: `msg-${sessionId}-${i + 1}` }, d: { via: 'typed' }, text: said }));
    events.push(recordedEvent(sessionId, 'narration', {
      who: { actor: who }, ref: { nar, card: `card-${sessionId}-${i + 1}` }, d: { mode: 'paced', actorId: who },
      text: told ?? `The narrator tells it: ${said}`,
    }));
  });
  return events;
}

/**
 * Put a session's record on its Session Log page — the journal made when
 * there is none (the journal mock's JournalEntry.create: installJournalMock).
 *
 * @param {string} sessionId
 * @param {Object[]} events
 * @param {{ number?: number|null, story?: string, createdAt?: number, views?: Object }} [opts]
 * @returns {Promise<Object>} the page
 */
export async function seedSessionRecord(sessionId, events, { number = 1, story = '', createdAt = Date.now() - 3_600_000 + _n, views = {} } = {}) {
  const journal = globalThis.game.journal.getName(JOURNAL_NAMES.sessionLog)
    ?? await globalThis.JournalEntry.create({ name: JOURNAL_NAMES.sessionLog });
  const pageName = number ? `Session ${number}` : 'Session';
  const [page] = await journal.createEmbeddedDocuments('JournalEntryPage', [{
    name: pageName, type: 'text', text: { format: 1, content: `<h2>${pageName}</h2>` },
    flags: { [MODULE_ID]: {
      sessionLogPage: {
        sessionId, sessionNumber: number, pageName, createdAt: new Date(createdAt).toISOString(), updatedAt: new Date(createdAt).toISOString(),
        summary: story ? { narrative: story, writtenAt: new Date(createdAt).toISOString() } : null,
      },
      sessionRecord: {
        v: 1, sessionId, createdAt, seq: Math.max(0, ...events.map(e => e.seq ?? 0)),
        events: Object.fromEntries(events.map(e => [e.id, e])), views,
      },
    } },
  }]);
  return page;
}

/** A session's page from before the record: its story alone (End a Session wrote it). */
export async function seedLegacySessionPage(sessionId, story, { number = 1, createdAt = Date.now() - 7_200_000 } = {}) {
  const journal = globalThis.game.journal.getName(JOURNAL_NAMES.sessionLog)
    ?? await globalThis.JournalEntry.create({ name: JOURNAL_NAMES.sessionLog });
  const pageName = number ? `Session ${number}` : 'Session';
  const [page] = await journal.createEmbeddedDocuments('JournalEntryPage', [{
    name: pageName, type: 'text', text: { format: 1, content: `<h2>${pageName}</h2>` },
    flags: { [MODULE_ID]: { sessionLogPage: {
      sessionId, sessionNumber: number, pageName, createdAt: new Date(createdAt).toISOString(),
      summary: { narrative: story, writtenAt: new Date(createdAt).toISOString() },
    } } },
  }]);
  return page;
}

/** A session's page, by its id. */
export function sessionPageOf(sessionId) {
  const journal = globalThis.game.journal.getName(JOURNAL_NAMES.sessionLog);
  return journal?.pages?.contents?.find(p => p.flags?.[MODULE_ID]?.sessionLogPage?.sessionId === sessionId) ?? null;
}

/** The summary view stored on a session's page, or null. */
export function storedSummaryOf(sessionId) {
  return sessionPageOf(sessionId)?.flags?.[MODULE_ID]?.sessionRecord?.views?.summary ?? null;
}

/** A Claude reply in the form the session summary asks for: cited sentences. */
export function citedSummaryReply(sentences) {
  return JSON.stringify(sentences.map(s => (typeof s === 'string' ? { text: s, because: ['1'] } : s)));
}

/**
 * A simulated table (tests/helpers/multiClient.js) whose journals keep their
 * pages, so the session record is stored as the module writes it: the
 * harness's own JournalEntry.create keeps none. Returns the restore.
 *
 * @param {Object} table
 * @param {(name: string) => Object} makeJournal — tests/helpers/fullStateFixture.js makeJournal
 * @returns {() => void}
 */
export function journalsKeepPages(table, makeJournal) {
  const saved = globalThis.JournalEntry;
  globalThis.JournalEntry = { async create(data) { const j = makeJournal(data.name); if (data.flags) j.flags = structuredClone(data.flags); table.journal._set(j.id, j); return j; } };
  return () => { globalThis.JournalEntry = saved; };
}

/** The summary view a simulated table's Session Log page holds for a session, or null. */
export function tableSummaryOf(table, sessionId) {
  const log = table.journal.find(j => j.name === JOURNAL_NAMES.sessionLog);
  return log?.pages?.contents?.find(p => p.flags?.[MODULE_ID]?.sessionLogPage?.sessionId === sessionId)
    ?.flags?.[MODULE_ID]?.sessionRecord?.views?.summary ?? null;
}

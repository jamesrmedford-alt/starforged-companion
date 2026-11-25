/**
 * STARFORGED COMPANION
 * src/record/pages.js — the Session Log's pages, as the session record sees them (issue #382)
 *
 * One page a session, found by its session id: a page made since the record
 * carries a `sessionRecord` flag; one from before it carries only the
 * `sessionLogPage` flag End a Session wrote (its story, `summary.narrative`),
 * and is read as it is — a legacy session (read.js). Nothing here writes, and
 * nothing here looks inside a record's events: store.js writes them, read.js
 * reads them.
 */

import { sessionLogJournal, FLAG_KEYS } from '../world/worldJournal.js';
import { actorNames, getActor } from '../character/actorBridge.js';

const MODULE_ID = 'starforged-companion';

/** The page flag the record is stored under. */
export const RECORD_FLAG = 'sessionRecord';

/** The stored campaignState, or null when it cannot be read. */
export function storedCampaignState() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, 'campaignState') ?? null;
  } catch {
    return null;
  }
}

/** The Session Log journal's pages as the journal holds them; [] when it is not there (or not readable on this client). */
export function sessionLogPages() {
  try {
    return sessionLogJournal()?.pages?.contents ?? [];
  } catch {
    return [];
  }
}

/** A page's record flag, or null. */
export function recordOf(page) {
  const rec = page?.flags?.[MODULE_ID]?.[RECORD_FLAG];
  return rec && typeof rec === 'object' ? rec : null;
}

/**
 * What a page says of itself: its session, its number, when it was made, the
 * story a page from before the record holds, and its record (null on a legacy
 * page).
 *
 * @param {Object} page
 * @returns {{ pageId: string|null, sessionId: string|null, number: number|null, name: string,
 *   createdAt: number, story: string, record: Object|null }}
 */
export function pageMeta(page) {
  const log = page?.flags?.[MODULE_ID]?.[FLAG_KEYS.sessionLogPage] ?? null;
  const rec = recordOf(page);
  const sessionId = rec?.sessionId ?? log?.sessionId ?? null;
  const created = Number.isFinite(rec?.createdAt) ? rec.createdAt : Date.parse(log?.createdAt ?? '');
  const number = log?.sessionNumber === null || log?.sessionNumber === undefined ? NaN : Number(log.sessionNumber);
  return {
    pageId:    page?.id ?? null,
    sessionId: typeof sessionId === 'string' && sessionId ? sessionId : null,
    number:    Number.isFinite(number) ? number : null,
    name:      log?.pageName ?? page?.name ?? '',
    createdAt: Number.isFinite(created) ? created : 0,
    story:     typeof log?.summary?.narrative === 'string' ? log.summary.narrative.trim() : '',
    record:    rec,
  };
}

/**
 * The session's page, or null.
 *
 * @param {string} sessionId
 * @returns {Object|null}
 */
export function recordPageOf(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return null;
  return sessionLogPages().find(p => pageMeta(p).sessionId === sessionId) ?? null;
}

/**
 * What `readRecord` reads when it is given nothing else: every session's page
 * as it is stored, the campaign's current session, and the names in play.
 *
 * @returns {{ pages: Object[], currentSessionId: string|null, nameOf: (id: string) => string|null, otherNames: string[] }}
 */
export function recordSource() {
  return {
    pages: sessionLogPages().map(pageMeta).filter(p => p.sessionId),
    currentSessionId: storedCampaignState()?.currentSessionId ?? null,
    // Every actor read is the bridge's (CLAUDE.md).
    nameOf: (id) => {
      try {
        const name = id ? getActor(id)?.name : null;
        return typeof name === 'string' && name ? name : null;
      } catch {
        return null;
      }
    },
    otherNames: actorNames(),
  };
}

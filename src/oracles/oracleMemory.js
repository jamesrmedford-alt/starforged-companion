/**
 * STARFORGED COMPANION
 * src/oracles/oracleMemory.js
 *
 * Memory home for raw oracle results (narrator-context audit 2026-07 —
 * "raw oracle results have no memory home"). `!oracle yes` / `!pay-the-price`
 * outcomes used to exist only as chat cards: the narrator was never told what
 * the dice established and could contradict a roll the table just made.
 *
 * Storage: `campaignState.recentOracles` — a small append ring of
 * `{ name, question, answer, sessionId, at }`, capped at RECENT_ORACLE_CAP;
 * a move's own Pay the Price also carries its move's `resolutionId`, so a
 * Burn Momentum or Improve Result that reverts the price takes it back out
 * (`dropOracleResultsOf`, issue #342 Z11), and every entry the id of the
 * result card it came from (`cardId`), which its follow-up narration's card
 * names (`oracleCardId`): an X-Card on that narration — or on the move
 * narration that told a move's price — takes the result out with it
 * (`dropOracleResultsFor`, issue #345 AA01).
 * Written by the canonical GM's capture hook in src/index.js (the command
 * handlers run on whichever client typed the command, which may not be able
 * to write world settings — the result card carries an `oracleMemory` flag
 * and the GM hook ledgers it). Read by `buildNarratorExtras` and injected as
 * the RECENT ORACLE RESULTS prompt block (narratorPrompt.js), and by the
 * assembler's RECENT ORACLES context-packet section.
 *
 * Pure module: mutates the campaignState passed in, no I/O.
 */

export const RECENT_ORACLE_CAP = 8;

/**
 * Append an oracle result to the ring. Mutates campaignState in place;
 * persistence is the caller's responsibility. Entries missing both a name
 * and an answer are ignored (nothing to remember).
 *
 * @param {Object} campaignState
 * @param {{ name?: string, question?: string, answer?: string }} entry
 * @param {{ now?: number }} [opts] — injectable clock for tests
 * @returns {Object|null} the stored entry, or null when ignored
 */
export function recordOracleResult(campaignState, entry, opts = {}) {
  if (!campaignState || !entry || typeof entry !== 'object') return null;
  const name     = typeof entry.name     === 'string' ? entry.name.trim()     : '';
  const question = typeof entry.question === 'string' ? entry.question.trim() : '';
  const answer   = typeof entry.answer   === 'string' ? entry.answer.trim()   : '';
  if (!name && !answer) return null;

  if (!Array.isArray(campaignState.recentOracles)) {
    campaignState.recentOracles = [];
  }

  const stored = {
    name,
    question,
    answer,
    sessionId: campaignState.currentSessionId ?? null,
    at:        opts.now ?? Date.now(),
    // The move whose Pay the Price this is: an upgrade that reverts the price
    // drops it (dropOracleResultsOf).
    ...(typeof entry.resolutionId === 'string' && entry.resolutionId ? { resolutionId: entry.resolutionId } : {}),
    // The result card it came from: an X-Card on the narration that told it
    // drops it (dropOracleResultsFor).
    ...(typeof entry.cardId === 'string' && entry.cardId ? { cardId: entry.cardId } : {}),
  };
  campaignState.recentOracles.push(stored);
  if (campaignState.recentOracles.length > RECENT_ORACLE_CAP) {
    campaignState.recentOracles.splice(0, campaignState.recentOracles.length - RECENT_ORACLE_CAP);
  }
  return stored;
}

/**
 * Take a move's Pay the Price out of the ring: a Burn Momentum or Improve
 * Result that reverts the price — "the price was never actually paid" — left
 * it in RECENT ORACLE RESULTS, which tells every narration the dice
 * established it and must not be contradicted, beside the upgraded outcome's
 * re-narration (issue #342 Z11). Replaces `campaignState.recentOracles` with
 * the ring without the entries stamped with `resolutionId`; mutates nothing
 * else. Pure, like recordOracleResult: the caller writes a copy.
 *
 * @param {Object} campaignState
 * @param {string} resolutionId — the move resolution whose price was reverted
 * @returns {number} how many entries were dropped
 */
export function dropOracleResultsOf(campaignState, resolutionId) {
  if (typeof resolutionId !== 'string' || !resolutionId) return 0;
  return dropOracleResultsFor(campaignState, { resolutionIds: [resolutionId] });
}

/**
 * Take the oracle results narrations the X-Card removed told out of the ring
 * (issue #345 AA01): an oracle follow-up's — the result card it narrated,
 * `cardIds` (the entry's `cardId`) — and a move narration's Pay the Price —
 * the move's resolution, `resolutionIds`. Left in RECENT ORACLE RESULTS, the
 * answer the table removed was handed to every later narration of the session
 * as "established … must not contradict", beside the X-CARD — REDIRECT that
 * says the beat did not happen. Replaces `campaignState.recentOracles` with the
 * ring without those entries; mutates nothing else. Pure, as
 * dropOracleResultsOf.
 *
 * @param {Object} campaignState
 * @param {{ resolutionIds?: string[], cardIds?: string[] }} [ids]
 * @returns {number} how many entries were dropped
 */
export function dropOracleResultsFor(campaignState, { resolutionIds = [], cardIds = [] } = {}) {
  if (!campaignState) return 0;
  const ids = (list) => new Set((Array.isArray(list) ? list : []).filter(id => typeof id === 'string' && id));
  const byResolution = ids(resolutionIds);
  const byCard       = ids(cardIds);
  if (!byResolution.size && !byCard.size) return 0;
  const ring = Array.isArray(campaignState.recentOracles) ? campaignState.recentOracles : [];
  const kept = ring.filter(e => !(e && typeof e === 'object' && (byResolution.has(e.resolutionId) || byCard.has(e.cardId))));
  if (kept.length === ring.length) return 0;
  campaignState.recentOracles = kept;
  return ring.length - kept.length;
}

/**
 * Read the most recent oracle results for the current session, oldest first.
 * Tolerant of malformed rings (non-array, junk entries).
 *
 * @param {Object} campaignState
 * @param {number} [limit=5]
 * @returns {Array<{ name: string, question: string, answer: string }>}
 */
export function readRecentOracleResults(campaignState, limit = 5) {
  const ring = Array.isArray(campaignState?.recentOracles)
    ? campaignState.recentOracles
    : [];
  const sessionId = campaignState?.currentSessionId ?? null;
  return ring
    .filter(e => e && typeof e === 'object' && (e.name || e.answer))
    .filter(e => sessionId === null || e.sessionId === sessionId)
    .slice(-Math.max(0, limit))
    .map(e => ({
      name:     String(e.name ?? ''),
      question: String(e.question ?? ''),
      answer:   String(e.answer ?? ''),
    }));
}


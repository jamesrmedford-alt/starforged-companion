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
 * `{ name, question, answer, sessionId, at }`, capped at RECENT_ORACLE_CAP.
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
  };
  campaignState.recentOracles.push(stored);
  if (campaignState.recentOracles.length > RECENT_ORACLE_CAP) {
    campaignState.recentOracles.splice(0, campaignState.recentOracles.length - RECENT_ORACLE_CAP);
  }
  return stored;
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


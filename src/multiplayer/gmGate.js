/**
 * STARFORGED COMPANION
 * src/multiplayer/gmGate.js — single-emitter pipeline gate
 *
 * Background
 * ----------
 * The createChatMessage hook fires on every connected client. Before this
 * gate, every client ran the move-interpretation pipeline (Haiku + Sonnet
 * API calls) and posted its own narrator ChatMessage. In a 2-player
 * session that produced:
 *   - duplicated narration cards (one per client, real card from the
 *     keyed player + a fallback card from the unkeyed player whose API
 *     key was empty)
 *   - red permission toasts on player clients ("User X lacks permission
 *     to update Setting [campaignState] / create JournalEntryPage […]")
 *     because non-GM players can't write world-scoped state
 *   - duplicated entity-draft posts
 *
 * Fix: gate the pipeline entry on isCanonicalGM(). Players' typed
 * messages still fire the createChatMessage hook on every client, but
 * only ONE client (the canonical GM) actually runs the pipeline.
 *
 * "Canonical GM" tiebreak — when two GMs are connected (a real GM plus
 * an Assistant GM, or two GMs on the same world), the lowest userId wins.
 * Same algorithm Foundry uses for status-effect application and other
 * "exactly one client must run this" patterns.
 */

/**
 * @returns {boolean} true iff THIS client is the canonical GM responsible
 *   for running write-side pipeline work.
 *
 * Returns false when:
 *   - this client is not a GM
 *   - no GM is currently active (e.g. all GMs disconnected mid-session —
 *     the pipeline pauses until a GM reconnects, rather than letting a
 *     player client try and fail with permission errors)
 *   - this client is a GM but not the lowest-userId active GM
 */
export function isCanonicalGM() {
  if (!globalThis.game?.user?.isGM) return false;

  const users = globalThis.game?.users;
  const activeGMs = Array.from(users ?? [])
    .filter(u => u?.isGM && u?.active);

  if (!activeGMs.length) return false;

  // Lowest id wins. String comparison is stable for Foundry's id format
  // (16-char base62) and matches Foundry core's internal tiebreak.
  let canonical = activeGMs[0];
  for (const u of activeGMs) {
    if (u.id < canonical.id) canonical = u;
  }
  return canonical.id === globalThis.game.user.id;
}

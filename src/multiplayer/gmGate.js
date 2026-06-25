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
 *
 * Keyed-GM routing — the Claude API key is client-scoped (per browser, never
 * written to world data; issue #209). The pipeline must therefore run on a GM
 * whose browser actually holds a key. A keyless GM that happened to win the
 * lowest-userId tiebreak — e.g. a player just promoted to GM, whose browser
 * has no key — would otherwise become the sole emitter and silently fail every
 * move with "Claude API key not configured". To prevent that, GM clients
 * advertise key presence into a world-scoped registry of user IDs
 * (keyedGmUserIds — IDs only, never the key itself, so #209 still holds) and
 * the tiebreak runs over keyed GMs first. See advertiseClaudeKeyPresence().
 */

const MODULE_ID = "starforged-companion";

/**
 * @returns {boolean} true iff THIS client is the canonical GM responsible
 *   for running write-side pipeline work.
 *
 * Returns false when:
 *   - this client is not a GM
 *   - no GM is currently active (e.g. all GMs disconnected mid-session —
 *     the pipeline pauses until a GM reconnects, rather than letting a
 *     player client try and fail with permission errors)
 *   - this client is a GM but not the canonical one. The canonical GM is the
 *     lowest-userId active GM that has advertised a Claude key; when no active
 *     GM has advertised one, it falls back to the lowest-userId active GM, so
 *     the pipeline still has a single emitter (which surfaces a clear no-key
 *     error rather than stopping silently).
 */
export function isCanonicalGM() {
  if (!globalThis.game?.user?.isGM) return false;

  const users = globalThis.game?.users;
  const activeGMs = Array.from(users ?? [])
    .filter(u => u?.isGM && u?.active);

  if (!activeGMs.length) return false;

  // Prefer GMs whose client has advertised a Claude key. Falls back to all
  // active GMs when the registry is empty or unreadable, so behaviour matches
  // the original lowest-userId gate before anyone has advertised.
  let pool = activeGMs;
  try {
    const keyed = globalThis.game?.settings?.get(MODULE_ID, "keyedGmUserIds");
    if (Array.isArray(keyed) && keyed.length) {
      const keyedSet = new Set(keyed);
      const keyedActive = activeGMs.filter(u => keyedSet.has(u.id));
      if (keyedActive.length) pool = keyedActive;
    }
  } catch (err) {
    // Settings not ready (e.g. a call before registration) — fall back to all
    // active GMs. Rare; isCanonicalGM runs post-ready in normal operation.
    console.warn(`${MODULE_ID} | isCanonicalGM: keyed-GM registry read failed; using all active GMs:`, err?.message ?? err);
  }

  // Lowest id wins. String comparison is stable for Foundry's id format
  // (16-char base62) and matches Foundry core's internal tiebreak.
  let canonical = pool[0];
  for (const u of pool) {
    if (u.id < canonical.id) canonical = u;
  }
  return canonical.id === globalThis.game.user.id;
}

/**
 * Record (or clear) THIS client's Claude-key presence in the world-scoped
 * keyed-GM registry, so isCanonicalGM() can route the single-emitter pipeline
 * to a GM that actually holds a key.
 *
 * GM-only: world-setting writes require GM permissions, and only GM clients
 * ever run the pipeline. Stores user IDs only — never the key — so issue #209
 * (keys never leave the browser) still holds. Writes only when membership
 * actually changes, so it never loops or spams world-setting writes.
 *
 * Call sites: the `ready` hook (every GM advertises its current state on load)
 * and the claudeApiKey `onChange` (so entering or clearing a key updates the
 * registry immediately, mid-session).
 *
 * @returns {Promise<void>}
 */
export async function advertiseClaudeKeyPresence() {
  const game = globalThis.game;
  if (!game?.user?.isGM) return;

  const hasKey = !!game.settings?.get(MODULE_ID, "claudeApiKey");
  const list   = game.settings?.get(MODULE_ID, "keyedGmUserIds");
  const ids    = Array.isArray(list) ? list : [];
  const id     = game.user.id;
  const member = ids.includes(id);

  if (hasKey && !member) {
    await game.settings.set(MODULE_ID, "keyedGmUserIds", [...ids, id]);
  } else if (!hasKey && member) {
    await game.settings.set(MODULE_ID, "keyedGmUserIds", ids.filter(x => x !== id));
  }
  // else: membership already correct — no write.
}

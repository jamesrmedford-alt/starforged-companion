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

// ── GMs whose page is still loading (issue #347 AB03) ──────────────────────
// A user is `active` from the moment their socket connects — the start of
// their page load — but this module's chat pipeline, hooks and relay listener
// exist on that client only from its `ready`, often many seconds later. The
// election ran over every active GM, so a lower-id (or keyed) GM opening the
// world stood the connected, ready GM down for the whole load: a player's
// X-Card, typed moves and card presses reached no handler, and nobody was
// told. Each client keeps what it has seen of the other GMs' loads:
//   - a GM whose connect this client saw (`userConnected`) is loading until
//     its ready announcement arrives (gmRelay.js registerGmReadiness);
//   - a GM that leaves is forgotten — its next connect is a new load;
//   - a GM already connected when this client loaded is presumed ready, as
//     every GM was before (an overlapping load stays the old election).
// The election runs over the active GMs not known to be loading; when every
// active GM is loading, over all of them, as before. This client never counts
// itself as loading: its own handlers are what asks.
const _gmLoad = new Map();   // userId → "loading" | "ready"

// Called when what this client knows of the GMs' loads changes — the
// canonical GM may have changed with it (onGmLoadChange).
const _loadChangeListeners = new Set();

/**
 * Run `fn()` whenever a GM's connect, page-ready announcement or departure is
 * seen — moments when the canonical GM can change. The held forced moves use it
 * to follow the canonical GM (index.js drainDeferredForcedMoves, issue #347
 * AB06). A listener that throws is logged.
 *
 * @param {() => void} fn
 */
export function onGmLoadChange(fn) {
  if (typeof fn === "function") _loadChangeListeners.add(fn);
}

function gmLoadChanged() {
  for (const fn of _loadChangeListeners) {
    try { fn(); }
    catch (err) { console.warn(`${MODULE_ID} | a GM-load listener failed:`, err?.message ?? err); }
  }
}

/** A GM's socket connected: its page is loading until it announces ready. */
export function noteGmLoading(userId) {
  if (typeof userId !== "string" || !userId || userId === globalThis.game?.user?.id) return;
  _gmLoad.set(userId, "loading");
  gmLoadChanged();
}

/** A GM announced its page ready: its handlers are installed. */
export function noteGmReady(userId) {
  if (typeof userId !== "string" || !userId || userId === globalThis.game?.user?.id) return;
  _gmLoad.set(userId, "ready");
  gmLoadChanged();
}

/** A GM left: what this client knew of its load no longer holds. */
export function forgetGmLoad(userId) {
  _gmLoad.delete(userId);
  gmLoadChanged();
}

/** Test seam — forget every GM's load state. */
export function _resetGmLoadForTests() {
  _gmLoad.clear();
}

/**
 * The active GMs that can act: those not known to be loading — or, when every
 * active GM is, all of them.
 *
 * @param {Array<User>} activeGMs
 * @returns {Array<User>}
 */
function settledGMs(activeGMs) {
  const selfId = globalThis.game?.user?.id ?? null;
  const settled = activeGMs.filter(u => u.id === selfId || _gmLoad.get(u.id) !== "loading");
  return settled.length ? settled : activeGMs;
}

/** The active GMs, less any still loading (settledGMs). */
function electableGMs() {
  return settledGMs(Array.from(globalThis.game?.users ?? []).filter(u => u?.isGM && u?.active));
}

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
 *     error rather than stopping silently). A GM whose page this client saw
 *     start loading, and which has not announced ready, is passed over while
 *     another GM can act (issue #347 AB03).
 */
export function isCanonicalGM() {
  if (!globalThis.game?.user?.isGM) return false;

  const activeGMs = electableGMs();

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
 * True when at least one ACTIVE GM has advertised a Claude key (its user id is
 * in the world-scoped keyedGmUserIds registry). When this holds, the canonical
 * GM is keyed by construction — isCanonicalGM() picks from keyed active GMs
 * first — so Claude-calling work routed there gets a real answer AND its world
 * writes (narrator sidecar, notes, campaignState) apply.
 *
 * Every client reads the same world setting and the same user list, so all of
 * them reach the same answer — the basis of RUN_ON.CLAUDE (src/index.js) and
 * requestOracleNarration (src/oracles/oracleFollowup.js) running exactly once.
 *
 * @returns {boolean}
 */
export function hasKeyedActiveGM() {
  const game = globalThis.game;
  let keyed;
  try {
    keyed = game?.settings?.get(MODULE_ID, "keyedGmUserIds");
  } catch (err) {
    console.warn(`${MODULE_ID} | hasKeyedActiveGM: keyed-GM registry read failed:`, err?.message ?? err);
    return false;
  }
  if (!Array.isArray(keyed) || !keyed.length) return false;
  const keyedSet = new Set(keyed);
  // A keyed GM still loading cannot answer yet (issue #347 AB03).
  return electableGMs().some(u => keyedSet.has(u.id));
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
  return advertiseKeyPresence(KEY_REGISTRIES.claude);
}

/**
 * Record (or clear) THIS client's ElevenLabs-key presence in the world-scoped
 * audio-keyed GM registry (`audioKeyedGmUserIds`), so a keyless player's
 * narrator-audio request is answered by a GM that can make the clip
 * (isAudioGM). The ElevenLabs key is a second per-browser key, independent of
 * the Claude key the canonical GM is chosen by: with it on a co-GM only, the
 * keyless canonical GM answered "no clip" and the co-GM stood down (issue
 * #342 Z67). Same rules as advertiseClaudeKeyPresence: GM-only, ids only,
 * writes only when membership changes. Call sites: the `ready` hook and the
 * elevenLabsApiKey `onChange`.
 *
 * @returns {Promise<void>}
 */
export async function advertiseElevenLabsKeyPresence() {
  return advertiseKeyPresence(KEY_REGISTRIES.elevenLabs);
}

// Each per-browser key a GM's client may hold, and the world registry naming
// the GMs whose client holds one (user ids only — the key never leaves the
// browser, issue #209).
const KEY_REGISTRIES = Object.freeze({
  claude:     Object.freeze({ keySetting: "claudeApiKey",     registry: "keyedGmUserIds",
    holds: (key) => !!key }),
  // As the audio module reads it (hasElevenLabsKey): blank is no key.
  elevenLabs: Object.freeze({ keySetting: "elevenLabsApiKey", registry: "audioKeyedGmUserIds",
    holds: (key) => typeof key === "string" && key.trim().length > 0 }),
});

/** Put THIS GM in, or take it out of, one key registry — a write only when its membership is wrong. */
async function advertiseKeyPresence({ keySetting, registry, holds }) {
  const game = globalThis.game;
  if (!game?.user?.isGM) return;

  const hasKey = holds(game.settings?.get(MODULE_ID, keySetting));
  const list   = game.settings?.get(MODULE_ID, registry);
  const ids    = Array.isArray(list) ? list : [];
  const id     = game.user.id;
  const member = ids.includes(id);

  if (hasKey && !member) {
    await game.settings.set(MODULE_ID, registry, [...ids, id]);
  } else if (!hasKey && member) {
    await game.settings.set(MODULE_ID, registry, ids.filter(x => x !== id));
  }
  // else: membership already correct — no write.
}

let healingRegistered = false;

/**
 * Keep THIS GM's own membership right in each key registry whenever the
 * registry is written. Two GMs who load at once each read the list before the
 * other's write lands, and the later write drops the earlier GM's id; nothing
 * put it back until that GM's next load, so once the listed GM left,
 * hasKeyedActiveGM() was false at a table with a keyed GM — `RUN_ON.CLAUDE`
 * commands and oracle follow-ups ran on the typist's key or failed, and Batch
 * Mode could not read its rounds (issue #342 Z68). The audio registry (Z67)
 * has the same shape. Every GM hears each write of a registry and
 * re-advertises: a write only when the list misstates this GM, so the
 * registry converges and the hook cannot loop. Registered at `ready`, before
 * the load's own advertise.
 */
export function registerKeyRegistryHealing() {
  if (healingRegistered) return;
  healingRegistered = true;
  Hooks.on("updateSetting", onKeyRegistryWritten);
  Hooks.on("createSetting", onKeyRegistryWritten);
}

/** A world setting landed: when it is a key registry, put this GM's own entry right. */
function onKeyRegistryWritten(setting) {
  const entry = Object.values(KEY_REGISTRIES).find(r => setting?.key === `${MODULE_ID}.${r.registry}`);
  if (!entry || !globalThis.game?.user?.isGM) return;
  advertiseKeyPresence(entry).catch(err =>
    console.warn(`${MODULE_ID} | ${entry.registry}: re-advertising this GM failed:`, err?.message ?? err));
}

/**
 * True iff THIS client is the GM that serves narrator audio to keyless clients
 * — answers `audio.synth.request`, `audio.cache.ask` and files a relayed clip
 * (src/audio/index.js): the lowest-id active GM whose client advertised an
 * ElevenLabs key (`audioKeyedGmUserIds`), else — no active GM holds one —
 * the canonical GM, as before (it then says the key is missing). The help
 * promises that only a GM needs the key, any GM; the canonical GM is chosen
 * by the Claude key, so a keyless canonical GM answered every keyless
 * player's Play with "no clip" while a keyed co-GM stood down (issue #342
 * Z67). Every client reads the same registry and user list, so exactly one
 * GM answers.
 *
 * @returns {boolean}
 */
export function isAudioGM() {
  const game = globalThis.game;
  if (!game?.user?.isGM) return false;
  let keyed;
  try {
    keyed = game.settings?.get(MODULE_ID, KEY_REGISTRIES.elevenLabs.registry);
  } catch (err) {
    console.warn(`${MODULE_ID} | isAudioGM: audio-keyed GM registry read failed; using the canonical GM:`, err?.message ?? err);
    keyed = null;
  }
  const keyedSet = new Set(Array.isArray(keyed) ? keyed : []);
  const pool = electableGMs().filter(u => keyedSet.has(u.id));
  if (!pool.length) return isCanonicalGM();
  let first = pool[0];
  for (const u of pool) if (u.id < first.id) first = u;
  return first.id === game.user.id;
}

/**
 * STARFORGED COMPANION
 * src/world/salience.js — capture-salience tiers and the per-channel gate
 *
 * Auto-capture (the combined detection pass → World Journal lore/threats, and
 * the chronicle writer) was over-eager in playtest: transient scene beats became
 * permanent records (findings F15 / F17 / F20 / F21). The detector and the
 * chronicle scribe now rate each candidate's *salience* — how durable it is —
 * and each channel drops anything below its own configurable floor.
 *
 * Design (docs/decisions.md → "Auto-capture salience gate"):
 *   - Per-channel thresholds (D4): lore, threats, and chronicle each own a floor.
 *   - Conservative defaults (D5): the floor is "significant", so only durable
 *     world/character facts are recorded; the GM promotes scene texture up.
 *   - Fail-open: an item with an absent or unrecognised salience PASSES the
 *     gate. A model that stops emitting the field degrades to the pre-salience
 *     "capture everything" behaviour — never a silent capture blackout
 *     (the RECAP-003 lesson: never let a parse miss disable a whole subsystem).
 *
 * Pure logic apart from the thin getSalienceThreshold reader, which is
 * defensively wrapped so unit tests (no registered settings) and non-GM
 * clients both fall back to the default.
 */

const MODULE_ID = "starforged-companion";

// Ordered least → most durable. Mirrors the SEVERITY_ORDER idiom in worldJournal.js.
export const SALIENCE_TIERS = ["trivial", "scene", "notable", "significant", "defining"];

// Derived from SALIENCE_TIERS so the tier list and its ordering cannot drift
// apart (2026-07 test-suite review — the two were parallel literals).
export const SALIENCE_ORDER = Object.fromEntries(SALIENCE_TIERS.map((t, i) => [t, i]));

/** Conservative default floor (D5) — records "significant" and "defining" only. */
export const DEFAULT_THRESHOLD = "significant";

/**
 * Each channel's own default floor — the one place it is said (the settings'
 * registration and the panel read it from here). Lore and Threats keep the
 * conservative floor. The Chronicle's is "notable": at "significant" a live
 * scribe rated every beat of a whole session lower — a strong hit that named
 * an NPC and a witness among them — so nothing was stored, the session ended
 * with an empty Chronicle and no campaign recap could be made (known-issues
 * CHRONICLE-EMPTY-AFTER-LIVE-SESSION, 2026-11). The Chronicle is the PC's
 * record, and its below-floor beats go nowhere else (D7).
 */
export const DEFAULT_THRESHOLDS = Object.freeze({
  lore:      DEFAULT_THRESHOLD,
  threats:   DEFAULT_THRESHOLD,
  chronicle: "notable",
});

/**
 * @param {"lore"|"threats"|"chronicle"} channel
 * @returns {string} that channel's default floor
 */
export function defaultSalienceThreshold(channel) {
  return DEFAULT_THRESHOLDS[channel] ?? DEFAULT_THRESHOLD;
}

/** channel → world-setting key. The three keys live in one place. */
export const SALIENCE_SETTING_KEYS = {
  lore:      "loreSalienceThreshold",
  threats:   "threatSalienceThreshold",
  chronicle: "chronicleSalienceThreshold",
};

/**
 * Coerce a model- or setting-provided value to a known tier, or null if it is
 * absent / unrecognised.
 *
 * @param {*} value
 * @returns {string|null}
 */
export function normalizeSalience(value) {
  if (typeof value !== "string") return null;
  const tier = value.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(SALIENCE_ORDER, tier) ? tier : null;
}

/**
 * Does an item clear a channel's floor? Fail-open: an item whose salience is
 * absent or unrecognised passes (so a model format drift degrades to the
 * pre-salience capture-all baseline rather than dropping everything).
 *
 * @param {*} itemSalience      — the candidate item's salience (any shape)
 * @param {*} thresholdSalience — the channel floor (defaults to "significant")
 * @returns {boolean}
 */
export function passesSalience(itemSalience, thresholdSalience) {
  const threshold = normalizeSalience(thresholdSalience) ?? DEFAULT_THRESHOLD;
  const item      = normalizeSalience(itemSalience);
  if (item === null) return true; // fail-open
  return SALIENCE_ORDER[item] >= SALIENCE_ORDER[threshold];
}

/**
 * Read a channel's configured floor from world settings, defaulting to the
 * channel's own default (defaultSalienceThreshold). Defensive: unregistered settings (unit tests) and any read
 * failure (non-GM, early boot) fall back to the default.
 *
 * @param {"lore"|"threats"|"chronicle"} channel
 * @returns {string} a valid salience tier
 */
export function getSalienceThreshold(channel) {
  const key = SALIENCE_SETTING_KEYS[channel];
  if (!key) return DEFAULT_THRESHOLD;
  const fallback = defaultSalienceThreshold(channel);
  try {
    const v = globalThis.game?.settings?.get?.(MODULE_ID, key);
    return normalizeSalience(v) ?? fallback;
  } catch {
    return fallback;
  }
}

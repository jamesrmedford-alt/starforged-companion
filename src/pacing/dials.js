/**
 * STARFORGED COMPANION
 * src/pacing/dials.js — the pacing dials' words and their arithmetic
 *
 * What the pacing pre-classifier's file kept when the line reader replaced
 * it (issue #384, slice 2 — decisions.md → "Overhauls 1 and 4"): the three
 * decisions a typed line can come to, the five dial categories a reading is
 * filed under, and the effective dial of a category with the scene's
 * override. The route itself is code's (pacing/readAndRoute.js
 * routeReading); the reading is the line reader's (moves/reader.js).
 */

/** What a typed line comes to: rolled, narrated with a move offered, or narrated. */
export const PACING_DECISION = Object.freeze({
  MOVE:                          "MOVE",
  NARRATIVE:                     "NARRATIVE",
  NARRATIVE_WITH_MOVE_AVAILABLE: "NARRATIVE_WITH_MOVE_AVAILABLE",
});

/** The dial categories a reading is filed under (the table's five pacing dials). */
export const PACING_CATEGORIES = Object.freeze([
  "combat", "investigation", "exploration", "social", "downtime",
]);

/**
 * The effective dial of a category after the scene override's modifier,
 * clamped to [0, 10].
 *
 * @param {string} category
 * @param {{dials?: Object, sceneOverride?: {modifier?: number}|null}} pacingConfig
 * @returns {number}
 */
export function effectiveDial(category, pacingConfig) {
  const base = Number(pacingConfig?.dials?.[category] ?? 0);
  const mod  = Number(pacingConfig?.sceneOverride?.modifier ?? 0);
  const raw  = base + mod;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(10, Math.round(raw)));
}

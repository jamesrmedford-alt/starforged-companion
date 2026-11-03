/**
 * STARFORGED COMPANION
 * src/moves/sceneChallenge.js — Finish the Scene (issue #326 D6)
 *
 * A scene challenge is a progress track paired with a tension clock
 * (src/ui/progressTracks.js). Its progress move is Finish the Scene
 * (Starforged p. 241; vendored `Finish_the_Scene`): "When the scene challenge
 * tension clock or progress track is filled, or when events lead to the
 * scene's conclusion, roll the challenge dice and compare to your progress."
 * The scene concludes on every outcome — a weak hit pays a minor price, a miss
 * a dire one (resolver.js routes Pay the Price) — so the challenge track
 * completes and its clock retires.
 *
 * Pure orchestration over injected deps, so it tests without Foundry.
 */

import { wholeWordsFit } from "../context/relevanceResolver.js";

/** Normalise a track label for matching ("The Storm" ≈ "storm"). */
function normalizeLabel(s) {
  return String(s ?? "").trim().toLowerCase().replace(/^the\s+/, "");
}

/**
 * The open scene challenge a Finish the Scene rolls against: the row's id
 * when the roll came from it (the Progress Tracks panel) — that track or
 * nothing — else the named challenge (exact, then whole words), else the
 * sole open one. Null when none, or when several are open and none is named.
 *
 * @param {Array<Object>} allTracks
 * @param {string|null} label
 * @param {{ trackId?: string|null }} [opts]
 * @returns {Object|null}
 */
export function selectSceneChallengeTrack(allTracks, label, { trackId = null } = {}) {
  const open = (allTracks ?? []).filter(t => t?.type === "scene_challenge" && !t.completed);
  if (typeof trackId === "string" && trackId) return open.find(t => t.id === trackId) ?? null;
  if (!open.length) return null;
  const want = normalizeLabel(label);
  if (want) {
    const exact = open.find(t => normalizeLabel(t.label) === want);
    if (exact) return exact;
    const fuzzy = open.find(t => wholeWordsFit(normalizeLabel(t.label), want));
    if (fuzzy) return fuzzy;
  }
  return open.length === 1 ? open[0] : null;
}

/**
 * Finish the scene: retire the challenge's tension clock, then complete its
 * track. The clock goes first — retiring is idempotent, so a refused track
 * save leaves only the save to redo — and before the move's Pay the Price,
 * which would otherwise advance the clock of a scene that has ended.
 *
 * @param {{ moveTarget?: string|null, moveTargetId?: string|null }} move
 * @param {{ listTracks: () => Promise<Array<Object>>,
 *           completeTrack: (id: string) => Promise<Object|null>,
 *           retireClock: (id: string) => Promise<unknown> }} deps
 * @returns {Promise<{ track: Object }|null>} the finished challenge, or null when none matched
 */
export async function finishSceneChallenge({ moveTarget = null, moveTargetId = null } = {}, deps = {}) {
  const track = selectSceneChallengeTrack(await deps.listTracks(), moveTarget, { trackId: moveTargetId });
  if (!track) return null;
  if (track.tensionClockId) await deps.retireClock(track.tensionClockId);
  const completed = await deps.completeTrack(track.id);
  return { track: completed ?? track };
}

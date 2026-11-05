/**
 * STARFORGED COMPANION
 * src/moves/sceneChallenge.js — the scene-challenge moves (issue #326 D6,
 * issue #338 D2)
 *
 * A scene challenge is a progress track paired with a tension clock
 * (src/ui/progressTracks.js — the panel's Add is Begin the Scene's set-up: a
 * track of the rank chosen and a 4-segment clock). Within it, Face Danger and
 * Secure an Advantage are their scene-challenge variants (vendored
 * `Starforged/Moves/Scene_Challenge`): a hit marks progress on the challenge,
 * a weak hit or a miss fills its clock (scoreSceneChallenge, the pipeline's
 * scene-challenge hop). Its progress move is Finish the Scene (Starforged
 * p. 241; vendored `Finish_the_Scene`): "When the scene challenge tension
 * clock or progress track is filled, or when events lead to the scene's
 * conclusion, roll the challenge dice and compare to your progress." The
 * scene concludes on every outcome — a weak hit pays a minor price, a miss a
 * dire one (resolver.js routes Pay the Price) — so the challenge track
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
 * Finish the scene: complete the challenge's track. Completing a scene
 * challenge retires its tension clock first (completeProgressTrack, issue
 * #316 T03 — idempotent, so a refused track save leaves only the save to
 * redo), so it is retired before the move's Pay the Price, which would
 * otherwise advance the clock of a scene that has ended. This read the clock
 * id off the listed track to retire it itself, but the list does not carry
 * it — the completion's retire was the only one that ran
 * (FINISH-SCENE-CLOCKID-DEAD).
 *
 * @param {{ moveTarget?: string|null, moveTargetId?: string|null }} move
 * @param {{ listTracks: () => Promise<Array<Object>>,
 *           completeTrack: (id: string) => Promise<Object|null> }} deps
 * @returns {Promise<{ track: Object }|null>} the finished challenge, or null when none matched
 */
export async function finishSceneChallenge({ moveTarget = null, moveTargetId = null } = {}, deps = {}) {
  const track = selectSceneChallengeTrack(await deps.listTracks(), moveTarget, { trackId: moveTargetId });
  if (!track) return null;
  const completed = await deps.completeTrack(track.id);
  return { track: completed ?? track };
}

/**
 * The scene-challenge moves and the ordinary move each varies (issue #338
 * D2): Face Danger and Secure an Advantage made within a scene challenge.
 */
export const SCENE_CHALLENGE_VARIANTS = Object.freeze({
  face_danger_scene_challenge:         "face_danger",
  secure_an_advantage_scene_challenge: "secure_an_advantage",
});

/**
 * The move a scene-challenge variant is made as when no scene challenge is
 * open: the ordinary move it varies — the variant's progress and segments
 * would land on nothing, and its strong hit takes no momentum. Any other
 * move, or a variant while a challenge is open, is itself. Never the other
 * way: an ordinary Face Danger stays one while a challenge is open (the
 * interpreter types the variant; a fight mid-challenge is not the
 * challenge's).
 *
 * @param {string} moveId
 * @param {Array<Object>} allTracks — listProgressTracks()
 * @returns {string}
 */
export function moveOutsideSceneChallenge(moveId, allTracks) {
  const ordinary = SCENE_CHALLENGE_VARIANTS[moveId];
  if (!ordinary) return moveId;
  return (allTracks ?? []).some(t => t?.type === "scene_challenge" && !t.completed) ? moveId : ordinary;
}

/**
 * Score a scene-challenge move against its challenge (issue #338 D2): mark
 * the track `marks` times and fill its tension clock by `segments`.
 *
 * The challenge is the move's named one, else the sole open one
 * (selectSceneChallengeTrack); for an upgrade, the one the move's card named
 * (`trackId`) — open, else nothing. An upgrade carries the original's clock
 * receipt (`receipt`: the fill before it, what it filled, the clock's size):
 * its clock change is what the upgraded outcome fills from where the
 * original began, less what the original filled — a miss's segment burned to
 * a strong hit is taken back, never more than it filled (a full clock filled
 * nothing).
 *
 * @param {{ moveTarget?: string|null, moveTargetId?: string|null, trackId?: string|null }} move
 * @param {{ marks?: number, segments?: number,
 *   receipt?: { clockBefore: number, clockFilled: number, clockSegments: number }|null }} effect
 * @param {{ listTracks: () => Promise<Array<Object>>,
 *           getTrack: (id: string) => Promise<Object|null>,
 *           markProgress: (id: string, times: number) => Promise<Object|null>,
 *           adjustClock: (id: string, delta: number) => Promise<Object|null> }} deps
 * @returns {Promise<{ track: Object, marked: number, clock: Object|null }
 *   | { track: null, reason: "none"|"ambiguous"|"gone" }>}
 */
export async function scoreSceneChallenge(
  { moveTarget = null, moveTargetId = null, trackId = null } = {},
  { marks = 0, segments = 0, receipt = null } = {},
  deps = {},
) {
  const tracks = (await deps.listTracks()) ?? [];
  const picked = trackId
    ? selectSceneChallengeTrack(tracks, null, { trackId })
    : selectSceneChallengeTrack(tracks, moveTarget, { trackId: moveTargetId });
  if (!picked) {
    const open = tracks.filter(t => t?.type === "scene_challenge" && !t.completed).length;
    return { track: null, reason: trackId || moveTargetId ? "gone" : open ? "ambiguous" : "none" };
  }
  let track = (await deps.getTrack(picked.id)) ?? picked;
  let marked = 0;
  if (marks > 0) {
    const updated = await deps.markProgress(track.id, marks);
    if (updated) { track = updated; marked = marks; }
  }
  const delta = receipt
    ? Math.min(Math.max(0, segments), Math.max(0, Number(receipt.clockSegments ?? 0) - Number(receipt.clockBefore ?? 0)))
      - Number(receipt.clockFilled ?? 0)
    : segments;
  const clock = delta && track.tensionClockId ? await deps.adjustClock(track.tensionClockId, delta) : null;
  return { track, marked, clock };
}

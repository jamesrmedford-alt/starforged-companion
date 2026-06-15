// src/moves/expedition.js
//
// Expedition lifecycle — resolve/create the shared expedition progress track
// and mark progress from Undertake an Expedition and Explore a Waypoint.
//
// The LIVE progress-track store is the flag-array model in ui/progressTracks.js
// (the panel): one journal whose flag holds an array of track records
// { id, label, type, rank, ticks, completed }. The campaignState.progressTrackIds
// path in persistResolution is vestigial (never written from a resolution), so
// the move→track wiring lives here instead, dependency-injected so it unit-tests
// without Foundry.
//
// Decision: docs/decisions.md → "Exploration lifecycle: expedition + waypoint".

export const EXPEDITION_RANKS = ["troublesome", "dangerous", "formidable", "extreme", "epic"];
export const DEFAULT_EXPEDITION_RANK = "dangerous";

/**
 * Coerce an interpreter-supplied (LLM-inferred) rank to a valid rank, falling
 * back to `dangerous`. The inferred rank is a best guess — the player can
 * re-rank the track in the Progress Tracks panel, so a wrong guess is cheap.
 *
 * @param {*} rank
 * @returns {string}
 */
export function normalizeExpeditionRank(rank) {
  const r = String(rank ?? "").trim().toLowerCase();
  return EXPEDITION_RANKS.includes(r) ? r : DEFAULT_EXPEDITION_RANK;
}

/** Normalise a destination/track label for matching ("The Vault" ≈ "vault"). */
function normalizeLabel(s) {
  return String(s ?? "").trim().toLowerCase().replace(/^the\s+/, "");
}

/**
 * Pick the expedition track an Undertake/Explore should mark, from the full
 * track list. Match the named destination against OPEN expedition tracks
 * (exact-normalised, then substring either way); else fall back to the single
 * open expedition; else null (the caller creates one).
 *
 * @param {Array<{id,label,type,rank,ticks,completed}>} allTracks
 * @param {string|null} label  — the move's destination (interpretation.moveTarget)
 * @returns {Object|null}
 */
export function selectExpeditionTrack(allTracks, label) {
  const expeditions = (allTracks ?? []).filter(t => t?.type === "expedition" && !t.completed);
  if (!expeditions.length) return null;

  const want = normalizeLabel(label);
  if (want) {
    const exact = expeditions.find(t => normalizeLabel(t.label) === want);
    if (exact) return exact;
    const fuzzy = expeditions.find(t => {
      const have = normalizeLabel(t.label);
      return have && (have.includes(want) || want.includes(have));
    });
    if (fuzzy) return fuzzy;
  }
  return expeditions.length === 1 ? expeditions[0] : null;
}

/**
 * Resolve-or-create the expedition track and mark one rank-step of progress.
 * Pure orchestration over injected deps so it tests without Foundry:
 *   deps.listTracks()            -> Promise<track[]>   (all tracks, incl. completed)
 *   deps.createTrack({label,type,rank}) -> Promise<track>
 *   deps.markProgress(trackId)   -> Promise<track|null> (rank-aware; returns updated)
 *
 * @param {{ moveTarget:string|null, expeditionRank:string|null }} move
 * @param {Object} deps
 * @returns {Promise<{ track:Object, created:boolean }|null>}
 */
export async function applyExpeditionProgress({ moveTarget, expeditionRank }, deps) {
  if (!deps?.listTracks || !deps?.createTrack || !deps?.markProgress) return null;

  const all = await deps.listTracks();
  let track   = selectExpeditionTrack(all, moveTarget);
  let created = false;

  if (!track) {
    const rank  = normalizeExpeditionRank(expeditionRank);
    const label = (moveTarget && String(moveTarget).trim()) ? String(moveTarget).trim() : "Expedition";
    track   = await deps.createTrack({ label, type: "expedition", rank });
    created = true;
  }

  const updated = await deps.markProgress(track.id);
  return { track: updated ?? track, created };
}

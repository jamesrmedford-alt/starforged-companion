/**
 * STARFORGED COMPANION
 * src/moves/legacyTracks.js — the legacy tracks' arithmetic
 *
 * A legacy track (quests, bonds, discoveries — `campaignState.legacyTracks`,
 * one set shared by the crew: decisions.md → "Legacy XP pays at the tick
 * write") is ten boxes of four ticks. Filling a box earns experience: 2 XP a
 * box, and once the track has been filled and cleared, 1 XP a box (play kit,
 * Earn Experience). Filling the tenth box clears the track: it starts again
 * at the first box, keeping any ticks that overflowed, and the cleared mark
 * stays for good.
 *
 * Record shape: { ticks, cleared, cycles }
 *   ticks    0–39 within the current cycle (the tenth box filled is a clear)
 *   cycles   how many times the track has been filled and cleared
 *   cleared  cycles > 0 — the flag the readers check, written through here
 *
 * Before issue #316 T02 the track capped at 40 and nothing cleared it: every
 * later mark was lost and no XP followed. The persist merge
 * (persistResolution.js mergeWithLatestState) took the higher tick count, so a
 * record that had rolled over to 0 would have read as behind the store's 38 —
 * records compare by their progress (legacyProgress), which only ever grows.
 *
 * Pure: no Foundry, no mutation of the records passed in. index.js
 * addLegacyTicks is the one writer (markLegacyOnCopy); persistResolution.js
 * applies a copy's marks to the store (legacyTracksWithCopyMarks). The state
 * here is by working copy: the ticks it marked, and the XP it owes until it
 * is saved (deferLegacyXp / payDeferredLegacyXp, below).
 */

export const LEGACY_TICKS_PER_BOX = 4;
export const LEGACY_BOXES = 10;
/** Ticks in one filled track — the clear point. */
export const LEGACY_CYCLE_TICKS = LEGACY_TICKS_PER_BOX * LEGACY_BOXES;

const XP_PER_BOX         = 2;
const XP_PER_BOX_CLEARED = 1;
const xpPerBox = (cycles) => (cycles > 0 ? XP_PER_BOX_CLEARED : XP_PER_BOX);

/**
 * A legacy record as the arithmetic reads it. A record written before cycles
 * were counted carries `cleared` alone (one cycle when set); ticks are a whole
 * number within 0..40 — 40 is a track the old cap froze at its tenth box, and
 * the next mark clears it.
 *
 * @param {Object|null|undefined} track
 * @returns {{ ticks: number, cleared: boolean, cycles: number }}
 */
export function normaliseLegacyTrack(track) {
  const t = track && typeof track === "object" ? track : {};
  const cycles = Number.isInteger(t.cycles) && t.cycles > 0 ? t.cycles : (t.cleared ? 1 : 0);
  const ticks  = Math.min(Math.max(0, Math.floor(Number(t.ticks) || 0)), LEGACY_CYCLE_TICKS);
  return { ticks, cleared: cycles > 0, cycles };
}

/**
 * Mark ticks on a legacy track. Every box filled is counted and paid at the
 * rate of the cycle it filled in: the tenth box of the first cycle at 2 XP,
 * then — the track cleared — the overflow's boxes at 1 XP each. Several
 * boxes, a clear in the middle and more than one clear in one mark all
 * resolve.
 *
 * @param {Object|null|undefined} track — the record as stored
 * @param {number} ticks — to add (a negative or non-numeric amount adds nothing)
 * @returns {{ track: { ticks: number, cleared: boolean, cycles: number },
 *   boxes: number, xp: number, cleared: boolean }} the new record, the boxes
 *   filled by this mark, the XP they earn (per character), and whether this
 *   mark cleared the track
 */
export function markLegacyTrack(track, ticks) {
  const before = normaliseLegacyTrack(track);
  const add    = Math.max(0, Math.floor(Number(ticks) || 0));

  let remaining   = before.ticks + add;
  let cycles      = before.cycles;
  let boxesBefore = Math.floor(before.ticks / LEGACY_TICKS_PER_BOX);
  let boxes = 0;
  let xp    = 0;

  // Each full cycle in the total: the boxes it still had to fill, the tenth
  // included, at that cycle's rate — then the track clears and starts again.
  while (remaining >= LEGACY_CYCLE_TICKS) {
    const filled = LEGACY_BOXES - boxesBefore;
    boxes += filled;
    xp    += filled * xpPerBox(cycles);
    remaining  -= LEGACY_CYCLE_TICKS;
    cycles     += 1;
    boxesBefore = 0;
  }
  const more = Math.floor(remaining / LEGACY_TICKS_PER_BOX) - boxesBefore;
  boxes += more;
  xp    += more * xpPerBox(cycles);

  return {
    track:   { ticks: remaining, cleared: cycles > 0, cycles },
    boxes,
    xp,
    cleared: cycles > before.cycles,
  };
}

/**
 * How far a legacy track has come, in ticks ever marked: its cleared cycles
 * and the ticks of the current one. Grows with every mark, so two records of
 * one track compare by it — a higher raw tick count is not further along
 * once the lower one has cleared.
 *
 * @param {Object|null|undefined} track
 * @returns {number}
 */
export function legacyProgress(track) {
  const t = normaliseLegacyTrack(track);
  return t.cycles * LEGACY_CYCLE_TICKS + t.ticks;
}

/**
 * The record for a legacy track that has come `progress` ticks — the inverse
 * of legacyProgress. A Starforged sheet keeps a legacy as ticks ever marked
 * (`system.legacies.<track>`: 40 a filled track, more past a clear), so a
 * sheet edit flows back to the shared track through this (issue #326 D3).
 *
 * @param {number} progress — ticks ever marked (a negative or non-numeric value reads as 0)
 * @returns {{ ticks: number, cleared: boolean, cycles: number }}
 */
export function legacyTrackFromProgress(progress) {
  const p = Math.max(0, Math.floor(Number(progress) || 0));
  const cycles = Math.floor(p / LEGACY_CYCLE_TICKS);
  return { ticks: p - cycles * LEGACY_CYCLE_TICKS, cleared: cycles > 0, cycles };
}

// ─────────────────────────────────────────────────────────────────────────────
// Marks made on a working copy (LEGACY-SHEET-DECREASE)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The ticks marked on a working copy, per track, keyed by that copy. The
 * persist merge (persistResolution.js) applies them to the stored record
 * rather than keeping whichever record is further along: a legacy lowered on
 * a sheet meanwhile (the Legacies tab's ◂ — sharedLegacies.js) flowed back to
 * the shared track, and a move whose copy was read before it raised the
 * track again on its persist (LEGACY-SHEET-DECREASE).
 */
const MARKS_ON_COPY = new WeakMap();

/**
 * Mark ticks on a working copy's legacy track and record them by the copy:
 * index.js addLegacyTicks, the one writer. Mutates `campaignState`.
 *
 * @param {Object} campaignState — the working copy
 * @param {string} key — "quests" | "bonds" | "discoveries"
 * @param {number} ticks
 * @returns {ReturnType<typeof markLegacyTrack>}
 */
export function markLegacyOnCopy(campaignState, key, ticks) {
  campaignState.legacyTracks ??= {};
  const marked = markLegacyTrack(campaignState.legacyTracks[key], ticks);
  campaignState.legacyTracks[key] = marked.track;
  const add = Math.max(0, Math.floor(Number(ticks) || 0));
  if (add) {
    const marks = MARKS_ON_COPY.get(campaignState) ?? new Map();
    marks.set(key, (marks.get(key) ?? 0) + add);
    MARKS_ON_COPY.set(campaignState, marks);
  }
  return marked;
}

/**
 * The stored legacy tracks with a working copy's own marks applied — what
 * the copy's persist writes. A track the copy marked is the stored record
 * marked again by those ticks (a concurrent `!bond` mark kept beside it, as
 * the merge by progress lost one of two); one it did not mark is the stored
 * record, as it stands — lowered on a sheet since the copy was read included
 * (LEGACY-SHEET-DECREASE: the merge kept the copy's higher, stale record). A
 * track the store does not hold is the copy's.
 *
 * @param {Object|null|undefined} store — the stored `legacyTracks`
 * @param {Object|null|undefined} working — the copy's `legacyTracks`
 * @param {Object|null} copy — the copy the marks were made on (markLegacyOnCopy's)
 * @returns {Object|null}
 */
export function legacyTracksWithCopyMarks(store, working, copy) {
  const s = (store   && typeof store   === "object") ? store   : null;
  const w = (working && typeof working === "object") ? working : null;
  if (!s && !w) return null;
  const marks = (copy && MARKS_ON_COPY.get(copy)) ?? null;
  const out = {};
  for (const key of new Set([...Object.keys(s ?? {}), ...Object.keys(w ?? {})])) {
    const add = marks?.get(key) ?? 0;
    if (s?.[key]) out[key] = add > 0 ? markLegacyTrack(s[key], add).track : normaliseLegacyTrack(s[key]);
    else if (w?.[key]) out[key] = w[key];
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// XP owed by a working copy (issue #326 W52)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The box XP owed by the ticks marked on a working copy, keyed by that copy.
 * A legacy box's XP is paid only once the write that saves its ticks has
 * landed: the move pipeline marks its working copy (index.js addLegacyTicks)
 * and the ticks reach the world in persistResolution's write, but the XP was
 * awarded at the mark — a refused persist paid XP for ticks never saved, as
 * bond.apply's award did before its own save (issue #306 R04 fixed this
 * order for writeLegacyTicks only). The copy's writer pays what it owes
 * (payDeferredLegacyXp) once its write has landed; a copy never written
 * pays nothing and is dropped with it.
 */
const DEFERRED_XP = new WeakMap();

/**
 * Record a payment owed by a working copy — run by payDeferredLegacyXp once
 * that copy has been saved.
 *
 * @param {Object} campaignState — the working copy the ticks were marked on
 * @param {() => Promise<void>} pay
 */
export function deferLegacyXp(campaignState, pay) {
  if (!campaignState || typeof campaignState !== "object" || typeof pay !== "function") return;
  const owed = DEFERRED_XP.get(campaignState) ?? [];
  owed.push(pay);
  DEFERRED_XP.set(campaignState, owed);
}

/**
 * Pay the XP a working copy owes — call once the write that saved it has
 * landed. Each payment runs once: the record is taken before they run.
 *
 * @param {Object} campaignState — the working copy (the object marked, not a clone)
 * @returns {Promise<void>}
 */
export async function payDeferredLegacyXp(campaignState) {
  const owed = (campaignState && typeof campaignState === "object") ? DEFERRED_XP.get(campaignState) : null;
  if (!owed?.length) return;
  DEFERRED_XP.delete(campaignState);
  for (const pay of owed) await pay();
}

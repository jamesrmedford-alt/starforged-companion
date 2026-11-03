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
 * addLegacyTicks is the one writer; persistResolution.js merges with it. The
 * one piece of state here is the XP a working copy owes until it is saved
 * (deferLegacyXp / payDeferredLegacyXp, below).
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
 * The record further along of two copies of one legacy track (the stored one
 * and a pipeline's working copy): ticks only ever increase, so the one with
 * more progress has every mark the other has. Equal progress with a clear on
 * one side is the cleared one (a track frozen at 40 and its clear to 0 are
 * the same marks). A record present on one side only is returned as it is;
 * null when both are absent.
 *
 * @param {Object|null|undefined} a
 * @param {Object|null|undefined} b
 * @returns {Object|null}
 */
export function mergeLegacyTrack(a, b) {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  const na = normaliseLegacyTrack(a);
  const nb = normaliseLegacyTrack(b);
  const pa = legacyProgress(na);
  const pb = legacyProgress(nb);
  if (pb > pa || (pb === pa && nb.cycles > na.cycles)) return nb;
  return na;
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

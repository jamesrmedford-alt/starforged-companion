/**
 * STARFORGED COMPANION
 * src/clocks/planClockPacing.js — a hidden plan's clock pacing, undone (issue #362 AC33)
 *
 * When a beat plays a hidden plan's escalation step, the plan's clock is paced
 * (secrets.js paceAfterReveal → clocks.js pacePlanClock): back to empty for
 * the step after, or retired after a last step — stamped with the narration
 * that paced it (`pacedBy`) and the fill it had (`pacedFrom`). Taking that
 * narration back — the X-Card, a Burn Momentum / Improve Result supersede —
 * puts the step back unplayed, and these put the clock back with it. Pure, no
 * imports: the X-Card's pause write (narrator.js applyXCardToNarratorMemory)
 * applies them to its copy synchronously, and clocks.js to the store.
 *
 * Whose pacing a clock carries is its stamp's to say, wherever the clock
 * stands (pacedByOneOf): the stamp stays while later prices turn the emptied
 * clock, and is replaced only by the next pacing. The removal of a narration
 * names it exactly, so it does not ask whether the clock still stands as that
 * narration left it — asked, a price paid between a trigger vignette and the
 * X-Card on it left the step back unplayed and the clock where it was (issue
 * #364 PLAN-TRIGGER-XCARD-AFTER-LATER-PRICE).
 */

/**
 * The narration a plan's clock still stands paced by (`pacedBy`) — emptied, or
 * retired after a last step, and not moved since — else null. Asked only where
 * nothing names the narration: the burn of a price whose receipt, from before
 * issue #364, does not name its trigger vignette (clocks.js pacingOfTrigger) —
 * a clock a later price advanced, or re-armed (clocks.js rearmClock), may be
 * another trigger's by then. Everything that knows the narration matches the
 * stamp itself (pacedByOneOf; the burn by its receipt's `vignetteNarrationId`,
 * issue #364 PLAN-CLOCK-BURN-AFTER-LATER-PRICE).
 *
 * @param {object|null} clock — a campaignState.clocks entry
 * @returns {string|null}
 */
export function standingPacedBy(clock) {
  const id = typeof clock?.pacedBy === "string" && clock.pacedBy ? clock.pacedBy : null;
  if (!id) return null;
  return clock.active === false || (clock.filled ?? 0) === 0 ? id : null;
}

/**
 * Whether one of the given narrations paced the clock — its stamp
 * (`pacedBy`) is one of theirs — however far later prices have turned it
 * since. What a removed narration's undo asks (the X-Card's pause write,
 * clocks.js restoreClocksPacedBy).
 *
 * @param {object|null} clock — a campaignState.clocks entry
 * @param {Iterable<string>} narrationIds
 * @returns {boolean}
 */
export function pacedByOneOf(clock, narrationIds) {
  const id = typeof clock?.pacedBy === "string" && clock.pacedBy ? clock.pacedBy : null;
  if (!id) return false;
  for (const candidate of narrationIds ?? []) if (candidate === id) return true;
  return false;
}

/**
 * A clock a taken-back narration paced, as it stands once that narration's
 * step is put back unplayed: running again at the fill it had before
 * (`pacedFrom`) plus the segments turned since the pacing emptied it, at most
 * one segment short of full — a trigger vignette's clock was full, and is
 * re-armed so the next price that fills it plays the step. A clock the pacing
 * retired (after a last step) kept its fill and was turned by nothing since.
 *
 * @param {object} clock
 * @returns {object} a new clock record
 */
export function unpacedClock(clock) {
  const top   = Math.max(0, (Number(clock?.segments) || 0) - 1);
  const from  = Number.isInteger(clock?.pacedFrom) ? clock.pacedFrom : top;
  const since = clock?.active === false ? 0 : Math.max(0, Math.trunc(Number(clock?.filled) || 0));
  const next  = { ...(clock ?? {}), active: true, filled: Math.max(0, Math.min(from + since, top)), updatedAt: new Date().toISOString() };
  delete next.pacedBy;
  delete next.pacedFrom;
  return next;
}

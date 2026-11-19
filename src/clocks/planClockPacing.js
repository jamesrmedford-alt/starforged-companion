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
 */

/**
 * The narration a plan's clock still stands paced by (`pacedBy`) — emptied, or
 * retired after a last step, and not moved since — else null. A clock a later
 * price advanced, or re-armed (clocks.js rearmClock), is no longer as that
 * pacing left it: taking the narration back leaves it be. (A burn of the
 * price whose trigger paced it does not ask this: its receipt names the
 * vignette, and the stamp — kept while later prices turn the clock — is that
 * narration's or not; clocks.js revertTensionClocksForBurn, issue #364
 * PLAN-CLOCK-BURN-AFTER-LATER-PRICE.)
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
 * A clock a taken-back narration paced, as it stands once that narration's
 * step is put back unplayed: running again at the fill it had before
 * (`pacedFrom`), at most one segment short of full — a trigger vignette's
 * clock was full, and is re-armed so the next price that fills it plays the
 * step.
 *
 * @param {object} clock
 * @returns {object} a new clock record
 */
export function unpacedClock(clock) {
  const top  = Math.max(0, (Number(clock?.segments) || 0) - 1);
  const from = Number.isInteger(clock?.pacedFrom) ? clock.pacedFrom : top;
  const next = { ...(clock ?? {}), active: true, filled: Math.max(0, Math.min(from, top)), updatedAt: new Date().toISOString() };
  delete next.pacedBy;
  delete next.pacedFrom;
  return next;
}

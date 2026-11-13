/**
 * STARFORGED COMPANION
 * src/moves/sufferDialog.js — suffer-choice resolution (F16 Phase D)
 *
 * Turns a `sufferPrompt` (emitted by Phase B's CONSEQUENCE_MAP) and the
 * player's pick into one or more `executeSuffer` calls (Phase C), and runs
 * them. The blocking ApplicationV2 dialog this file was named for is retired:
 * the non-blocking suffer-choice card (sufferCard.js — the move lock-up fix, PR #243) offers
 * the options and runs the pick through `runSufferResolution`.
 *
 * The pure logic for "selection → executor call sequence" is exported
 * separately (`resolveSufferSelection`) so unit tests can pin it; the option
 * filter (`isOptionAvailable`) decides what the card offers, and
 * `isRetryableSufferCall` bounds what a payoff failure card's Retry
 * re-applies.
 *
 * Source: issue #214 (Suffer-move Pipeline) §5.3.
 */

import { executeSuffer, SUFFER_EXECUTORS, rollImpactTable, offerAtZeroChoiceAfterMiss, clearUnprepared, crewClearedNote, overflowToMomentum, markUnprepared } from "./sufferExecutor.js";
import { findThresholdCard, stashPositionOnThresholdCard as stashOnOwnThresholdCard } from "./combatThreshold.js";
import { UNNAMED_EXPEDITION_LABEL } from "./expedition.js";

const MODULE_ID = "starforged-companion";


// ─────────────────────────────────────────────────────────────────────────────
// Pure selection → executor-call resolver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a `sufferPrompt` plus the player's chosen options into the
 * list of executor calls needed to apply the consequence.
 *
 * Pure function — no I/O, no Foundry deps. Tests pin this without
 * needing the dialog.
 *
 * @param {Object} sufferPrompt  — the consequences.sufferPrompt object.
 * @param {Object} selection
 * @param {number[]} [selection.optionIndices]   — for enumerated prompts
 * @param {string|null} [selection.anyChoice]    — for "any" prompts (suffer id)
 * @param {string|null} [selection.itemId]       — for companion/withstand
 * @returns {Array<Object>} list of `{ kind, ...payload }` describing the
 *   write operations needed. Each entry is one of:
 *     { kind: "suffer",       sufferId, amount, itemId? }
 *     { kind: "meter",        meterKey, delta }
 *     { kind: "noop" }
 *     { kind: "complication", scope }
 *     { kind: "route",        route, rank?, mark?, price? } — `price` ({ roll, moveName }):
 *                                         a Pay the Price the move rolled (SOJOURN-PTP-ADVISORY)
 *     { kind: "mark",         debility }
 *     { kind: "roll-table",   table }   — Endure Harm / Stress at 0 on a miss (issue #329 X03)
 *     { kind: "at-zero-choice", which } — the at-0 choice after a miss's
 *                                         Lose Momentum (ENDURE-ZERO-ON-OTHER-OPTION)
 */
export function resolveSufferSelection(sufferPrompt, selection = {}) {
  if (!sufferPrompt) return [];

  // B1 — "any": the player picks one of the six suffer moves per selection.
  // A `count` > 1 ("two suffer moves at -1 each") is that many selections —
  // the card takes `count` picks (sufferCard.js sufferMultiCap). The one
  // chosen move used to be repeated `count` times, so the player could never
  // take two different suffer moves (issue #325 W15).
  if (sufferPrompt.kind === "any") {
    // A momentum loss the minimum refused may clear progress instead: one
    // rank's mark on a track the card offers (MOMENTUM-MIN-REDIRECT-MANUAL).
    if (selection.clearTrackId) {
      const track = (sufferPrompt.clearTracks ?? []).find(t => t?.id === selection.clearTrackId);
      return track ? [{ kind: "clear-progress", trackId: track.id, label: track.label ?? null }] : [];
    }
    const sufferId = selection.anyChoice;
    if (!sufferId) return [];
    return [{ kind: "suffer", sufferId, amount: sufferPrompt.amount ?? 1, itemId: selection.itemId ?? null }];
  }

  // B2 — "enumerated": player picks one or more from a listed set.
  // Each picked option may carry a suffer route, an explicit meter
  // delta, a chain of writes, a complication scope, or a route to
  // another move.
  if (sufferPrompt.kind === "enumerated") {
    const indices = selection.optionIndices ?? [];
    const calls = [];
    for (const idx of indices) {
      const opt = sufferPrompt.options?.[idx];
      if (!opt) continue;
      calls.push(...optionToCalls(opt, selection));
    }
    return calls;
  }

  return [];
}

/**
 * Turn a single sufferPrompt option (one entry in `options[]`) into the
 * sequence of write operations it represents.
 */
function optionToCalls(opt, selection) {
  // Option may bundle multiple writes via `chain: [...]`.
  if (Array.isArray(opt.chain)) {
    const calls = [];
    for (const step of opt.chain) {
      calls.push(...optionToCalls(step, selection));
    }
    return calls;
  }

  // No-op option (e.g. "Press on").
  if (opt.noop) return [{ kind: "noop" }];

  // Complication branch (e.g. set_a_course "complication at destination").
  if (opt.complication) {
    return [{ kind: "complication", scope: opt.scope ?? "scene", label: typeof opt.label === "string" ? opt.label : null }];
  }

  // Route to another move (e.g. "Pay the Price", "Swear an Iron Vow").
  if (opt.route) {
    // A priced Pay the Price option (Sojourn's miss — resolver rollChoicePrice)
    // carries the roll its narration depicted, for the pick to pay.
    const price = opt.route === "pay_the_price" && Number.isInteger(opt.price?.roll) ? { roll: opt.price.roll, moveName: opt.price.moveName ?? null } : null;
    return [{ kind: "route", route: opt.route, ...(opt.rank ? { rank: opt.rank } : {}), ...(price ? { price } : {}) }];
  }

  // Combat progress mark — marks the active combat track N times.
  if (typeof opt.combatProgress === 'number') {
    return [{ kind: "combat-progress", count: opt.combatProgress }];
  }

  // Expedition progress mark — marks the active expedition track N times.
  if (typeof opt.expeditionProgress === 'number') {
    return [{ kind: "expedition-progress", count: opt.expeditionProgress }];
  }

  // Roll an at-0 table — Endure Harm's mortal wound, Endure Stress's
  // desolation — the third choice at 0 on a miss (issue #329 X03).
  if (typeof opt.rollTable === "string") {
    return [{ kind: "roll-table", table: opt.rollTable }];
  }

  // The resist roll a suffer move owes at 0 (issue #330 D3): roll Endure
  // Harm / Endure Stress as the PC.
  if (opt.resist === "endure_harm" || opt.resist === "endure_stress") {
    return [{ kind: "resist", moveId: opt.resist }];
  }

  // "+1 on next move" situational bonus — surfaced as a reminder card;
  // the player applies it manually to the next action die roll.
  if (typeof opt.nextBonus === 'number') {
    return [{ kind: "next-bonus", amount: opt.nextBonus }];
  }

  // Clear a character impact (e.g. clear "wounded" on a successful Heal,
  // "shaken" on Hearten, "unprepared" on Resupply).
  if (opt.clearImpact) {
    return [{ kind: "clear-impact", debility: opt.clearImpact }];
  }

  // Combat position pick — enter_the_fray weak hit: "You are in control".
  // Before this branch existed the option's string value fell through the
  // numeric meter loop below and produced zero calls (the card reported
  // "Applied: no change").
  if (opt.combatPosition === "in_control" || opt.combatPosition === "bad_spot") {
    return [{ kind: "combat-position", position: opt.combatPosition }];
  }

  // Suffer route via id (e.g. "Sacrifice Resources (-1)") OR generic
  // "any" sub-prompt (e.g. set_a_course's "One suffer move (-2)" option
  // which carries `kind: "any", amount, count`).
  if (opt.suffer) {
    // A suffer move the fiction sizes: the move's own minor / serious / major
    // (-1 / -2 / -3), picked on a follow-up card — Forsake Your Vow's "Endure
    // Stress" names no amount (issue #330 D7; it was a fixed -2).
    const amounts = Array.isArray(opt.amountPick) ? opt.amountPick.filter(a => Number.isInteger(a) && a >= 1 && a <= 3) : [];
    if (amounts.length) return [{ kind: "needs-amount", sufferId: opt.suffer, amounts }];
    const calls = [{ kind: "suffer", sufferId: opt.suffer, amount: opt.amount ?? 1, itemId: selection.itemId ?? null }];
    // Endure Harm / Stress's miss: "If your health is 0, you must also mark …
    // or roll on the table" whichever option is taken — the Lose Momentum
    // pick's at-0 choice follows it (known-issues ENDURE-ZERO-ON-OTHER-OPTION).
    if (opt.atZeroChoice === "harm" || opt.atZeroChoice === "stress") {
      calls.push({ kind: "at-zero-choice", which: opt.atZeroChoice });
    }
    return calls;
  }
  if (opt.kind === "any") {
    const sufferId = selection.anyChoice;
    if (!sufferId || (opt.count ?? 1) > 1) {
      // Caller didn't pre-select which suffer move — or the option is several
      // suffer moves, each the player's own pick (issue #325 W15) — surface a
      // follow-up prompt by emitting a "needs-suffer-pick" marker. The card
      // posts the B1 picker, which takes `count` picks.
      return [{ kind: "needs-any", amount: opt.amount ?? 1, count: opt.count ?? 1 }];
    }
    return [{ kind: "suffer", sufferId, amount: opt.amount ?? 1, itemId: selection.itemId ?? null }];
  }

  // Explicit meter delta options (e.g. "+1 momentum", "-1 health").
  const meterCalls = [];
  for (const [field, delta] of Object.entries(opt)) {
    if (["label", "requires", "noop", "route", "complication", "scope", "suffer", "amount", "chain", "kind", "count", "rank", "mark", "clearImpact", "combatPosition"].includes(field)) continue;
    if (typeof delta !== "number") continue;
    meterCalls.push({ kind: "meter", meterKey: field, delta });
  }
  // Optional debility mark on the same option (face_death "mark doomed",
  // face_desolation "mark tormented").
  if (opt.mark) meterCalls.push({ kind: "mark", debility: opt.mark });
  return meterCalls;
}


// Meters a "meter" call may change: the PC's four, the vehicle's integrity and
// a companion's health.
const RETRY_METERS = new Set(["health", "spirit", "supply", "momentum", "integrity", "companionHealth"]);
const smallInt = (n, max) => Number.isInteger(n) && n >= 1 && n <= max;

/**
 * True when a GM's Retry may run `call` again: a write runSufferResolution
 * makes, with its values in range. A suffer pick's refused write goes on the
 * GMs' payoff failure card as a `suffer` step (issue #309 N07) — the card is
 * GM-authored, but what a Retry re-applies is still checked.
 *
 * @param {Object} call — a resolveSufferSelection call
 * @returns {boolean}
 */
export function isRetryableSufferCall(call) {
  switch (call?.kind) {
    case "suffer":
      return Object.prototype.hasOwnProperty.call(SUFFER_EXECUTORS, call.sufferId) && smallInt(call.amount, 6);
    case "meter":
      return RETRY_METERS.has(call.meterKey) && Number.isInteger(call.delta) && smallInt(Math.abs(call.delta), 6);
    case "mark":
    case "clear-impact":
      return typeof call.debility === "string" && /^[a-z0-9]+$/i.test(call.debility);
    case "combat-progress":
    case "expedition-progress":
      return smallInt(call.count ?? 1, 4);
    case "clear-progress":
      return typeof call.trackId === "string" && call.trackId.length > 0 && call.trackId.length <= 64;
    case "next-bonus":
      return smallInt(call.amount, 2);
    default:
      return false;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Async runner — turns a resolved selection into actual writes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the newest combat-threshold card still awaiting its Enter the Fray
 * click and stash a combat position in its flags, so track creation applies
 * it (createCombatTrackFromThreshold reads flags.position). Handles the
 * enter_the_fray weak hit resolved before the player commits to the fight.
 *
 * @param {'in_control'|'bad_spot'} position
 * @returns {Promise<boolean>} true when a card was updated
 */
async function stashPositionOnThresholdCard(position) {
  try {
    const messages = game.messages?.contents ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.flags?.[MODULE_ID]?.combatThresholdCard) {
        await m.update({ [`flags.${MODULE_ID}.position`]: position });
        return true;
      }
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | combat-position stash failed:`, err?.message ?? err);
  }
  return false;
}

/**
 * Execute the calls returned by `resolveSufferSelection`. Calls each
 * executor in order; for `complication` and `route` calls, surfaces a
 * chat card describing the deferred action (v1 doesn't auto-execute
 * route follow-ups like Swear an Iron Vow — that's the GM's call).
 *
 * @param {Array<Object>} calls    — output of resolveSufferSelection
 * @param {Actor} actor
 * @param {Object} [opts]          — forwarded to executors (isMiss,
 *                                   isMissWithMatch, isCommandVehicle,
 *                                   fixedRoll for tests, …)
 * @returns {Promise<Array<Object>>} list of per-call results
 */
export async function runSufferResolution(calls, actor, opts = {}) {
  const results = [];
  for (const call of calls) {
    try {
      results.push(await runSufferCall(call, actor, opts));
    } catch (err) {
      // A write the world refused is reported, never thrown past the card:
      // its pick is claimed before any effect runs (issue #309 N07), so the
      // card says this one was not applied and the GMs can retry it.
      console.warn(`${MODULE_ID} | suffer ${call?.kind ?? "call"} not applied:`, err?.message ?? err);
      results.push({ kind: call?.kind ?? "unknown", ok: false, reason: "refused", error: String(err?.message ?? err) });
    }
  }
  return results;
}

/** One call of runSufferResolution — its result; a refused write throws. */
async function runSufferCall(call, actor, opts) {
  const { applyMeterChanges, setDebility } = await import("../character/actorBridge.js");
  switch (call.kind) {
    case "suffer": {
      const r = await executeSuffer(call.sufferId, actor, {
        amount: call.amount,
        itemId: call.itemId,
        ...opts,
      });
      return { kind: "suffer", sufferId: call.sufferId, ...r };
    }
    case "meter": {
      // Aid Your Ally's choice: the benefit is the ally's (issue #325 W17).
      if (call.meterKey === "momentum" && call.delta > 0) {
        const ally = await aidedAllyActor(opts);
        if (ally) {
          await applyMeterChanges(ally, { momentum: call.delta });
          return { kind: "meter", meterKey: call.meterKey, delta: call.delta, actorId: ally.id };
        }
      }
      // Heal's recovery is the patient's — the ally under the roller's care,
      // or the companion treated — never the healer's (issue #325 W04).
      if (call.meterKey === "health" && call.delta > 0 && opts.patientCompanionItemId) {
        const { applyCompanionHealthChange } = await import("../character/actorBridge.js");
        return { kind: "meter", meterKey: call.meterKey, delta: call.delta, companionItemId: opts.patientCompanionItemId,
          ...(await applyCompanionHealthChange(actor, call.delta, { itemId: opts.patientCompanionItemId })) };
      }
      if (call.meterKey === "health" && call.delta > 0) {
        const patient = await healPatientActor(opts);
        if (patient) {
          await applyMeterChanges(patient, { health: call.delta });
          return { kind: "meter", meterKey: call.meterKey, delta: call.delta, actorId: patient.id };
        }
      }
      // A vehicle's integrity and a companion's health are no PC meters: the
      // generic write dropped them, and the card reported them applied
      // (issue #309 N02 / N03).
      // A support vehicle's roll changes its own Integrity track (issue #342
      // Z53); otherwise the vehicle the move was rolled against, else the
      // command vehicle. A loss the track cannot take is momentum
      // (lossPastZero, issue #345 AA15).
      if (call.meterKey === "integrity" && opts.vehicleItemId) {
        const { applyVehicleAssetIntegrityChange } = await import("../character/actorBridge.js");
        return { kind: "meter", meterKey: call.meterKey, delta: call.delta,
          ...(await lossPastZero(actor, call.delta, await applyVehicleAssetIntegrityChange(actor, call.delta, { itemId: opts.vehicleItemId }), opts)) };
      }
      if (call.meterKey === "integrity") {
        return { kind: "meter", meterKey: call.meterKey, delta: call.delta,
          ...(await lossPastZero(actor, call.delta, await applyVehicleIntegrity(opts.vehicleActorId ?? null, call.delta), opts)) };
      }
      if (call.meterKey === "companionHealth") {
        const { applyCompanionHealthChange } = await import("../character/actorBridge.js");
        return { kind: "meter", meterKey: call.meterKey, delta: call.delta,
          ...(await lossPastZero(actor, call.delta, await applyCompanionHealthChange(actor, call.delta, { itemId: opts.companionItemId ?? null }), opts)) };
      }
      await applyMeterChanges(actor, { [call.meterKey]: call.delta });
      return { kind: "meter", meterKey: call.meterKey, delta: call.delta };
    }
    case "mark":
      // Unprepared is the crew's: its one writer marks every PC sharing the
      // supply (markUnprepared) — a Sacrifice Resources' refused mark, retried
      // alone (SUFFER-RETRY-WHOLE-AFTER-METER).
      if (call.debility === "unprepared") {
        const marks = await markUnprepared(actor);
        return { kind: "mark", debility: call.debility, ...marks };
      }
      await setDebility(actor, call.debility, true);
      return { kind: "mark", debility: call.debility };
    case "clear-impact": {
      // Heal clears the patient's wound (issue #325 W04); a companion has none.
      if (call.debility === "wounded" && opts.patientCompanionItemId) {
        return { kind: "clear-impact", debility: call.debility, skipped: true };
      }
      // Resupply's clear is the crew's: every PC sharing the supply, as they
      // were marked together (known-issues UNPREPARED-CLEAR-ONE-PC, issue #338 D3).
      if (call.debility === "unprepared") {
        const clears = await clearUnprepared(actor);
        const crew = crewClearedNote(clears);
        if (crew) await postDeferredCard("Unprepared cleared for the crew", `${crew}.`);
        return { kind: "clear-impact", debility: call.debility, ...clears };
      }
      const patient = call.debility === "wounded" ? await healPatientActor(opts) : null;
      await setDebility(patient ?? actor, call.debility, false);
      return { kind: "clear-impact", debility: call.debility, ...(patient ? { actorId: patient.id } : {}) };
    }
    case "noop":
      return { kind: "noop" };
    case "at-zero-choice":
      // A miss at 0 health / spirit: the choice card (nothing otherwise).
      return { kind: "at-zero-choice", which: call.which, ...(await offerAtZeroChoiceAfterMiss(actor, call.which, opts)) };
    case "resist": {
      // The resist roll at 0 (issue #330 D3): Endure Harm / Stress posted as
      // the card's PC — the move pipeline rolls it +health / +iron (or
      // +spirit / +heart), whichever is higher, and its miss card offers the
      // at-0 choice. Held while another move resolves (deferWhileBusy). It is
      // owed (`owedMove`): in a Batch Mode round it is the roller's entry,
      // never an optional offer beside one (src/batch/round.js
      // offerForcedMove, issue #342 D2).
      const what = call.moveId === "endure_stress" ? "the stress" : "the harm";
      try {
        await ChatMessage.create({
          content: `${actor?.name ?? "The character"} resists ${what}.`,
          ...(actor ? { speaker: { actor: actor.id, alias: actor.name } } : {}),
          flags: { [MODULE_ID]: {
            bypassPacing: true, forcedMoveId: call.moveId, deferWhileBusy: true, owedMove: true,
            // The card that owes it: a roll then not made re-opens it (issue #347 AB06).
            ...(typeof opts?.sufferCardId === "string" && opts.sufferCardId
              ? { sourceCard: { messageId: opts.sufferCardId, kind: "suffer" } } : {}),
          } },
        });
      } catch (err) {
        console.warn(`${MODULE_ID} | resist roll: the move could not be posted:`, err?.message ?? err);
        return { kind: "resist", moveId: call.moveId, ok: false, reason: "post-failed" };
      }
      return { kind: "resist", moveId: call.moveId };
    }
    case "roll-table": {
      const rolled = await rollImpactTable(call.table, { ...opts, actorName: actor?.name ?? null });
      return rolled
        ? { kind: "roll-table", table: call.table, ...rolled }
        : { kind: "roll-table", table: call.table, skipped: true, ok: false, reason: "no-table" };
    }
    case "clear-progress": {
      // A momentum loss the minimum refused, taken as progress: one rank's
      // mark cleared on the track picked (MOMENTUM-MIN-REDIRECT-MANUAL).
      const { getProgressTrack, adjustProgressById } = await import("../ui/progressTracks.js");
      const track = await getProgressTrack(call.trackId);
      if (!track) return { kind: "clear-progress", trackId: call.trackId, ok: false, reason: "track-gone" };
      if (track.completed) return { kind: "clear-progress", trackId: call.trackId, ok: false, reason: "track-done" };
      const cleared = await adjustProgressById(call.trackId, -1);
      if (!cleared) return { kind: "clear-progress", trackId: call.trackId, ok: false, reason: "track-gone" };
      return { kind: "clear-progress", trackId: call.trackId, before: Number(track.ticks ?? 0), after: Number(cleared.ticks ?? 0) };
    }
    case "combat-progress": {
      const { listProgressTracks, markProgressById } = await import("../ui/progressTracks.js");
      const { fight, reason } = progressFight(await listProgressTracks(), opts);
      if (!fight) {
        console.warn(`${MODULE_ID} | combat-progress executor: ${reason} — progress not marked.`);
        return { kind: "combat-progress", count: call.count, skipped: true, ok: false, reason };
      }
      for (let i = 0; i < (call.count ?? 1); i++) await markProgressById(fight.id);
      return { kind: "combat-progress", count: call.count, trackId: fight.id };
    }
    case "expedition-progress": {
      const { listProgressTracks, markProgressById, addProgressTrack } = await import("../ui/progressTracks.js");
      const allTracks = await listProgressTracks();
      // The expedition the move explored, resolved when it was rolled
      // (Explore a Waypoint's targets): that one or nothing — never the sole
      // open one at click time (DELAYED-CHOICE-IDENTITY, N04's rule). A card
      // that names none keeps the click-time reading below.
      if (typeof opts.expeditionTrackId === "string" && opts.expeditionTrackId) {
        const own = allTracks.find(t => t.id === opts.expeditionTrackId && t.type === "expedition") ?? null;
        if (!own || own.completed) {
          const reason = own ? "expedition-over" : "expedition-gone";
          console.warn(`${MODULE_ID} | expedition-progress executor: the move's expedition ${opts.expeditionTrackId} is ${own ? "over" : "gone"} — progress not marked.`);
          return { kind: "expedition-progress", count: call.count, skipped: true, ok: false, reason };
        }
        for (let i = 0; i < (call.count ?? 1); i++) await markProgressById(own.id);
        return { kind: "expedition-progress", count: call.count, trackId: own.id };
      }
      const open = allTracks.filter(t => t.type === 'expedition' && !t.completed);
      if (open.length === 1) {
        for (let i = 0; i < (call.count ?? 1); i++) await markProgressById(open[0].id);
        return { kind: "expedition-progress", count: call.count, trackId: open[0].id };
      }
      if (open.length === 0) {
        // Explore a Waypoint's "mark progress" pick used to silently skip
        // when no expedition was open (WAYPOINT-PROGRESS-NOOP). Mirror
        // applyExpeditionProgress's resolve-or-create: begin a default
        // expedition and mark it, so the chosen reward always lands. Its label
        // is the one every unnamed expedition has — the arrival and the finish
        // read it as "no destination named" (WAYPOINT-PLACEHOLDER-LITERAL).
        const created = await addProgressTrack({ label: UNNAMED_EXPEDITION_LABEL, type: "expedition", rank: "dangerous" });
        for (let i = 0; i < (call.count ?? 1); i++) await markProgressById(created.id);
        return { kind: "expedition-progress", count: call.count, trackId: created.id, created: true };
      }
      console.warn(`${MODULE_ID} | expedition-progress executor: ${open.length} open expeditions — ambiguous, progress not marked. Name the expedition or mark it in the Progress Tracks panel.`);
      return { kind: "expedition-progress", count: call.count, skipped: true, ok: false, reason: "ambiguous" };
    }
    case "combat-position": {
      const { listProgressTracks } = await import("../ui/progressTracks.js");
      const allTracks = await listProgressTracks();
      // The fight the move was about, resolved when it was rolled
      // (DELAYED-CHOICE-IDENTITY, N04's rule): the open fight its foe named,
      // or the fight its threshold card begins — never the sole open fight
      // or the newest threshold card at click time. A card that names
      // neither keeps the click-time reading below.
      const own = ownCombatPositionTarget(allTracks, opts);
      if (own) {
        if (own.stash) {
          const stashed = await stashOnOwnThresholdCard(opts.thresholdResolutionId, call.position);
          if (stashed) return { kind: "combat-position", position: call.position, stashed, skipped: false };
          return { kind: "combat-position", position: call.position, skipped: true, ok: false, reason: "fight-gone" };
        }
        if (!own.fight) {
          console.warn(`${MODULE_ID} | combat-position executor: ${own.reason} — position "${call.position}" not applied.`);
          return { kind: "combat-position", position: call.position, skipped: true, ok: false, reason: own.reason };
        }
        const { applyCombatPositionToTrack } = await import("./combatTracker.js");
        await applyCombatPositionToTrack(own.fight.id, call.position, actor);
        return { kind: "combat-position", position: call.position, trackId: own.fight.id };
      }
      const open = allTracks.filter(t => t.type === 'combat' && !t.completed);
      if (open.length === 1) {
        const { applyCombatPositionToTrack } = await import("./combatTracker.js");
        await applyCombatPositionToTrack(open[0].id, call.position, actor);
        return { kind: "combat-position", position: call.position, trackId: open[0].id };
      }
      if (open.length === 0) {
        // Enter the Fray's threshold card may still be waiting for its
        // Enter-the-Fray click (the suffer choice and the threshold card can
        // be resolved in either order). Stash the position on the newest
        // threshold card so createCombatTrackFromThreshold applies it when
        // the track is created.
        const stashed = await stashPositionOnThresholdCard(call.position);
        if (stashed) return { kind: "combat-position", position: call.position, stashed, skipped: false };
        console.warn(`${MODULE_ID} | combat-position executor: no open combat track or pending threshold card to receive "${call.position}".`);
        return { kind: "combat-position", position: call.position, stashed, skipped: true, ok: false, reason: "no-fight" };
      }
      console.warn(`${MODULE_ID} | combat-position executor: ${open.length} open combat tracks — position "${call.position}" not applied.`);
      return { kind: "combat-position", position: call.position, skipped: true, ok: false, reason: "ambiguous" };
    }
    case "next-bonus": {
      // The roller's own +1, added by the pipeline to their next action roll
      // (nextMoveAdd.js consumeNextMoveBonus). It only posted a reminder card,
      // and the confirm dialog has nowhere to enter it (issue #322 V02). A
      // write the world refuses throws: the card reports it, with a Retry.
      // Aid Your Ally's choice: the ally's next roll (issue #325 W17).
      const taker = (await aidedAllyActor(opts)) ?? actor;
      const { grantNextMoveBonus } = await import("./nextMoveAdd.js");
      const granted = await grantNextMoveBonus(taker?.id ?? null, call.amount, "choice");
      if (!granted.ok) return { kind: "next-bonus", amount: call.amount, ok: false, reason: granted.reason };
      await postDeferredCard(
        `+${call.amount} on your next move`,
        `Added to ${escapeHtml(taker?.name ?? "your character")}'s next action roll (not a progress move).`,
      );
      return { kind: "next-bonus", amount: call.amount };
    }
    case "complication":
      return postChosenComplication(call, actor);
    case "route":
      // A priced Pay the Price (Sojourn's "No relief"): the price the move's
      // narration depicted is paid — its card, its suffer routes and the
      // countdown clocks — never a reminder to roll another, which differed
      // from the narrated one (SOJOURN-PTP-ADVISORY).
      if (call.route === "pay_the_price" && call.price) {
        const { payChosenPrice } = await import("../index.js");
        const paid = await payChosenPrice(call.price, actor);
        return { kind: "route", route: call.route, ...paid };
      }
      // Surface a chat card prompting the player/GM to trigger the
      // follow-up move themselves. Auto-firing Swear an Iron Vow /
      // Pay the Price from here would lose the player's narration.
      await postDeferredCard(
        `Trigger: ${call.route}`,
        `Resolve this by typing the move's chat command or using its panel.${call.rank ? ` (rank: ${call.rank})` : ""}`,
        { route: call.route, rank: call.rank ?? null },
      );
      return { kind: "route", route: call.route, rank: call.rank };
    case "needs-any":
      // Caller didn't pre-supply an `anyChoice` for a B2 option that
      // embeds a B1-style sub-prompt. Defer to a recursive prompt —
      // the dialog handles this by re-opening with the sub-prompt.
      return { kind: "needs-any", amount: call.amount, count: call.count };
    case "needs-amount":
      // An option whose amount the player picks (amountPick, issue #330 D7):
      // the card posts the minor / serious / major follow-up.
      return { kind: "needs-amount", sufferId: call.sufferId, amounts: call.amounts };
    default:
      return { kind: "unknown", call };
  }
}

/**
 * The ally an Aid Your Ally's benefits go to (`opts.allyActorId`, resolved
 * before the dice — statEnrichment.js resolveAidedAlly), or null. Issue #325
 * W17.
 *
 * @param {Object} opts — the card's executorOpts
 * @returns {Promise<Actor|null>}
 */
async function aidedAllyActor(opts) {
  const id = typeof opts?.allyActorId === "string" && opts.allyActorId ? opts.allyActorId : null;
  if (!id) return null;
  const { isPlayerCharacterActor } = await import("../character/actorBridge.js");
  const actor = globalThis.game?.actors?.get?.(id) ?? null;
  return isPlayerCharacterActor(actor) ? actor : null;
}

/**
 * The player character a Heal's care is for (`opts.patientActorId`, resolved
 * before the dice — statEnrichment.js resolveHealPatient), or null when the
 * roller tends their own wounds or the patient is gone. Issue #325 W04.
 *
 * @param {Object} opts — the card's executorOpts
 * @returns {Promise<Actor|null>}
 */
async function healPatientActor(opts) {
  const id = typeof opts?.patientActorId === "string" && opts.patientActorId ? opts.patientActorId : null;
  if (!id) return null;
  const { isPlayerCharacterActor } = await import("../character/actorBridge.js");
  const actor = globalThis.game?.actors?.get?.(id) ?? null;
  return isPlayerCharacterActor(actor) ? actor : null;
}

/**
 * The fight a combat-position choice is about, as its card names it
 * (DELAYED-CHOICE-IDENTITY): null when the card names none (a card posted
 * before it carried them — the caller's click-time reading). Enter the Fray
 * against a new foe names its threshold card (`thresholdResolutionId`):
 * still waiting, the position is stashed on it (`stash`); entered, the fight
 * it began (its `frayTrackId`); a way out taken, no fight. A move whose foe an
 * open fight was names that fight (`combatTrackId`, progressFight's ladder).
 *
 * @param {Array<Object>} tracks
 * @param {Object} opts — the card's executor opts
 * @returns {{ stash?: boolean, fight?: Object|null, reason?: string }|null}
 */
function ownCombatPositionTarget(tracks, opts) {
  if (typeof opts?.thresholdResolutionId === "string" && opts.thresholdResolutionId) {
    const tf = findThresholdCard(opts.thresholdResolutionId)?.flags?.[MODULE_ID] ?? null;
    if (!tf) return { fight: null, reason: "fight-gone" };
    if (!tf.thresholdTaken) return { stash: true };
    if (tf.thresholdTaken !== "fray") return { fight: null, reason: "way-out" };
    if (typeof tf.frayTrackId !== "string" || !tf.frayTrackId) return { fight: null, reason: "fight-gone" };
    return progressFight(tracks, { combatTrackId: tf.frayTrackId });
  }
  if (typeof opts?.combatTrackId === "string" && opts.combatTrackId) return progressFight(tracks, opts);
  return null;
}

/**
 * The fight a delayed "mark progress" choice (Gain Ground's) marks: the fight
 * the move was about — the pipeline's `moveFight`, carried on the card as
 * `opts.combatTrackId` — checked when the choice is made. Gone or finished by
 * then, nothing is marked: never whichever other fight is the only one open
 * (issue #309 N04 — the choice re-selected the sole open fight at click time,
 * so with two open it marked nothing, and an old choice marked a fight opened
 * after its own had finished). A card that names no fight (posted before the
 * card carried one) keeps the sole-open-fight reading.
 *
 * @param {Array<Object>} tracks — listProgressTracks()
 * @param {Object} opts — the card's executorOpts
 * @returns {{ fight: Object|null, reason?: string }}
 */
function progressFight(tracks, opts) {
  if (!("combatTrackId" in opts)) {
    const open = tracks.filter(t => t.type === "combat" && !t.completed);
    if (open.length === 1) return { fight: open[0] };
    return { fight: null, reason: open.length ? "ambiguous" : "no-fight" };
  }
  if (!opts.combatTrackId) return { fight: null, reason: "no-fight" };
  const fight = tracks.find(t => t.id === opts.combatTrackId && t.type === "combat") ?? null;
  if (!fight)              return { fight: null, reason: "fight-gone" };
  if (fight.completed)     return { fight: null, reason: "fight-over" };
  return { fight };
}

/**
 * The damage a vehicle's integrity, or the harm a companion's health, could
 * not take, as momentum: "If your integrity is 0, Lose Momentum equal to any
 * remaining damage" (vendored Withstand Damage; Companion Takes a Hit reads
 * the same for its health) — as the Endure Harm executor takes harm past 0
 * health (issue #314 Q02). The miss's "-1 integrity" / "-1 companion health"
 * was a clamped delta, free at 0, and the card said it was applied (issue
 * #345 AA15). Only a loss whose write landed: a vehicle or companion that
 * is not there, or a refused write, is reported as not applied.
 *
 * @param {Actor} actor — the roller, whose momentum it is
 * @param {number} delta
 * @param {Object} res — the write's result (`ok`, `before`, `after`)
 * @returns {Promise<Object>} `res`, with `momentumLoss` when some overflowed
 */
async function lossPastZero(actor, delta, res, opts = {}) {
  if (!(delta < 0) || res?.ok !== true || !Number.isFinite(res.before)) return res;
  const taken = Math.max(0, res.before - (Number.isFinite(res.after) ? res.after : res.before));
  const momentumLoss = await overflowToMomentum(actor, -delta - taken, opts);
  return momentumLoss ? { ...res, momentumLoss } : res;
}

/**
 * Change a vehicle's integrity — a consequence's "+1 integrity" / "-1
 * integrity" (Withstand Damage): the vehicle the move was rolled against,
 * else the command vehicle, through the ship record's one integrity writer
 * (entities/ship.js changeIntegrity — raising it is refused while the
 * vehicle is battered, read from its canonical native impact).
 *
 * @param {string|null} vehicleActorId
 * @param {number} delta
 * @returns {Promise<{ ok: boolean, vehicleActorId?: string, name?: string, before?: number, after?: number, reason?: string, error?: string }>}
 */
async function applyVehicleIntegrity(vehicleActorId, delta) {
  const { getCommandVehicleActorId, changeIntegrity } = await import("../entities/ship.js");
  const id = vehicleActorId
    ?? getCommandVehicleActorId(globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {});
  const res = await changeIntegrity(id ?? null, delta);
  if (res.reason === "no-vehicle") {
    console.warn(`${MODULE_ID} | integrity change: no vehicle found — ${delta >= 0 ? "+" : ""}${delta} integrity not applied.`);
    return res;
  }
  if (res.reason === "battered") console.warn(`${MODULE_ID} | integrity change: ${res.name ?? id} is battered — integrity not raised.`);
  if (res.reason === "refused")  console.warn(`${MODULE_ID} | integrity change on ${res.name ?? id} failed:`, res.error);
  return { ...res, vehicleActorId: id };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The table a chosen complication's scope is rolled on: a waypoint's peril (issue #353 Phase 0). */
const COMPLICATION_TABLES = Object.freeze({ waypoint: "spaceborne_peril" });

/** What a complication with no option label is called, by scope. */
const COMPLICATION_LABELS = Object.freeze({
  waypoint:    "Peril at the waypoint",
  destination: "Complication at destination",
  scene:       "Narrative cost",
});

/**
 * A complication the player chose as a weak hit's cost — "Peril at the
 * waypoint", "Complication at destination", Forsake Your Vow's "Narrative
 * cost" — delivered: its card, then a short narrator beat that plays it now
 * (the oracle follow-up, narrated once where a Claude key lives, its card
 * stamped for the X-Card). Its card only promised that the narrator would
 * "surface" it, and nothing read it (issue #353 Phase 0; rules/
 * reachability.md §1). A waypoint's peril is rolled on Spaceborne Peril
 * first, and the roll is on the card and in RECENT ORACLE RESULTS; the other
 * scopes roll nothing. The card is the module's own oracle card
 * (`oracleCommandCard`), so the GM narrates what it carries and nothing a
 * relay brings (oracleFollowup.js).
 *
 * @param {{ scope?: string, label?: string|null }} call
 * @param {Actor|null} actor — the card's PC, whose beat it is
 * @returns {Promise<{ kind: "complication", scope: string, roll?: string }>}
 */
async function postChosenComplication(call, actor) {
  const scope = typeof call?.scope === "string" && call.scope ? call.scope : "scene";
  const label = (typeof call?.label === "string" && call.label.trim()) ? call.label.trim()
    : (COMPLICATION_LABELS[scope] ?? "A complication");
  const tableId = COMPLICATION_TABLES[scope] ?? null;
  let roll = null;
  if (tableId) {
    try {
      const { rollOracle } = await import("../oracles/roller.js");
      const r = rollOracle(tableId);
      if (r?.result && r.result !== "—") roll = { tableId, tableName: r.tableName ?? tableId, die: r.die ?? 100, roll: r.roll, result: r.result };
    } catch (err) {
      console.warn(`${MODULE_ID} | complication: the ${tableId} roll failed — it is narrated unrolled:`, err?.message ?? err);
    }
  }
  const narration = {
    kind:           "complication",
    oracleName:     label,
    question:       "",
    rolledLine:     roll ? `${roll.tableName}: ${roll.result}` : "",
    speakerActorId: actor?.id ?? null,
    scope,
  };
  const body = roll
    ? `<p>${escapeHtml(roll.tableName)}: d${roll.die} = <strong>${roll.roll}</strong> · ${escapeHtml(roll.result)}</p>`
    : `<p>The cost you chose arrives.</p>`;
  const card = await postDeferredCard(`Complication: ${escapeHtml(label)}`, body, {
    complication:      true,
    scope,
    oracleCommandCard: true,
    ...(roll ? {
      oracleTableId: roll.tableId,
      // The dice established it: later narrations must not contradict it.
      oracleMemory:  { name: roll.tableName, question: label, answer: roll.result },
    } : {}),
    // What the GM narrates — the card's own (oracleFollowup.js, issue #331 X49).
    oracleNarration: narration,
  });
  if (card?.id) {
    const { requestOracleNarration } = await import("../oracles/oracleFollowup.js");
    requestOracleNarration({ ...narration, messageId: card.id });
  }
  return { kind: "complication", scope, ...(roll ? { roll: roll.result } : {}) };
}

async function postDeferredCard(title, body, flags = {}) {
  try {
    return await globalThis.ChatMessage?.create?.({
      content: `<div class="sf-card sf-card--suffer-deferred"><div class="sf-card-header">${title}</div><div class="sf-card-body">${body}</div></div>`,
      flags: { [MODULE_ID]: { sufferDeferred: true, ...flags } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | sufferDialog: deferred-card post failed:`, err);
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Filter / preview helpers (used by the dialog UI; pure)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate an option's `requires` predicate against the actor's
 * current state. Supports the small DSL the audit table uses:
 *
 *   "!wounded"            → actor.system.debility.wounded === false
 *   "!shaken"             → actor.system.debility.shaken === false
 *   "!battered"           → the vehicle is not battered (caller passes
 *                           ctx.vehicleBattered — null: no vehicle, so none
 *                           to raise); without it, the actor's own impact
 *   "companionHealth>0"   → companion health > 0 (caller passes context)
 *
 * Returns `true` if the option is selectable, `false` if greyed out.
 *
 * @param {Object} opt           — sufferPrompt option entry
 * @param {Object} ctx           — { actor, companionHealth?, vehicleBattered?, … }
 *   (sufferCard.js optionContext builds it from the card)
 */
export function isOptionAvailable(opt, ctx = {}) {
  // An option that sacrifices resources stays open while unprepared: the
  // rule moves the cost, it does not remove the choice ("When you suffer a
  // loss of resources while unprepared … apply the cost to a different
  // suffer move"). Picked, the Sacrifice Resources executor posts the "make a
  // suffer move (-N)" picker without Sacrifice Resources — the cost at its
  // own size, to the move the player chooses (issue #325 W16's redirect).
  // Greying it left Check Your Gear's and Heal's weak hits only the costlier
  // Lose Momentum (-2) (issue #342 D1; the "any" picker still greys it,
  // sufferCard.js anySufferBlocked — picking another move there IS the
  // redirect).
  if (!opt?.requires) return true;
  const req = String(opt.requires);
  const actor = ctx.actor;
  const debility = actor?.system?.debility ?? {};

  // Heal's wound is the patient's (issue #325 W04): the ally under the
  // roller's care, or a companion, who has no impacts.
  if (req === "wounded" || req === "!wounded") {
    const wounded = ctx.patientCompanion ? false
      : ctx.patient ? !!ctx.patient.system?.debility?.wounded
      : !!debility.wounded;
    return req === "wounded" ? wounded : !wounded;
  }
  if (req === "!shaken")     return !debility.shaken;
  // The at-0 choice's lasting impacts (issue #329 X03).
  if (req === "!permanentlyharmed") return !debility.permanentlyharmed;
  if (req === "!traumatized")       return !debility.traumatized;
  if (req === "!battered") {
    // The vehicle's own impact — its +integrity is what the option gives
    // (issue #309 N02: the PC's impacts were read instead).
    if ("vehicleBattered" in ctx) return ctx.vehicleBattered === false;
    return !debility.battered;
  }
  if (req === "!unprepared") return !debility.unprepared;
  if (req === "shaken")      return !!debility.shaken;
  if (req === "unprepared")  return !!debility.unprepared;

  if (req === "companionHealth>0") {
    return (ctx.companionHealth ?? 0) > 0;
  }

  // Unrecognised requires → allow (fail-open; safer than dropping a
  // rulebook-named option silently).
  return true;
}


// ─────────────────────────────────────────────────────────────────────────────
// HTML helpers (pure-ish; readers test these via snapshot)
// ─────────────────────────────────────────────────────────────────────────────


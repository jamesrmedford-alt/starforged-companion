/**
 * STARFORGED COMPANION
 * src/moves/developRelationship.js — Develop Your Relationship lifecycle (audit 3.14)
 *
 * Pure orchestration for the connection-progress / bond-legacy split:
 *  - An UN-bonded connection: Develop Your Relationship marks progress on the
 *    connection's own relationship track (per its rank). "No roll, mark progress."
 *  - A BONDED connection (play kit §3.3.5): you roll +rank instead — a
 *    strong hit marks 2 ticks on the bonds legacy track, a weak hit takes +2
 *    momentum, a miss takes no lasting benefit, and a strong hit with a match
 *    raises the connection's rank by one (BONDED_DEVELOP_OUTCOMES).
 *
 * The side effects (markRelationshipProgress / addLegacyTicks / updateConnection)
 * live in the GM-gated pipeline handler; this module only decides *what* to do
 * so it can be unit-tested without Foundry. Mirrors expedition.js / combat.js.
 *
 * Source: docs/rules-reference/playkit-rules-and-coverage.md §3.3.5, the
 *         move's text (vendor/foundry-ironsworn starforged-moves),
 *         decisions.md → "Develop Your Relationship bond legacy".
 */

import { wholeWordPattern, wholeWordsFit } from "../context/relevanceResolver.js";

export const CONNECTION_RANKS = ["troublesome", "dangerous", "formidable", "extreme", "epic"];

// Move categories where a "Develop Relationship / Forge a Bond" suggestion is shown
// on the move result card when there are active unbonded connections.
export const CONNECTION_SUGGEST_CATEGORIES = new Set(["connection"]);
// Lifecycle moves that should never re-trigger the suggestion on their own result cards.
const CONNECTION_SUGGEST_EXCLUDE = new Set(["develop_your_relationship", "forge_a_bond"]);

/**
 * Determine whether to show the connection-development suggestion buttons on a
 * move result card. Returns { eligible, count } when eligible, null otherwise.
 *
 * @param {{ moveId: string, outcome: string }} resolution
 * @param {Array<{ bonded?: boolean }>} activeConnections
 * @param {string|null} moveCategory
 * @returns {{ eligible: true, count: number }|null}
 */
export function buildConnectionSuggestion(resolution, activeConnections, moveCategory) {
  if (!activeConnections?.length) return null;
  if (!CONNECTION_SUGGEST_CATEGORIES.has(moveCategory)) return null;
  if (CONNECTION_SUGGEST_EXCLUDE.has(resolution.moveId)) return null;
  if (resolution.outcome === "miss") return null;
  const unbonded = activeConnections.filter(c => !c.bonded);
  if (!unbonded.length) return null;
  return { eligible: true, count: unbonded.length };
}
// What a BONDED Develop Your Relationship roll pays, by outcome — the move's
// text: "On a strong hit, mark 2 ticks on your bonds legacy track. … On a
// weak hit, take +2 momentum. On a miss, take no lasting benefit." The one
// table both paths read: the move pipeline (planDevelopRelationship, and the
// resolver's weak-hit momentum) and `!bond` (handleBondCommand and its relay
// handler, applyBondEffects). The pipeline paid a weak hit 1 bonds tick and
// `!bond` +2 momentum (issue #322 V01).
export const BONDED_DEVELOP_OUTCOMES = Object.freeze({
  strong_hit: Object.freeze({ ticks: 2, momentum: 0 }),
  weak_hit:   Object.freeze({ ticks: 0, momentum: 2 }),
  miss:       Object.freeze({ ticks: 0, momentum: 0 }),
});

/**
 * A bonded Develop Your Relationship's lasting effects for one roll result:
 * its BONDED_DEVELOP_OUTCOMES row, and whether a match raises the
 * connection's rank — "On a strong hit with a match, you may also … raise
 * their rank by one (if not already epic)": a strong hit only, never a weak
 * one (both paths raised on any hit with a match — issue #322 V01).
 *
 * @param {string} outcome — "strong_hit" | "weak_hit" | "miss"
 * @param {boolean} isMatch
 * @returns {{ ticks: number, momentum: number, raiseRank: boolean }|null}
 *   null for anything that is not a roll result
 */
export function bondedDevelopOutcome(outcome, isMatch) {
  const row = Object.hasOwn(BONDED_DEVELOP_OUTCOMES, String(outcome)) ? BONDED_DEVELOP_OUTCOMES[outcome] : null;
  if (!row) return null;
  return { ticks: row.ticks, momentum: row.momentum, raiseRank: outcome === "strong_hit" && isMatch === true };
}

// Rank → the adds of the bonded-path Develop Your Relationship roll (play kit
// p. 3: troublesome +1; dangerous +2; formidable +3; extreme +4; epic +5). The
// pipeline's roll (statEnrichment enrichBondedDevelop) and `!bond` share it.
export const BOND_ROLL_ADDS = {
  troublesome: 1,
  dangerous:   2,
  formidable:  3,
  extreme:     4,
  epic:        5,
};

/**
 * What a bonded Develop Your Relationship rolls: "roll +rank" — the
 * connection's rank as the stat, worth its BOND_ROLL_ADDS. Null for an
 * un-bonded connection (its development is no roll, a mark of progress) or an
 * unknown rank. The move's schema lists no stat, so the pipeline rolled +0 for
 * a bonded connection while `!bond` rolled +rank (issue #314 Q06).
 *
 * @param {{ bonded?: boolean, rank?: string }|null} connection
 * @returns {{ statUsed: string, statValue: number }|null}
 */
export function bondedDevelopRoll(connection) {
  if (!connection?.bonded) return null;
  const adds = BOND_ROLL_ADDS[connection.rank];
  return adds == null ? null : { statUsed: connection.rank, statValue: adds };
}

/**
 * Pure: does a Forge a Bond resolution earn its connection payoff (bonded flip
 * + bonds legacy)? True on any hit — the bond forms on a weak hit too, once
 * their request is met (BOND-WEAK-FORGE). Used by the native-sheet consequence
 * hook, mirroring vow.js shouldPayFulfilledVow.
 *
 * @param {{ moveId?: string, outcome?: string }} args
 * @returns {boolean}
 */
export function shouldForgeBond({ moveId, outcome } = {}) {
  return moveId === "forge_a_bond" && (outcome === "strong_hit" || outcome === "weak_hit");
}

/**
 * Raise a rank by one step, clamped at epic. Unknown ranks pass through.
 * @param {string} rank
 * @returns {string}
 */
export function nextRank(rank) {
  const i = CONNECTION_RANKS.indexOf(rank);
  if (i < 0) return rank;
  return CONNECTION_RANKS[Math.min(i + 1, CONNECTION_RANKS.length - 1)];
}

/**
 * Resolve which connection a Develop Your Relationship / Forge a Bond move
 * targets.
 *
 * Resolution order (mirrors selectExpeditionTrack / selectCombatTrack):
 *  0. `hostId` — the connection's host Actor id (`__hostId`, the
 *     `campaignState.connectionIds` entry), carried by a connection picker
 *     card's choice. It is stable, so it outranks every name; an id that
 *     matches no active connection resolves nothing rather than a guess
 *     (rules/reachability.md §6 — issue #301 B01). With `unbonded` (Forge a
 *     Bond), an id whose connection is bonded resolves nothing too: the
 *     forge picker lists un-bonded connections only, so the pick is stale
 *     (issue #345 AA50 — the bonded track was scored, and the hit's card
 *     said a legacy reward was marked)
 *  1. Exact name match (case-insensitive, ignoring a leading "the")
 *  2. One name inside the other, as whole words, either way (`wholeWordsFit`:
 *     "Captain Ren" is Ren; "Lorenzo" is not — issue #325 W30). With
 *     `unbonded`, a name that matches a bonded connection resolves nothing,
 *     as its id does at rung 0 — not the sole un-bonded one below: a typed
 *     Forge a Bond naming a bond already forged was scored on that bond's
 *     track and then skipped (FORGE-NAMED-BONDED-SCORED)
 *  3. Fallback: the sole bonded connection, else the sole active connection —
 *     with `unbonded` (Forge a Bond), the sole un-bonded one instead: a bonded
 *     connection is never what a forge with no matching target meant
 *  4. null when ambiguous
 *
 * `strict` is for an irreversible write (`!sever`): a named target that
 * matches no name resolves nothing, and an unnamed one resolves only the sole
 * active connection — never the sole bonded one among several. A typo must
 * not land on the table's one bond (rules/reachability.md §6 — issue #321 U14).
 * Its rung 2 is one way: the typed name a whole-word fragment OF one
 * connection's name (`connectionsNamedByFragment`) — `!sever Lyssa Chen`
 * severed the connection named "Chen", and a fragment that fits two
 * connections severed the first (issue #325 W30).
 *
 * @param {Array<{_id,name,rank,bonded,active,__hostId}>} connections
 * @param {string|null} target — interpretation.moveTarget (the named connection)
 * @param {{ hostId?: string|null, unbonded?: boolean, strict?: boolean }} [opts]
 * @returns {object|null}
 */
export function selectConnection(connections, target, { hostId = null, unbonded = false, strict = false } = {}) {
  const active = (connections ?? []).filter(c => c && c.active !== false);
  if (!active.length) return null;

  if (typeof hostId === "string" && hostId) {
    const picked = active.find(c => c.__hostId === hostId) ?? null;
    return unbonded && picked?.bonded ? null : picked;
  }

  if (target) {
    const needle = normConnectionName(target);
    if (needle) {
      const named = (c) => (unbonded && c.bonded ? null : c);
      const exact = active.find(c => normConnectionName(c.name) === needle);
      if (exact) return named(exact);
      if (strict) {
        const fits = connectionsNamedByFragment(active, needle);
        return fits.length === 1 ? named(fits[0]) : null;
      }
      const sub = active.find(c => wholeWordsFit(normConnectionName(c.name), needle));
      if (sub) return named(sub);
    }
  }

  if (strict) {
    if (target) return null;
    return active.length === 1 ? active[0] : null;
  }
  if (unbonded) {
    const open = active.filter(c => !c.bonded);
    return open.length === 1 ? open[0] : null;
  }
  const bonded = active.filter(c => c.bonded);
  if (bonded.length === 1) return bonded[0];
  return active.length === 1 ? active[0] : null;
}

/** A connection name as the ladder compares it: lowercased, a leading "the" dropped. */
function normConnectionName(s) {
  return String(s ?? "").toLowerCase().replace(/^the\s+/, "").trim();
}

/**
 * The active connections whose names hold `fragment` as whole words — the
 * typed name a fragment OF the record's name, never the other way ("Lyssa"
 * and "Lyssa Chen" name "Dr. Lyssa Chen"; neither names "Chen"). `!sever`'s
 * rung: one fit is the connection, two or more sever nobody, and the command
 * names them (issue #325 W30).
 *
 * @param {Array<{name, active?}>} connections
 * @param {string|null} fragment
 * @returns {Array<object>}
 */
export function connectionsNamedByFragment(connections, fragment) {
  const needle = normConnectionName(fragment);
  if (!needle) return [];
  const pattern = wholeWordPattern(needle);
  return (connections ?? []).filter(c => c && c.active !== false && pattern.test(normConnectionName(c.name)));
}

/**
 * Decide what a Develop Your Relationship resolution should do.
 *
 * @param {object|null} connection — from selectConnection
 * @param {"strong_hit"|"weak_hit"|"miss"} outcome
 * @param {boolean} isMatch
 * A bonded plan carries its outcome's `momentum` (bondedDevelopOutcome). For
 * Develop Your Relationship itself that is the roll's own momentum, which the
 * resolver's consequences carry (credited to the roller with the move's other
 * meters); a Test Your Relationship hit develops through this plan with the
 * test's roll, so its pipeline branch applies the momentum.
 *
 * @returns {{action:"none"}
 *          | {action:"connection-progress", connection, marks:number}
 *          | {action:"bond-legacy", connection, ticks:number, momentum:number, raiseRank:boolean, newRank:string|null}}
 */
export function planDevelopRelationship(connection, outcome, isMatch) {
  if (!connection) return { action: "none" };

  if (connection.bonded) {
    const effect = bondedDevelopOutcome(outcome, isMatch) ?? { ticks: 0, momentum: 0, raiseRank: false };
    const raiseRank = effect.raiseRank && connection.rank !== "epic";
    return {
      action: "bond-legacy",
      connection,
      ticks:    effect.ticks,
      momentum: effect.momentum,
      raiseRank,
      newRank: raiseRank ? nextRank(connection.rank) : null,
    };
  }

  // Un-bonded: "no roll, mark progress" — one mark on the connection's own track.
  return { action: "connection-progress", connection, marks: 1 };
}

/**
 * What a bonded development adds over another of the same connection — a
 * Burn Momentum's or Improve Result's upgraded outcome over the recorded one
 * (movePipeline.applyDevelopRelationship, BOND-DEVELOP-UPGRADE): the bonds
 * ticks beyond the recorded ones and a rank raise the recorded outcome did not
 * make. The momentum is no part of it: the move's own, it is swapped with
 * the outcome's other meters. Null when it adds nothing.
 *
 * @param {Object} next — planDevelopRelationship's, for the upgraded outcome
 * @param {Object} was  — planDevelopRelationship's, for the recorded one ({ action: "none" } when it developed nothing)
 * @returns {Object|null}
 */
export function developmentAdded(next, was) {
  if (next?.action === "connection-progress") return was?.action === "connection-progress" ? null : next;
  if (next?.action !== "bond-legacy") return null;
  const prior     = was?.action === "bond-legacy" ? was : { ticks: 0, raiseRank: false };
  const ticks     = Math.max(0, Number(next.ticks ?? 0) - Number(prior.ticks ?? 0));
  const raiseRank = !!next.raiseRank && !prior.raiseRank;
  if (!ticks && !raiseRank) return null;
  return { ...next, ticks, momentum: 0, raiseRank, newRank: raiseRank ? next.newRank : null };
}

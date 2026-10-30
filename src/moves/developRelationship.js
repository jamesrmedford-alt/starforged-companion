/**
 * STARFORGED COMPANION
 * src/moves/developRelationship.js — Develop Your Relationship lifecycle (audit 3.14)
 *
 * Pure orchestration for the connection-progress / bond-legacy split:
 *  - An UN-bonded connection: Develop Your Relationship marks progress on the
 *    connection's own relationship track (per its rank). "No roll, mark progress."
 *  - A BONDED connection (play kit §3.3.5): you roll +rank instead, and the
 *    outcome marks the bonds legacy track — strong hit 2 ticks, weak hit 1,
 *    miss 0 — and a match (on a hit) raises the connection's rank by one.
 *
 * The side effects (markRelationshipProgress / addLegacyTicks / updateConnection)
 * live in the GM-gated pipeline handler; this module only decides *what* to do
 * so it can be unit-tested without Foundry. Mirrors expedition.js / combat.js.
 *
 * Source: docs/rules-reference/playkit-rules-and-coverage.md §3.3.5,
 *         decisions.md → "Develop Your Relationship bond legacy".
 */

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
// Bonds legacy ticks marked when developing a BONDED connection, by outcome.
// Strong = 2 (the play-kit value); weak = 1 (diminished-but-present, see
// decisions.md); miss = 0. A match on a hit additionally raises rank.
export const BOND_LEGACY_TICKS = { strong_hit: 2, weak_hit: 1, miss: 0 };

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
 *     (rules/reachability.md §6 — issue #301 B01)
 *  1. Exact name match (case-insensitive, ignoring a leading "the")
 *  2. Substring match in either direction
 *  3. Fallback: the sole bonded connection, else the sole active connection —
 *     with `unbonded` (Forge a Bond), the sole un-bonded one instead: a bonded
 *     connection is never what a forge with no matching target meant
 *  4. null when ambiguous
 *
 * @param {Array<{_id,name,rank,bonded,active,__hostId}>} connections
 * @param {string|null} target — interpretation.moveTarget (the named connection)
 * @param {{ hostId?: string|null, unbonded?: boolean }} [opts]
 * @returns {object|null}
 */
export function selectConnection(connections, target, { hostId = null, unbonded = false } = {}) {
  const active = (connections ?? []).filter(c => c && c.active !== false);
  if (!active.length) return null;

  if (typeof hostId === "string" && hostId) {
    return active.find(c => c.__hostId === hostId) ?? null;
  }

  if (target) {
    const norm = s => String(s ?? "").toLowerCase().replace(/^the\s+/, "").trim();
    const needle = norm(target);
    if (needle) {
      const exact = active.find(c => norm(c.name) === needle);
      if (exact) return exact;
      const sub = active.find(c => {
        const n = norm(c.name);
        return n && (n.includes(needle) || needle.includes(n));
      });
      if (sub) return sub;
    }
  }

  if (unbonded) {
    const open = active.filter(c => !c.bonded);
    return open.length === 1 ? open[0] : null;
  }
  const bonded = active.filter(c => c.bonded);
  if (bonded.length === 1) return bonded[0];
  return active.length === 1 ? active[0] : null;
}

/**
 * Decide what a Develop Your Relationship resolution should do.
 *
 * @param {object|null} connection — from selectConnection
 * @param {"strong_hit"|"weak_hit"|"miss"} outcome
 * @param {boolean} isMatch
 * @returns {{action:"none"}
 *          | {action:"connection-progress", connection, marks:number}
 *          | {action:"bond-legacy", connection, ticks:number, raiseRank:boolean, newRank:string|null}}
 */
export function planDevelopRelationship(connection, outcome, isMatch) {
  if (!connection) return { action: "none" };

  if (connection.bonded) {
    const ticks = BOND_LEGACY_TICKS[outcome] ?? 0;
    const raiseRank = !!isMatch && outcome !== "miss";
    return {
      action: "bond-legacy",
      connection,
      ticks,
      raiseRank,
      newRank: raiseRank ? nextRank(connection.rank) : null,
    };
  }

  // Un-bonded: "no roll, mark progress" — one mark on the connection's own track.
  return { action: "connection-progress", connection, marks: 1 };
}

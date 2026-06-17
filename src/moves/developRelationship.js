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

// Bonds legacy ticks marked when developing a BONDED connection, by outcome.
// Strong = 2 (the play-kit value); weak = 1 (diminished-but-present, see
// decisions.md); miss = 0. A match on a hit additionally raises rank.
export const BOND_LEGACY_TICKS = { strong_hit: 2, weak_hit: 1, miss: 0 };

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
 * Resolve which connection a Develop Your Relationship move targets.
 *
 * Resolution order (mirrors selectExpeditionTrack / selectCombatTrack):
 *  1. Exact name match (case-insensitive, ignoring a leading "the")
 *  2. Substring match in either direction
 *  3. Fallback: the sole bonded connection, else the sole active connection
 *  4. null when ambiguous
 *
 * @param {Array<{_id,name,rank,bonded,active}>} connections
 * @param {string|null} target — interpretation.moveTarget (the named connection)
 * @returns {object|null}
 */
export function selectConnection(connections, target) {
  const active = (connections ?? []).filter(c => c && c.active !== false);
  if (!active.length) return null;

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

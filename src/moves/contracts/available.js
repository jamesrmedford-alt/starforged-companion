/**
 * STARFORGED COMPANION
 * src/moves/contracts/available.js — what can be made now, as the line reader is told it
 *
 * Overhaul 1's slice 4 (issue #384 — overhaul 4's slice 6, issue #385): the
 * line reader's POSSIBLE NOW / NOT NOW and its quoted triggers, built on the
 * move contracts (table.js MOVE_CONTRACTS, gate.js checkMove) — the one
 * authority that decides whether a move can be made where it is offered,
 * read and rolled. It replaces the reader's stand-in (moves/availability.js,
 * deleted with this file's birth), so what the reader is told can be made is
 * what the gate will let be made:
 *
 *   availableMoves(situation, moveIds)  every move once: `{ moveId, can, why, instead?, hard? }` —
 *                                       a refusal's own words and the move it offers, a reroute
 *                                       (the position pair, a variant with no challenge open) as
 *                                       `instead`, and for a move that can be made what it can be
 *                                       made for (its row's `target`: the connections, the vows,
 *                                       the fights …), read from the situation
 *   formatAvailableMoves(available)     those as the reader's two lists
 *   moveTriggers(moveIds)               the game's trigger words, as the table holds them (held to
 *                                       the vendored pack by moveContracts.test.js) — the reader's
 *                                       catalogue quotes them (moves/readerCatalogue.js)
 *
 * Pure over the situation the gate reads (moves/situation.js
 * readMoveSituation): read once by the caller. Soft preconditions are not
 * applied in a fight (the gate's rule); a refusal is asked at the offer stage,
 * as decidePacing asks it.
 */

import { contractFor } from "./table.js";
import { checkMove } from "./gate.js";

const quoted = (name) => `"${name}"`;

/** What a move with each row `target` can be made for, by name, from the situation. */
const TARGETS = Object.freeze({
  connection: (s) => (s?.roller?.connections ?? []).filter(c => !c.lost)
    .map(c => `${quoted(c.name)}${c.bonded ? " (bonded)" : c.full ? " (relationship full: ready to forge)" : ""}`),
  vow: (s) => (s?.roller?.vows ?? []).filter(v => !v.completed && !v.forsaken).map(v => quoted(v.name)),
  fight: (s) => (s?.tracks?.fights ?? []).map(f => quoted(f.label)),
  expedition: (s) => (s?.tracks?.expeditions ?? []).map(e => quoted(e.label)),
  challenge: (s) => (s?.tracks?.sceneChallenges ?? []).map(c => quoted(c.label)),
  vehicle: (s) => (s?.roller?.vehicles ?? []).map(v => quoted(v.name)),
  companion: (s) => (s?.roller?.companions ?? []).map(c => quoted(c.name)),
  ally: (s) => (s?.party ?? []).map(p => p.name).filter(Boolean),
});

const POSITION_WORDS = Object.freeze({ in_control: "in control", bad_spot: "in a bad spot" });

/** Why a move is made as another: the speaker's position in the fight, or no scene challenge under way. */
function rerouteWhy(moveId, situation) {
  if (contractFor(moveId)?.target === "fight") {
    const where = POSITION_WORDS[situation?.tracks?.rollerPosition] ?? null;
    if (where) return `${situation?.roller?.name ?? "the character"} is ${where}`;
  }
  if (contractFor(moveId)?.target === "challenge") return "no scene challenge is under way";
  return "made as the move its own rule names";
}

/**
 * Every move once, as the gate answers it now.
 *
 * @param {Object|null} situation — readMoveSituation's; null: nothing is known, so nothing is refused
 * @param {string[]} moveIds — the moves to answer for, in order (the reader's catalogue's)
 * @param {{ mode?: "open"|"roll" }} [opts] — `roll`: a roll was asked for — a refusal the sheet settles
 *   (a soft one) is no "cannot" then, since a GM may roll it at their word; one with nothing to act on
 *   (a hard one) and a reroute still are
 * @returns {Array<{ moveId: string, can: boolean, why: string, instead?: string, hard?: boolean }>}
 */
export function availableMoves(situation, moveIds, { mode = "open" } = {}) {
  return (Array.isArray(moveIds) ? moveIds : []).map((moveId) => {
    const verdict = situation ? checkMove(moveId, situation, { line: "" }, { stage: "offer" }) : null;
    if (verdict && verdict.ok === false && (mode !== "roll" || verdict.hard === true)) {
      return { moveId, can: false, why: verdict.why, hard: verdict.hard === true, ...(verdict.offer ? { instead: verdict.offer } : {}) };
    }
    if (verdict?.instead && verdict.instead !== moveId) {
      return { moveId, can: false, why: verdict.note || rerouteWhy(moveId, situation), instead: verdict.instead };
    }
    // Swear an Iron Vow swears a new one: it is made for none of the vows there are.
    const target = moveId === "swear_an_iron_vow" ? null : (contractFor(moveId)?.target ?? null);
    const names = situation && TARGETS[target] ? TARGETS[target](situation) : [];
    return { moveId, can: true, why: names.join(", ") };
  });
}

/**
 * POSSIBLE NOW / NOT NOW: the availability, grouped. Moves that share a
 * reason share a line; a "cannot" made as another, or offering another, says
 * which. A move with nothing to say of it is not listed: POSSIBLE NOW says
 * every move the not-now list does not name can be made.
 *
 * @param {ReturnType<typeof availableMoves>} available
 * @returns {string}
 */
export function formatAvailableMoves(available) {
  const groups = new Map();
  for (const e of Array.isArray(available) ? available : []) {
    if (e.can && !e.why) continue;
    const key = `${e.can ? "can" : "not"}\u0000${e.why}`;
    if (!groups.has(key)) groups.set(key, { can: e.can, why: e.why, ids: [], instead: [] });
    const g = groups.get(key);
    g.ids.push(e.moveId);
    if (e.instead && !g.instead.includes(e.instead)) g.instead.push(e.instead);
  }
  const line = (g) => `- ${g.ids.join(", ")} — ${g.why}${g.instead.length ? ` (${g.instead.join(", ")} instead)` : ""}`;
  const can = [...groups.values()].filter(g => g.can);
  const not = [...groups.values()].filter(g => !g.can);
  return [
    `POSSIBLE NOW — every move of THE MOVES but those named after this list${can.length ? ", and these as told:" : "."}`,
    ...can.map(line),
    "NOT NOW",
    ...(not.length ? not.map(line) : ["- nothing"]),
  ].join("\n");
}

/**
 * The game's trigger words for each move, as the contracts table holds them
 * (the vendored pack's, held word for word by moveContracts.test.js) — the
 * one store the reader's catalogue quotes. A move with no row has none.
 *
 * @param {string[]} moveIds
 * @returns {Record<string, string>}
 */
export function moveTriggers(moveIds) {
  return Object.fromEntries((Array.isArray(moveIds) ? moveIds : []).map(id => [id, contractFor(id)?.trigger ?? ""]));
}

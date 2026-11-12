/**
 * STARFORGED COMPANION
 * src/moves/travel.js — where a travel move is going (issue #348 PT06–PT08)
 *
 * Set a Course is for a known route: "when you follow a known route through
 * perilous space, or return to a familiar location". Travel toward a place
 * that is not charted — coordinates an NPC gave, "the gap", an unexplored
 * site — is an expedition. The interpreter kept Set a Course whenever the
 * player typed "set a course", whatever the destination (alpha 23 playtest:
 * a course to an uncharted rendezvous offered a Set a Course roll, and no
 * expedition, site or map pin ever followed).
 *
 * Pure reads over the campaign's stores; the place resolver is the arrival's
 * own (index.js resolveCurrentLocationName), injected so this module needs no
 * import of index.js.
 */

import { MOVES } from "../schemas.js";
import { moveDisplayName } from "../system/i18n.js";

const MODULE_ID = "starforged-companion";

/**
 * The charted, known place a destination names, or null. Known: a tracked
 * settlement, planet or location, by the name resolver the arrival and `!at`
 * use. Charted: not an unexplored site — a precursor vault, derelict or
 * uncharted destination still undiscovered shows on the map only as
 * "Unexplored Site" and is reached by expedition (its location record reads
 * `status: "unexplored"`, its discovery record `discovered: false`).
 *
 * @param {string|null} destination — the place, as the move names it
 * @param {Object} campaignState
 * @param {(name: string, state: Object) => ({ id: string, type: string, entity: Object }|null)} resolvePlace
 * @returns {{ id: string, type: string, entity: Object }|null}
 */
export function chartedPlaceFor(destination, campaignState, resolvePlace) {
  const name = typeof destination === "string" ? destination.trim() : "";
  if (!name || typeof resolvePlace !== "function") return null;
  let place = null;
  try {
    place = resolvePlace(name, campaignState);
  } catch (err) {
    console.warn(`${MODULE_ID} | travel: resolving "${name}" failed:`, err?.message ?? err);
    return null;
  }
  if (!place) return null;
  if (place.type === "location" && isUnchartedSite(place, campaignState)) return null;
  return place;
}

/** A location still undiscovered: its record unexplored, or its site not yet charted. */
function isUnchartedSite(place, campaignState) {
  if (String(place?.entity?.status ?? "").toLowerCase() === "unexplored") return true;
  for (const sector of Array.isArray(campaignState?.sectors) ? campaignState.sectors : []) {
    const site = (sector?.mapData?.discoveries ?? []).find(d => d?.actorId && d.actorId === place.id);
    if (site) return !site.discovered;
  }
  return false;
}

/**
 * The destination the scene has established, for a travel move that names
 * none ("please set a course"): the uncharted destination recorded most
 * recently in the active sector and not yet charted (siteDiscovery
 * recordUnchartedDestination, PT07) — the place the story kept referring to.
 * null when there is none.
 *
 * @param {Object} campaignState
 * @returns {string|null}
 */
export function sceneDestination(campaignState) {
  const active = (Array.isArray(campaignState?.sectors) ? campaignState.sectors : [])
    .find(s => s?.id && s.id === campaignState?.activeSectorId) ?? null;
  const pending = (active?.mapData?.discoveries ?? [])
    .filter(d => d?.workingLabel === true && !d.discovered && typeof d.name === "string" && d.name.trim());
  return pending.length ? pending[pending.length - 1].name.trim() : null;
}

/**
 * Read a forced travel move's destination — and its stat — from the player's
 * line and the scene it follows (issue #348 PT05, PT07). A paced card's "Roll
 * Undertake an Expedition" or "Roll Set a Course" carries the move alone: the
 * destination the scene set up was never read, so the expedition began as
 * "Expedition", for no place, and the course arrived nowhere. The reading is
 * the interpreter's with the move fixed (`interpret(text, moveId)` — its
 * `moveTarget` names the destination as the scene does, or by a working
 * label); the stat is taken when the move lists it. Changes the
 * interpretation in place; never throws.
 *
 * @param {Object} interpretation — a forced travel move's
 * @param {{ interpret: (text: string, moveId: string) => Promise<Object> }} deps
 * @returns {Promise<string|null>} the destination read, or null
 */
export async function readForcedTravelDestination(interpretation, { interpret } = {}) {
  const moveId = interpretation?.moveId;
  if (typeof interpret !== "function" || !moveId) return null;
  let reading = null;
  try {
    reading = await interpret(interpretation.playerNarration ?? "", moveId);
  } catch (err) {
    console.warn(`${MODULE_ID} | travel: reading the forced ${moveId}'s destination failed — it names none:`, err?.message ?? err);
    return null;
  }
  const stats = Array.isArray(MOVES[moveId]?.stat) ? MOVES[moveId].stat : [];
  if (stats.includes(reading?.statUsed)) interpretation.statUsed = reading.statUsed;
  if (reading?.expeditionRank && !interpretation.expeditionRank) interpretation.expeditionRank = reading.expeditionRank;
  if (reading?.rationale) interpretation.rationale = [interpretation.rationale, reading.rationale].filter(Boolean).join(" ");
  const target = typeof reading?.moveTarget === "string" ? reading.moveTarget.trim() : "";
  if (!target) return null;
  interpretation.moveTarget = target;
  return target;
}

/**
 * Read a Set a Course whose destination is not a charted, known place as
 * Undertake an Expedition — on every Mischief setting (maintainer decision,
 * issue #348 PT06). The interpretation is changed in place: the move, its
 * stat (Undertake an Expedition's first listed — the caller may read the
 * line for a better one), and a rationale the confirm dialog shows, saying
 * why; its Cancel lets the player re-word the line. `courseRerouted` rides
 * onto the resolution so the move card says why too.
 *
 * A course named by its pin's Actor (a token dropped on a settlement pin —
 * `moveTargetId`) is to a charted place and stays. A course naming no
 * destination stays: nothing says where it goes (the caller first tries the
 * scene's destination, sceneDestination).
 *
 * @param {Object} interpretation — mutated
 * @param {Object} campaignState
 * @param {{ resolvePlace: Function }} deps
 * @returns {{ from: string, destination: string }|null} the reroute, or null
 */
export function rerouteUnchartedCourse(interpretation, campaignState, { resolvePlace } = {}) {
  if (interpretation?.moveId !== "set_a_course") return null;
  if (interpretation.moveTargetId) return null;
  const destination = typeof interpretation.moveTarget === "string" ? interpretation.moveTarget.trim() : "";
  if (!destination) return null;
  if (chartedPlaceFor(destination, campaignState, resolvePlace)) return null;

  const to = "undertake_an_expedition";
  const reroute = { from: "set_a_course", destination };
  interpretation.moveId         = to;
  interpretation.moveName       = moveDisplayName(to);
  interpretation.statUsed       = MOVES[to]?.stat?.[0] ?? "edge";
  interpretation.isProgressMove = MOVES[to]?.progressMove === true;
  interpretation.courseRerouted = reroute;
  interpretation.rationale      = courseReroutedText(reroute);
  return reroute;
}

/**
 * Why a Set a Course was read as Undertake an Expedition — the confirm
 * dialog's rationale and the move card's note.
 *
 * @param {{ destination: string }} reroute
 * @returns {string}
 */
export function courseReroutedText(reroute) {
  const where = String(reroute?.destination ?? "").trim() || "The destination";
  return `Read as Undertake an Expedition: "${where}" is not a charted place, and Set a Course follows a known route. `
    + `Cancel and re-word the line if you meant a known route.`;
}

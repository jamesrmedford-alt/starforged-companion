/**
 * STARFORGED COMPANION
 * src/moves/availability.js — which moves can be made now, and the gate after the reading (a stand-in)
 *
 * The line reader (src/moves/reader.js) is told which moves the situation
 * allows and why the others cannot be made (its POSSIBLE NOW / NOT NOW), and
 * the code checks the reading against the same answer after it (the gate,
 * src/pacing/readAndRoute.js routeReading). The authority for both belongs to
 * the move contracts (overhaul 4, "moves as contracts": `availableMoves`,
 * `checkMove` on its table, src/moves/contracts/). Until they land this
 * stand-in gives the reader the same two answers in the shapes it needs
 * (issue #384 — decisions.md → "Overhauls 1 and 4", D14) — built only
 * from what the game's text and today's code already settle, each rule
 * citing its source:
 *
 *   - heal / hearten / resupply / repair with nothing to recover, per target:
 *     the rule situation.js nothingToRecover held until overhaul 4's gate
 *     took it over (contracts/predicates.js RECOVERABLE, SOMETHING_DAMAGED),
 *     kept here as the stand-in's own (nothingToRecover below) until slice 4
 *     builds this file's answers on the contracts. TOLD for all four; REFUSED only where
 *     today's code refuses — Hearten, and Heal with nobody else to treat, by
 *     the sheet alone (`sheetAlone`); a Resupply may be after one particular
 *     item and a Repair for another vehicle, a module, a companion or a
 *     device, so those are left to the reader.
 *   - strike / gain_ground only in control, clash / react_under_fire only in
 *     a bad spot: interpreter.js POSITION_MOVE_REMAP. TOLD, and REMAPPED to
 *     the pair's other (`instead`).
 *   - the scene-challenge variants and finish_the_scene only while a
 *     challenge is open: sceneChallenge.js moveOutsideSceneChallenge. TOLD;
 *     a variant with none open is REMAPPED to the ordinary move.
 *   - the position-locked moves, take_decisive_action and face_defeat only
 *     in an open fight: the triggers. TOLD, not refused — a Strike with no
 *     fight open is rolled today, and its marks begin a fight (combat.js).
 *   - develop / test / forge_a_bond only with a connection, forge_a_bond not
 *     for a bonded one, make_a_connection not for an existing one:
 *     movePipeline.js trackGoneReason and the readers' rules. TOLD; the
 *     refusals stay where they are (rollMove).
 *   - reach_a_milestone / fulfill / forsake only with an open vow:
 *     milestone.js selectFulfilVow / selectForsakeVow. TOLD; the vow-gone
 *     card stays.
 *   - explore_a_waypoint only during an expedition or inside a site,
 *     finish_an_expedition only with one open: the triggers. TOLD, not
 *     refused — whether code should is overhaul 4's call.
 *   - aid_your_ally needs another player character, companion_takes_a_hit a
 *     companion: the triggers ("an ally", "your companion"). TOLD.
 *
 * A refusal of the sheet's applies to the open reading of a line only:
 * `!roll` is how a player who means it rolls a Heal at full health, and a
 * card's move is the card's — so in the `roll` mode NOT NOW names only what
 * cannot be rolled at all (the remaps). The remaps apply in every mode. In
 * an open fight the sheet's refusals still apply: the precondition is the
 * game's, fight or no fight (routeReading's gate comes before its fight row).
 *
 * When the contracts land, the reader takes their `availableMoves` /
 * `checkMove` and this file is deleted in the same commit (slice 4).
 *
 * Pure: it reads only the situation it is given (src/moves/readerSituation.js
 * readLineSituation), never throws, and an unknown is never a refusal.
 */

import { MOVES } from "../schemas.js";
import { SCENE_CHALLENGE_VARIANTS, moveOutsideSceneChallenge } from "./sceneChallenge.js";
import { CATALOGUE_MOVE_IDS } from "./readerCatalogue.js";
import { progressText } from "./readerSituation.js";

/** The open reading of a line (reader.js READING_MODES.OPEN): the sheet's refusals are its alone. */
const OPEN = "open";

// interpreter.js POSITION_MOVE_REMAP: the same intent's move in the other position.
const POSITION_REMAP = Object.freeze({
  in_control: Object.freeze({ clash: "strike", react_under_fire: "gain_ground" }),
  bad_spot:   Object.freeze({ strike: "clash", gain_ground: "react_under_fire" }),
});
const POSITION_WORDS = Object.freeze({ in_control: "in control", bad_spot: "in a bad spot" });
/** The fight's moves, in the order a block names them. */
const FIGHT_MOVES = Object.freeze(["strike", "gain_ground", "clash", "react_under_fire", "take_decisive_action", "face_defeat"]);
const SCENE_MOVES = Object.freeze(["face_danger_scene_challenge", "secure_an_advantage_scene_challenge", "finish_the_scene"]);
const RELATIONSHIP_MOVES = Object.freeze(["develop_your_relationship", "test_your_relationship"]);
const VOW_MOVES = Object.freeze(["reach_a_milestone", "fulfill_your_vow", "forsake_your_vow"]);
const EXPEDITION_MOVES = Object.freeze(["explore_a_waypoint", "finish_an_expedition"]);

const quoted = (name) => `"${name}"`;
/** "health 3 of 5, wounded" — a meter beside its impact, as a line of the block names it. */
const meterText = (label, value, marked, impact, max = 5) => {
  if (!Number.isFinite(value)) return `${label} unknown`;
  const notes = [value >= max ? "full" : null, marked === true ? impact : marked === false ? `not ${impact}` : null].filter(Boolean);
  return [`${label} ${value} of ${max}`, ...notes].join(", ");
};
const nameOf = (situation) => situation?.speaker?.name ?? situation?.sheet?.name ?? "The character";

const METER_MAX = 5;
const isFull = (value, max = METER_MAX) => Number.isFinite(value) && value >= max;

/**
 * Whether a recovery move has nothing to recover — Heal with health full and
 * no wound, Hearten with spirit full and not shaken, Resupply with supply
 * full and not unprepared, Repair with the command vehicle's integrity full
 * and it not battered — read from the whole line situation. Anything unknown
 * is not "nothing". `sheetAlone`: only the sheet speaks for it — then only
 * Hearten, and Heal with nobody else the care could be for (the situation's
 * party and the speaker's companions; where either could not be read,
 * someone might be), are answered; a Resupply may be after one item and a
 * Repair for another vehicle or a device. The rule situation.js held until
 * overhaul 4's gate took it over (d068851e, contracts/predicates.js
 * RECOVERABLE); the stand-in keeps it until slice 4 asks the contracts.
 *
 * @param {string} moveId
 * @param {ReturnType<import("./readerSituation.js").readLineSituation>|null} s
 * @param {{ sheetAlone?: boolean }} [opts]
 * @returns {boolean}
 */
function nothingToRecover(moveId, s, { sheetAlone = false } = {}) {
  const sheet = s?.sheet;
  if (!sheet) return false;
  const { meters = {}, impacts = {}, vehicle = null } = sheet;
  switch (moveId) {
    case "heal": {
      if (!(isFull(meters.health) && impacts.wounded === false)) return false;
      if (!sheetAlone) return true;
      const unread = new Set(s.unread ?? []);
      if (unread.has("the party") || unread.has("the vehicles and companions")) return false;
      return (Array.isArray(s.party) ? s.party.length : 0) + (Array.isArray(s.companions) ? s.companions.length : 0) === 0;
    }
    case "hearten":  return isFull(meters.spirit) && impacts.shaken === false;
    case "resupply": return !sheetAlone && isFull(meters.supply) && impacts.unprepared === false;
    case "repair":   return !sheetAlone && !!vehicle && isFull(vehicle.integrity, vehicle.max) && vehicle.battered === false;
    default:         return false;
  }
}
const named = (t) => `${t.name}${t.why ? ` (${t.why})` : ""}`;

/**
 * The moves the speaker can make now, each with why — every move of the
 * reader's catalogue, once, in its order.
 *
 * @param {ReturnType<import("./readerSituation.js").readLineSituation>} situation
 * @param {{ mode?: "open"|"roll"|"chosen" }} [opts] — outside the open
 *   reading only a remap is a "cannot": what the sheet or the game's text
 *   tells against a move is said beside it, as a can
 * @returns {Array<{ moveId: string, can: boolean, why: string,
 *   targets?: Array<{ kind: string, id: string|null, name: string, can: boolean, why?: string }>,
 *   instead?: string|null, group?: "fight"|"scene"|"expedition" }>} `group`:
 *   the block line a move made within an open track belongs on
 */
export function availableMoves(situation, { mode = OPEN } = {}) {
  const s = situation ?? {};
  const out = new Map();
  const set = (moveId, entry) => { if (MOVES[moveId]) out.set(moveId, { moveId, ...entry }); };
  const who = nameOf(s);
  const sheet = s.sheet ?? null;

  // The fight's moves: the speaker's position decides two pairs of them.
  const fights = Array.isArray(s.fights) ? s.fights : [];
  if (!fights.length) {
    for (const id of FIGHT_MOVES) set(id, { can: false, why: "no fight is open: enter_the_fray begins one" });
  } else {
    const position = s.position ?? null;
    const where = fights.map(f => quoted(f.label)).join(", ");
    for (const id of FIGHT_MOVES) {
      const instead = position ? POSITION_REMAP[position]?.[id] ?? null : null;
      if (instead) {
        set(id, { can: false, instead, why: `${who} is ${POSITION_WORDS[position]}` });
      } else {
        set(id, { can: true, group: "fight", why: `in the fight ${where} (${position ? `${who} is ${POSITION_WORDS[position]}` : `${who}'s position is not recorded`})` });
      }
    }
  }

  // The scene challenge.
  const challenges = Array.isArray(s.challenges) ? s.challenges : [];
  for (const id of SCENE_MOVES) {
    if (challenges.length) set(id, { can: true, group: "scene", why: `within the scene challenge ${challenges.map(c => `${quoted(c.label)} (${progressText(c.ticks)})`).join(", ")}` });
    else set(id, { can: false, why: "no scene challenge is open", instead: SCENE_CHALLENGE_VARIANTS[id] ?? null });
  }

  // The expedition, or a site to explore.
  const expeditions = Array.isArray(s.expeditions) ? s.expeditions : [];
  if (expeditions.length) {
    const where = expeditions.map(e => `${quoted(e.label)} (${progressText(e.ticks)})`).join(", ");
    for (const id of EXPEDITION_MOVES) set(id, { can: true, group: "expedition", why: `in the expedition ${where}` });
  } else {
    if (s.site) set("explore_a_waypoint", { can: true, why: `inside the ${s.site.kind}${s.site.name ? ` ${quoted(s.site.name)}` : ""}` });
    else set("explore_a_waypoint", { can: false, why: "no expedition is open" });
    set("finish_an_expedition", { can: false, why: "no expedition is open" });
  }

  // The connections.
  const connections = Array.isArray(sheet?.connections) ? sheet.connections : [];
  if (!sheet) {
    for (const id of [...RELATIONSHIP_MOVES, "forge_a_bond"]) set(id, { can: true, why: "the speaker's connections are unknown" });
  } else if (!connections.length) {
    for (const id of [...RELATIONSHIP_MOVES, "forge_a_bond"]) set(id, { can: false, why: `${who} has no connection yet: make_a_connection makes one` });
  } else {
    const targets = connections.map(c => ({ kind: "connection", id: null, name: c.name, can: true }));
    for (const id of RELATIONSHIP_MOVES) set(id, { can: true, targets, why: connections.map(c => quoted(c.name)).join(", ") });
    const forge = connections.map(c => ({
      kind: "connection", id: null, name: c.name, can: !c.bonded,
      why: c.bonded ? "bonded already" : c.full ? "relationship full: ready" : `relationship ${progressText(c.ticks)}: at worse odds`,
    }));
    const can = forge.some(t => t.can);
    set("forge_a_bond", {
      can, targets: forge,
      why: can ? forge.filter(t => t.can).map(t => `${quoted(t.name)} (${t.why})`).join(", ")
        : `every connection of ${who}'s is bonded already: develop_your_relationship instead`,
    });
  }
  set("make_a_connection", {
    can: true,
    why: connections.length
      ? `anyone who is not yet ${who}'s connection (${connections.map(c => c.name).join(", ")} already ${connections.length === 1 ? "is" : "are"})`
      : "anyone who is not yet a connection",
  });

  // The vows: the speaker's own, else the table's.
  const vows = Array.isArray(sheet?.vows) ? sheet.vows : [];
  const others = Array.isArray(s.othersVows) ? s.othersVows : [];
  for (const id of VOW_MOVES) {
    if (vows.length) set(id, { can: true, why: vows.map(v => `${quoted(v.name)} (${[v.rank, progressText(v.ticks)].filter(Boolean).join(", ")})`).join(", ") });
    else if (others.length) set(id, { can: true, why: `${who} holds no open vow; the table's: ${others.map(v => `${quoted(v.name)} (${v.owner})`).join(", ")}` });
    else if (!sheet) set(id, { can: true, why: "the speaker's vows are unknown" });
    else set(id, { can: false, why: "no vow is open: swear_an_iron_vow makes one" });
  }

  // What an Explore a Waypoint roll's match makes — never a line.
  for (const id of ["make_a_discovery", "confront_chaos"]) set(id, { can: false, why: "made by an Explore a Waypoint roll's match, not by a line" });

  // The party and the companions.
  const party = Array.isArray(s.party) ? s.party : [];
  if (party.length) set("aid_your_ally", { can: true, why: party.map(p => p.name).join(", "), targets: party.map(p => ({ kind: "ally", id: p.actorId ?? null, name: p.name, can: true })) });
  else set("aid_your_ally", { can: false, why: "no other player character is here to aid" });
  const companions = Array.isArray(s.companions) ? s.companions : [];
  if (sheet && !companions.length) set("companion_takes_a_hit", { can: false, why: `${who} has no companion` });

  // The recovery moves, per target.
  if (sheet) recovery(set, s, { who, party, companions });

  // Every other move of the catalogue: no precondition the stand-in knows.
  for (const id of CATALOGUE_MOVE_IDS) if (!out.has(id)) set(id, { can: true, why: "" });
  const list = CATALOGUE_MOVE_IDS.filter(id => out.has(id)).map(id => out.get(id));
  // A roll was asked for (or the move is chosen): only a remap is a "cannot".
  return mode === OPEN ? list : list.map(e => (e.can || e.instead ? e : { ...e, can: true }));
}

/** Heal, Hearten, Resupply and Repair on the speaker's sheet (nothingToRecover). */
function recovery(set, s, { who, party, companions }) {
  const sheet = s.sheet;
  const { meters, impacts, vehicle } = sheet;

  // Heal: the speaker, and whoever else the care could be for.
  const health = meterText("health", meters.health, impacts.wounded, "wounded");
  const selfWhole = nothingToRecover("heal", s);
  const elsewhere = [
    ...party.map(p => {
      const known = Number.isFinite(p.health);
      return { kind: "ally", id: p.actorId ?? null, name: p.name, can: !(known && p.health >= 5 && p.wounded === false),
        ...(known ? { why: meterText("health", p.health, p.wounded, "wounded") } : {}) };
    }),
    ...companions.map(c => ({ kind: "companion", id: null, name: c.given ? `${c.name} "${c.given}"` : c.name, can: true })),
  ];
  const targets = [{ kind: "self", id: s.speaker?.actorId ?? null, name: who, can: !selfWhole, why: health }, ...elsewhere];
  const others = elsewhere.filter(t => t.can).map(named);
  if (!selfWhole) set("heal", { can: true, targets, why: [`${who} (${health})`, ...others].join(", ") });
  else if (others.length) set("heal", { can: true, targets, why: `not ${who} (${health}); ${others.join(", ")}` });
  else set("heal", { can: false, targets, why: `${health}, and nobody else ${elsewhere.length ? "is hurt" : "to treat"}: nothing to heal` });

  // Hearten: the speaker's own spirit.
  const spirit = meterText("spirit", meters.spirit, impacts.shaken, "shaken");
  set("hearten", nothingToRecover("hearten", s) ? { can: false, why: `${spirit}: nothing to recover` } : { can: true, why: spirit });

  // Resupply and Repair: told, never refused by the sheet (an item, a device).
  const supply = meterText("supply", meters.supply, impacts.unprepared, "unprepared");
  set("resupply", nothingToRecover("resupply", s)
    ? { can: false, why: `${supply}: nothing to restock, unless the line is after one particular item` }
    : { can: true, why: supply });
  if (vehicle) {
    const integrity = meterText("integrity", vehicle.integrity, vehicle.battered, "battered", vehicle.max);
    const ship = vehicle.name ? quoted(vehicle.name) : "the command vehicle";
    set("repair", nothingToRecover("repair", s)
      ? { can: false, why: `${ship} is at ${integrity}: nothing to mend on her, unless the line is about another vehicle, a module, a companion or a device` }
      : { can: true, why: `${ship} (${integrity})` });
  }
}

/**
 * The gate, after the reading: may this move be made now? It refuses only
 * what today's code refuses before the roll — the open reading's Hearten,
 * and Heal with nobody else to treat, by the sheet alone — and remaps what
 * it remaps: the position pair, and a scene-challenge variant with no
 * challenge open or whose own challenge has ended. Everything else is told
 * to the reader, not refused here: the which-track, vow-gone and bonded-forge
 * checks stay where they are (readMove, rollMove).
 *
 * @param {string} moveId
 * @param {ReturnType<import("./readerSituation.js").readLineSituation>} situation
 * @param {{ mode?: "open"|"roll"|"chosen", targetId?: string|null }} [opts] — `targetId`:
 *   the scene challenge a variant names, by id
 * @returns {{ ok: boolean, why: string, instead: string|null }}
 */
export function checkMove(moveId, situation, { mode = OPEN, targetId = null } = {}) {
  const ok = { ok: true, why: "", instead: null };
  if (typeof moveId !== "string" || !MOVES[moveId]) return ok;
  const s = situation ?? {};

  const position = s.position ?? null;
  const swap = position ? POSITION_REMAP[position]?.[moveId] ?? null : null;
  if (swap) return { ok: false, why: `${nameOf(s)} is ${POSITION_WORDS[position]}`, instead: swap };

  if (SCENE_CHALLENGE_VARIANTS[moveId]) {
    const ordinary = moveOutsideSceneChallenge(moveId, Array.isArray(s.challenges) ? s.challenges : [], { trackId: targetId });
    if (ordinary !== moveId) return { ok: false, why: targetId ? "its scene challenge has ended" : "no scene challenge is open", instead: ordinary };
  }

  if (mode !== OPEN || !s.sheet) return ok;
  const { meters, impacts } = s.sheet;
  if (moveId === "hearten" && nothingToRecover("hearten", s)) {
    return { ok: false, why: `${meterText("spirit", meters.spirit, impacts.shaken, "shaken")}: nothing to recover`, instead: null };
  }
  if (moveId === "heal" && nothingToRecover("heal", s, { sheetAlone: true })) {
    return { ok: false, why: `${meterText("health", meters.health, impacts.wounded, "wounded")}, and nobody else to treat: nothing to heal`, instead: null };
  }
  return ok;
}

/**
 * STARFORGED COMPANION
 * src/moves/battleStations.js — Battle Stations! shipboard-combat framework.
 *
 * "Battle Stations!" is a Chapter-3 rulebook section (Ironsworn: Starforged
 * pp. 184–187), NOT a move. It frames shipboard/starship combat with a crew:
 * the standard combat moves apply, but position is tracked *per character* and
 * Aid Your Ally hands control between crew. The rulebook is explicit that there
 * are "no strict shipboard combat roles," but lists 11 example crew tasks a PC,
 * companion, or ally can adopt and switch between as the fight develops.
 *
 * This module is PURE (no Foundry globals). It exposes:
 *   - the canonical 11 roles (SHIPBOARD_ROLES),
 *   - the narrator guidance block (buildShipboardCombatGuidance),
 *   - the injection predicate (shouldInjectShipboardGuidance),
 *   - the `!stations` command matcher + play-aid card renderer.
 * The narrator wiring (detect active combat + command vehicle) lives in
 * narrator.js; the chat-command IO lives in index.js. Both consume the pure
 * functions here so the logic stays unit-testable.
 *
 * A richer ship-map "battle stations" mini-game is planned — see
 * issue #216 (Shipboard Combat (Battle Stations!)).
 */

const MODULE_ID = "starforged-companion";

/**
 * The 11 example shipboard-combat tasks (rulebook p. 185). Verbatim glosses.
 * Order matches the rulebook (alphabetical).
 */
export const SHIPBOARD_ROLES = [
  { id: "command",        label: "Command",        description: "Coordinate, make plans, provide motivation or comfort" },
  { id: "countermeasures",label: "Countermeasures",description: "Deploy electronic countermeasures, defend against incoming missiles" },
  { id: "damage_control", label: "Damage Control", description: "Resist damage, suppress fires, patch hull breaches, fix systems, tend to mechanical companions" },
  { id: "engineering",    label: "Engineering",    description: "Tune engines, manage power, bypass failing systems" },
  { id: "escort",         label: "Escort",         description: "Operate a support vehicle" },
  { id: "gunnery",        label: "Gunnery",        description: "Energize or ready weapons, lock on targets, fire weapons" },
  { id: "infantry",       label: "Infantry",       description: "Repel boarders, launch raids against enemy vessels" },
  { id: "medical",        label: "Medical",        description: "Tend to the wounded" },
  { id: "piloting",       label: "Piloting",       description: "Maneuver to get in position, line up a shot, evade incoming fire, avoid obstacles, pursue or escape targets" },
  { id: "sensors",        label: "Sensors",        description: "Survey surroundings, scan foes, track and identify targets, plot navigation paths" },
  { id: "systems",        label: "Systems",        description: "Manage communications, jam or hack enemy systems, defend against electronic threats" },
];

/**
 * Keyword signal that an active fight is shipboard (the foe / objective is a
 * vessel). Used as the positive trigger when the ship's mobility state isn't
 * available. Conservative — a generic foe label ("cult enforcers") won't match,
 * so we under-inject rather than push shipboard framing into a planetside brawl.
 */
const SHIP_COMBAT_KEYWORDS =
  /\b(ships?|starships?|vessels?|vehicles?|fleets?|frigates?|cruisers?|corvettes?|fighters?|gunships?|destroyers?|dreadnoughts?|carriers?|interceptors?|raiders?|pirates?|privateers?|boarding|boarders?|armadas?|squadrons?|drones?|warships?)\b/i;

/**
 * Decide whether to inject the shipboard-combat guidance block into the
 * narrator prompt. Pure — the caller supplies the detected combat track and the
 * command-vehicle name.
 *
 * Injects when a fight is active aboard the crew's ship: there must be an open
 * combat track AND a command vehicle, AND a positive shipboard signal —
 * the ship is underway (`opts.underway`), the combat track names a vessel, or
 * the caller forces it (`opts.force`).
 *
 * @param {{ completed?:boolean, label?:string }|null} combatTrack
 * @param {string|null} commandVehicleName
 * @param {{ underway?:boolean, force?:boolean }} [opts]
 * @returns {boolean}
 */
export function shouldInjectShipboardGuidance(combatTrack, commandVehicleName, opts = {}) {
  if (!combatTrack || combatTrack.completed) return false;
  if (!commandVehicleName || !String(commandVehicleName).trim()) return false;
  if (opts.force === true || opts.underway === true) return true;
  return SHIP_COMBAT_KEYWORDS.test(String(combatTrack.label ?? ""));
}

/**
 * Build the narrator guidance block. Additive rules framing (mirrors the
 * NARRATOR_PERMISSIONS blocks) — it supplements, never replaces, the
 * per-move permission class.
 *
 * @param {{ shipName?:string|null }} [params]
 * @returns {string}
 */
export function buildShipboardCombatGuidance({ shipName = null } = {}) {
  const ship = shipName && String(shipName).trim()
    ? `the crew's ship, ${String(shipName).trim()}`
    : "the crew's starship or a support vehicle";

  const roleLines = SHIPBOARD_ROLES
    .map(r => `- ${r.label} — ${shortGloss(r.description)}`)
    .join("\n");

  return [
    "## SHIPBOARD COMBAT — BATTLE STATIONS",
    "",
    `This fight involves ${ship}. Resolve it with the normal combat moves —`,
    "there is no separate \"battle stations\" roll. Frame it this way:",
    "",
    "- Each character holds their OWN position (in control / in a bad spot) —",
    "  position is per crew member, not shared. A character in control envisions",
    "  proactive moves (Gain Ground, Strike); one in a bad spot reacts and fights",
    "  back (React Under Fire, Clash). A character in control who directly supports",
    "  another uses Aid Your Ally, which can hand control to that ally.",
    "- Suffer moves (harm, stress, vehicle damage) and recover moves come into play",
    "  as the crew takes hits.",
    "- There are no fixed roles — crew take and switch shipboard tasks as the fight",
    "  develops (drop out of a gun turret to fight an engine-room fire). Solo players",
    "  jump between or prioritise stations.",
    "",
    "Ground crew actions in these example stations when it helps the scene (do not",
    "force them, and do not invent a station the fiction doesn't call for):",
    roleLines,
  ].join("\n");
}

/** Trim a role description to its first clause for the compact narrator list. */
function shortGloss(desc) {
  const firstClause = String(desc).split(",")[0].trim();
  return firstClause || String(desc).trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// !stations chat command (player play-aid)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Match the `!stations` (alias `!battlestations` / `!battle-stations`) command.
 * Re-posts of our own card are excluded via the card flag.
 */
export function isBattleStationsCommand(message) {
  const text = message?.content?.trim() ?? "";
  if (message?.flags?.[MODULE_ID]?.battleStationsCard) return false;
  return /^!(stations|battlestations|battle-stations)(\s|$)/i.test(text);
}

/**
 * Render the Battle Stations! play-aid card listing the 11 crew roles. Pure
 * HTML string; index.js posts it via ChatMessage.
 */
export function renderBattleStationsCardHtml() {
  const rows = SHIPBOARD_ROLES
    .map(r => `<tr><td><strong>${escapeHtml(r.label)}</strong></td><td>${escapeHtml(r.description)}</td></tr>`)
    .join("");
  return [
    `<div class="sf-card sf-card--battle-stations">`,
    `<div class="sf-card-header">⚔ Battle Stations!</div>`,
    `<div class="sf-card-body">`,
    `<p>Shipboard combat uses the normal combat moves. <strong>Position is tracked per character</strong>, and <strong>Aid Your Ally</strong> hands control between crew. There are no fixed roles — take a station that fits your character and switch as the fight develops.</p>`,
    `<table class="sf-battle-stations-roles"><tbody>${rows}</tbody></table>`,
    `<p><em>In control? Envision Gain Ground or Strike. In a bad spot? React Under Fire or Clash. Supporting a crewmate? Aid Your Ally.</em></p>`,
    `</div></div>`,
  ].join("");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

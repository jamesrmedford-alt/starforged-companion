/**
 * STARFORGED COMPANION
 * src/moves/situation.js — the speaking character's situation, as both readers are told it
 *
 * Two model calls read every typed line: the pacing reader (is it a move? —
 * src/pacing/classifier.js) and the move reader (which move, which stat —
 * src/moves/interpreter.js). Neither was told the character's meters, and the
 * pacing reader was told nothing of the vows or of how far a relationship had
 * come (the move reader was told the vows' names and the connections'
 * tracks). So, in the long haul's live runs and the readers' plain-line test
 * (test/ci/playwright/readers/runs/readers-live-20261124-0255/):
 *
 *   - Heal was offered and rolled at 5 health of 5 — "0 health (now 5)" for 2
 *     supply, twice (known-issues HEAL-ROLLED-AT-FULL-HEALTH);
 *   - "I now have proof the raids are fed by dock clerks selling cargo
 *     routes." was narrated with nothing offered, twelve readings of twelve:
 *     "the player states a conclusion… no action is attempted" — the reader
 *     did not know a vow was open (VOW-STEP-SAID-IN-FICTION-NOT-READ).
 *
 * This is the one block both are given, in the same words: the speaker's
 * health, spirit and supply, each with the impact its recovery move clears;
 * the command vehicle's integrity and whether it is battered; each open vow
 * with its rank, its progress and the connection it is sworn to; each
 * connection with its rank and its relationship track. One builder, so the
 * two readers cannot be told different things of the same sheet.
 *
 * Why here, in src/moves/: the block is what a move would change, and the
 * pacing reader already reads from src/moves/ (sceneChallenge.js). The move
 * reader importing from src/pacing/ would be a new edge the other way.
 *
 * Reads only — the sheet through src/character/actorBridge.js, the command
 * vehicle through src/entities/ship.js (getCommandVehicle: its STARSHIP
 * asset's Integrity track, the starship's native battered impact). No write,
 * no model call, and it never throws: what cannot be read is said to be
 * unknown.
 */

import { isPlayerCharacterActor, readCharacterSnapshot, readVows, readConnections } from "../character/actorBridge.js";
import { getCommandVehicle } from "../entities/ship.js";

const MODULE_ID = "starforged-companion";

/** The sheet's health, spirit and supply meters run 0–5. */
const METER_MAX = 5;
/** A progress track: ten boxes of four ticks. */
const TRACK_BOXES   = 10;
const TICKS_PER_BOX = 4;
const TRACK_TICKS   = TRACK_BOXES * TICKS_PER_BOX;
/** The most vows, and the most connections, the block lists. */
const LIST_CAP = 8;

/** What both readers are told when the speaker has no character sheet. */
const NO_SHEET_SITUATION =
  "SITUATION — no character sheet is known for the speaker: meters, vows and connections are unknown.";

const clean = (text) => String(text ?? "").replace(/["\r\n]+/g, " ").replace(/\s+/g, " ").trim();
const whole = (value) => (value !== null && value !== "" && Number.isFinite(Number(value)) ? Math.round(Number(value)) : null);
const ticksOf = (value) => Math.max(0, Math.min(TRACK_TICKS, whole(value) ?? 0));

/**
 * The speaking character's situation, as plain data — null for no player
 * character (a GM's line at a table of several, an NPC card).
 *
 * @param {Actor|null} actor — the speaker's character
 * @param {{ campaignState?: Object|null }} [opts] — for the command vehicle (campaignState.shipIds)
 * @returns {{
 *   name: string,
 *   meters:  { health: number|null, spirit: number|null, supply: number|null },
 *   impacts: { wounded: boolean|null, shaken: boolean|null, unprepared: boolean|null },
 *   vehicle: { name: string, integrity: number|null, max: number, battered: boolean }|null,
 *   vows: Array<{ name: string, rank: string, ticks: number, swornTo: string|null }>,
 *   connections: Array<{ name: string, rank: string, ticks: number, bonded: boolean, full: boolean }>,
 * }|null}
 */
function readSituation(actor, { campaignState = null } = {}) {
  let isPc = false;
  try { isPc = isPlayerCharacterActor(actor); } catch { isPc = false; }
  if (!isPc) return null;

  const situation = {
    name:    clean(actor.name) || "The character",
    meters:  { health: null, spirit: null, supply: null },
    impacts: { wounded: null, shaken: null, unprepared: null },
    vehicle: null,
    vows: [],
    connections: [],
  };
  const unread = (what, err) =>
    console.warn(`${MODULE_ID} | situation: ${situation.name}'s ${what} could not be read — told to the readers as unknown:`, err?.message ?? err);

  try {
    const sheet = readCharacterSnapshot(actor);
    for (const key of Object.keys(situation.meters))  situation.meters[key]  = whole(sheet?.meters?.[key]);
    for (const key of Object.keys(situation.impacts)) situation.impacts[key] = sheet?.debilities ? sheet.debilities[key] === true : null;
  } catch (err) { unread("meters", err); }

  try {
    const ship = getCommandVehicle(campaignState ?? {});
    if (ship) {
      situation.vehicle = {
        name:      clean(ship.name),
        integrity: whole(ship.integrity),
        max:       whole(ship.integrityMax) ?? METER_MAX,
        battered:  ship.battered === true,
      };
    }
  } catch (err) { unread("command vehicle", err); }

  try {
    situation.vows = readVows(actor)
      .filter(v => v && !v.completed && clean(v.name))
      .map(v => ({ name: clean(v.name), rank: clean(v.rank), ticks: ticksOf(v.ticks), swornTo: clean(v.linkedConnectionName) || null }));
  } catch (err) { unread("vows", err); }

  try {
    situation.connections = readConnections(actor)
      .filter(c => c && !c.lost && clean(c.name))
      .map((c) => {
        const ticks  = ticksOf(c.ticks);
        const bonded = c.completed === true;
        return { name: clean(c.name), rank: clean(c.rank), ticks, bonded, full: !bonded && ticks >= TRACK_TICKS };
      });
  } catch (err) { unread("connections", err); }

  return situation;
}

/** "3 of 10 boxes", or "3 of 10 boxes and 2 ticks" for a track part-way through a box. */
function progress(ticks) {
  const boxes = Math.floor(ticks / TICKS_PER_BOX);
  const extra = ticks % TICKS_PER_BOX;
  return `${boxes} of ${TRACK_BOXES} boxes${extra ? ` and ${extra} tick${extra === 1 ? "" : "s"}` : ""}`;
}

/** "Health 5 of 5 (full, not wounded)" — a meter beside the impact its recovery move clears. */
function meter(label, value, marked, impact, max = METER_MAX) {
  if (value === null) return `${label} unknown`;
  const notes = [
    value >= max ? "full" : null,
    marked === null ? null : marked ? impact : `not ${impact}`,
  ].filter(Boolean);
  return `${label} ${value} of ${max}${notes.length ? ` (${notes.join(", ")})` : ""}`;
}

function capped(items) {
  if (items.length <= LIST_CAP) return items.join("; ");
  return `${items.slice(0, LIST_CAP).join("; ")}; +${items.length - LIST_CAP} more`;
}

/**
 * The situation as the block both readers' prompts carry. Pure: the same
 * data gives the same text.
 *
 * @param {ReturnType<typeof readSituation>} situation
 * @returns {string}
 */
function renderSituation(situation) {
  if (!situation) return NO_SHEET_SITUATION;
  const { meters, impacts, vehicle } = situation;
  const vows = situation.vows.map(v =>
    `"${v.name}" (${[v.rank, progress(v.ticks)].filter(Boolean).join(", ")}${v.swornTo ? `; sworn to ${v.swornTo}` : ""})`);
  const connections = situation.connections.map((c) => {
    const track = c.bonded
      ? "bonded"
      : `relationship ${progress(c.ticks)}${c.full ? " — full, no bond forged yet" : ""}`;
    return `"${c.name}" (${[c.rank, track].filter(Boolean).join(", ")})`;
  });
  return [
    `SITUATION — ${situation.name}'s sheet as it stands:`,
    `- Meters: ${[
      meter("Health", meters.health, impacts.wounded, "wounded"),
      meter("Spirit", meters.spirit, impacts.shaken, "shaken"),
      meter("Supply", meters.supply, impacts.unprepared, "unprepared"),
    ].join("; ")}.`,
    vehicle
      ? `- Command vehicle: ${vehicle.name ? `"${vehicle.name}", ` : ""}${meter("integrity", vehicle.integrity, vehicle.battered, "battered", vehicle.max)}.`
      : "- Command vehicle: none recorded.",
    `- Open vows: ${vows.length ? capped(vows) : "none"}.`,
    `- Connections: ${connections.length ? capped(connections) : "none"}.`,
  ].join("\n");
}

/**
 * The block for a speaker, read and rendered: what the pacing reader's
 * CHARACTER section and the move reader's context both carry.
 *
 * @param {Actor|null} actor — the speaker's character
 * @param {{ campaignState?: Object|null }} [opts]
 * @returns {string}
 */
export function buildSituationBlock(actor, opts = {}) {
  return renderSituation(readSituation(actor, opts));
}

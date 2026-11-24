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
 * Reads only — the sheet through src/character/actorBridge.js, live (its
 * meters and impacts are not taken from the cached snapshot), the command
 * vehicle through src/entities/ship.js (getCommandVehicle: its STARSHIP
 * asset's Integrity track, the starship's native battered impact). No write,
 * no model call, and it never throws: what cannot be read is said to be
 * unknown, and an unknown is never "nothing to recover".
 *
 * Where code decides instead of a reader (nothingToRecover): a recovery move
 * the sheet has nothing for is not offered by the pacing router
 * (src/pacing/router.js decidePacing) and is not rolled or offered by the
 * move pipeline (src/moves/movePipeline.js readMove). The readers' rules say
 * the same of the same block.
 */

import {
  isPlayerCharacterActor, getPlayerActors, readMeters, readDebilities, readVows, readConnections, listCompanionAssets,
} from "../character/actorBridge.js";
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
 *   othersToTreat: number|null,
 * }|null} `othersToTreat`: the other player characters and the speaker's
 *   companions — who else a Heal of theirs could be for. Not in the block:
 *   it is for nothingToRecover.
 */
export function readSituation(actor, { campaignState = null } = {}) {
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
    othersToTreat: null,
  };
  const unread = (what, err) =>
    console.warn(`${MODULE_ID} | situation: ${situation.name}'s ${what} could not be read — told to the readers as unknown:`, err?.message ?? err);

  // Read live (never the cached snapshot): a recovery move is held back on
  // what this says, and a sheet edited a moment ago must be what it says.
  try {
    const meters = readMeters(actor);
    for (const key of Object.keys(situation.meters)) situation.meters[key] = whole(meters?.[key]);
  } catch (err) { unread("meters", err); }
  try {
    const impacts = readDebilities(actor);
    for (const key of Object.keys(situation.impacts)) situation.impacts[key] = impacts?.[key] === true;
  } catch (err) { unread("impacts", err); }

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

  try {
    situation.othersToTreat = getPlayerActors().filter(a => a?.id !== actor.id).length + listCompanionAssets(actor).length;
  } catch (err) { unread("allies and companions", err); }

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

// ─────────────────────────────────────────────────────────────────────────────
// Where code decides: a recovery move with nothing to recover
// ─────────────────────────────────────────────────────────────────────────────

/** The moves that restore a meter or clear its impact — the ones nothingToRecover answers for. */
const RECOVERY_MOVES = new Set(["heal", "hearten", "resupply", "repair"]);

const isFull = (value, max = METER_MAX) => Number.isFinite(value) && value >= max;

/** Whether `moveId` is one of the recovery moves nothingToRecover answers for. */
export function isRecoveryMove(moveId) {
  return RECOVERY_MOVES.has(moveId);
}

/**
 * Whether `moveId` is a recovery move the sheet shows nothing for: Heal with
 * health full and not wounded, Hearten with spirit full and not shaken,
 * Resupply with supply full and not unprepared, Repair with the command
 * vehicle's integrity full and it not battered. In live play a Heal at 5
 * health of 5 was offered, pressed and rolled — "0 health (now 5)" for 2
 * supply — twice (known-issues HEAL-ROLLED-AT-FULL-HEALTH).
 *
 * The readers are told the same in their rules; this is for the places code
 * decides. Anything unknown is not "nothing": an unread meter, no command
 * vehicle, no sheet. Any other move: false.
 *
 * `sheetAlone` — only the sheet speaks for it: no reader has read the line as
 * no move. Then it answers only where the sheet settles the question:
 * Hearten (the character's own spirit), and Heal when there is nobody else
 * the care could be for — no other player character, no companion. A
 * Resupply can still be after one particular item, and a Repair for a
 * support vehicle, a module, a companion or a device; the meters show none of
 * those, so they are left to the readers.
 *
 * @param {string|null} moveId
 * @param {ReturnType<typeof readSituation>} situation
 * @param {{ sheetAlone?: boolean }} [opts]
 * @returns {boolean}
 */
export function nothingToRecover(moveId, situation, { sheetAlone = false } = {}) {
  if (!situation || !RECOVERY_MOVES.has(moveId)) return false;
  const { meters, impacts, vehicle } = situation;
  switch (moveId) {
    case "heal":
      return isFull(meters.health) && impacts.wounded === false && (!sheetAlone || situation.othersToTreat === 0);
    case "hearten":
      return isFull(meters.spirit) && impacts.shaken === false;
    case "resupply":
      return !sheetAlone && isFull(meters.supply) && impacts.unprepared === false;
    case "repair":
      return !sheetAlone && !!vehicle && isFull(vehicle.integrity, vehicle.max) && vehicle.battered === false;
    default:
      return false;
  }
}

/**
 * Why there is nothing to recover, for a rationale or a telemetry line —
 * "health is full and no wound is marked".
 *
 * @param {string} moveId — a recovery move nothingToRecover answered true for
 * @returns {string}
 */
export function nothingToRecoverReason(moveId) {
  return ({
    heal:     "health is full and no wound is marked",
    hearten:  "spirit is full and the character is not shaken",
    resupply: "supply is full and the character is not unprepared",
    repair:   "the command vehicle's integrity is full and it is not battered",
  })[moveId] ?? "there is nothing to recover";
}

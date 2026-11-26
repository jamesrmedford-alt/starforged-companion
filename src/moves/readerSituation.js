/**
 * STARFORGED COMPANION
 * src/moves/readerSituation.js — the whole situation a typed line is read against
 *
 * Two model calls read every typed line before the switch, and neither was
 * told what the other was: the pacing classifier the dials, the scene frame,
 * the charted places and a fight's bare "COMBAT STATUS: ACTIVE"; the move
 * interpreter the sheet, the other characters' vows, the open tracks, the
 * vehicles and companions and a combat-position directive. The line reader
 * (src/moves/reader.js) is one call, told the whole of it (issue #384 —
 * decisions.md → "Overhauls 1 and 4"). This module is what it is told of the
 * situation, read once a line; what can be made in it is the move contracts'
 * to say (src/moves/contracts/available.js, over the gate's own read,
 * moves/situation.js readMoveSituation), so the reader is never told a move
 * can be made that the gate would refuse.
 *
 *   - the speaker's sheet: src/moves/situation.js readSituation (meters and
 *     impacts, the command vehicle, the open vows, the connections) — null
 *     for no player character;
 *   - the party (the other player characters), their open vows, the
 *     speaker's support vehicles and companions;
 *   - the open fights with the speaker's own position in each, the scene
 *     challenges and the expeditions (src/ui/progressTracks.js
 *     listOpenProgressTracks — synchronous, read-only, any client);
 *   - the scene as the narrator holds it (narration/narratorPrompt.js
 *     sceneForReading: the place, the ship's position, the scene frame, with
 *     the table's new names) — else the current location, the ship's position
 *     line (factContinuity/shipPosition.js) and the frame read here — the
 *     current site, the X-Card;
 *   - the charted places Set a Course is for.
 *
 * Why its own module, beside situation.js: situation.js is the move
 * contracts' own situation (readMoveSituation, the gate's); this is the
 * reader's telling. The current location and the charted places are read as
 * the retired pacing classifier read them (formatScene, formatChartedPlaces);
 * the reader is their one reader now.
 *
 * Reads only, live, and it never throws: a part that cannot be read is told
 * as unknown, and an unknown is never "nothing to recover" (situation.js).
 */

import {
  isPlayerCharacterActor, getPlayerActors, readVows, listSupportVehicleAssets,
  listCompanionAssets, companionGivenName,
} from "../character/actorBridge.js";
import { readSituation } from "./situation.js";
import { listOpenProgressTracks } from "../ui/progressTracks.js";
import { combatPositionFor, isTrackPosition } from "./combat.js";
import { getCommandVehicle } from "../entities/ship.js";
import { formatShipPositionLine } from "../factContinuity/shipPosition.js";
import { getCurrentSiteKind } from "../entities/location.js";
import { sceneForReading, formatSceneForReading } from "../narration/narratorPrompt.js";
import { elsewhereOf } from "../factContinuity/whereabouts.js";

const MODULE_ID = "starforged-companion";

/** A progress track: ten boxes of four ticks. */
const TRACK_BOXES   = 10;
const TICKS_PER_BOX = 4;
const TRACK_TICKS   = TRACK_BOXES * TICKS_PER_BOX;
const METER_MAX     = 5;
/** The most of any one list the block names. */
const LIST_CAP = 8;
/** The most charted places named (as the retired pacing classifier capped them). */
const CHARTED_PLACES_CAP = 12;

const clean = (text) => String(text ?? "").replace(/["\r\n]+/g, " ").replace(/\s+/g, " ").trim();
const whole = (value) => (value !== null && value !== "" && Number.isFinite(Number(value)) ? Math.round(Number(value)) : null);
const ticksOf = (value) => Math.max(0, Math.min(TRACK_TICKS, whole(value) ?? 0));

/**
 * The situation a line is read against — plain data, never null.
 *
 * @param {Actor|null} actor — the speaker's character (none: a GM's line at a table of several)
 * @param {{ campaignState?: Object|null }} [opts]
 * @returns {{
 *   speaker: { actorId: string, name: string }|null,
 *   sheet: ReturnType<typeof readSituation>,
 *   party: Array<{ actorId: string, name: string }>,
 *   othersVows: Array<{ name: string, owner: string }>,
 *   vehicles: string[],
 *   companions: Array<{ name: string, given: string|null }>,
 *   fights: Array<{ id: string, label: string, rank: string, ticks: number, position: "in_control"|"bad_spot"|null }>,
 *   position: "in_control"|"bad_spot"|null,
 *   challenges: Array<{ id: string, label: string, rank: string, ticks: number, type: "scene_challenge", completed: false }>,
 *   expeditions: Array<{ id: string, label: string, rank: string, ticks: number }>,
 *   place: { name: string, type: string }|null,
 *   ship: string|null,
 *   frame: { where: string|null, present: string[], now: string|null }|null,
 *   site: { kind: string, name: string, status: string }|null,
 *   xCard: boolean,
 *   charted: { shown: string[], more: number },
 *   unread: string[],
 * }} `position`: the speaker's one position across the open fights, as
 *   getActiveCombatPosition reads it — their own where every fight that
 *   records one agrees, else the only fight's — null out of a fight or when
 *   it cannot be told which applies; the reader's position remap reads it
 *   (reader.js; the gate reads its own, readMoveSituation's
 *   tracks.rollerPosition). `unread`: the parts that could not be read (told
 *   as unknown).
 */
export function readLineSituation(actor, { campaignState = null, line = "" } = {}) {
  let isPc = false;
  try { isPc = isPlayerCharacterActor(actor); } catch { isPc = false; }
  const speaker = isPc ? { actorId: actor.id ?? null, name: clean(actor.name) || "The character" } : null;
  const situation = {
    speaker,
    sheet: isPc ? readSituation(actor, { campaignState }) : null,
    party: [], othersVows: [], vehicles: [], companions: [],
    fights: [], position: null, challenges: [], expeditions: [],
    place: null, ship: null, frame: null, scene: null, site: null, elsewhere: null, xCard: campaignState?.xCardActive === true,
    charted: { shown: [], more: 0 },
    unread: [],
  };
  const unread = (what, err) => {
    situation.unread.push(what);
    console.warn(`${MODULE_ID} | line situation: ${what} could not be read — told to the reader as unknown:`, err?.message ?? err);
  };

  // The party, and their open vows — the other player characters'.
  try {
    const own = new Set(isPc ? readVows(actor).filter(v => !v.completed && v.vowId).map(v => v.vowId) : []);
    for (const pc of getPlayerActors()) {
      if (isPc && pc?.id === actor.id) continue;
      situation.party.push({ actorId: pc.id, name: clean(pc.name) });
      for (const vow of readVows(pc)) {
        // A copy of a shared vow the speaker holds too is theirs already.
        if (vow.completed || !clean(vow.name) || (vow.vowId && own.has(vow.vowId))) continue;
        situation.othersVows.push({ name: clean(vow.name), owner: clean(pc.name) });
      }
    }
  } catch (err) { unread("the party", err); }

  // The speaker's support vehicles and companions, by name.
  if (isPc) {
    try {
      situation.vehicles = listSupportVehicleAssets(actor).map(i => clean(i.name)).filter(Boolean);
      situation.companions = listCompanionAssets(actor).map(c => ({ name: clean(c.name), given: clean(companionGivenName(c)) || null })).filter(c => c.name);
    } catch (err) { unread("the vehicles and companions", err); }
  }

  // The open tracks: fights (with the speaker's own position), scene challenges, expeditions.
  try {
    const open = listOpenProgressTracks();
    const actorId = speaker?.actorId ?? null;
    const combat = open.filter(t => t?.type === "combat");
    situation.fights = combat.map(t => ({
      id: t.id, label: clean(t.label) || "(unnamed)", rank: clean(t.rank), ticks: ticksOf(t.ticks), position: combatPositionFor(t, actorId),
    }));
    situation.position = positionAcross(combat, actorId);
    situation.challenges = open.filter(t => t?.type === "scene_challenge")
      .map(t => ({ id: t.id, label: clean(t.label) || "(unnamed)", rank: clean(t.rank), ticks: ticksOf(t.ticks), type: "scene_challenge", completed: false }));
    situation.expeditions = open.filter(t => t?.type === "expedition")
      .map(t => ({ id: t.id, label: clean(t.label) || "(unnamed)", rank: clean(t.rank), ticks: ticksOf(t.ticks) }));
  } catch (err) { unread("the open tracks", err); }

  try { situation.place = currentPlace(campaignState); } catch (err) { unread("the current location", err); }
  try {
    const ship = getCommandVehicle(campaignState ?? {});
    const line = ship ? formatShipPositionLine(ship.position, campaignState ?? {}, ship.name ?? "") : "";
    situation.ship = line ? line.replace(/^SHIP POSITION:\s*/, "").trim() || null : null;
  } catch (err) { unread("the ship's position", err); }
  const frame = campaignState?.sceneFrame;
  if (frame && typeof frame === "object") {
    const present = Array.isArray(frame.present) ? frame.present.map(clean).filter(Boolean) : [];
    // Heard or seen over a comm, not here in person (round 7's a57).
    const remote = Array.isArray(frame.remote) ? frame.remote.map(clean).filter(Boolean) : [];
    const where = clean(frame.location) || null;
    const now = clean(frame.situation) || null;
    if (where || present.length || remote.length || now) situation.frame = { where, present, remote, now };
  }
  situation.site = getCurrentSiteKind(campaignState ?? {});
  // The place, the ship and the frame as one read, with the table's new names
  // and what play let go — overhaul 2's renderer, the narrator's THE SCENE and
  // the pacing reader's before the switch (narratorPrompt.js sceneForReading).
  try {
    situation.scene = formatSceneForReading(sceneForReading(campaignState ?? {},
      { underway: situation.expeditions[0]?.label ?? "" })) || null;
  } catch (err) { unread("the scene", err); }
  try { situation.charted = chartedPlaces(campaignState); } catch (err) { unread("the charted places", err); }
  // What the line names elsewhere (issue #393 D5, D7): another place, or a person at one.
  situation.elsewhere = elsewhereOf(line, campaignState, { underway: situation.expeditions[0]?.label ?? "" });

  return situation;
}

/**
 * The speaker's one position across the open fights — progressTracks.js
 * getActiveCombatPosition's rule, over tracks already read: their own where
 * the fights that record one agree, else the only fight's last-set position.
 */
function positionAcross(fights, actorId) {
  if (actorId) {
    const own = new Set(fights.map(t => t?.positions?.[actorId]).filter(isTrackPosition));
    if (own.size === 1) return [...own][0];
  }
  if (fights.length !== 1) return null;
  return isTrackPosition(fights[0]?.combatState) ? fights[0].combatState : null;
}

/** The current location by its record's name (as the retired pacing classifier's formatScene read it). */
function currentPlace(campaignState) {
  const id = campaignState?.currentLocationId;
  const type = campaignState?.currentLocationType;
  if (!id || !type) return null;
  const actor = globalThis.game?.actors?.get?.(id);
  const entry = globalThis.game?.journal?.get?.(id);
  const data = actor?.flags?.[MODULE_ID]?.[type] ?? entry?.pages?.contents?.[0]?.flags?.[MODULE_ID]?.[type];
  const name = clean(data?.name ?? actor?.name ?? entry?.name);
  return name ? { name, type: clean(type) } : null;
}

/**
 * The charted, known places (as the retired pacing classifier's formatChartedPlaces read them): the
 * tracked settlements, planets and locations, the active sector's first,
 * without the sites still unexplored.
 */
function chartedPlaces(campaignState) {
  const places = [];
  const activeSectorId = campaignState?.activeSectorId ?? null;
  for (const [type, ids] of [["settlement", campaignState?.settlementIds], ["planet", campaignState?.planetIds], ["location", campaignState?.locationIds]]) {
    for (const id of Array.isArray(ids) ? ids : []) {
      const actor = globalThis.game?.actors?.get?.(id);
      const data = actor?.flags?.[MODULE_ID]?.[type];
      const name = clean(data?.name ?? actor?.name);
      if (!name) continue;
      if (type === "location" && String(data?.status ?? "").toLowerCase() === "unexplored") continue;
      places.push({ name, here: !!activeSectorId && data?.sectorId === activeSectorId });
    }
  }
  const unique = [...new Set([...places.filter(p => p.here), ...places.filter(p => !p.here)].map(p => p.name))];
  const shown = unique.slice(0, CHARTED_PLACES_CAP);
  return { shown, more: unique.length - shown.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// The block
// ─────────────────────────────────────────────────────────────────────────────

/** "3 of 10 boxes", or "3 of 10 boxes and 2 ticks" (situation.js's words). */
export function progressText(ticks) {
  const boxes = Math.floor(ticks / TICKS_PER_BOX);
  const extra = ticks % TICKS_PER_BOX;
  return `${boxes} of ${TRACK_BOXES} boxes${extra ? ` and ${extra} tick${extra === 1 ? "" : "s"}` : ""}`;
}

/** "Health 5 of 5 (full, not wounded)" (situation.js's words). */
function meterText(label, value, marked, impact, max = METER_MAX) {
  if (value === null || value === undefined) return `${label} unknown`;
  const notes = [value >= max ? "full" : null, marked === null || marked === undefined ? null : marked ? impact : `not ${impact}`].filter(Boolean);
  return `${label} ${value} of ${max}${notes.length ? ` (${notes.join(", ")})` : ""}`;
}

const capped = (items, sep = "; ") => (items.length <= LIST_CAP ? items.join(sep) : `${items.slice(0, LIST_CAP).join(sep)}${sep}+${items.length - LIST_CAP} more`);
const POSITION_WORDS = { in_control: "in control", bad_spot: "in a bad spot" };
const trackText = (t, extra = null) => `"${t.label}" (${[t.rank, progressText(t.ticks), extra].filter(Boolean).join(", ")})`;

/**
 * The situation as the reader's SITUATION block: the speaker's sheet in the
 * words both readers are told it today (situation.js renderSituation), then
 * what they are not both told — the vehicles and companions, the other
 * characters' vows, the open fights with the speaker's position, the scene
 * challenges and expeditions, the place, the scene frame, the charted places.
 * Pure: the same situation gives the same text.
 *
 * @param {ReturnType<typeof readLineSituation>} situation
 * @returns {string}
 */
export function buildReaderSituationBlock(situation) {
  const s = situation ?? {};
  const sheet = s.sheet ?? null;
  const who = s.speaker?.name ?? sheet?.name ?? null;
  const unknown = new Set(s.unread ?? []);
  const lines = [];
  if (sheet) {
    const { meters, impacts, vehicle } = sheet;
    const vows = sheet.vows.map(v => `"${v.name}" (${[v.rank, progressText(v.ticks)].filter(Boolean).join(", ")}${v.swornTo ? `; sworn to ${v.swornTo}` : ""})`);
    const connections = sheet.connections.map((c) => {
      const track = c.bonded ? "bonded" : `relationship ${progressText(c.ticks)}${c.full ? " — full, no bond forged yet" : ""}`;
      return `"${c.name}" (${[c.rank, track].filter(Boolean).join(", ")})`;
    });
    lines.push(
      `SITUATION — ${sheet.name}'s sheet as it stands:`,
      `- Meters: ${[
        meterText("Health", meters.health, impacts.wounded, "wounded"),
        meterText("Spirit", meters.spirit, impacts.shaken, "shaken"),
        meterText("Supply", meters.supply, impacts.unprepared, "unprepared"),
      ].join("; ")}.`,
      vehicle
        ? `- Command vehicle: ${vehicle.name ? `"${vehicle.name}", ` : ""}${meterText("integrity", vehicle.integrity, vehicle.battered, "battered", vehicle.max)}.`
        : "- Command vehicle: none recorded.",
      `- Open vows: ${vows.length ? capped(vows) : "none"}.`,
      `- Connections: ${connections.length ? capped(connections) : "none"}.`,
    );
    const companions = (s.companions ?? []).map(c => (c.given ? `"${c.name}" (named "${c.given}")` : `"${c.name}"`));
    lines.push(unknown.has("the vehicles and companions")
      ? "- Support vehicles and companions: unknown."
      : `- Support vehicles: ${(s.vehicles ?? []).length ? capped(s.vehicles.map(v => `"${v}"`), ", ") : "none"}. Companions: ${companions.length ? capped(companions, ", ") : "none"}.`);
  } else {
    lines.push("SITUATION — no character sheet is known for the speaker: meters, vows and connections are unknown.");
  }
  const others = (s.othersVows ?? []).map(v => `"${v.name}" (${v.owner})`);
  lines.push(unknown.has("the party") ? "- Other characters' open vows: unknown." : `- Other characters' open vows: ${others.length ? capped(others) : "none"}.`);

  if (unknown.has("the open tracks")) {
    lines.push("- Open fights, scene challenges and expeditions: unknown.");
  } else {
    const fights = (s.fights ?? []).map(f => trackText(f, f.position && who ? `${who} is ${POSITION_WORDS[f.position]}` : null));
    lines.push(
      `- Open fights: ${fights.length ? capped(fights) : "none"}.`,
      `- Scene challenges: ${(s.challenges ?? []).length ? capped(s.challenges.map(c => trackText(c))) : "none"}.`,
      `- Expeditions: ${(s.expeditions ?? []).length ? capped(s.expeditions.map(e => trackText(e))) : "none"}.`,
    );
  }

  const site = s.site ? ` Inside the ${s.site.kind} ${s.site.name ? `"${s.site.name}"` : "(unnamed)"}.` : "";
  if (s.scene) {
    // Overhaul 2's one read of the place, the ship and the frame.
    lines.push(s.scene);
    if (site) lines.push(`-${site}`);
  } else {
    const place = unknown.has("the current location") ? "unknown"
      : s.place ? `${s.place.name} (${s.place.type})` : "none recorded";
    lines.push(`- Place: ${place}.${site}${s.ship ? ` Ship: ${s.ship}.` : ""}`);
  }
  if (s.frame && !s.scene) {
    const parts = [
      s.frame.where ? `where: ${s.frame.where}` : null,
      s.frame.present?.length ? `present: ${capped(s.frame.present, ", ")}` : null,
      s.frame.remote?.length ? `over a comm, not here: ${capped(s.frame.remote, ", ")}` : null,
      s.frame.now ? `now: ${s.frame.now}` : null,
    ].filter(Boolean);
    lines.push(`- Scene — ${parts.join("; ")}.`);
  }
  const charted = s.charted ?? { shown: [], more: 0 };
  lines.push(unknown.has("the charted places") ? "- Charted places: unknown."
    : `- Charted places: ${charted.shown.length ? `${charted.shown.join(", ")}${charted.more ? `, +${charted.more} more` : ""}` : "none recorded"}.`);
  const away = s.elsewhere ?? null;
  if (away && ((away.people ?? []).length || (away.places ?? []).length)) {
    const parts = [
      ...(away.people ?? []).map(p => `${p.name} is ${p.where}, not here`),
      ...(away.places ?? []).map(p => `${p.name} is another place — reached only by a journey`),
    ];
    lines.push(`- Elsewhere: ${parts.join("; ")}.`);
  }
  if (s.xCard) lines.push("- The X-Card is active: the scene is paused.");
  return lines.join("\n");
}

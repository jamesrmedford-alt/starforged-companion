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
 * Where code decides instead of a reader: the move contracts' gate
 * (src/moves/contracts/gate.js checkMove) — a move the sheet, the tracks or
 * the table say cannot be made is not offered by the pacing router, not
 * rolled or offered by the move pipeline's reading, and not rolled at the
 * dice. It reads readMoveSituation below: this block's sheet, read the same
 * live way, with the open tracks, the scene and the table beside it. The
 * readers' rules say the same of the same block.
 */

import {
  isPlayerCharacterActor, getPlayerActors, readMeters, readDebilities, readVows, readConnections, listCompanionAssets,
  readMomentumState, listSupportVehicleAssets, readAssetIntegrity, readVehicleAssetBattered, companionGivenName,
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
 * }|null}
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

  return situation;
}

/** "3 of 10 boxes", or "3 of 10 boxes and 2 ticks" for a track part-way through a box. */
function progress(ticks) {
  const boxes = Math.floor(ticks / TICKS_PER_BOX);
  const extra = ticks % TICKS_PER_BOX;
  return `${boxes} of ${TRACK_BOXES} boxes${extra ? ` and ${extra} tick${extra === 1 ? "" : "s"}` : ""}`;
}

/**
 * A connection's standing in the sheet's words — the SITUATION block's, the
 * narrator's CHARACTER block's and the recap's WHERE THINGS STAND (one
 * wording for the readers, the narrator and the recap — TRACK-TOLD-AS-A-BOND:
 * with no bond forged, recaps said "that bond" and `@scene` "bonded" of a
 * full relationship track; overhaul 4). A connection is a bond Item on a
 * PC's sheet (FOLDER-002): its track is the relationship, its completion the
 * bond.
 *
 * @param {{ ticks?: number, progress?: number, bonded?: boolean, completed?: boolean, lost?: boolean }} c —
 *   a readConnections row, or the situation's; `progress` (boxes) where no ticks are given
 * @returns {string} "relationship 4 of 10 boxes" · "relationship 10 of 10 boxes — full, no bond forged yet" ·
 *   "bonded" · "lost — no longer a connection"
 */
export function connectionStanding(c) {
  if (c?.lost === true) return "lost — no longer a connection";
  if (c?.bonded === true || c?.completed === true) return "bonded";
  const ticks = ticksOf(Number.isFinite(Number(c?.ticks)) ? c.ticks : Number(c?.progress ?? 0) * TICKS_PER_BOX);
  return `relationship ${progress(ticks)}${ticks >= TRACK_TICKS ? " — full, no bond forged yet" : ""}`;
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
  const connections = situation.connections.map(c => `"${c.name}" (${[c.rank, connectionStanding(c)].filter(Boolean).join(", ")})`);
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
// The situation a move's contract reads (overhaul 4, "moves as contracts")
// ─────────────────────────────────────────────────────────────────────────────

/** A fight's stored position for a character: their own, else the fight's last-set one (moves/combat.js combatPositionFor's rule). */
const POSITIONS = new Set(["in_control", "bad_spot"]);
function positionFor(track, actorId) {
  const own = actorId ? track?.positions?.[actorId] : null;
  if (POSITIONS.has(own)) return own;
  return POSITIONS.has(track?.combatState) ? track.combatState : null;
}

/** A companion that is a machine — what Repair mends ("+1 mechanical companion health"). The asset carries no such field; its name says so. */
const MECHANICAL = /\b(bot|drone|droid|robot|automaton|android|mech|construct|probe|sentinel)\b/i;

/**
 * A player character's sheet as the contracts read it: meters, impacts,
 * companions, vehicles, vows and connections — every list as read, null when
 * it could not be (unknown is never nothing). Vows and connections keep the
 * closed and the severed ones, with their ids: a reason names a vow "already
 * fulfilled", and a move names its target by id. `own`: the roller — the
 * others at the table are read for their meters, impacts and vows alone.
 *
 * @param {Actor} actor — a player character
 * @param {{ campaignState: Object|null, people: Array<Object>|null, own: boolean }} opts
 */
function readRoller(actor, { campaignState, people, own }) {
  const name = clean(actor?.name) || "The character";
  const roller = {
    actorId: actor?.id ?? null, name,
    meters: { health: null, spirit: null, supply: null, momentum: null },
    impacts: { wounded: null, shaken: null, unprepared: null },
    companions: null, vehicles: null, vows: null, connections: null,
  };
  const unread = (what, err) =>
    console.warn(`${MODULE_ID} | move situation: ${name}'s ${what} could not be read — taken as unknown:`, err?.message ?? err);
  try {
    const meters = readMeters(actor);
    for (const key of ["health", "spirit", "supply"]) roller.meters[key] = whole(meters?.[key]);
  } catch (err) { unread("meters", err); }
  try { roller.meters.momentum = whole(readMomentumState(actor)?.value); } catch (err) { unread("momentum", err); }
  try {
    const impacts = readDebilities(actor);
    roller.impacts = Object.fromEntries(Object.entries(impacts ?? {}).map(([k, v]) => [k, v === true]));
  } catch (err) { unread("impacts", err); }
  try {
    roller.vows = readVows(actor).map(v => ({
      vowId: v.vowId ?? null, itemId: v.id ?? null, name: clean(v.name), rank: clean(v.rank), ticks: ticksOf(v.ticks),
      completed: v.completed === true, forsaken: v.forsaken === true, shared: v.shared === true,
      linkedConnectionName: clean(v.linkedConnectionName) || null,
    }));
  } catch (err) { unread("vows", err); }
  if (!own) return roller;
  try {
    roller.companions = listCompanionAssets(actor).map(item => ({
      itemId: item.id ?? null,
      name: clean(companionGivenName(item) ?? item.name) || "the companion",
      health: whole(item.system?.track?.value),
      max: whole(item.system?.track?.max) ?? METER_MAX,
      mechanical: MECHANICAL.test(`${item.name ?? ""} ${companionGivenName(item) ?? ""}`),
    }));
  } catch (err) { unread("companions", err); }
  try {
    const vehicles = [];
    const ship = getCommandVehicle(campaignState ?? {});
    if (ship) {
      vehicles.push({ id: ship._id ?? null, itemId: null, name: clean(ship.name), kind: "command",
        integrity: whole(ship.integrity), max: whole(ship.integrityMax) ?? METER_MAX, battered: ship.battered === true });
    }
    for (const item of listSupportVehicleAssets(actor)) {
      vehicles.push({ id: item.id ?? null, itemId: item.id ?? null, name: clean(item.name), kind: "support",
        integrity: whole(readAssetIntegrity(actor, item.id)), max: whole(item.system?.track?.max) ?? METER_MAX,
        battered: readVehicleAssetBattered(actor, item.id) === true });
    }
    roller.vehicles = vehicles;
  } catch (err) { unread("vehicles", err); }
  try {
    const hostOf = new Map((people ?? []).filter(p => p.connectionId).map(p => [p.connectionId, p.hostId]));
    roller.connections = readConnections(actor).map((c) => {
      const ticks  = ticksOf(c.ticks);
      const bonded = c.completed === true;
      return {
        hostId: (c.connectionId && hostOf.get(c.connectionId)) ?? null,
        connectionId: c.connectionId ?? null, itemId: c.id ?? null,
        name: clean(c.name), rank: clean(c.rank), ticks, bonded, lost: c.lost === true,
        full: !bonded && ticks >= TRACK_TICKS,
      };
    });
  } catch (err) { unread("connections", err); }
  return roller;
}

/**
 * The people the table has recorded: every NPC card in `connectionIds` — a
 * person, not a connection (FOLDER-002: every named individual has one) —
 * with the record's own id, which a PC's bond Item is keyed to.
 *
 * @param {Object|null} campaignState
 * @returns {Promise<Array<{ hostId: string, connectionId: string|null, name: string }>|null>}
 */
async function readPeople(campaignState) {
  try {
    const { getConnection } = await import("../entities/connection.js");
    const stored = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? null;
    const ids = [...new Set([...(campaignState?.connectionIds ?? []), ...(stored?.connectionIds ?? [])])];
    return ids.map((hostId) => {
      const record = getConnection(hostId);
      return record ? { hostId, connectionId: record._id ?? null, name: clean(record.name) } : null;
    }).filter(Boolean);
  } catch (err) {
    console.warn(`${MODULE_ID} | move situation: the recorded people could not be read — taken as unknown:`, err?.message ?? err);
    return null;
  }
}

/**
 * The open tracks, as the contracts read them: fights (with the roller's
 * position in each), expeditions, scene challenges, and the fights an Enter
 * the Fray offered that no one has begun (its threshold card, unanswered).
 * Null when the tracks cannot be read.
 *
 * @param {string|null} actorId — the roller
 * @returns {Promise<Object|null>}
 */
async function readTracks(actorId) {
  let all;
  try {
    const { listProgressTracks } = await import("../ui/progressTracks.js");
    all = await listProgressTracks();
    if (!Array.isArray(all)) return null;
  } catch (err) {
    console.warn(`${MODULE_ID} | move situation: the progress tracks could not be read — taken as unknown:`, err?.message ?? err);
    return null;
  }
  const open = all.filter(t => t && !t.completed);
  const openFights = open.filter(t => t.type === "combat");
  const base = (t) => ({ id: t.id ?? null, label: clean(t.label) || null, rank: clean(t.rank) || null, ticks: ticksOf(t.ticks) });
  const fights = openFights.map(t => ({
    ...base(t), position: positionFor(t, actorId), objective: clean(t.objective) || null, linkedVowName: clean(t.linkedVowName) || null,
  }));
  // The roller's position as getActiveCombatPosition reads it: their own
  // across the open fights when it is one, else the sole fight's.
  const own = new Set(actorId ? openFights.map(t => t.positions?.[actorId]).filter(p => POSITIONS.has(p)) : []);
  const rollerPosition = own.size === 1 ? [...own][0]
    : (openFights.length === 1 && POSITIONS.has(openFights[0].combatState) ? openFights[0].combatState : null);
  let fightsOffered = [];
  try {
    fightsOffered = (globalThis.game?.messages?.contents ?? [])
      .filter(m => m?.flags?.[MODULE_ID]?.combatThresholdCard === true && !m.flags[MODULE_ID].thresholdTaken)
      .map(m => ({ resolutionId: m.flags[MODULE_ID].resolutionId ?? null, label: clean(m.flags[MODULE_ID].label) || null,
        actorId: m.flags[MODULE_ID].actorId ?? null, cardId: m.id ?? null }));
  } catch (err) {
    console.warn(`${MODULE_ID} | move situation: the offered fights could not be read:`, err?.message ?? err);
  }
  return {
    fights, rollerPosition, fightsOffered,
    expeditions: open.filter(t => t.type === "expedition").map(t => ({ ...base(t), siteId: t.siteId ?? null })),
    sceneChallenges: open.filter(t => t.type === "scene_challenge").map(base),
  };
}

/**
 * Everything a move's contract reads, as plain data — the roller's sheet, the
 * other player characters, the recorded people, the open tracks, the scene
 * and the table — read live, never from a cached snapshot (a recovery move is
 * refused on what this says, and a sheet edited a moment ago must be what it
 * says). Never throws: what cannot be read is null, and the gate holds on an
 * unknown (moves/contracts/gate.js checkMove).
 *
 * @param {Actor|string|null} actorOrId — the roller's PC, or its id
 * @param {{ campaignState?: Object|null }} [opts]
 * @returns {Promise<{
 *   roller: Object|null, party: Array<Object>|null, people: Array<Object>|null,
 *   tracks: Object|null,
 *   scene: { sceneId: string|null, placeId: string|null, atSite: boolean|null, siteKind: string|null, combatActive: boolean|null },
 *   table: { pcCount: number|null, spokenToAFellowPc: ((line: string, speakerName: string|null) => boolean)|null },
 * }>}
 */
export async function readMoveSituation(actorOrId, { campaignState = null } = {}) {
  let actor = null;
  try {
    actor = typeof actorOrId === "string" ? (globalThis.game?.actors?.get?.(actorOrId) ?? null) : (actorOrId ?? null);
  } catch { actor = null; }
  const people = await readPeople(campaignState);
  let isPc = false;
  try { isPc = isPlayerCharacterActor(actor); } catch { isPc = false; }
  const roller = isPc ? readRoller(actor, { campaignState, people, own: true }) : null;

  let party = null;
  let pcCount = null;
  try {
    const pcs = getPlayerActors();
    pcCount = pcs.length;
    party = pcs.filter(a => a?.id !== roller?.actorId).map(a => readRoller(a, { campaignState, people, own: false }));
  } catch (err) {
    console.warn(`${MODULE_ID} | move situation: the other player characters could not be read — taken as unknown:`, err?.message ?? err);
  }

  const tracks = await readTracks(roller?.actorId ?? null);

  const scene = { sceneId: campaignState?.currentSceneId ?? null, placeId: campaignState?.currentLocationId ?? null,
    atSite: null, siteKind: null, combatActive: tracks ? tracks.fights.length > 0 : null };
  if (campaignState) {
    try {
      const { getCurrentSiteKind } = await import("../entities/location.js");
      const site = getCurrentSiteKind(campaignState);
      scene.atSite = !!site;
      scene.siteKind = site?.kind ?? null;
    } catch (err) {
      console.warn(`${MODULE_ID} | move situation: the current site could not be read — taken as unknown:`, err?.message ?? err);
    }
  }

  // The addressee test NOT_AT_A_PC asks of a line — the social moves' own
  // (narrator.js lineIsToAFellowPlayerCharacter, finding G), with the table's
  // PCs and the people it has recorded — loaded here, so the predicates
  // import no narrator (contracts/predicates.js).
  let spokenToAFellowPc = null;
  try {
    const { lineIsToAFellowPlayerCharacter } = await import("../narration/narrator.js");
    const pcActors = [roller, ...(party ?? [])].filter(Boolean).map(p => ({ name: p.name }));
    const npcNames = (people ?? []).map(p => p.name).filter(Boolean);
    // Asked as Compel: the test keys on the social moves, and a row that
    // requires NOT_AT_A_PC is one of them or reads the addressee the same way.
    spokenToAFellowPc = (line, speakerName) => lineIsToAFellowPlayerCharacter("compel", line, speakerName, { pcActors, npcNames });
  } catch (err) {
    console.warn(`${MODULE_ID} | move situation: the addressee test could not be loaded — taken as unknown:`, err?.message ?? err);
  }

  return { roller, party, people, tracks, scene, table: { pcCount, spokenToAFellowPc } };
}


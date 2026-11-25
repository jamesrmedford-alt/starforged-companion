/**
 * STARFORGED COMPANION
 * src/moves/contracts/predicates.js — what must be true before a move is made
 *
 * Overhaul 4, "moves as contracts" (slice 1). Each precondition a move's row
 * names (table.js MOVE_CONTRACTS) is one of these: a test over the situation
 * (situation.js readMoveSituation — the sheet, the open tracks, the scene and
 * the table, read live) and the reading (the move the line was read as, with
 * what the pipeline resolved — its target, its patient), with its reason and
 * its premise in words. The gate (gate.js checkMove) runs them; it is called
 * where a move is offered (the pacing router), where a line is read as one
 * (movePipeline.js readMove) and where the dice are thrown (rollAndApply) —
 * the roll is the authority.
 *
 *   test(situation, reading)  → true (holds) · false (fails) · null (cannot
 *                               tell — holds: an unknown is never a refusal)
 *   why(situation, reading)   → the reason, in plain words about the sheet —
 *                               said on the card, in the narration's NOT SO
 *                               line and (slice 6) to the reader
 *   premise(situation, reading) → what a line that sets about the move takes
 *                               for granted that is not so, and what the
 *                               narration must never show of it
 *   hard                      → nothing for the move to act on: refused, no
 *                               override. Soft: the sheet says the move would
 *                               change nothing — a typed line is narrated and
 *                               told, a GM may roll it anyway (D2)
 *   instead                   → the move made in its place (a reroute, never a
 *                               refusal) — POSITION, the scene-challenge twin
 *   offer                     → the move offered beside the refusal
 *   readerSettled             → the sheet cannot see all of it (one particular
 *                               item, a device): refused only where no reader
 *                               read the line as the move — an offer re-made
 *                               after a reading of no move (today's
 *                               `sheetAlone: false`)
 *   stages                    → where it is checked; default everywhere
 *
 * Two rules hold for every predicate: an unknown holds (a meter or a list not
 * read — the move is made), and a predicate reads the situation and the
 * reading, never the line's prose — save NOT_AT_A_PC, which keeps
 * lineIsToAFellowPlayerCharacter's lexical test of the addressee (narrator.js),
 * handed to it on the situation (`table.spokenToAFellowPc`, readMoveSituation):
 * this file imports no narrator — obligations.js reads the table, and the
 * narrator reads obligations.js.
 *
 * A predicate never throws: the gate catches a test that does, and holds.
 */

import { SCENE_CHALLENGE_VARIANTS, moveOutsideSceneChallenge } from "../sceneChallenge.js";
import { legacyTrackNamed } from "../statEnrichment.js";

/** The sheet's health, spirit and supply run 0–5. */
const METER_MAX = 5;
/** A progress track: ten boxes of four ticks. */
const TRACK_TICKS = 40;

/**
 * A precondition, frozen. `test` is required; `why` and `premise` default to
 * nothing said.
 *
 * @param {Object} spec
 * @returns {Readonly<Object>}
 */
function pre(spec) {
  if (typeof spec?.id !== "string" || typeof spec?.test !== "function") throw new Error("predicates: a precondition needs an id and a test");
  return Object.freeze({
    scope: "sheet", hard: false, instead: null, offer: null, readerSettled: false, stages: null,
    why: () => "", premise: () => null,
    ...spec,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the situation
// ─────────────────────────────────────────────────────────────────────────────

const lower = (s) => String(s ?? "").trim().toLowerCase();
const nameOf = (s) => s?.roller?.name || "The character";
const quoted = (name, fallback) => (String(name ?? "").trim() ? `"${String(name).trim()}"` : fallback);

/**
 * A name matched against a list by the bounded ladder (rules/reachability.md
 * §6): exact, then a whole word of it (a first or last name), never a guess
 * between several.
 *
 * @param {Array<{ name: string }>} list
 * @param {string|null} name
 * @returns {Object|null}
 */
function byName(list, name) {
  const wanted = lower(name).replace(/^the\s+/, "");
  if (!wanted || !Array.isArray(list)) return null;
  const exact = list.filter(x => lower(x?.name).replace(/^the\s+/, "") === wanted);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const words = (s) => lower(s).split(/[^a-z0-9'’-]+/i).filter(w => w.length >= 3);
  const parts = list.filter((x) => {
    const own = words(x?.name);
    const asked = words(wanted);
    return asked.length && asked.every(w => own.includes(w));
  });
  return parts.length === 1 ? parts[0] : null;
}

/** More than one of the list has exactly this name — byName's "none" that is not "no one". */
function namedMoreThanOnce(list, name) {
  const wanted = lower(name).replace(/^the\s+/, "");
  return !!wanted && Array.isArray(list) && list.filter(x => lower(x?.name).replace(/^the\s+/, "") === wanted).length > 1;
}

/** The roller's connections that are live (a bond Item not severed). */
const liveConnections = (s) => (Array.isArray(s?.roller?.connections) ? s.roller.connections.filter(c => !c.lost) : null);

/**
 * The connection the reading names among the roller's live ones: by its id
 * (a picker's host Actor id, the record's id or the bond Item's), else its
 * name; with neither, the sole one. `{ found, named }` — `named`: the reading
 * named someone (so a miss is "not their connection", not "no target").
 */
function namedConnection(s, r) {
  const live = liveConnections(s);
  if (!live) return { live: null, found: null, named: false, several: false };
  if (r?.targetId) {
    const found = live.find(c => c.hostId === r.targetId || c.connectionId === r.targetId || c.itemId === r.targetId) ?? null;
    return { live, found, named: true, several: false };
  }
  // Two of their connections share the name (a namesake): it names a
  // connection of theirs, not which — the move's own resolution picks.
  if (lower(r?.target)) return { live, found: byName(live, r.target), named: true, several: namedMoreThanOnce(live, r.target) };
  return { live, found: live.length === 1 ? live[0] : null, named: false, several: false };
}

/** Who the reading names, by name, for a reason: its target, else a known person's card. */
function personNamed(s, r) {
  if (lower(r?.target)) return String(r.target).trim();
  const card = r?.targetId ? (s?.people ?? []).find(p => p.hostId === r.targetId || p.connectionId === r.targetId) : null;
  return card?.name ?? "The person it named";
}

/** Every open vow the reading could act on: the roller's, or — for a table move — the party's when the roller holds none. */
function openVows(s, { own = false } = {}) {
  const mine = Array.isArray(s?.roller?.vows) ? s.roller.vows : null;
  if (!mine) return null;
  const open = mine.filter(v => !v.completed);
  if (open.length || own) return open;
  if (!Array.isArray(s?.party)) return open;
  return s.party.flatMap(p => (Array.isArray(p?.vows) ? p.vows : []).filter(v => !v.completed));
}

/** Every vow the reading's id could name: the roller's, then the party's. */
function anyVowById(s, id) {
  if (!id) return null;
  const all = [...(s?.roller?.vows ?? []), ...(s?.party ?? []).flatMap(p => p?.vows ?? [])];
  return all.find(v => v.itemId === id || v.vowId === id) ?? null;
}

/** The vow the reading names: by id, else by name, else the sole open one. */
function namedVow(s, r, { own = false } = {}) {
  const open = openVows(s, { own });
  if (!open) return { open: null, vow: null };
  if (r?.targetId) {
    const vow = anyVowById(s, r.targetId);
    return { open, vow };
  }
  if (lower(r?.target)) return { open, vow: byName(open, r.target) };
  return { open, vow: open.length === 1 ? open[0] : null };
}

/**
 * The roller's position in the fight the reading acts on: the named fight's
 * (their own there, else the fight's), else their own across the open fights
 * as getActiveCombatPosition reads it — null when it cannot be told.
 */
function rollerPosition(s, r) {
  const fights = s?.tracks?.fights;
  if (!Array.isArray(fights)) return null;
  if (r?.targetId) return fights.find(f => f.id === r.targetId)?.position ?? null;
  return s.tracks.rollerPosition ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tracks: fights, expeditions, scene challenges
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An open fight: the one the reading names by id, if any. While a threshold
 * card of the roller's waits, the reason names its button; else the move that
 * begins a fight is offered.
 */
export const OPEN_FIGHT = pre({
  id: "open-fight", scope: "tracks", hard: true,
  test: (s, r) => {
    const fights = s?.tracks?.fights;
    if (!Array.isArray(fights)) return null;
    return r?.targetId ? fights.some(f => f.id === r.targetId) : fights.length > 0;
  },
  why: (s, r) => {
    if (r?.targetId) return `${quoted(r?.target, "The fight it named")} was finished or deleted before the roll`;
    const offered = (s?.tracks?.fightsOffered ?? []).some(o => !o.actorId || o.actorId === s?.roller?.actorId);
    return offered
      ? `the fight is offered, not begun — ${nameOf(s)} has not pressed ⚔ Begin the fight on its card`
      : "no fight is under way";
  },
  premise: () => ({ claim: "a fight under way", never: "a blow struck, a shot fired or a foe engaged in a fight" }),
  offer: (s, r) => (r?.targetId || (s?.tracks?.fightsOffered ?? []).length ? null : "enter_the_fray"),
});

/**
 * The roller's position in the fight is `position` — else the move is made as
 * its same-position twin (Strike in a bad spot is a Clash). Unknown holds.
 *
 * @param {"in_control"|"bad_spot"} position
 * @param {{ instead: string }} opts
 */
export function POSITION(position, { instead }) {
  return pre({
    id: `position-${position}`, scope: "tracks",
    test: (s, r) => {
      const p = rollerPosition(s, r);
      return p ? p === position : null;
    },
    why: () => (position === "in_control" ? "the character is in a bad spot" : "the character is in control"),
    instead: () => instead,
  });
}

const TRACK_WORDS = Object.freeze({
  combat:          { none: "no fight is under way",             claim: "a fight under way",             offer: "enter_the_fray" },
  expedition:      { none: "no expedition is under way",        claim: "an expedition under way",       offer: "undertake_an_expedition" },
  scene_challenge: { none: "no scene challenge is under way",   claim: "a scene challenge under way",   offer: null },
});

/**
 * An open track of `type`: the one the reading names by id, if any. With
 * `onlyNamed`, only a track named by id is asked about (Battle names its
 * fight from an Enter the Fray card; one in a blur needs none).
 *
 * @param {"combat"|"expedition"|"scene_challenge"} type
 * @param {{ onlyNamed?: boolean }} [opts]
 */
export function OPEN_TRACK(type, { onlyNamed = false } = {}) {
  const words = TRACK_WORDS[type];
  const listOf = (s) => (type === "combat" ? s?.tracks?.fights : type === "expedition" ? s?.tracks?.expeditions : s?.tracks?.sceneChallenges);
  return pre({
    id: `open-track-${type}${onlyNamed ? "-named" : ""}`, scope: "tracks", hard: true,
    test: (s, r) => {
      if (onlyNamed && !r?.targetId) return true;
      const list = listOf(s);
      if (!Array.isArray(list)) return null;
      return r?.targetId ? list.some(t => t.id === r.targetId) : list.length > 0;
    },
    why: (s, r) => (r?.targetId
      ? `${quoted(r?.target, "The track it named")} was finished or deleted before the roll`
      : words.none),
    premise: () => ({ claim: words.claim, never: null }),
    offer: (s, r) => (r?.targetId ? null : words.offer),
  });
}

/** Explore a Waypoint: an open expedition, or the crew at a site (a vault, a derelict). */
export const EXPEDITION_OR_SITE = pre({
  id: "expedition-or-site", scope: "tracks", hard: true,
  test: (s) => {
    const open = s?.tracks?.expeditions;
    if (Array.isArray(open) && open.length) return true;
    if (s?.scene?.atSite === true) return true;
    if (!Array.isArray(open) || s?.scene?.atSite == null) return null;
    return false;
  },
  why: () => "no expedition is under way, and the crew is at no site to explore",
  premise: () => ({ claim: "an expedition under way", never: "a waypoint reached on a journey that has not begun" }),
  offer: () => "undertake_an_expedition",
});

/** A scene-challenge move within its open challenge — else the ordinary move it varies (issue #338 D2). */
export const WITHIN_SCENE_CHALLENGE = pre({
  id: "within-scene-challenge", scope: "tracks",
  test: (s, r) => {
    const open = s?.tracks?.sceneChallenges;
    if (!Array.isArray(open)) return null;
    const asTracks = open.map(t => ({ ...t, type: "scene_challenge", completed: false }));
    return moveOutsideSceneChallenge(r?.moveId, asTracks, { trackId: r?.targetId ?? null }) === r?.moveId;
  },
  why: () => "no scene challenge is under way",
  instead: (s, r) => SCENE_CHALLENGE_VARIANTS[r?.moveId] ?? null,
});

// ─────────────────────────────────────────────────────────────────────────────
// Vows
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An open vow to act on: the named one, else any. `own`: the roller's alone
 * (Forsake Your Vow); otherwise a roller holding none may act on the table's
 * (Fulfill Your Vow's "or, holding none, the table").
 *
 * @param {{ own?: boolean }} [opts]
 */
export function OPEN_VOW({ own = false } = {}) {
  return pre({
    id: own ? "open-vow-own" : "open-vow", scope: "sheet", hard: true,
    test: (s, r) => {
      const open = openVows(s, { own });
      if (!open) return null;
      if (r?.targetId) {
        // The roller's own vow, for a forsake: one the id names that is not
        // theirs (deleted since, or a crewmate's) is none to clear (issue
        // #345 AA16, AA49). Any sheet's otherwise — a "Which vow?" pick's
        // copy, which the roll scores by id alone (statEnrichment's vow
        // source never falls back to a journal track for one): on no sheet
        // read, it was deleted before the roll (issue #306 R06, #321 U02 —
        // the track-gone guard this replaces). The party unread: unknown.
        const vow = own ? (s.roller.vows ?? []).find(v => v.itemId === r.targetId || v.vowId === r.targetId) : anyVowById(s, r.targetId);
        if (vow) return !vow.completed;
        return own || Array.isArray(s?.party) ? false : null;
      }
      return open.length > 0;
    },
    why: (s, r) => {
      // The vow it names — by id, else by name among every vow the sheets
      // hold, closed ones too: a reason says how a closed one closed
      // (ROUND-VOW-GONE-SAYS-FULFILLED).
      const every = [...(s?.roller?.vows ?? []), ...(s?.party ?? []).flatMap(p => p?.vows ?? [])];
      const vow = r?.targetId ? anyVowById(s, r.targetId) : (lower(r?.target) ? byName(every, r.target) : null);
      if (vow?.completed) return vow.forsaken ? `${quoted(vow.name, "The vow it named")} was forsaken` : `${quoted(vow.name, "The vow it named")} is fulfilled`;
      if (r?.targetId && own) return `${quoted(r?.target, "The vow it named")} is no open vow of ${nameOf(s)}'s`;
      if (r?.targetId && !vow) return `${quoted(r?.target, "The vow it named")} was deleted before the roll`;
      return `${nameOf(s)} has no open vow`;
    },
    premise: () => ({ claim: "a vow being pursued", never: "headway on a vow that is not open" }),
  });
}

/** Reach a Milestone: progress left to mark — not every vow it could mean already full. */
export const ROOM_ON_VOW = pre({
  id: "room-on-vow", scope: "sheet",
  test: (s, r) => {
    const { open, vow } = namedVow(s, r);
    if (!open) return null;
    const candidates = vow ? [vow] : open;
    if (!candidates.length) return null;
    return candidates.some(v => Number(v.ticks ?? 0) < TRACK_TICKS);
  },
  why: (s, r) => {
    const { vow, open } = namedVow(s, r);
    const v = vow ?? (open?.length === 1 ? open[0] : null);
    return v ? `${quoted(v.name, "The vow")} is full — it is ready to be fulfilled` : "every open vow is full — each is ready to be fulfilled";
  },
  premise: () => ({ claim: "progress left to mark on the vow", never: "headway marked on a vow that is already full" }),
  offer: () => "fulfill_your_vow",
});

// ─────────────────────────────────────────────────────────────────────────────
// Connections
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The person the move is made with is a connection of the roller's: an active
 * bond Item on their sheet (actorBridge.readConnections). Every named
 * individual has an NPC card (FOLDER-002) — a card is a person, not a
 * connection.
 */
export const THEIR_CONNECTION = pre({
  id: "their-connection", scope: "sheet", hard: true,
  test: (s, r) => {
    const { live, found, named, several } = namedConnection(s, r);
    if (!live) return null;
    if (found || several) return true;
    if (named) return false;
    return live.length > 0;
  },
  why: (s, r) => {
    const { live, named } = namedConnection(s, r);
    if (named) return `${personNamed(s, r)} is not ${nameOf(s)}'s connection`;
    return live && !live.length ? `${nameOf(s)} has no connection` : `${nameOf(s)} has no such connection`;
  },
  premise: (s, r) => ({ claim: `a connection with ${namedConnection(s, r).named ? personNamed(s, r) : "them"}`, never: "a tie between them that the sheet does not hold" }),
  offer: () => "make_a_connection",
});

/** Make a Connection: the person is not already the roller's connection. */
export const NOT_YET_THEIR_CONNECTION = pre({
  id: "not-yet-their-connection", scope: "sheet",
  test: (s, r) => {
    if (!r?.targetId && !lower(r?.target)) return true;
    const { live, found, several } = namedConnection(s, r);
    if (!live) return null;
    return !found && !several;
  },
  why: (s, r) => `${personNamed(s, r)} is already ${nameOf(s)}'s connection`,
  premise: () => ({ claim: "a new tie", never: "a connection made with someone who already is one" }),
  offer: () => "develop_your_relationship",
});

/** Develop Your Relationship with an un-bonded connection: room left on the relationship track. */
export const ROOM_ON_RELATIONSHIP = pre({
  id: "room-on-relationship", scope: "sheet",
  test: (s, r) => {
    const { found } = namedConnection(s, r);
    if (!found) return null;
    if (found.bonded) return true;          // bonded: the move rolls +rank instead
    return Number(found.ticks ?? 0) < TRACK_TICKS;
  },
  why: (s, r) => {
    const { found } = namedConnection(s, r);
    return `${found?.name ?? "their"}${found?.name ? "'s" : ""} relationship with ${nameOf(s)} is full — a bond is ready to be forged`;
  },
  premise: () => ({ claim: "progress left to mark on the relationship", never: "the relationship deepened past a full track" }),
  offer: () => "forge_a_bond",
});

/** Forge a Bond: not bonded already. */
export const NOT_BONDED = pre({
  id: "not-bonded", scope: "sheet", hard: true,
  test: (s, r) => {
    const { found } = namedConnection(s, r);
    if (!found) return null;
    return !found.bonded;
  },
  why: (s, r) => `${namedConnection(s, r).found?.name ?? personNamed(s, r)} is already bonded — there is no bond to forge`,
  premise: () => ({ claim: "a bond still to forge", never: "a bond forged that was forged already" }),
  offer: () => "develop_your_relationship",
});

/**
 * The one the move is made with is no player character: a social move against
 * a fellow PC is roleplay, not a roll (finding G; issue #354 P2-06). Keeps the
 * lexical test of the addressee (narrator.js lineIsToAFellowPlayerCharacter) —
 * the one predicate that reads the line — and a target that is a PC's own id
 * or name.
 */
export const NOT_AT_A_PC = pre({
  id: "not-at-a-pc", scope: "table", hard: true,
  test: (s, r) => {
    const pcs = [s?.roller, ...(Array.isArray(s?.party) ? s.party : [])].filter(Boolean);
    if (r?.targetId && pcs.some(p => p.actorId === r.targetId && p.actorId !== s?.roller?.actorId)) return false;
    if (lower(r?.target) && byName(pcs.filter(p => p.actorId !== s?.roller?.actorId), r.target)) return false;
    if (!lower(r?.line)) return true;
    // The social moves' test of the addressee (narrator.js
    // lineIsToAFellowPlayerCharacter, with the table's PCs and people), as
    // the situation carries it; not read, unknown.
    const asked = s?.table?.spokenToAFellowPc;
    if (typeof asked !== "function") return null;
    return !asked(r.line, s?.roller?.name ?? null);
  },
  why: () => "the line is spoken to a fellow player character — between player characters that is roleplay, not a roll",
});

// ─────────────────────────────────────────────────────────────────────────────
// The table and the sheet's assets
// ─────────────────────────────────────────────────────────────────────────────

/** Aid Your Ally: another player character at the table to aid. */
export const AN_ALLY = pre({
  id: "an-ally", scope: "table", hard: true,
  test: (s) => (Number.isFinite(s?.table?.pcCount) ? s.table.pcCount >= 2 : null),
  why: () => "there is no other player character to aid",
  premise: () => ({ claim: "an ally to aid", never: "another player character acting beside them" }),
});

/** Withstand Damage: a vehicle of the roller's — the command vehicle, or a support vehicle. */
export const A_VEHICLE = pre({
  id: "a-vehicle", scope: "sheet", hard: true,
  test: (s) => (Array.isArray(s?.roller?.vehicles) ? s.roller.vehicles.length > 0 : null),
  why: (s) => `${nameOf(s)} has no vehicle on record`,
});

/** Companion Takes a Hit: a companion of the roller's. */
export const A_COMPANION = pre({
  id: "a-companion", scope: "sheet", hard: true,
  test: (s) => (Array.isArray(s?.roller?.companions) ? s.roller.companions.length > 0 : null),
  why: (s) => `${nameOf(s)} has no companion`,
});

// ─────────────────────────────────────────────────────────────────────────────
// Recovery
// ─────────────────────────────────────────────────────────────────────────────

const RECOVERY_WORDS = Object.freeze({
  health: { impact: "wounded", nothing: "nothing to heal", claim: "a wound to treat", never: "a cut, a gash, blood or a dressing on them",
    state: (name, v, marked, max) => `${name}'s health is ${v} of ${max}${marked === false ? " and no wound is marked" : marked ? " and a wound is marked" : ""}` },
  spirit: { impact: "shaken", nothing: "nothing to ease", claim: "a strain to ease", never: "fear, despair or a shaken nerve eased",
    state: (name, v, marked, max) => `${name}'s spirit is ${v} of ${max}${marked === false ? ` and ${name} is not shaken` : marked ? ` and ${name} is shaken` : ""}` },
  supply: { impact: "unprepared", nothing: "nothing to restock", claim: "supplies to restock", never: "stores running short or restocked",
    state: (name, v, marked, max) => `${name}'s supply is ${v} of ${max}${marked === false ? ` and ${name} is not unprepared` : marked ? ` and ${name} is unprepared` : ""}` },
});

/** Each body a Heal could be for, with what can be told of it: the patient named, else the party (the roller, the other PCs, the roller's companions). */
function healBodies(s, r) {
  const roller = s?.roller;
  if (!roller) return null;
  const pc = (p) => ({ name: p.name, value: p.meters?.health ?? null, marked: p.impacts?.wounded ?? null, max: METER_MAX, kind: "pc" });
  const companion = (c) => ({ name: c.name, value: c.health ?? null, marked: false, max: c.max ?? METER_MAX, kind: "companion" });
  const patient = r?.patient ?? null;
  if (patient?.companionItemId) {
    const c = (roller.companions ?? []).find(x => x.itemId === patient.companionItemId);
    return c ? [companion(c)] : null;
  }
  if (patient?.actorId && patient.actorId !== roller.actorId) {
    const p = (s.party ?? []).find(x => x.actorId === patient.actorId);
    return p ? [pc(p)] : null;
  }
  if (patient?.self === true) return [pc(roller)];
  if (!Array.isArray(s.party) || !Array.isArray(roller.companions)) return null;
  return [pc(roller), ...s.party.map(pc), ...roller.companions.map(companion)];
}

/**
 * A recovery move's meter below its max, or its impact marked. Heal reads the
 * patient (resolveHealPatient's — the roller, an ally or a companion), and
 * with no patient resolved, anyone the party could treat. Hearten and
 * Resupply read the roller. In live play a Heal at 5 health of 5 was offered,
 * pressed and rolled, twice (HEAL-ROLLED-AT-FULL-HEALTH); eight such lines
 * were then rightly given no move and nobody was told (NOTHING-TO-RECOVER-UNTOLD).
 *
 * @param {{ meter: "health"|"spirit"|"supply", of?: "patient"|"roller", readerSettled?: boolean }} opts
 */
export function RECOVERABLE({ meter, of = "roller", readerSettled = false }) {
  const words = RECOVERY_WORDS[meter];
  const bodies = (s, r) => {
    if (of === "patient") return healBodies(s, r);
    const roller = s?.roller;
    if (!roller) return null;
    return [{ name: roller.name, value: roller.meters?.[meter] ?? null, marked: roller.impacts?.[words.impact] ?? null, max: METER_MAX, kind: "pc" }];
  };
  return pre({
    id: `recoverable-${meter}`, scope: "sheet", readerSettled,
    test: (s, r) => {
      const list = bodies(s, r);
      if (!list || !list.length) return null;
      if (list.some(b => b.value === null || b.marked === null)) {
        // Something unread: it holds unless what was read already needs it.
        return list.some(b => (Number.isFinite(b.value) && b.value < b.max) || b.marked === true) ? true : null;
      }
      return list.some(b => b.value < b.max || b.marked === true);
    },
    why: (s, r) => {
      const list = bodies(s, r) ?? [];
      const said = list.map(b => (b.kind === "companion"
        ? `${b.name}'s health is ${b.value} of ${b.max}`
        : words.state(b.name, b.value, b.marked, b.max)));
      return `${words.nothing}: ${said.length ? said.join("; ") : "nothing is marked"}`;
    },
    premise: () => ({ claim: words.claim, never: words.never }),
  });
}

/** Repair: something damaged — a vehicle below its integrity or battered, a mechanical companion hurt. A device is invisible to the sheet: reader-settled. */
export const SOMETHING_DAMAGED = pre({
  id: "something-damaged", scope: "sheet", readerSettled: true,
  test: (s) => {
    const vehicles = s?.roller?.vehicles;
    const companions = s?.roller?.companions;
    if (!Array.isArray(vehicles) || !Array.isArray(companions)) return null;
    if (!vehicles.length) return null;      // no vehicle recorded is not "nothing damaged"
    const hurt = vehicles.some(v => (Number.isFinite(v.integrity) && v.integrity < (v.max ?? METER_MAX)) || v.battered === true)
      || companions.some(c => c.mechanical === true && Number.isFinite(c.health) && c.health < (c.max ?? METER_MAX));
    if (hurt) return true;
    return vehicles.some(v => !Number.isFinite(v.integrity)) ? null : false;
  },
  why: (s) => {
    const v = (s?.roller?.vehicles ?? []).map(x => `${x.name || "the vehicle"} is at ${x.integrity} of ${x.max ?? METER_MAX} integrity${x.battered === false ? ", not battered" : ""}`);
    return `nothing is damaged: ${v.join("; ")}`;
  },
  premise: () => ({ claim: "damage to repair", never: "a part patched, fixed or replaced" }),
});

/** Sojourn: someone in the party has something a recover move would mend (D15 — the community is the reader's). */
export const PARTY_HAS_SOMETHING_TO_RECOVER = pre({
  id: "party-has-something-to-recover", scope: "sheet",
  test: (s) => {
    const roller = s?.roller;
    if (!roller || !Array.isArray(s?.party) || !Array.isArray(roller.companions) || !Array.isArray(roller.vehicles)) return null;
    const pcs = [roller, ...s.party];
    let unknown = false;
    for (const p of pcs) {
      for (const [meter, { impact }] of Object.entries(RECOVERY_WORDS)) {
        const v = p.meters?.[meter];
        const m = p.impacts?.[impact];
        if (v == null || m == null) { unknown = true; continue; }
        if (v < METER_MAX || m === true) return true;
      }
    }
    if (roller.companions.some(c => Number.isFinite(c.health) && c.health < (c.max ?? METER_MAX))) return true;
    if (roller.vehicles.some(v => (Number.isFinite(v.integrity) && v.integrity < (v.max ?? METER_MAX)) || v.battered === true)) return true;
    return unknown ? null : false;
  },
  why: () => "nobody has anything to recover: every meter is full and no impact is marked",
  premise: () => ({ claim: "something to recover", never: "a wound, a strain or a shortfall mended" }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Exploration and legacy
// ─────────────────────────────────────────────────────────────────────────────

/** Make a Discovery / Confront Chaos: made from an Explore a Waypoint match — its card's alternative. */
export const FROM_A_WAYPOINT = pre({
  id: "from-a-waypoint", scope: "table",
  test: (s, r) => r?.fromWaypoint === true,
  why: () => "a discovery or a chaos comes from exploring a waypoint — its card's 🔭 / 🌀 button on a match",
  offer: () => "explore_a_waypoint",
});

/** Continue a Legacy: a legacy track named — quests, bonds or discoveries. Checked at the roll; readMove asks which first. */
export const LEGACY_TRACK_NAMED = pre({
  id: "legacy-track-named", scope: "reading", hard: true, stages: Object.freeze(["roll"]),
  test: (s, r) => !!legacyTrackNamed(r?.target ?? null),
  why: () => "no legacy track is named — quests, bonds or discoveries",
});

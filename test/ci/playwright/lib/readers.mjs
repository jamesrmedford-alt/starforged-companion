// The two readers on plain lines (decisions.md → "A player is never made to
// name a move").
//
// What a player types stays in the fiction, so a plain line that sets about a
// move must end in that move rolled, or in the right move offered on a
// button. Two model calls decide which: the pacing reader (src/pacing/
// router.js decidePacing, which calls classifier.js classifyInput) and, when
// it says a move is being made, the move reader (src/moves/interpreter.js
// interpretMove). readers.mjs runs a list of plain lines
// (readers/plain-lines.json) through both — on the model they are written
// for, and on others — to answer how often a plain line is read right, and
// how much of the failure is the model.
//
// The one reader that is to replace them (src/moves/reader.js readLine, routed
// by src/pacing/readAndRoute.js — issue #384, slice 1) is measured beside them: an arm is a design and a
// model — `two:<model>` today's two readers, `one:<model>` the one reader —
// and a bare model is `two:` (armsOf).
//
// This file is the part of that test that needs no browser: the list's own
// checks, the arms, what a reading's replies come to at the table, its score
// against the reading the line should get, the run's numbers and its report.
//
// Pure: no Foundry, no network, no clock, no file.

import { MOVES } from "../../../../src/schemas.js";
import { movesNamedIn, moveLabel } from "./moveNames.mjs";
import { costOf } from "./budget.mjs";

/** The two designs an arm reads a line with: today's two readers, or the one. */
export const DESIGNS = Object.freeze(["two", "one"]);

/**
 * The arms of a run from READERS_ARMS: each `design:model`, a bare model
 * meaning `two:` (so a run named as before reads as it did). Each arm's id is
 * its spec as written; an arm named twice is one arm.
 *
 * @param {string[]} specs
 * @returns {{ arms: Array<{ id: string, design: "two"|"one", model: string }>, problems: string[] }}
 */
export function armsOf(specs) {
  const arms = [];
  const problems = [];
  for (const raw of Array.isArray(specs) ? specs : []) {
    const spec = String(raw ?? "").trim();
    if (!spec) continue;
    const at = spec.indexOf(":");
    const design = at > 0 ? spec.slice(0, at) : "two";
    const model = at > 0 ? spec.slice(at + 1).trim() : spec;
    if (!DESIGNS.includes(design)) { problems.push(`arm "${spec}": its design is two or one, not "${design}"`); continue; }
    if (!model) { problems.push(`arm "${spec}" names no model`); continue; }
    const id = at > 0 ? `${design}:${model}` : model;
    if (!arms.some(a => a.id === id)) arms.push({ id, design, model });
  }
  return { arms, problems };
}

/** The pacing reader's three decisions (src/pacing/classifier.js PACING_DECISION). */
export const DECISION = Object.freeze({
  MOVE:      "MOVE",
  OFFER:     "NARRATIVE_WITH_MOVE_AVAILABLE",
  NARRATIVE: "NARRATIVE",
});

/**
 * What a reading comes to, against the reading its line should get. A line
 * that wants a move: the move rolled, the move offered on a button, another
 * move rolled, another move offered, or nothing — and a line that wants its
 * move rolled (`want.rolled`: one that names it — the pacing reader's own
 * rule, A LINE THAT NAMES ITS MOVE ASKS FOR IT) is not read when the move is
 * only offered. A control — a line that makes no move: narrated, a move
 * offered, or a move rolled. A reading a reader's call failed on is none of
 * these and is counted apart.
 */
export const OUTCOME = Object.freeze({
  ROLLED:          "rolled",
  OFFERED:         "offered",
  // A line that asks to be rolled (`want.rolled` — a move named after a run of
  // moves, issue #383 finding 17): its move offered is not read.
  OFFERED_NOT_ROLLED: "offered, not rolled",
  ANOTHER_ROLLED:  "another move rolled",
  ANOTHER_OFFERED: "another move offered",
  NOTHING:         "nothing",
  NARRATED:        "narrated",
  MOVE_OFFERED:    "a move offered",
  MOVE_ROLLED:     "a move rolled",
  FAILED:          "reader failed",
});

/** A line that wanted a move was read: its move rolled, or offered on a button. */
const READ = new Set([OUTCOME.ROLLED, OUTCOME.OFFERED]);
const RANKS = ["troublesome", "dangerous", "formidable", "extreme", "epic"];
const FULL_TRACK = 40;

/**
 * What of a context's `state` reaches a reader's prompt — which is what the
 * runner sets. Read from the prompts' own builders: the pacing reader's
 * buildClassifierContext (src/pacing/classifier.js) and the move reader's
 * buildContextSummary (src/moves/interpreter.js), and the SITUATION block
 * both carry (src/moves/situation.js buildSituationBlock).
 */
const SITUATION = "both readers' SITUATION block";
export const STATE_READ = Object.freeze({
  location:   "the pacing reader's CURRENT SCENE — \"Current location\", from campaignState.currentLocationId / currentLocationType",
  frame:      "the pacing reader's CURRENT SCENE — \"Scene frame\", from campaignState.sceneFrame",
  connection: `${SITUATION}, from the bond Item on the character's sheet: its name, rank and relationship track, or that it is bonded`,
  vow:        `${SITUATION}, from the vow Item on the character's sheet: its name, rank and progress`,
  tracks:     "the move reader's \"Open progress tracks\", by type and label, and its combat position directive; an open fight (\"COMBAT STATUS: ACTIVE\") or scene challenge reaches the pacing reader too; the one reader's SITUATION gives each with its rank and progress, a fight with the character's position in it",
  health:     `${SITUATION}, from the sheet's health meter`,
  spirit:     `${SITUATION}, from the sheet's spirit meter`,
  supply:     `${SITUATION}, from the sheet's supply meter`,
  impacts:    `${SITUATION}: wounded, shaken and unprepared, from the sheet's impacts`,
  integrity:  `${SITUATION}: the command vehicle's integrity, from its ship record (its STARSHIP asset's track where it has one)`,
  battered:   `${SITUATION}: whether the command vehicle is battered, from the starship's own impact`,
});

/** The impacts a recovery move clears: the three the SITUATION block names. */
const IMPACTS = ["wounded", "shaken", "unprepared"];
const METER_MAX = 5;

/**
 * The sheet a context's state says the world holds — what the runner sets and
 * what contextMismatch reads back. A meter the state does not give is full,
 * an impact it does not list is clear and a vow's progress it does not give
 * is none: a context says what is wrong, and nothing of the last context's
 * stays behind.
 *
 * @param {Object} state
 * @returns {{ health: number, spirit: number, supply: number, impacts: Record<string, boolean>,
 *   integrity: number, battered: boolean, vowTicks: number }}
 */
export function sheetOf(state) {
  const meter = (value) => (Number.isInteger(value) ? value : METER_MAX);
  const marked = Array.isArray(state?.impacts) ? state.impacts : [];
  return {
    health:    meter(state?.health),
    spirit:    meter(state?.spirit),
    supply:    meter(state?.supply),
    impacts:   Object.fromEntries(IMPACTS.map(key => [key, marked.includes(key)])),
    integrity: meter(state?.integrity),
    battered:  state?.battered === true,
    vowTicks:  Number.isInteger(state?.vow?.ticks) ? state.vow.ticks : 0,
  };
}

/**
 * The parts of a context's state the runner does not set, each with why: a
 * state says what the world must hold, and only some of it reaches a prompt.
 *
 * @param {Object} state
 * @returns {Array<{ key: string, why: string }>}
 */
export function stateNotSet(state) {
  const out = [];
  for (const key of Object.keys(state ?? {})) {
    if (!STATE_READ[key]) out.push({ key, why: "neither reader's prompt reads it" });
  }
  if (state?.vow?.swornTo != null) out.push({ key: "vow.swornTo", why: "the runner links no vow to a connection; the block would name the link, were one made" });
  return out;
}

// ── the list ─────────────────────────────────────────────────────────────────

/**
 * What each recovery move restores, on the sheet a context's state gives: the
 * readers are told the meters, and a recovery move with nothing to recover is
 * no move (src/moves/situation.js nothingToRecover). So a line cannot want a
 * recovery move its sheet has nothing for — and a control may say its line
 * sets about one the sheet has nothing for (`nothingToRecover`). True when
 * the move has something to do.
 */
const RECOVERS = {
  heal:     (sheet) => sheet.health < METER_MAX || sheet.impacts.wounded,
  hearten:  (sheet) => sheet.spirit < METER_MAX || sheet.impacts.shaken,
  resupply: (sheet) => sheet.supply < METER_MAX || sheet.impacts.unprepared,
  repair:   (sheet) => sheet.integrity < METER_MAX || sheet.battered,
};

/** The fight a context opens, or null: this test opens one at most. */
export const fightOf = (state) => (Array.isArray(state?.tracks) ? state.tracks.find(t => t?.type === "combat") ?? null : null);

/** The moves a combat position allows of the two pairs (interpreter.js POSITION_MOVE_REMAP's other side). */
const POSITION_MOVES = Object.freeze({ in_control: ["strike", "gain_ground"], bad_spot: ["clash", "react_under_fire"] });
const FIGHT_POSITIONS = Object.keys(POSITION_MOVES);

/** Whether a move rolled in a fight is one the character's position allows: false for the other position's pair. */
export function positionLegal(moveId, position) {
  if (!FIGHT_POSITIONS.includes(position)) return true;
  const other = FIGHT_POSITIONS.find(p => p !== position);
  return !POSITION_MOVES[other].includes(moveId);
}
/** The density window a new world's pacing reads (the `pacing.densityWindow` setting's default): a case's recent moves are a count within it. */
const DENSITY_WINDOW = 5;
/** The vow moves a control may say its line claims the step of, where its scene refutes the claim (`refutes`). */
const STEP_MOVES = ["reach_a_milestone", "fulfill_your_vow"];

/** What a wanted move needs its context to hold, or null. */
function contextProblem(moveId, state) {
  const connection = state?.connection ?? null;
  const tracks = Array.isArray(state?.tracks) ? state.tracks : [];
  const fight = fightOf(state);
  for (const [position, moves] of Object.entries(POSITION_MOVES)) {
    if (moves.includes(moveId) && fight?.position !== position) return `${moveId} is wanted only in a fight where the character is ${position === "in_control" ? "in control" : "in a bad spot"}`;
  }
  if (RECOVERS[moveId] && !RECOVERS[moveId](sheetOf(state))) {
    return `${moveId} is wanted only where the context's sheet has something for it to recover`;
  }
  if (["develop_your_relationship", "test_your_relationship", "forge_a_bond"].includes(moveId) && !connection?.name) {
    return `${moveId} needs a connection in its context`;
  }
  if (moveId === "forge_a_bond" && (Number(connection.ticks) < FULL_TRACK || connection.bonded === true)) {
    return "forge_a_bond is wanted only where the context's connection has a full relationship track and no bond yet";
  }
  if (["reach_a_milestone", "fulfill_your_vow"].includes(moveId) && !state?.vow?.name) return `${moveId} needs a vow in its context`;
  if (moveId === "explore_a_waypoint" && !tracks.some(t => t?.type === "expedition")) return "explore_a_waypoint needs an open expedition in its context";
  return null;
}

/**
 * Problems with a list of plain lines (empty when it can run): a context
 * that is no scene, a sheet that is no sheet (a meter off its scale, an
 * impact the block does not name), a ship's state with no ship in the world,
 * a case in a context the list does not have, a move id the module does not
 * know, a line that names a move or uses a rules word, a case that wants
 * neither a move nor none, an id used twice, a wanted move its context cannot
 * hold — a recovery move with nothing on the sheet to recover among them, a
 * position's move in a fight where the character is in the other — a
 * control that says its line is a recovery with nothing to recover
 * (`nothingToRecover: "heal"`) in a context whose sheet has something, and a
 * fight that does not give the character's position. And, for the cases that
 * measure what a plain line is not: a line may name its move only where the
 * case says so (`named`: the move's id — a move named at the last resort),
 * and then names that move, wants it alone, and wants it rolled
 * (`want.rolled`); `want.rolled` is for a wanted move only; a case read after
 * a run of moves (`recentMoves`) gives a whole number within the density
 * window; a control that says its line claims a vow's step its scene refutes
 * (`refutes: "reach_a_milestone"`) has a vow in its context; and a case's
 * `kind` (the issue #383 kind it measures) is a name.
 *
 * @param {{ world?: Object, contexts?: Object, cases?: Object[] }} file
 * @returns {string[]}
 */
export function validateCases(file) {
  const problems = [];
  const contexts = file?.contexts && typeof file.contexts === "object" && !Array.isArray(file.contexts) ? file.contexts : {};
  const cases = Array.isArray(file?.cases) ? file.cases : [];
  if (!Object.keys(contexts).length) problems.push("the list has no contexts");
  if (!cases.length) problems.push("the list has no cases");
  const places = new Set((file?.world?.settlements ?? []).map(s => s?.name).filter(Boolean));

  for (const [key, context] of Object.entries(contexts)) {
    const scene = Array.isArray(context?.scene) ? context.scene : [];
    if (!scene.length || scene.length > 2 || scene.some(p => typeof p !== "string" || !p.trim())) {
      problems.push(`context "${key}": its scene is one or two paragraphs of narration`);
    }
    const state = context?.state;
    if (!state || typeof state !== "object") { problems.push(`context "${key}": it has no state`); continue; }
    if (state.location != null && !places.has(state.location)) problems.push(`context "${key}": its location "${state.location}" is not one of the world's settlements`);
    if (state.connection != null) {
      const c = state.connection;
      if (typeof c.name !== "string" || !c.name.trim()) problems.push(`context "${key}": its connection has no name`);
      if (c.rank != null && !RANKS.includes(c.rank)) problems.push(`context "${key}": its connection's rank "${c.rank}" is not a rank`);
      if (!Number.isInteger(c.ticks) || c.ticks < 0 || c.ticks > FULL_TRACK) problems.push(`context "${key}": its connection's ticks are a whole number from 0 to ${FULL_TRACK}`);
    }
    if (state.vow != null && (typeof state.vow.name !== "string" || !state.vow.name.trim())) problems.push(`context "${key}": its vow has no name`);
    if (state.vow?.ticks != null && !(Number.isInteger(state.vow.ticks) && state.vow.ticks >= 0 && state.vow.ticks <= FULL_TRACK)) {
      problems.push(`context "${key}": its vow's ticks are a whole number from 0 to ${FULL_TRACK}`);
    }
    for (const meter of ["health", "spirit", "supply", "integrity"]) {
      if (state[meter] != null && !(Number.isInteger(state[meter]) && state[meter] >= 0 && state[meter] <= METER_MAX)) {
        problems.push(`context "${key}": its ${meter} is a whole number from 0 to ${METER_MAX}`);
      }
    }
    if (state.impacts != null && !(Array.isArray(state.impacts) && state.impacts.every(i => IMPACTS.includes(i)))) {
      problems.push(`context "${key}": its impacts are a list of ${IMPACTS.join(", ")}`);
    }
    if (state.battered != null && typeof state.battered !== "boolean") problems.push(`context "${key}": battered is true or false`);
    // The ship's integrity is the command vehicle's: a world with none has no meter to set.
    if ((state.integrity != null || state.battered != null) && !file?.world?.ship?.name) {
      problems.push(`context "${key}": it gives the ship's state, and the world has no command vehicle (world.ship)`);
    }
    for (const track of state.tracks ?? []) {
      if (!track?.type || !track?.label) problems.push(`context "${key}": a track needs a type and a label`);
      if (track?.ticks != null && !(Number.isInteger(track.ticks) && track.ticks >= 0 && track.ticks <= FULL_TRACK)) {
        problems.push(`context "${key}": a track's ticks are a whole number from 0 to ${FULL_TRACK}`);
      }
      // An open fight is read against the character's position in it, which
      // the runner writes (setCombatTrackPosition) and both designs are told:
      // a fight in this test says it.
      if (track?.type === "combat" && !FIGHT_POSITIONS.includes(track.position)) {
        problems.push(`context "${key}": an open fight gives the character's position in it (in_control or bad_spot)`);
      }
      if (track?.type !== "combat" && track?.position != null) problems.push(`context "${key}": only a fight has a position`);
    }
    if ((state.tracks ?? []).filter(t => t?.type === "combat").length > 1) problems.push(`context "${key}": one fight at most`);
  }

  const seen = new Set();
  for (const [i, c] of cases.entries()) {
    const at = typeof c?.id === "string" && c.id ? `case "${c.id}"` : `case #${i + 1}`;
    if (typeof c?.id !== "string" || !c.id) problems.push(`${at}: it has no id`);
    else if (seen.has(c.id)) problems.push(`${at}: its id is used twice`);
    else seen.add(c.id);
    if (typeof c?.family !== "string" || !c.family) problems.push(`${at}: it has no family`);
    const context = contexts[c?.context];
    if (!context) problems.push(`${at}: unknown context "${c?.context}"`);
    const none = c?.want?.none === true;
    const moves = c?.want?.moves;
    if (typeof c?.line !== "string" || !c.line.trim()) problems.push(`${at}: it has no line`);
    else if (c.named !== undefined) {
      // A line that names its move on purpose: the move it names, wanted alone, and rolled.
      const label = Object.hasOwn(MOVES, c.named) ? moveLabel(c.named) : null;
      if (!label) problems.push(`${at}: named "${c.named}" is no move the module knows`);
      else if (!movesNamedIn(c.line).includes(label)) problems.push(`${at}: it is named for ${label}, and its line does not name it`);
      else if (!(Array.isArray(moves) && moves.length === 1 && moves[0] === c.named && c.want?.rolled === true)) problems.push(`${at}: a line that names ${label} wants it alone, rolled (want: { moves: ["${c.named}"], rolled: true })`);
    } else {
      const named = movesNamedIn(c.line);
      if (named.length) problems.push(`${at}: its line names ${named.join(", ")} — a plain line names no move and uses no rules word`);
    }
    if (c?.want?.rolled !== undefined && !(c.want.rolled === true && Array.isArray(moves) && moves.length)) problems.push(`${at}: want.rolled is true, and for a wanted move`);
    if (c?.recentMoves !== undefined && !(Number.isInteger(c.recentMoves) && c.recentMoves >= 0 && c.recentMoves <= DENSITY_WINDOW)) {
      problems.push(`${at}: its recentMoves is a whole number from 0 to ${DENSITY_WINDOW} (the moves of the last ${DENSITY_WINDOW} lines)`);
    }
    if (c?.refutes !== undefined) {
      if (!none) problems.push(`${at}: refutes is for a control (want.none)`);
      else if (!STEP_MOVES.includes(c.refutes)) problems.push(`${at}: refutes names one of ${STEP_MOVES.join(", ")} — not "${c.refutes}"`);
      else if (context?.state && !context.state.vow?.name) problems.push(`${at}: it claims a step of ${c.refutes} and its context holds no vow`);
    }
    if (c?.kind !== undefined && !(typeof c.kind === "string" && c.kind.trim())) problems.push(`${at}: its kind is a name`);
    if (none && moves !== undefined) problems.push(`${at}: it wants both a move and none`);
    else if (!none && !(Array.isArray(moves) && moves.length)) problems.push(`${at}: it wants neither a move (want.moves) nor none (want.none)`);
    else if (c.nothingToRecover !== undefined) {
      // A control whose line sets about a recovery move its sheet has nothing for.
      const has = RECOVERS[c.nothingToRecover];
      if (!none) problems.push(`${at}: nothingToRecover is for a control (want.none)`);
      else if (!has) problems.push(`${at}: nothingToRecover names one of ${Object.keys(RECOVERS).join(", ")} — not "${c.nothingToRecover}"`);
      else if (context?.state && has(sheetOf(context.state))) problems.push(`${at}: its context's sheet has something for ${c.nothingToRecover} to recover`);
    } else if (!none) {
      for (const id of moves) {
        if (!Object.hasOwn(MOVES, id)) { problems.push(`${at}: unknown move id "${id}"`); continue; }
        const needs = context?.state ? contextProblem(id, context.state) : null;
        if (needs) problems.push(`${at}: ${needs}`);
      }
    }
  }
  return problems;
}

/**
 * The cases a run reads — all of them, or those named — in the list's order
 * with each context's cases together, so the world is set once a context.
 *
 * @param {{ cases: Object[] }} file
 * @param {string[]} [only] — case ids; empty for every case
 * @returns {{ cases: Object[], unknown: string[] }}
 */
export function casesToRun(file, only = []) {
  const all = Array.isArray(file?.cases) ? file.cases : [];
  const wanted = new Set(only);
  const unknown = only.filter(id => !all.some(c => c.id === id));
  const chosen = wanted.size ? all.filter(c => wanted.has(c.id)) : all;
  const contexts = [...new Set(chosen.map(c => c.context))];
  return { cases: contexts.flatMap(key => chosen.filter(c => c.context === key)), unknown };
}

/**
 * A context as the runner applied it, against what its state says of the
 * parts a prompt reads: the first thing that did not land, or null. `applied`
 * is the world read back through the readers' own sources — the recent scene
 * as getRecentSceneForReading gives it, the sheet's meters and impacts, its
 * live connections and open vows with their progress, the command vehicle,
 * the open tracks, the current location and the scene frame.
 *
 * @param {{ scene?: string[], state?: Object }} context
 * @param {{ scene: string, location: string|null, frame: Object|null,
 *   sheet: { health: number, spirit: number, supply: number, impacts: Record<string, boolean> },
 *   vehicle: { integrity: number|null, battered: boolean }|null,
 *   connections: Array<{ name: string, ticks: number, bonded: boolean }>,
 *   vows: Array<{ name: string, ticks: number }>,
 *   tracks: Array<{ type: string, label: string, ticks?: number, position?: string|null }> }} applied — a
 *   fight's `position` is the character's own in it
 * @returns {string|null}
 */
export function contextMismatch(context, applied) {
  const state = context?.state ?? {};
  const flat = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
  const missing = (context?.scene ?? []).find(p => !flat(applied?.scene).includes(flat(p)));
  if (missing) return `the readers' recent scene lacks "${flat(missing).slice(0, 60)}…"`;
  if ((state.location ?? null) !== (applied.location ?? null)) return `the current location is ${applied.location ?? "none"}, not ${state.location ?? "none"}`;
  if (state.frame && flat(applied.frame?.situation) !== flat(state.frame.situation)) return "the scene frame was not set";
  const c = state.connection ?? null;
  const connections = applied.connections ?? [];
  const live = c ? connections.find(x => x.name === c.name) : null;
  if (c && !(live && live.ticks === c.ticks && live.bonded === (c.bonded === true))) return `the connection ${c.name} is not on the sheet as the context has it`;
  if (connections.some(x => x.name !== c?.name)) return "a connection is on the sheet that the context does not hold";
  const sheet = sheetOf(state);
  const vows = applied.vows ?? [];
  if (state.vow?.name ? !(vows.length === 1 && vows[0].name === state.vow.name) : vows.length) return "the sheet's open vows are not the context's";
  if (state.vow?.name && vows[0].ticks !== sheet.vowTicks) return `the vow stands at ${vows[0].ticks} ticks, not ${sheet.vowTicks}`;
  for (const meter of ["health", "spirit", "supply"]) {
    if (applied.sheet?.[meter] !== sheet[meter]) return `the sheet's ${meter} is ${applied.sheet?.[meter] ?? "unread"}, not ${sheet[meter]}`;
  }
  for (const impact of IMPACTS) {
    if ((applied.sheet?.impacts?.[impact] === true) !== sheet.impacts[impact]) return `the sheet is ${sheet.impacts[impact] ? "not " : ""}marked ${impact}, against the context`;
  }
  // The ship's state is checked where the context gives it: a list whose world has no ship gives none (validateCases).
  if (state.integrity != null || state.battered != null) {
    if (!applied.vehicle) return "the world has no command vehicle to hold the ship's state";
    if (applied.vehicle.integrity !== sheet.integrity) return `the command vehicle's integrity is ${applied.vehicle.integrity ?? "unread"}, not ${sheet.integrity}`;
    if ((applied.vehicle.battered === true) !== sheet.battered) return `the command vehicle is ${sheet.battered ? "not " : ""}battered, against the context`;
  }
  const wanted = state.tracks ?? [];
  const tracks = applied.tracks ?? [];
  if (wanted.length !== tracks.length || wanted.some(w => !tracks.some(a => a.type === w.type && a.label === w.label))) return "the open tracks are not the context's";
  for (const w of wanted) {
    const a = tracks.find(t => t.type === w.type && t.label === w.label);
    if (w.ticks != null && a.ticks !== undefined && a.ticks !== w.ticks) return `the track "${w.label}" stands at ${a.ticks} ticks, not ${w.ticks}`;
    if (w.position != null && a.position !== w.position) return `the character is ${a.position ?? "in no position"} in the fight "${w.label}", not ${w.position}`;
  }
  return null;
}

// ── a reading ────────────────────────────────────────────────────────────────

/** A scene-challenge move is the ordinary move it varies: no context of this test opens a challenge. */
const ordinary = (id) => (typeof id === "string" && id ? id.replace(/_scene_challenge$/, "") : null);
const known = (id) => (id && Object.hasOwn(MOVES, id) ? id : null);

/**
 * What the two readers' replies come to at the table, as the chat pipeline
 * acts on them (src/index.js, src/moves/movePipeline.js readMove):
 *
 *   - the pacing reader says NARRATIVE: the line is narrated, nothing offered;
 *   - it says NARRATIVE_WITH_MOVE_AVAILABLE: narrated, its move on a button;
 *   - it says MOVE: the move reader reads the line. Its move is rolled —
 *     unless it answers that no move is being made, or is unsure of its own
 *     reading (confidence "low"): then the line is narrated, and the table
 *     is offered the move the pacing reader named, else the unsure reading's
 *     own.
 *
 * A reading is `failed` when a reader did not read the line at all: the
 * pacing reader's fallback for a call that failed or a reply it could not
 * read (it sends the line on as a move), the move reader's the same, or no
 * reply. Such a reading says nothing of either reader and is not scored.
 *
 * An arm of the `one` design (`design: "one"`) is read by readingOfLine: the
 * one reader's route is what the line comes to.
 *
 * @param {{ design?: "two"|"one", pacing?: Object|null, interpretation?: Object|null, interpretError?: string|null,
 *   line?: Object|null, lineError?: string|null }} replies — `two`: decidePacing's decision and
 *   interpretMove's reading, as the page returns them; `one`: readAndRoute's decision (`line`)
 * @returns {{ decision: string|null, suggested: string|null, move: string|null, noMove: boolean, offered: string|null,
 *   unsure: boolean, mischief: boolean, failed: string|null, category: string|null, confidence: number|null,
 *   reasons: { pacing: string, move: string } }}
 */
export function readingOf(replies = {}) {
  if (replies?.design === "one") return readingOfLine(replies);
  return readingOfTwo(replies);
}

/** The two readers' reading (readingOf's, for an arm of the `two` design). */
function readingOfTwo({ pacing = null, interpretation = null, interpretError = null } = {}) {
  const decision = Object.values(DECISION).includes(pacing?.decision) ? pacing.decision : null;
  const reading = {
    decision,
    // The move the pacing reader named: nominated on MOVE, offered on NARRATIVE_WITH_MOVE_AVAILABLE.
    suggested: known(ordinary(decision === DECISION.MOVE ? pacing.nominatedMove : decision === DECISION.OFFER ? pacing.suggestedMove : null)),
    move:      null,     // the move reader's move, when it is the one rolled
    noMove:    false,    // the move reader read no move, or was unsure of its own
    offered:   null,     // the move on the narration's button, when the line is narrated
    unsure:    false,
    mischief:  false,    // the move reader says it chose a neighbouring move (Balanced Mischief)
    failed:    null,
    category:   typeof pacing?.category === "string" ? pacing.category : null,
    confidence: Number.isFinite(pacing?.confidence) ? pacing.confidence : null,
    reasons: {
      pacing: String(pacing?.reasoning ?? "").trim(),
      move:   String(interpretation?.rationale ?? "").trim(),
    },
  };
  if (!decision) { reading.failed = "the pacing reader gave no decision"; return reading; }
  if (decision === DECISION.OFFER) { reading.offered = reading.suggested; return reading; }
  if (decision === DECISION.NARRATIVE) return reading;

  // MOVE. Whether a classifier read the line (router.js classifierReadingOf):
  // not its fallback, a `!roll`, or pacing switched off.
  const classifierRead = pacing.classifierRead === true;
  if (!classifierRead) reading.failed = `the pacing reader did not read the line (${reading.reasons.pacing || "no reason given"})`;
  if (!interpretation) {
    reading.failed ??= `the move reader gave no reading${interpretError ? ` (${interpretError})` : ""}`;
    return reading;
  }
  if (interpretation.fallback === true) {
    reading.failed ??= "the move reader's reply could not be read";
    return reading;
  }
  const own = known(ordinary(interpretation.moveId));
  if (interpretation.noMove === true || interpretation.confidence === "low") {
    reading.noMove = true;
    reading.unsure = interpretation.noMove !== true;
    reading.offered = (classifierRead ? reading.suggested : null) ?? (reading.unsure ? own : null);
    return reading;
  }
  reading.move = own;
  reading.mischief = interpretation.mischiefApplied === true;
  if (!own) reading.failed ??= `the move reader named no move the module knows (${interpretation.moveId ?? "none"})`;
  return reading;
}

/**
 * What the one reader's reading comes to at the table, as readAndRoute
 * routes it (src/pacing/readAndRoute.js): roll → its move rolled; offer → its
 * move on the narration's button; narrate → nothing. A reading the reader
 * failed on (readAndRoute's fallback: the call failed, the reply could not be
 * read) is no reading of the line and is not scored. Its `asked` and `risk`
 * ride with it, and what the gate refused (`unmade`).
 *
 * @param {{ line?: Object|null, lineError?: string|null }} replies
 * @returns {Object} readingOf's shape, with `design: "one"`, `route`, `asked`, `risk`, `unmade`
 */
function readingOfLine({ line = null, lineError = null } = {}) {
  const r = line?.reading ?? null;
  const route = line?.route?.route ?? null;
  const reading = {
    design:     "one",
    decision:   Object.values(DECISION).includes(line?.decision) ? line.decision : null,
    route,
    suggested:  null,
    move:       null,
    noMove:     false,
    offered:    null,
    unsure:     false,
    mischief:   r?.interpretation?.mischiefApplied === true,
    failed:     null,
    category:   typeof r?.category === "string" ? r.category : null,
    confidence: Number.isFinite(line?.confidence) ? line.confidence : null,
    asked:      r?.asked === true,
    risk:       r?.risk ?? null,
    unmade:     line?.unmade ?? null,
    reasons:    { line: String(r?.reason ?? "").trim(), route: String(line?.route?.why ?? "").trim() },
  };
  if (!line) { reading.failed = `the line reader gave no reading${lineError ? ` (${lineError})` : ""}`; return reading; }
  if (line.fallback === true || r?.failed) { reading.failed = `the line reader did not read the line (${r?.failed ?? line.reasoning ?? "no reason given"})`; return reading; }
  if (route === "roll") {
    reading.move = known(ordinary(line.moveId));
    if (!reading.move) reading.failed = `the line reader routed a roll of no move the module knows (${line.moveId ?? "none"})`;
  } else if (route === "offer") {
    reading.offered = known(ordinary(line.suggestedMove));
    reading.suggested = reading.offered;
  } else if (route !== "narrate") {
    reading.failed = `the line reader's reading was given no route (${route ?? "none"})`;
  }
  return reading;
}

/**
 * A reading against the reading its line should get.
 *
 * @param {{ moves?: string[], none?: boolean, rolled?: boolean }} want
 * @param {ReturnType<typeof readingOf>} reading
 * @returns {string} an OUTCOME
 */
export function scoreCase(want, reading) {
  if (!reading || reading.failed) return OUTCOME.FAILED;
  const control = want?.none === true;
  const wanted = new Set(control ? [] : want?.moves ?? []);
  if (reading.move) return control ? OUTCOME.MOVE_ROLLED : wanted.has(reading.move) ? OUTCOME.ROLLED : OUTCOME.ANOTHER_ROLLED;
  // A line that names its move asks for the roll: offered, it is left to ask again.
  if (reading.offered && want?.rolled === true && wanted.has(reading.offered)) return OUTCOME.OFFERED_NOT_ROLLED;
  if (reading.offered) return control ? OUTCOME.MOVE_OFFERED : wanted.has(reading.offered) ? OUTCOME.OFFERED : OUTCOME.ANOTHER_OFFERED;
  return control ? OUTCOME.NARRATED : OUTCOME.NOTHING;
}

// ── the run's numbers ────────────────────────────────────────────────────────

const isControl = (r) => r?.want?.none === true;
const count = (list, test) => list.filter(test).length;
const rate = (n, of) => (of > 0 ? n / of : null);

function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

/** The counts of a set of readings: one arm's, or one arm's in one family. */
function tally(list) {
  const scored = list.filter(r => r.outcome !== OUTCOME.FAILED);
  const wanting = scored.filter(r => !isControl(r));
  const controls = scored.filter(isControl);
  const rolled = count(wanting, r => r.outcome === OUTCOME.ROLLED);
  const offered = count(wanting, r => r.outcome === OUTCOME.OFFERED);
  const anotherRolled = count(wanting, r => r.outcome === OUTCOME.ANOTHER_ROLLED);
  const anotherOffered = count(wanting, r => r.outcome === OUTCOME.ANOTHER_OFFERED);
  const offeredNotRolled = count(wanting, r => r.outcome === OUTCOME.OFFERED_NOT_ROLLED);
  const right = count(controls, r => r.outcome === OUTCOME.NARRATED);
  // The dials' share (the switch's criterion 8): of the lines read right
  // whose move makes an action roll — a stat; the no-roll moves are offered
  // by rule — how many were rolled.
  const action = (r) => READ.has(r.outcome) && Array.isArray(MOVES[r.reading?.move ?? r.reading?.offered]?.stat) && MOVES[r.reading?.move ?? r.reading?.offered].stat.length > 0;
  const actionRead = count(wanting, action);
  const actionRolled = count(wanting, r => action(r) && r.outcome === OUTCOME.ROLLED);
  return {
    readings: list.length,
    failed:   list.length - scored.length,
    wanting:  wanting.length,
    read:     rolled + offered,
    readRate: rate(rolled + offered, wanting.length),
    rolled, offered, offeredNotRolled,
    actionRead, actionRolled, rolledShare: rate(actionRolled, actionRead),
    wrong:    anotherRolled + anotherOffered,
    anotherRolled, anotherOffered,
    // Of the other moves rolled, those the move reader says it chose on purpose (Balanced Mischief).
    mischief: count(wanting, r => r.outcome === OUTCOME.ANOTHER_ROLLED && r.reading?.mischief === true),
    nothing:  count(wanting, r => r.outcome === OUTCOME.NOTHING),
    controls: controls.length,
    controlsRight: right,
    controlRate:   rate(right, controls.length),
    controlsOffered: count(controls, r => r.outcome === OUTCOME.MOVE_OFFERED),
    controlsRolled:  count(controls, r => r.outcome === OUTCOME.MOVE_ROLLED),
  };
}

/** One arm's calls: how many, their tokens, their dollars at `prices`, how long each reader took. */
/**
 * Where a reading's line ended at the table: rolled, offered on a button, or
 * narrated with nothing — null for a reading the reader failed on.
 */
export function routeOf(reading) {
  if (!reading || reading.failed) return null;
  return reading.move ? "rolled" : reading.offered ? "offered" : "narrated";
}

function spendOf(list, prices) {
  const calls = list.flatMap(r => r.calls ?? []);
  const priced = calls.filter(c => c.usage && prices?.[c.model]);
  const sum = (key) => calls.reduce((n, c) => n + (Number(c.usage?.[key]) || 0), 0);
  const msOf = (reader) => calls.filter(c => c.reader === reader).map(c => c.ms).filter(Number.isFinite);
  const lineMs = (r) => (r.calls ?? []).reduce((n, c) => n + (Number(c.ms) || 0), 0);
  const perLine = list.map(lineMs).filter(n => n > 0);
  const time = (values) => ({ n: values.length, medianMs: percentile(values, 0.5), p90Ms: percentile(values, 0.9), maxMs: values.length ? Math.max(...values) : null });
  // A line's reading time by where it ended (the switch's criterion 6), and what a line costs (criterion 7).
  const byRoute = (route) => time(list.filter(r => routeOf(r.reading) === route).map(lineMs).filter(n => n > 0));
  const lineUsd = list.map(r => (r.calls ?? []).filter(c => c.usage && prices?.[c.model]).reduce((n, c) => n + costOf(prices[c.model], c.usage), 0))
    .filter(n => n > 0);
  return {
    calls:       calls.length,
    pacingCalls: count(calls, c => c.reader === "pacing"),
    moveCalls:   count(calls, c => c.reader === "move"),
    lineCalls:   count(calls, c => c.reader === "line"),
    callsPerLine: rate(calls.length, list.length),
    usd:         priced.reduce((n, c) => n + costOf(prices[c.model], c.usage), 0),
    // Calls the table has no price for, or that came back with no usage (a dry run's stubs): not in `usd`.
    unpriced:    calls.length - priced.length,
    tokens:      { input: sum("input_tokens"), cacheRead: sum("cache_read_input_tokens"), cacheWrite: sum("cache_creation_input_tokens"), output: sum("output_tokens") },
    models:      [...new Set(calls.map(c => c.model).filter(Boolean))],
    pacing:      time(msOf("pacing")),
    move:        time(msOf("move")),
    lineReader:  time(msOf("line")),
    line:        time(perLine),
    routes:      { narrated: byRoute("narrated"), offered: byRoute("offered"), rolled: byRoute("rolled") },
    // The median line (the switch's criterion 7, as worded) and the mean: today's median line is often
    // the pacing reader's one call, so the mean is the whole mix's cost a line, beside it.
    lineUsd:     { n: lineUsd.length, median: percentile(lineUsd, 0.5), mean: lineUsd.length ? lineUsd.reduce((n, x) => n + x, 0) / lineUsd.length : null },
  };
}

/**
 * An arm's fight lines (the switch's criterion 5): those read in a context
 * with a fight open — how many wanting a move were read, how many readings
 * rolled a move the character's position does not allow, and how many
 * controls had a move rolled.
 */
function fightsOf(list) {
  const fights = list.filter(r => r.fight && r.outcome !== OUTCOME.FAILED);
  const wanting = fights.filter(r => !isControl(r));
  const controls = fights.filter(isControl);
  return {
    readings: fights.length,
    wanting:  wanting.length,
    read:     count(wanting, r => READ.has(r.outcome)),
    illegal:  count(fights, r => r.reading?.move && !positionLegal(r.reading.move, r.fight)),
    controls: controls.length,
    controlsRolled: count(controls, r => r.outcome === OUTCOME.MOVE_ROLLED),
  };
}

const SEVERITY = [OUTCOME.ROLLED, OUTCOME.OFFERED, OUTCOME.OFFERED_NOT_ROLLED, OUTCOME.NARRATED, OUTCOME.ANOTHER_OFFERED, OUTCOME.ANOTHER_ROLLED,
  OUTCOME.MOVE_OFFERED, OUTCOME.MOVE_ROLLED, OUTCOME.NOTHING, OUTCOME.FAILED];

/** The outcome most of a line's repeats came to (a tie: the worse one). */
function verdictOf(outcomes) {
  const counts = new Map();
  for (const o of outcomes) counts.set(o, (counts.get(o) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || SEVERITY.indexOf(b[0]) - SEVERITY.indexOf(a[0]))[0]?.[0] ?? null;
}

/**
 * A run's numbers.
 *
 * @param {Array<{ arm: string, id: string, family: string, context?: string, line: string, want: Object, repeat?: number,
 *   outcome: string, reading: Object, source?: string, note?: string,
 *   calls?: Array<{ reader: "pacing"|"move", model: string, ms?: number, usage?: Object }> }>} results —
 *   one entry a reading: a line, read once, by one arm
 * @param {{ prices?: Record<string, { input: number, output: number, cacheRead?: number }> }} [options] —
 *   dollars per million tokens, as explore.config.json has them
 * @returns {Object} per arm: the counts, the read rate over lines wanting a move, the controls' accuracy, the
 *   same by family, self-consistency, cost and time; and across arms: the lines they read differently, the
 *   lines none read, the controls any read a move into
 */
export function summarise(results, { prices = {} } = {}) {
  const arms = [...new Set(results.map(r => r.arm))];
  const families = [...new Set(results.map(r => r.family))];
  const kinds = [...new Set(results.map(r => r.kind).filter(Boolean))];
  const ids = [...new Set(results.map(r => r.id))];
  const byArm = {};
  for (const arm of arms) {
    const mine = results.filter(r => r.arm === arm);
    // Self-consistency: of the lines read more than once, those whose repeats all came to the same thing.
    const repeated = ids.map(id => ({ id, outcomes: mine.filter(r => r.id === id).map(r => r.outcome) })).filter(x => x.outcomes.length > 1);
    const disagreeing = repeated.filter(x => new Set(x.outcomes).size > 1);
    const first = mine[0] ?? {};
    byArm[arm] = {
      design: first.design ?? "two",
      model:  first.model ?? arm,
      ...tally(mine),
      byFamily: Object.fromEntries(families.map(f => [f, tally(mine.filter(r => r.family === f))])),
      // A kind is a probe the list names across families (issue #383's): how
      // many of its readings came out as its lines want.
      byKind: Object.fromEntries(kinds.map((k) => {
        const of = mine.filter(r => r.kind === k && r.outcome !== OUTCOME.FAILED);
        return [k, { readings: of.length, wanted: count(of, r => (isControl(r) ? r.outcome === OUTCOME.NARRATED : READ.has(r.outcome))) }];
      })),
      fights: fightsOf(mine),
      consistency: { repeated: repeated.length, same: repeated.length - disagreeing.length, rate: rate(repeated.length - disagreeing.length, repeated.length), disagreeing },
      spend: spendOf(mine, prices),
    };
  }

  // Each line across the arms: what most of its repeats came to in each.
  const lines = ids.map((id) => {
    const readings = results.filter(r => r.id === id);
    const first = readings[0];
    const perArm = {};
    for (const arm of arms) {
      const mine = readings.filter(r => r.arm === arm);
      if (!mine.length) continue;
      const verdict = verdictOf(mine.map(r => r.outcome));
      perArm[arm] = { verdict, outcomes: mine.map(r => r.outcome), reading: (mine.find(r => r.outcome === verdict) ?? mine[0]).reading };
    }
    return { id, family: first.family, context: first.context ?? null, line: first.line, want: first.want, source: first.source ?? null, note: first.note ?? null, arms: perArm };
  });
  const verdicts = (l) => Object.values(l.arms).map(a => a.verdict);
  const scoredByAll = (l) => Object.keys(l.arms).length === arms.length && !verdicts(l).includes(OUTCOME.FAILED);
  const wanting = lines.filter(l => l.want?.none !== true && scoredByAll(l));

  return {
    arms, families, kinds,
    lines: ids.length,
    readings: results.length,
    byArm,
    // Lines the arms read differently: two arms or more read the line, and
    // what they came to differs. A reading a reader's call failed on is no
    // reading of the line, and makes no difference.
    differing: lines.filter(l => new Set(verdicts(l).filter(v => v !== OUTCOME.FAILED)).size > 1),
    // Of the lines wanting a move that every arm read: how many all read, none read, some read.
    agreement: {
      lines:    wanting.length,
      allRead:  count(wanting, l => verdicts(l).every(v => READ.has(v))),
      noneRead: count(wanting, l => verdicts(l).every(v => !READ.has(v))),
      someRead: count(wanting, l => verdicts(l).some(v => READ.has(v)) && !verdicts(l).every(v => READ.has(v))),
    },
    unreadByAll: wanting.filter(l => verdicts(l).every(v => !READ.has(v))),
    controlsMisread: lines.filter(l => l.want?.none === true && verdicts(l).some(v => v === OUTCOME.MOVE_OFFERED || v === OUTCOME.MOVE_ROLLED)),
    usd: arms.reduce((n, arm) => n + byArm[arm].spend.usd, 0),
  };
}

// ── the switch ───────────────────────────────────────────────────────────────

/**
 * The one reader against the two, model by model, on the criteria the
 * design switches on (issue #384 — decisions.md → "Overhauls 1 and 4";
 * the scope's section 8.2) — for every model a `two:` and a `one:` arm both
 * read. Counts are the runs' own: a run a cap stopped compares the readings
 * each arm made. A criterion with nothing to measure (no fight line, no
 * kind) is said to have none, and does not pass or fail.
 *
 * @param {ReturnType<typeof summarise>} summary
 * @returns {Array<{ model: string, two: string, one: string, verdict: "switch"|"do not switch"|"not measured in full",
 *   criteria: Array<{ n: number, name: string, pass: boolean|null, detail: string }> }>}
 */
export function compareDesigns(summary) {
  const { byArm = {}, arms = [] } = summary ?? {};
  const pairs = [];
  for (const one of arms.filter(a => byArm[a].design === "one")) {
    const model = byArm[one].model;
    const two = arms.find(a => byArm[a].design === "two" && byArm[a].model === model);
    if (two) pairs.push({ model, two, one });
  }
  const secs = (ms) => (ms == null ? "–" : `${(ms / 1000).toFixed(2)} s`);
  const usd = (n) => (n == null ? "–" : `$${n.toFixed(4)}`);
  return pairs.map(({ model, two, one }) => {
    const a = byArm[two];
    const b = byArm[one];
    const criteria = [];
    const add = (n, name, pass, detail) => criteria.push({ n, name, pass, detail });

    const fell = Object.keys(b.byFamily ?? {})
      .map(f => ({ f, drop: (a.byFamily?.[f]?.read ?? 0) - (b.byFamily?.[f]?.read ?? 0), wanting: a.byFamily?.[f]?.wanting ?? 0 }))
      .filter(x => x.wanting > 0 && x.drop > 2);
    add(1, "lines wanting a move", b.read >= a.read - 2 && !fell.length,
      `read ${b.read} of ${b.wanting} against ${a.read} of ${a.wanting}${fell.length ? `; fell by more than two: ${fell.map(x => `${x.f} (−${x.drop})`).join(", ")}` : "; no family fell by more than two"}`);
    const misread = (t) => t.controlsOffered + t.controlsRolled;
    add(2, "controls offered or rolled a move", misread(b) <= misread(a) + 1, `${misread(b)} of ${b.controls} against ${misread(a)} of ${a.controls}`);
    add(3, "another move rolled or offered", b.wrong <= a.wrong, `${b.wrong} against ${a.wrong}`);
    const kinds = Object.entries(b.byKind ?? {}).filter(([, k]) => k.readings > 0);
    const shortKinds = kinds.filter(([, k]) => k.wanted < Math.ceil(0.75 * k.readings));
    add(4, "issue #383's kinds, each as wanted in three readings of four", kinds.length ? !shortKinds.length : null,
      kinds.length ? kinds.map(([name, k]) => `${name} ${k.wanted} of ${k.readings}`).join("; ") : "no kind was read");
    add(5, "fights", b.fights.readings ? b.fights.read >= a.fights.read && b.fights.illegal === 0 && b.fights.controlsRolled === 0 : null,
      b.fights.readings
        ? `read ${b.fights.read} of ${b.fights.wanting} against ${a.fights.read} of ${a.fights.wanting}; ${b.fights.illegal} not legal for the position; ${b.fights.controlsRolled} control(s) rolled`
        : "no fight line was read");
    const rolled = [b.spend.routes.rolled.medianMs, a.spend.routes.rolled.medianMs];
    const narrated = [b.spend.routes.narrated.medianMs, a.spend.routes.narrated.medianMs];
    const timed = rolled.every(Number.isFinite) && narrated.every(Number.isFinite);
    add(6, "time: a rolled line 1 s faster, a narrated one no more than 0.3 s slower",
      timed ? rolled[0] <= rolled[1] - 1000 && narrated[0] <= narrated[1] + 300 : null,
      `rolled ${secs(rolled[0])} against ${secs(rolled[1])}; narrated ${secs(narrated[0])} against ${secs(narrated[1])}`);
    const cost = [b.spend.lineUsd.median, a.spend.lineUsd.median];
    const mean = [b.spend.lineUsd.mean, a.spend.lineUsd.mean];
    add(7, "cost: the median line no dearer", cost.every(Number.isFinite) ? cost[0] <= cost[1] : null,
      `${usd(cost[0])} against ${usd(cost[1])}; the mean line ${usd(mean[0])} against ${usd(mean[1])}`);
    const share = [b.rolledShare, a.rolledShare];
    add(8, "the dials hold: the rolled share within 10 points", share.every(x => x != null) ? Math.abs(share[0] - share[1]) <= 0.10 : null,
      `${share[0] == null ? "–" : `${Math.round(share[0] * 100)}%`} (${b.actionRolled} of ${b.actionRead}) against ${share[1] == null ? "–" : `${Math.round(share[1] * 100)}%`} (${a.actionRolled} of ${a.actionRead})`);
    add(9, "no more than one unreadable reply in a hundred", b.readings ? b.failed / b.readings <= 0.01 : null, `${b.failed} of ${b.readings}`);

    // Every criterion must hold: one that fails is no switch; one the run did not measure leaves it open.
    const verdict = criteria.some(c => c.pass === false) ? "do not switch"
      : criteria.some(c => c.pass === null) ? "not measured in full" : "switch";
    return { model, two, one, verdict, criteria };
  });
}

// ── the report ───────────────────────────────────────────────────────────────

const pct = (x) => (x == null ? "–" : `${Math.round(x * 100)}%`);
const outOf = (n, total) => (total ? `${n} of ${total} (${pct(n / total)})` : "–");
const secs = (ms) => (ms == null ? "–" : `${(ms / 1000).toFixed(1)} s`);
const label = (id) => (id ? moveLabel(id) : "no move");
const quote = (text) => (text ? ` — “${String(text).replace(/\s+/g, " ").trim()}”` : "");
const wants = (want) => (want?.none === true ? "no move" : `${(want?.moves ?? []).map(label).join(" or ")}${want?.rolled === true ? ", rolled" : ""}`);

/** One reading in words: what each reader said, and why. */
function readingLine(reading) {
  if (!reading) return "no reading";
  if (reading.failed) return `not read: ${reading.failed}`;
  if (reading.design === "one") return lineReadingLine(reading);
  const kind = [reading.category, reading.confidence != null ? reading.confidence.toFixed(2) : null].filter(Boolean).join(", ");
  const said = (what) => `the pacing reader ${what}${kind ? ` (${kind})` : ""}${quote(reading.reasons?.pacing)}`;
  if (reading.decision === DECISION.NARRATIVE) return said("narrates it, with no move offered");
  if (reading.decision === DECISION.OFFER) return said(reading.suggested ? `narrates it and offers ${label(reading.suggested)}` : "narrates it and names no move to offer");
  const pacing = said(`calls it a move${reading.suggested ? `, naming ${label(reading.suggested)}` : ""}`);
  if (reading.move) return `${pacing}; the move reader makes it ${label(reading.move)}${reading.mischief ? " (a misread on purpose, it says)" : ""}${quote(reading.reasons?.move)}`;
  const then = reading.offered ? `so it is narrated with ${label(reading.offered)} offered` : "so it is narrated with nothing offered";
  return `${pacing}; the move reader ${reading.unsure ? "is unsure of its reading" : "reads no move in it"}, ${then}${quote(reading.reasons?.move)}`;
}

/** The one reader's reading in words: where it went, what it read, asked and risk, and why. */
function lineReadingLine(reading) {
  const kind = [reading.category, reading.asked ? "asked" : null, reading.risk ? `risk ${reading.risk}` : null].filter(Boolean).join(", ");
  const where = reading.move ? `rolls ${label(reading.move)}`
    : reading.offered ? `narrates it and offers ${label(reading.offered)}`
    : reading.unmade ? `narrates it: not now, ${label(reading.unmade.moveId)} — ${reading.unmade.why}`
    : "narrates it, with no move offered";
  return `the line reader ${where}${kind ? ` (${kind})` : ""}${quote(reading.reasons?.line)}${reading.reasons?.route ? ` [${reading.reasons.route}]` : ""}`;
}

function lineBlock(l, arms) {
  const about = [l.family, `wants ${wants(l.want)}`, l.context ? `context ${l.context}` : null, l.source ? `from ${l.source}` : null].filter(Boolean).join(" · ");
  const out = [`**\`${l.id}\`** — ${about}`, "", `> ${l.line}`, ""];
  if (l.note) out.push(`_${l.note}_`, "");
  for (const arm of arms) {
    const a = l.arms[arm];
    if (!a) continue;
    const spread = a.outcomes.length > 1 && new Set(a.outcomes).size > 1 ? ` (its repeats: ${a.outcomes.join(", ")})` : "";
    out.push(`- \`${arm}\` — **${a.verdict}**${spread}: ${readingLine(a.reading)}`);
  }
  out.push("");
  return out;
}

/**
 * The report's sections for a run that measures the one reader beside the
 * two (or any run with fight lines or kinds): calls and time by where a line
 * ended, the dials' share, each kind, the fights — and, for a model both
 * designs read, the switch's criteria (compareDesigns).
 *
 * @param {ReturnType<typeof summarise>} summary
 * @returns {string[]}
 */
function designSections(summary) {
  const { arms, byArm } = summary;
  const out = [];
  const route = (t) => (t.n ? `${secs(t.medianMs)} (${t.n})` : "–");
  out.push("## Calls and time by where a line ended", "",
    "A line's reading time is its calls' together (the pacing reader's and the move reader's, or the line reader's one); a line ended rolled, offered on a button, or narrated with nothing.", "",
    "| Arm | Calls a line | Narrated: median (lines) | Offered: median (lines) | Rolled: median (lines) | A line's cost: median | A line's cost: mean |",
    "|---|---|---|---|---|---|---|");
  const dollars = (n) => (n == null ? "–" : `$${n.toFixed(4)}`);
  for (const arm of arms) {
    const s = byArm[arm].spend;
    out.push(`| \`${arm}\` | ${s.callsPerLine == null ? "–" : s.callsPerLine.toFixed(2)} | ${route(s.routes.narrated)} | ${route(s.routes.offered)} | ${route(s.routes.rolled)} `
      + `| ${dollars(s.lineUsd.median)} | ${dollars(s.lineUsd.mean)} |`);
  }
  out.push("");

  out.push("## The dials' share", "",
    "Of the lines read right whose move makes an action roll (a stat — a move with no roll is offered by rule), how many were rolled rather than offered: the dials at work.", "");
  for (const arm of arms) {
    const t = byArm[arm];
    out.push(`- \`${arm}\`: ${outOf(t.actionRolled, t.actionRead)} rolled${t.offeredNotRolled ? `; ${t.offeredNotRolled} line(s) that asked to be rolled were offered` : ""}.`);
  }
  out.push("");

  if (summary.kinds?.length) {
    out.push("## By kind", "", "A kind is a probe across families (issue #383's): its controls want narration, its other lines their move read.", "",
      `| Kind | ${arms.map(a => `\`${a}\``).join(" | ")} |`, `|---|${arms.map(() => "---").join("|")}|`);
    for (const kind of summary.kinds) {
      out.push(`| ${kind} | ${arms.map((arm) => { const k = byArm[arm].byKind[kind]; return k?.readings ? `${k.wanted} of ${k.readings}` : "–"; }).join(" | ")} |`);
    }
    out.push("");
  }

  if (arms.some(arm => byArm[arm].fights.readings)) {
    out.push("## Fights", "", "The lines read with a fight open, the character's position in it set: read, a move the position does not allow, a control rolled.", "");
    for (const arm of arms) {
      const f = byArm[arm].fights;
      out.push(`- \`${arm}\`: ${outOf(f.read, f.wanting)} read; ${f.illegal} reading(s) not legal for the position; ${f.controlsRolled} of ${f.controls} control(s) rolled.`);
    }
    out.push("");
  }

  const pairs = compareDesigns(summary);
  if (pairs.length) {
    out.push("## Against the switch criteria", "",
      "The one reader against the two on the same model, by the scope's section 8.2 (computed from the tables above; a criterion with nothing measured is open). A one-line difference is not a finding.", "");
    for (const p of pairs) {
      out.push(`### \`${p.one}\` against \`${p.two}\` — ${p.verdict}`, "", "| # | Criterion | Holds | Measured |", "|---|---|---|---|");
      for (const c of p.criteria) out.push(`| ${c.n} | ${c.name} | ${c.pass === null ? "not measured" : c.pass ? "yes" : "**no**"} | ${c.detail} |`);
      out.push("");
    }
  }
  return out;
}

/**
 * The run's report, in Markdown: its questions, the headline, the families,
 * the lines the arms read differently with each reader's stated reason, the
 * lines no arm read, what it cost — and what the test does not show.
 *
 * @param {ReturnType<typeof summarise>} summary
 * @param {{ runId?: string, mode?: "dry"|"live", startedAt?: string, commit?: string|null, questions?: string[],
 *   repeats?: number, planned?: number, stopped?: string|null, strays?: number, notSet?: Array<{ key: string, why: string }>,
 *   dials?: Object, thinking?: Record<string, string|null>, own?: string[] }} [meta] — `thinking`: the
 *   thinking-off form each arm's calls carried; `own`: the model the readers themselves ask for (the module's)
 * @returns {string}
 */
export function report(summary, meta = {}) {
  const { arms, byArm } = summary;
  const dry = meta.mode !== "live";
  const out = [`# The readers on plain lines${meta.runId ? ` — ${meta.runId}` : ""}`, ""];
  out.push(`${dry ? "A dry run" : "A live run"}${meta.startedAt ? `, ${meta.startedAt}` : ""}${meta.commit ? `, at commit \`${String(meta.commit).slice(0, 12)}\`` : ""}: `
    + `${summary.lines} line(s), read ${meta.repeats ?? 1} time(s) each by ${arms.map(a => `\`${a}\``).join(" and ") || "no arm"} — ${summary.readings} reading(s)`
    + `${meta.planned != null && meta.planned !== summary.readings ? ` of the ${meta.planned} planned` : ""}.`, "");
  if (dry) {
    out.push("> **The readings below are stubs.** A dry run calls no model: the harness answers both readers with its neutral reply, which neither can read, "
      + "so every line comes out as \"reader failed\". It shows that the flow runs and what prompts it builds (requests.json) — nothing about how a line is read.", "");
  }
  if (meta.stopped) out.push(`**Stopped early:** ${meta.stopped}. What follows is what was read before that.`, "");

  out.push("## What this run was to answer", "");
  if (meta.questions?.length) {
    meta.questions.forEach((q, i) => out.push(`${i + 1}. ${q}`));
    out.push("", "_To write — the answer to each, with its evidence from the tables below, or that the run did not answer it._", "");
  } else out.push("_No questions were given (a dry run needs none; a live run is refused without them)._", "");

  if (!summary.readings) {
    out.push("## No line was read", "", "The run ended before its first reading — run.json says why.", "");
    return `${out.join("\n")}\n`;
  }

  out.push("## How a line is scored", "",
    "Each line has the reading it should get: one or more moves the rules allow, or no move (a control). A line is read by the pacing reader, "
    + "and — when that calls it a move — by the move reader, exactly as the chat pipeline calls them; nothing is rolled or narrated.", "",
    `- **${OUTCOME.ROLLED}** — the pacing reader calls it a move and the move reader picks a wanted one: the roll dialog opens on the right move.`,
    `- **${OUTCOME.OFFERED}** — the line is narrated with a wanted move on the card's button: the pacing reader offered it, or it called a move, the move reader read none (or was unsure), and the move it had named is offered.`,
    `- **${OUTCOME.ANOTHER_ROLLED}** / **${OUTCOME.ANOTHER_OFFERED}** — a move that is not one the line wants.`,
    `- **${OUTCOME.NOTHING}** — narrated with no move offered: the player is left to ask for one.`,
    `- **${OUTCOME.OFFERED_NOT_ROLLED}** — a line that names its move wants it rolled (the pacing reader's own rule: a line that names its move asks for it, at any dial); offered on a button instead, it is not read.`,
    `- A control: **${OUTCOME.NARRATED}** (right), **${OUTCOME.MOVE_OFFERED}**, **${OUTCOME.MOVE_ROLLED}**.`,
    `- **${OUTCOME.FAILED}** — a reader's call failed or its reply could not be read; not scored, and not in any rate.`, "",
    "**Rolled and offered both count as read**: either way the player gets the right move without naming it. Offered costs them a click, and the line is narrated first.", "");
  if (arms.some(arm => byArm[arm].design === "one")) {
    out.push(`An arm \`one:<model>\` reads each line with the one reader instead (src/moves/reader.js, routed by src/pacing/readAndRoute.js): one call, and its route is what the line comes to — roll, offer on a button, or narrate. A line that asks to be rolled (a move named after a run of moves) is read only when it is: offered, it is **${OUTCOME.OFFERED_NOT_ROLLED}**.`, "");
  }

  out.push("## Headline", "",
    "| Arm | Lines wanting a move | Read | rolled | offered | Another move | Nothing | Controls right | Reader failed |",
    "|---|---|---|---|---|---|---|---|---|");
  for (const arm of arms) {
    const t = byArm[arm];
    const another = t.wrong ? `${t.wrong} (${t.anotherRolled} rolled${t.mischief ? `, ${t.mischief} of them on purpose` : ""}; ${t.anotherOffered} offered)` : "0";
    out.push(`| \`${arm}\` | ${t.wanting} | **${outOf(t.read, t.wanting)}** | ${t.rolled} | ${t.offered}${t.offeredNotRolled ? ` (and ${t.offeredNotRolled} named, offered, not rolled)` : ""} | ${another} | ${t.nothing} | ${outOf(t.controlsRight, t.controls)} | ${t.failed} |`);
  }
  out.push("");
  if (arms.length > 1 && summary.agreement.lines) {
    const a = summary.agreement;
    out.push(`Of the ${a.lines} line(s) wanting a move that every arm read: **${a.allRead}** every arm read right, **${a.someRead}** some did and some did not, `
      + `**${a.noneRead}** none did. A line no arm reads is not the model's doing alone; a line one arm reads and another does not is where the model matters.`, "");
  }

  out.push("## By family", "",
    `| Family | ${arms.map(a => `\`${a}\``).join(" | ")} |`,
    `|---|${arms.map(() => "---").join("|")}|`);
  for (const family of summary.families) {
    const cells = arms.map((arm) => {
      const t = byArm[arm].byFamily[family];
      if (!t || !t.readings) return "–";
      const failed = t.failed ? `; ${t.failed} not read` : "";
      if (t.controls && !t.wanting) return `${outOf(t.controlsRight, t.controls)} narrated; ${t.controlsOffered} offered a move, ${t.controlsRolled} rolled${failed}`;
      return `${outOf(t.read, t.wanting)} read (${t.rolled} rolled, ${t.offered} offered); ${t.wrong} another move, ${t.nothing} nothing${failed}`;
    });
    out.push(`| ${family} | ${cells.join(" | ")} |`);
  }
  out.push("");

  // With no reading scored — a dry run's stubs, or every call failed — there
  // is no line to list: "none unread" would read as a result.
  const scored = arms.reduce((n, arm) => n + byArm[arm].readings - byArm[arm].failed, 0);
  if (!scored) {
    out.push("## The lines", "", `_No reading was scored${dry ? ": a dry run's are all stubs" : ": every reader's call failed, or its reply could not be read"}._`, "");
  } else if (arms.length > 1) {
    out.push("## Where the arms differ", "");
    if (!summary.differing.length) out.push("_No line was read differently by the arms._", "");
    for (const l of summary.differing) out.push(...lineBlock(l, arms));
  }

  if (scored) {
    out.push(arms.length > 1 ? "## Lines no arm read" : "## Lines not read", "");
    if (!summary.unreadByAll.length) out.push("_None: every line wanting a move that was scored was read by at least one arm._", "");
    for (const l of summary.unreadByAll) out.push(...lineBlock(l, arms));

    out.push("## Controls read as a move", "");
    if (!summary.controlsMisread.length) out.push("_None: no arm offered or rolled a move for a line that makes none._", "");
    for (const l of summary.controlsMisread) out.push(...lineBlock(l, arms));
  }

  if (scored && arms.some(arm => byArm[arm].consistency.repeated)) {
    out.push("## Self-consistency", "", "A line read more than once by the same arm: did its repeats come to the same thing?", "");
    for (const arm of arms) {
      const c = byArm[arm].consistency;
      out.push(`- \`${arm}\`: ${outOf(c.same, c.repeated)} line(s) came out the same every time.`
        + `${c.disagreeing.length ? ` Not the same: ${c.disagreeing.map(d => `\`${d.id}\` (${d.outcomes.join(", ")})`).join("; ")}.` : ""}`);
    }
    out.push("");
  }

  out.push("## Cost and time", "",
    "| Arm | Calls (pacing + move, or the line reader's) | Input | Cache read | Cache write | Output | Cost | Pacing reader, median | Move reader, median | A line, median / p90 |",
    "|---|---|---|---|---|---|---|---|---|---|");
  for (const arm of arms) {
    const s = byArm[arm].spend;
    const calls = byArm[arm].design === "one" ? `${s.calls} (the line reader)` : `${s.calls} (${s.pacingCalls} + ${s.moveCalls})`;
    const readers = byArm[arm].design === "one" ? `${secs(s.lineReader.medianMs)} (the line reader) | –` : `${secs(s.pacing.medianMs)} | ${secs(s.move.medianMs)}`;
    out.push(`| \`${arm}\` | ${calls} | ${s.tokens.input} | ${s.tokens.cacheRead} | ${s.tokens.cacheWrite} | ${s.tokens.output} `
      + `| $${s.usd.toFixed(4)}${s.unpriced ? ` (${s.unpriced} call(s) not priced)` : ""} | ${readers} | ${secs(s.line.medianMs)} / ${secs(s.line.p90Ms)} |`);
  }
  out.push("", `Total: $${summary.usd.toFixed(4)}${dry ? " — a dry run spends nothing" : ", by the price table in explore.config.json (computed from each reply's usage, not billed from it)"}.`
    + `${meta.strays ? ` **${meta.strays} call(s) that were not a reader's were made, and reached no model** — see run.json.` : ""}`, "");

  if (scored) out.push(...designSections(summary));

  out.push("## What this test does not show", "",
    "- **Nothing is rolled or narrated.** A line counted as rolled is one whose roll dialog would open on the right move; the stat, the stakes, the dice and the narration are not looked at.",
    "- **The wanted readings are one reader's reading of the rules.** Where the rules allow two moves the list accepts both; a line whose reading is arguable was left out, and a note on a line says where it is close.",
    `- **${(meta.repeats ?? 1) > 1 ? "A few readings of a line are a small sample" : "One reading of a line is one sample"}** of a reader that does not always answer alike: a line read right four times in five shows here as right or as wrong. READERS_REPEATS measures it.`,
    `- **${summary.lines} line(s), a handful to a move.** A family's rate rests on three to ten lines, a kind's on two; a difference of one line between arms is not a finding.`,
    "- **The scenes are written by hand**: one or two paragraphs of narration, with a matching scene frame, where a table has up to three cards with the player's own lines among them — and none of the drift a long session leaves in a scene.",
    "- **One character, alone, with one connection and one vow**, at the pacing and mischief dials a new world has"
      + `${meta.dials ? ` (${Object.entries(meta.dials).map(([k, v]) => `${k} ${v}`).join(", ")})` : ""}.`
      + (arms.some(arm => byArm[arm].fights.readings)
        ? " A fight is one track with the character's position in it set by hand, never one a roll began or moved."
        : " No fight is open in any context read: the readers' rules for an open fight are not exercised."),
    "- **The sheet is set by hand.** Each context's health, spirit, supply and impacts, its vow's progress and the ship's integrity are written to the world before its lines are read, and both readers are told them (their SITUATION block). A table's sheet moves under play: no line here follows a roll that changed it"
      + `${meta.notSet?.length ? ` (not set in the world: ${[...new Set(meta.notSet.map(n => n.key))].join(", ")})` : ""}.`,
    "- **Each line is read on its own**: the count of recent moves is cleared before every reading — and set, before a line whose case says it follows a run of moves (`recentMoves`), to that many moves of the last five. Nothing else of a run of rolls is set: no move card is in the recent scene.",
    "- **Only the model changes between arms of one design.** Each arm reads the same prompts as the others of its design, written for the readers' own model"
      + `${meta.own?.length ? ` (${meta.own.map(m => `\`${m}\``).join(", ")})` : ""}; a prompt tuned to another model might read differently.`,
    "- **No arm thinks first.** The readers turn thinking off, each model in its own form"
      + `${meta.thinking ? ` (${Object.entries(meta.thinking).map(([arm, form]) => `\`${arm}\`: ${form ?? "no form sent"}`).join("; ")})` : ""}`
      + ", and each model answers at its own default effort; a reader allowed to think, or set to another effort, might read differently.",
    "");
  return `${out.join("\n")}\n`;
}

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
// This file is the part of that test that needs no browser: the list's own
// checks, what a pair of replies comes to at the table, its score against the
// reading the line should get, the run's numbers and its report.
//
// Pure: no Foundry, no network, no clock, no file.

import { MOVES } from "../../../../src/schemas.js";
import { movesNamedIn, moveLabel } from "./moveNames.mjs";
import { costOf } from "./budget.mjs";

/** The pacing reader's three decisions (src/pacing/classifier.js PACING_DECISION). */
export const DECISION = Object.freeze({
  MOVE:      "MOVE",
  OFFER:     "NARRATIVE_WITH_MOVE_AVAILABLE",
  NARRATIVE: "NARRATIVE",
});

/**
 * What a reading comes to, against the reading its line should get. A line
 * that wants a move: the move rolled, the move offered on a button, another
 * move rolled, another move offered, or nothing. A control — a line that
 * makes no move: narrated, a move offered, or a move rolled. A reading a
 * reader's call failed on is none of these and is counted apart.
 */
export const OUTCOME = Object.freeze({
  ROLLED:          "rolled",
  OFFERED:         "offered",
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
 * buildContextSummary (src/moves/interpreter.js).
 */
export const STATE_READ = Object.freeze({
  location:   "the pacing reader's CURRENT SCENE — \"Current location\", from campaignState.currentLocationId / currentLocationType",
  frame:      "the pacing reader's CURRENT SCENE — \"Scene frame\", from campaignState.sceneFrame",
  connection: "both readers, from the bond Item on the character's sheet: its name and whether it is bonded (the pacing reader); its name, rank and relationship ticks, or that it is bonded (the move reader)",
  vow:        "the move reader's \"Open vows\", by name alone, from the vow Item on the character's sheet; the pacing reader is told no vow",
  tracks:     "the move reader's \"Open progress tracks\", by type and label; an open fight or scene challenge would reach the pacing reader too",
});

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
    if (!STATE_READ[key]) out.push({ key, why: "neither reader's prompt reads it (the sheet's meters reach neither)" });
  }
  if (state?.vow && (state.vow.ticks != null)) out.push({ key: "vow.ticks", why: "the move reader is told an open vow's name and nothing of its progress; the pacing reader is told no vow" });
  if ((state?.tracks ?? []).some(t => t?.ticks != null)) out.push({ key: "tracks[].ticks", why: "the move reader is told a track's type and label, not its progress" });
  return out;
}

// ── the list ─────────────────────────────────────────────────────────────────

/** What a wanted move needs its context to hold, or null. */
function contextProblem(moveId, state) {
  const connection = state?.connection ?? null;
  const tracks = Array.isArray(state?.tracks) ? state.tracks : [];
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
 * that is no scene, a case in a context the list does not have, a move id
 * the module does not know, a line that names a move or uses a rules word, a
 * case that wants neither a move nor none, an id used twice, a wanted move
 * its context cannot hold.
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
    for (const track of state.tracks ?? []) {
      if (!track?.type || !track?.label) problems.push(`context "${key}": a track needs a type and a label`);
      // An open fight changes both readers' rules, and the runner hands the
      // move reader no combat position: a fight is not a context of this test.
      if (track?.type === "combat") problems.push(`context "${key}": an open fight is not a context of this test`);
    }
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
    if (typeof c?.line !== "string" || !c.line.trim()) problems.push(`${at}: it has no line`);
    else {
      const named = movesNamedIn(c.line);
      if (named.length) problems.push(`${at}: its line names ${named.join(", ")} — a plain line names no move and uses no rules word`);
    }
    const none = c?.want?.none === true;
    const moves = c?.want?.moves;
    if (none && moves !== undefined) problems.push(`${at}: it wants both a move and none`);
    else if (!none && !(Array.isArray(moves) && moves.length)) problems.push(`${at}: it wants neither a move (want.moves) nor none (want.none)`);
    else if (!none) {
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
 * as getRecentSceneForReading gives it, the sheet's live connections and open
 * vows, the open tracks, the current location and the scene frame.
 *
 * @param {{ scene?: string[], state?: Object }} context
 * @param {{ scene: string, location: string|null, frame: Object|null,
 *   connections: Array<{ name: string, ticks: number, bonded: boolean }>, vows: string[],
 *   tracks: Array<{ type: string, label: string }> }} applied
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
  const vows = applied.vows ?? [];
  if (state.vow?.name ? !(vows.length === 1 && vows[0] === state.vow.name) : vows.length) return "the sheet's open vows are not the context's";
  const wanted = state.tracks ?? [];
  const tracks = applied.tracks ?? [];
  if (wanted.length !== tracks.length || wanted.some(w => !tracks.some(a => a.type === w.type && a.label === w.label))) return "the open tracks are not the context's";
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
 * @param {{ pacing?: Object|null, interpretation?: Object|null, interpretError?: string|null }} replies —
 *   decidePacing's decision and interpretMove's reading, as the page returns them
 * @returns {{ decision: string|null, suggested: string|null, move: string|null, noMove: boolean, offered: string|null,
 *   unsure: boolean, mischief: boolean, failed: string|null, category: string|null, confidence: number|null,
 *   reasons: { pacing: string, move: string } }}
 */
export function readingOf({ pacing = null, interpretation = null, interpretError = null } = {}) {
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
 * A reading against the reading its line should get.
 *
 * @param {{ moves?: string[], none?: boolean }} want
 * @param {ReturnType<typeof readingOf>} reading
 * @returns {string} an OUTCOME
 */
export function scoreCase(want, reading) {
  if (!reading || reading.failed) return OUTCOME.FAILED;
  const control = want?.none === true;
  const wanted = new Set(control ? [] : want?.moves ?? []);
  if (reading.move) return control ? OUTCOME.MOVE_ROLLED : wanted.has(reading.move) ? OUTCOME.ROLLED : OUTCOME.ANOTHER_ROLLED;
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
  const right = count(controls, r => r.outcome === OUTCOME.NARRATED);
  return {
    readings: list.length,
    failed:   list.length - scored.length,
    wanting:  wanting.length,
    read:     rolled + offered,
    readRate: rate(rolled + offered, wanting.length),
    rolled, offered,
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
function spendOf(list, prices) {
  const calls = list.flatMap(r => r.calls ?? []);
  const priced = calls.filter(c => c.usage && prices?.[c.model]);
  const sum = (key) => calls.reduce((n, c) => n + (Number(c.usage?.[key]) || 0), 0);
  const msOf = (reader) => calls.filter(c => c.reader === reader).map(c => c.ms).filter(Number.isFinite);
  const perLine = list.map(r => (r.calls ?? []).reduce((n, c) => n + (Number(c.ms) || 0), 0)).filter(n => n > 0);
  const time = (values) => ({ n: values.length, medianMs: percentile(values, 0.5), p90Ms: percentile(values, 0.9), maxMs: values.length ? Math.max(...values) : null });
  return {
    calls:       calls.length,
    pacingCalls: count(calls, c => c.reader === "pacing"),
    moveCalls:   count(calls, c => c.reader === "move"),
    usd:         priced.reduce((n, c) => n + costOf(prices[c.model], c.usage), 0),
    // Calls the table has no price for, or that came back with no usage (a dry run's stubs): not in `usd`.
    unpriced:    calls.length - priced.length,
    tokens:      { input: sum("input_tokens"), cacheRead: sum("cache_read_input_tokens"), cacheWrite: sum("cache_creation_input_tokens"), output: sum("output_tokens") },
    models:      [...new Set(calls.map(c => c.model).filter(Boolean))],
    pacing:      time(msOf("pacing")),
    move:        time(msOf("move")),
    line:        time(perLine),
  };
}

const SEVERITY = [OUTCOME.ROLLED, OUTCOME.OFFERED, OUTCOME.NARRATED, OUTCOME.ANOTHER_OFFERED, OUTCOME.ANOTHER_ROLLED,
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
  const ids = [...new Set(results.map(r => r.id))];
  const byArm = {};
  for (const arm of arms) {
    const mine = results.filter(r => r.arm === arm);
    // Self-consistency: of the lines read more than once, those whose repeats all came to the same thing.
    const repeated = ids.map(id => ({ id, outcomes: mine.filter(r => r.id === id).map(r => r.outcome) })).filter(x => x.outcomes.length > 1);
    const disagreeing = repeated.filter(x => new Set(x.outcomes).size > 1);
    byArm[arm] = {
      ...tally(mine),
      byFamily: Object.fromEntries(families.map(f => [f, tally(mine.filter(r => r.family === f))])),
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
    arms, families,
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

// ── the report ───────────────────────────────────────────────────────────────

const pct = (x) => (x == null ? "–" : `${Math.round(x * 100)}%`);
const outOf = (n, total) => (total ? `${n} of ${total} (${pct(n / total)})` : "–");
const secs = (ms) => (ms == null ? "–" : `${(ms / 1000).toFixed(1)} s`);
const label = (id) => (id ? moveLabel(id) : "no move");
const quote = (text) => (text ? ` — “${String(text).replace(/\s+/g, " ").trim()}”` : "");
const wants = (want) => (want?.none === true ? "no move" : (want?.moves ?? []).map(label).join(" or "));

/** One reading in words: what each reader said, and why. */
function readingLine(reading) {
  if (!reading) return "no reading";
  if (reading.failed) return `not read: ${reading.failed}`;
  const kind = [reading.category, reading.confidence != null ? reading.confidence.toFixed(2) : null].filter(Boolean).join(", ");
  const said = (what) => `the pacing reader ${what}${kind ? ` (${kind})` : ""}${quote(reading.reasons?.pacing)}`;
  if (reading.decision === DECISION.NARRATIVE) return said("narrates it, with no move offered");
  if (reading.decision === DECISION.OFFER) return said(reading.suggested ? `narrates it and offers ${label(reading.suggested)}` : "narrates it and names no move to offer");
  const pacing = said(`calls it a move${reading.suggested ? `, naming ${label(reading.suggested)}` : ""}`);
  if (reading.move) return `${pacing}; the move reader makes it ${label(reading.move)}${reading.mischief ? " (a misread on purpose, it says)" : ""}${quote(reading.reasons?.move)}`;
  const then = reading.offered ? `so it is narrated with ${label(reading.offered)} offered` : "so it is narrated with nothing offered";
  return `${pacing}; the move reader ${reading.unsure ? "is unsure of its reading" : "reads no move in it"}, ${then}${quote(reading.reasons?.move)}`;
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
    `- A control: **${OUTCOME.NARRATED}** (right), **${OUTCOME.MOVE_OFFERED}**, **${OUTCOME.MOVE_ROLLED}**.`,
    `- **${OUTCOME.FAILED}** — a reader's call failed or its reply could not be read; not scored, and not in any rate.`, "",
    "**Rolled and offered both count as read**: either way the player gets the right move without naming it. Offered costs them a click, and the line is narrated first.", "");

  out.push("## Headline", "",
    "| Arm | Lines wanting a move | Read | rolled | offered | Another move | Nothing | Controls right | Reader failed |",
    "|---|---|---|---|---|---|---|---|---|");
  for (const arm of arms) {
    const t = byArm[arm];
    const another = t.wrong ? `${t.wrong} (${t.anotherRolled} rolled${t.mischief ? `, ${t.mischief} of them on purpose` : ""}; ${t.anotherOffered} offered)` : "0";
    out.push(`| \`${arm}\` | ${t.wanting} | **${outOf(t.read, t.wanting)}** | ${t.rolled} | ${t.offered} | ${another} | ${t.nothing} | ${outOf(t.controlsRight, t.controls)} | ${t.failed} |`);
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
    "| Arm | Calls (pacing + move) | Input | Cache read | Cache write | Output | Cost | Pacing reader, median | Move reader, median | A line, median / p90 |",
    "|---|---|---|---|---|---|---|---|---|---|");
  for (const arm of arms) {
    const s = byArm[arm].spend;
    out.push(`| \`${arm}\` | ${s.calls} (${s.pacingCalls} + ${s.moveCalls}) | ${s.tokens.input} | ${s.tokens.cacheRead} | ${s.tokens.cacheWrite} | ${s.tokens.output} `
      + `| $${s.usd.toFixed(4)}${s.unpriced ? ` (${s.unpriced} call(s) not priced)` : ""} | ${secs(s.pacing.medianMs)} | ${secs(s.move.medianMs)} | ${secs(s.line.medianMs)} / ${secs(s.line.p90Ms)} |`);
  }
  out.push("", `Total: $${summary.usd.toFixed(4)}${dry ? " — a dry run spends nothing" : ", by the price table in explore.config.json (computed from each reply's usage, not billed from it)"}.`
    + `${meta.strays ? ` **${meta.strays} call(s) that were not a reader's were made, and reached no model** — see run.json.` : ""}`, "");

  out.push("## What this test does not show", "",
    "- **Nothing is rolled or narrated.** A line counted as rolled is one whose roll dialog would open on the right move; the stat, the stakes, the dice and the narration are not looked at.",
    "- **The wanted readings are one reader's reading of the rules.** Where the rules allow two moves the list accepts both; a line whose reading is arguable was left out, and a note on a line says where it is close.",
    `- **${(meta.repeats ?? 1) > 1 ? "A few readings of a line are a small sample" : "One reading of a line is one sample"}** of a reader that does not always answer alike: a line read right four times in five shows here as right or as wrong. READERS_REPEATS measures it.`,
    "- **About fifty lines, a handful to a move.** A family's rate rests on three to ten lines; a difference of one line between arms is not a finding.",
    "- **The scenes are written by hand**: one or two paragraphs of narration, with a matching scene frame, where a table has up to three cards with the player's own lines among them — and none of the drift a long session leaves in a scene.",
    "- **One character, alone, with one connection and one vow**, at the pacing and mischief dials a new world has"
      + `${meta.dials ? ` (${Object.entries(meta.dials).map(([k, v]) => `${k} ${v}`).join(", ")})` : ""}. No fight is open in any context: the readers' rules for an open fight are not exercised.`,
    "- **The sheet does not reach the readers.** Neither prompt is told the character's health, spirit, supply or the ship's integrity, nor how far a vow has come; a context says so only in its narration"
      + `${meta.notSet?.length ? ` (not set in the world: ${[...new Set(meta.notSet.map(n => n.key))].join(", ")})` : ""}.`,
    "- **Each line is read on its own**: the count of recent moves is cleared before every reading, so a line never follows a run of rolls.",
    "- **Only the model changes between arms.** Each arm reads the same prompts, written for the readers' own model"
      + `${meta.own?.length ? ` (${meta.own.map(m => `\`${m}\``).join(", ")})` : ""}; a prompt tuned to another model might read differently.`,
    "- **No arm thinks first.** The readers turn thinking off, each model in its own form"
      + `${meta.thinking ? ` (${Object.entries(meta.thinking).map(([arm, form]) => `\`${arm}\`: ${form ?? "no form sent"}`).join("; ")})` : ""}`
      + ", and each model answers at its own default effort; a reader allowed to think, or set to another effort, might read differently.",
    "");
  return `${out.join("\n")}\n`;
}

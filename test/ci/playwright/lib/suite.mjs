// A suite of short scenario charters, run one after another (suite.mjs) —
// beside the long haul, not in place of it.
//
// The long haul (charters/long-haul.json) is the memory-stability test: three
// sessions, the narrator's memory and the mechanics loaded at once, its caps a
// settled decision (issue #373 decision 1). One early fault there costs every
// later beat that depends on it — the third live run lost beats 2, 3, 18, 22
// and 23 to one card that was never made. A scenario starts from a seeded
// state of its own, so each flow is put to the test whatever happens to the
// others: a fight, a vow, a connection, a recovery, an expedition, a scene
// question.
//
// A scenario is an ordinary charter with beats (rules/ci-e2e.md → "Adding a
// charter"), run by explore.mjs as any long run is — its seed, its beats and
// their checks, the mechanical checks after every action, the ledger where it
// has facts, its review layers — with caps of its own, under the suite's
// ceiling. This file is what the suite adds: which scenarios to run and
// whether each may (`scenarioProblem`, `suitePlan`), and what came of each
// (`scenarioResult`, `suiteSummary`, `summaryMarkdown`).
//
// Pure: the suite's definition, the charters and each run's own files in;
// what to run, and what came of it, out.

import { charterProblem } from "./charter.mjs";
import { movesNamedIn } from "./moveNames.mjs";

/** The caps a charter sets, by name. */
export const CAP_KEYS = ["actions", "calls", "minutes", "usd"];
/** How many beats a scenario has: a short slice of play, not a session. */
export const SCENARIO_BEATS = { min: 3, max: 8 };

const roundUsd = (n) => Number((Number(n) || 0).toFixed(4));

/** The card labels a tell may quote that are not lines to type: a command, a scene question, a button. */
const LABELS = ["Keep the result", "A fight looms", "New vow recorded", "Mark expedition progress", "Mark milestone", "Resolve consequence", "Expedition"];
/**
 * Whether words a tell quotes are a button's label (or a command or a scene
 * question) rather than a line to type: one that opens on a command's `!`, a
 * scene question's `@`, an emoji (the module's buttons carry one — "⚔ Begin
 * the fight", "🗺 Finish the Expedition"), or "Roll …" (a narration's offer),
 * or one of the module's plain labels.
 */
export function isButtonLabel(words) {
  const w = String(words ?? "").trim();
  return /^[!@]/.test(w) || /^[\p{So}\p{Extended_Pictographic}]/u.test(w) || /^Roll\b/.test(w) || LABELS.includes(w);
}

/**
 * Why a scenario's caps are not within the suite's ceiling, or null: every
 * cap set, a positive number, none above the ceiling's.
 *
 * @param {Record<string, number>|undefined} caps
 * @param {Record<string, number>} ceiling
 */
export function capsProblem(caps, ceiling) {
  for (const key of CAP_KEYS) {
    const value = caps?.[key];
    if (!(typeof value === "number" && Number.isFinite(value) && value > 0)) return `its caps need ${key} (a positive number)`;
    if (ceiling?.[key] != null && value > ceiling[key]) return `its ${key} cap (${value}) is above the suite's ceiling (${ceiling[key]})`;
  }
  return null;
}

/**
 * Why a scenario charter cannot run in its suite, or null. Everything a
 * charter needs (charterProblem), and:
 *
 *   - beats — three to eight, each with a check the observer knows;
 *   - caps — its own, each within the suite's ceiling;
 *   - a player in the fiction — no words a beat gives the player to type
 *     (its `tell`'s quoted words, the rehearsal's lines) name a move
 *     (decisions.md → "A player is never made to name a move"); a memory
 *     question is an `@scene` line;
 *   - a rehearsal script, every entry of it on a beat the charter has.
 *
 * @param {object} charter
 * @param {{ ceiling: Record<string, number> }} suite
 */
export function scenarioProblem(charter, suite) {
  const general = charterProblem(charter);
  if (general) return general;
  const beats = charter.beats ?? [];
  if (beats.length < SCENARIO_BEATS.min || beats.length > SCENARIO_BEATS.max) return `a scenario has ${SCENARIO_BEATS.min} to ${SCENARIO_BEATS.max} beats, not ${beats.length}`;
  const numbers = beats.map(b => b.n);
  if (numbers.some((n, i) => n !== i + 1)) return `its beats are numbered ${numbers.join(", ")}: they are 1 to ${beats.length}, in order`;
  if (new Set(beats.map(b => b.id)).size !== beats.length) return "two of its beats share an id";
  const caps = capsProblem(charter.caps, suite?.ceiling);
  if (caps) return caps;
  for (const b of beats) {
    // A button may name a move — pressing one is not naming it — so a
    // button's label in a tell is not held to it; every other quoted word is
    // something the player may type.
    const typed = [...String(b.tell ?? "").matchAll(/"([^"]+)"/g)].map(m => m[1]).filter(q => !isButtonLabel(q));
    for (const words of typed) if (movesNamedIn(words).length) return `beat ${b.n}'s tell gives the player "${words}" to type, which names ${movesNamedIn(words).join(", ")}`;
    // A beat that wants a move of a plain line shows the player a title that
    // names none, and says how to name it at the last (the long haul's rule:
    // exploreFictionOnlyPlayer.test.js).
    if (b.wants?.length) {
      const shown = b.playerTitle ?? b.title;
      if (movesNamedIn(shown).length) return `beat ${b.n} wants ${b.wants.join(" / ")} of a plain line and shows the player the title "${shown}", which names ${movesNamedIn(shown).join(", ")}: give it a playerTitle that does not`;
      if (!b.lastResort || !movesNamedIn(b.lastResort).length) return `beat ${b.n} wants ${b.wants.join(" / ")} of a plain line and says no last resort that names the move`;
    }
  }
  const script = charter.rehearsal ?? [];
  if (!script.length) return "it has no rehearsal script";
  const stray = script.find(e => e.beat != null && !beats.some(b => b.n === e.beat));
  if (stray) return `a rehearsal entry is on beat ${stray.beat}, which the charter does not have`;
  for (const e of script.filter(x => x.action === "say" && !/^[!@]/.test(String(x.text ?? "")))) {
    if (movesNamedIn(e.text).length) return `the rehearsal's line "${e.text}" names ${movesNamedIn(e.text).join(", ")}`;
  }
  return null;
}

/**
 * The scenarios to run, in the suite's order — all of them, or those named
 * (`only`: names, in any order; a name the suite does not have is an error,
 * not a silent skip).
 *
 * @param {{ scenarios: string[] }} suite
 * @param {{ only?: string[] }} [options]
 * @returns {{ run: string[], unknown: string[] }}
 */
export function suitePlan(suite, { only = [] } = {}) {
  const all = [...(suite?.scenarios ?? [])];
  const wanted = (only ?? []).map(s => String(s).trim()).filter(Boolean);
  const unknown = wanted.filter(w => !all.includes(w));
  return { run: wanted.length ? all.filter(s => wanted.includes(s)) : all, unknown };
}

/**
 * Whether the next scenario may start, given what the suite has spent: a
 * live scenario is started only when its own dollar cap still fits under the
 * suite's total, so the suite can never pass it. A rehearsal and a replay
 * spend nothing (a rehearsal's dollars are what its calls would cost).
 *
 * @param {{ spent: number, cap: number, total?: number|null, mode: string }} o
 * @returns {{ ok: boolean, why?: string }}
 */
export function mayStart({ spent, cap, total = null, mode }) {
  if (mode !== "live" || total == null) return { ok: true };
  if (roundUsd(spent) + cap > total + 1e-9) return { ok: false, why: `its $${cap} cap would take the suite past its $${total} total ($${roundUsd(spent)} spent so far)` };
  return { ok: true };
}

/**
 * What came of one scenario, from its run's own files: run.json, beats.json
 * and mechanics.json in the folder explore.mjs wrote it to. A run that wrote
 * no run.json (the process died) is `crashed`; one the suite did not start is
 * `skipped`, with why.
 *
 * @param {object} o
 * @param {string} o.name
 * @param {string} [o.flow] — what the scenario is about (its charter's `flow`)
 * @param {string|null} o.dir — the run's folder, relative to playwright/
 * @param {object|null} o.run — its run.json
 * @param {object[]|null} [o.beats] — its beats.json
 * @param {object|null} [o.mechanics] — its mechanics.json
 * @param {number|null} [o.exitCode]
 * @param {string|null} [o.skipped] — why it was not started
 */
export function scenarioResult({ name, flow = null, dir = null, run = null, beats = null, mechanics = null, exitCode = null, skipped = null }) {
  if (skipped) return { name, flow, status: "skipped", why: skipped, dir: null };
  if (!run) return { name, flow, status: "crashed", why: `no run.json was written${exitCode != null ? ` (exit ${exitCode})` : ""}`, dir, exitCode };
  const goal = run.goal ?? {};
  const each = (beats ?? []).map(b => ({ id: b.id, n: b.n, title: b.title, status: b.status === "pending" || b.status === "current" ? "not-exercised" : b.status, detail: b.detail ?? "" }));
  const count = (s) => each.filter(b => b.status === s).length;
  const budget = run.budget ?? {};
  return {
    name, flow, status: "ran", dir, exitCode,
    classification: run.classification ?? null, because: run.because ?? null,
    beats: { of: each.length || goal.beats?.beats || 0, done: count("done"), failed: count("failed"), notExercised: each.length ? count("not-exercised") : (goal.beats?.notExercised ?? 0), each },
    checks: { made: goal.checks?.made ?? mechanics?.checks ?? 0, violated: goal.checks?.violated ?? mechanics?.violations?.length ?? 0, violations: (mechanics?.violations ?? []).slice(0, 5) },
    ledger: goal.ledger?.facts ? { facts: goal.ledger.facts, recalled: goal.ledger.recalled ?? 0, lost: goal.ledger.lost ?? 0, refused: goal.ledger.refused ?? 0 } : null,
    calls: budget.calls ?? null, actions: budget.actions ?? null, usd: budget.usd != null ? roundUsd(budget.usd) : null, minutes: budget.minutes ?? null,
    stopped: budget.stopped ?? null, playerStopped: run.playerStopped ?? null,
    health: run.health?.failures ?? [],
    replay: typeof run.replay === "string" ? run.replay : null,
    reproduced: run.replay && typeof run.replay === "object" ? run.replay.reproduced ?? null : null,
  };
}

/**
 * The suite's summary: each scenario's result, the totals, and the suite's
 * own verdict — which counts, and never says "pass" for a scenario that did
 * not run.
 *
 * @param {{ suite: object, mode: string, startedAt: string, finishedAt?: string|null, results: object[], dir?: string|null }} o
 */
export function suiteSummary({ suite, mode, startedAt, finishedAt = null, results, dir = null }) {
  const ran = results.filter(r => r.status === "ran");
  const by = {};
  for (const r of ran) by[r.classification ?? "unknown"] = (by[r.classification ?? "unknown"] ?? 0) + 1;
  const sum = (k) => roundUsd(ran.reduce((n, r) => n + (Number(r[k]) || 0), 0));
  const beats = ran.reduce((t, r) => ({ of: t.of + r.beats.of, done: t.done + r.beats.done, failed: t.failed + r.beats.failed, notExercised: t.notExercised + r.beats.notExercised }), { of: 0, done: 0, failed: 0, notExercised: 0 });
  const unrun = results.filter(r => r.status !== "ran");
  const verdict = !results.length ? "nothing was run"
    : `${ran.length} of ${results.length} scenario(s) ran${unrun.length ? ` (${unrun.map(r => `${r.name}: ${r.status}`).join(", ")})` : ""}; `
      + `${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(", ") || "none classed"}; ${beats.done} of ${beats.of} beats done, ${beats.failed} failed, ${beats.notExercised} not exercised`;
  return {
    schema: 1, suite: suite?.name ?? null, mode, startedAt, finishedAt, dir,
    ceiling: suite?.ceiling ?? null, total: suite?.total ?? null,
    toAdd: suite?.toAdd ?? [],
    verdict,
    totals: { scenarios: results.length, ran: ran.length, byClass: by, beats, calls: ran.reduce((n, r) => n + (r.calls ?? 0), 0), actions: ran.reduce((n, r) => n + (r.actions ?? 0), 0), usd: sum("usd"), minutes: sum("minutes") },
    results,
  };
}

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

/** The summary as a page a person reads first. */
export function summaryMarkdown(summary) {
  const out = [];
  out.push(`# Suite ${summary.suite ?? "?"} — ${summary.mode}`, "");
  out.push(`${summary.startedAt}${summary.finishedAt ? ` to ${summary.finishedAt}` : " (still running, or stopped early)"}.`, "");
  out.push(`**${summary.verdict}.**`, "");
  if (summary.mode === "rehearsal") out.push("A rehearsal: every model reply came from the stand-in (lib/rehearsal.mjs), so this says the runner and the module's paths work, not how the narrator did. The dollars are what calls of these sizes would cost, not money spent.", "");
  const t = summary.totals;
  out.push(`Totals: ${t.calls} model call(s), ${t.actions} action(s), $${t.usd}, ${t.minutes} minutes.`, "");
  out.push("| Scenario | Flow | Result | Beats (done / failed / not exercised, of) | Checks (made / violated) | Calls | Cost | Minutes | Run |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of summary.results) {
    if (r.status !== "ran") { out.push(`| ${r.name} | ${cell(r.flow)} | ${r.status}: ${cell(r.why)} | | | | | | ${cell(r.dir)} |`); continue; }
    out.push(`| ${r.name} | ${cell(r.flow)} | ${r.classification}${r.reproduced != null ? (r.reproduced ? " (REPRODUCED)" : " (DIVERGED)") : ""} | ${r.beats.done} / ${r.beats.failed} / ${r.beats.notExercised} of ${r.beats.of} | ${r.checks.made} / ${r.checks.violated} | ${r.calls ?? "—"} | $${r.usd ?? "—"} | ${r.minutes ?? "—"} | ${cell(r.dir)} |`);
  }
  out.push("");
  for (const r of summary.results.filter(x => x.status === "ran")) {
    out.push(`## ${r.name}${r.flow ? ` — ${r.flow}` : ""}`, "", `${r.classification} — ${cell(r.because)}`, "");
    out.push("| Beat | Title | Status | What the observer saw |", "| --- | --- | --- | --- |");
    for (const b of r.beats.each) out.push(`| ${b.n} (${b.id}) | ${cell(b.title)} | ${b.status} | ${cell(b.detail)} |`);
    out.push("");
    if (r.checks.violations.length) out.push(`Checks violated: ${r.checks.violations.map(v => `${v.step} ${v.check}: ${cell(v.detail)}`).join("; ")}.`, "");
    if (r.health.length) out.push(`Health: ${r.health.map(cell).join("; ")}.`, "");
    if (r.ledger) out.push(`Ledger: ${r.ledger.recalled} of ${r.ledger.facts} fact(s) recalled, ${r.ledger.lost} lost, ${r.ledger.refused} refused.`, "");
    if (r.replay) out.push(`Replay: \`${r.replay}\``, "");
  }
  // What the suite does not test yet: its charters to add, each with why it is not built.
  if (summary.toAdd?.length) {
    out.push("## Not in the suite yet", "", ...summary.toAdd.map(t => `- **${t.name}** — ${t.flow}. ${t.why}`), "");
  }
  return `${out.join("\n")}\n`;
}

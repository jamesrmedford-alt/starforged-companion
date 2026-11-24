#!/usr/bin/env node
// test/ci/playwright/suite.mjs
//
// A suite of short scenario charters (suites/<name>.json), run one after
// another — each by explore.mjs, as any long run is, in a world it clears and
// seeds for itself, under caps of its own — and one summary of them all.
// Beside the long haul, not in place of it: lib/suite.mjs says why.
//
// Run it with ./scripts/cloud.sh explore --suite <name> [--rehearse | --replay <suite folder>].
//
// Modes (EXPLORE_MODE), as explore.mjs has them:
//   rehearsal — no key, no spend: every scenario's live path with the model
//               API stood in for (lib/rehearsal.mjs).
//   replay    — EXPLORE_REPLAY=<an earlier suite's folder>: each scenario's
//               run played again in a fresh world, with no key.
//   live      — real models, real money: refused without ANTHROPIC_API_KEY
//               and EXPLORE_QUESTIONS (one set for the suite, kept in every
//               scenario's run.json), each scenario under its own caps and
//               the suite under its `total` — a scenario whose dollar cap
//               would take the suite past it is not started.
// EXPLORE_SUITE=<name> picks the suite (default: scenarios);
// EXPLORE_SUITE_ONLY=<name,name> runs those scenarios alone, in the suite's
// order.
//
// Every scenario's charter is checked before the first one starts
// (lib/suite.mjs scenarioProblem): beats, checks, seed, caps within the
// suite's ceiling, no move named in what the player is given to type.
//
// Evidence: artifacts/explore/suite-<name>-<mode>-<time>/ — summary.json and
// summary.md, written after each scenario (a suite a crash stops still
// leaves the summary so far), and each scenario's run in a folder of its own
// (<scenario>/: run.json, transcript.md, scorecard.md, beats.json,
// replay.json, …, what explore.mjs writes for a long run).
//
// Exit code: 1 when a charter cannot run (nothing is started), or a
// scenario's run was an infrastructure error, crashed, or — in a replay —
// did not reproduce; else 0, whatever the scenarios found.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ARTIFACTS } from "./lib/foundry.mjs";
import { mayStart, scenarioProblem, scenarioResult, suitePlan, suiteSummary, summaryMarkdown } from "./lib/suite.mjs";

const MODE = ["rehearsal", "replay"].includes(process.env.EXPLORE_MODE) ? process.env.EXPLORE_MODE : "live";
const NAME = process.env.EXPLORE_SUITE || "scenarios";
const ONLY = String(process.env.EXPLORE_SUITE_ONLY ?? "").split(",").map(s => s.trim()).filter(Boolean);
const REPLAY_FROM = process.env.EXPLORE_REPLAY ? path.resolve(process.env.EXPLORE_REPLAY) : null;
const HERE = path.dirname(new URL(import.meta.url).pathname);

const log = (...args) => console.log("[suite]", ...args);
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const readIf = (file) => (fs.existsSync(file) ? readJson(file) : null);
const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

/** Run one scenario's charter with explore.mjs, its output passed through with the scenario's name. */
function runScenario(name, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["explore.mjs"], { cwd: HERE, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    const pass = (stream, out) => {
      let rest = "";
      stream.on("data", (chunk) => {
        const lines = (rest + chunk).split("\n");
        rest = lines.pop();
        for (const line of lines) out.write(`[${name}] ${line}\n`);
      });
      stream.on("end", () => { if (rest) out.write(`[${name}] ${rest}\n`); });
    };
    pass(child.stdout, process.stdout);
    pass(child.stderr, process.stderr);
    child.on("close", (code) => resolve(code));
  });
}

async function main() {
  const suiteFile = path.join(HERE, "suites", `${NAME}.json`);
  if (!fs.existsSync(suiteFile)) { log(`FAIL  no suite named ${NAME} (${path.relative(HERE, suiteFile)})`); process.exit(1); }
  const suite = { name: NAME, ...readJson(suiteFile) };
  if (MODE === "replay" && !REPLAY_FROM) { log("FAIL  replay mode needs EXPLORE_REPLAY=<the folder of the suite run to replay>"); process.exit(1); }

  const { run, unknown } = suitePlan(suite, { only: ONLY });
  if (unknown.length) { log(`FAIL  EXPLORE_SUITE_ONLY names scenario(s) the suite does not have: ${unknown.join(", ")}`); process.exit(1); }

  // Every charter is checked before anything starts: a suite that cannot run
  // whole is not half run.
  const charters = {};
  const problems = [];
  for (const name of run) {
    const file = path.join(HERE, "charters", `${name}.json`);
    if (!fs.existsSync(file)) { problems.push(`${name}: no charter (${path.relative(HERE, file)})`); continue; }
    charters[name] = { name, ...readJson(file) };
    const problem = scenarioProblem(charters[name], suite);
    if (problem) problems.push(`${name}: ${problem}`);
  }
  if (problems.length) { for (const p of problems) log(`FAIL  ${p}`); process.exit(1); }

  const startedAt = new Date();
  const dir = path.join(ARTIFACTS, "explore", `suite-${NAME}-${MODE}-${stamp(startedAt)}`);
  fs.mkdirSync(dir, { recursive: true });
  log(`the ${NAME} suite, ${MODE} mode — ${run.length} scenario(s), one after another; evidence in ${path.relative(HERE, dir)}`);
  if (MODE === "live") log(`caps: each scenario its own (ceiling ${JSON.stringify(suite.ceiling)}); the suite $${suite.total?.usd ?? "—"} in all`);

  const results = [];
  const write = (finished = false) => {
    const summary = suiteSummary({ suite, mode: MODE, startedAt: startedAt.toISOString(), finishedAt: finished ? new Date().toISOString() : null, results, dir: path.relative(HERE, dir) });
    fs.writeFileSync(path.join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    fs.writeFileSync(path.join(dir, "summary.md"), summaryMarkdown(summary));
    return summary;
  };

  let spent = 0;
  for (const name of run) {
    const charter = charters[name];
    const flow = charter.flow ?? null;
    const may = mayStart({ spent, cap: charter.caps.usd, total: suite.total?.usd ?? null, mode: MODE });
    if (!may.ok) { results.push(scenarioResult({ name, flow, skipped: may.why })); log(`${name}: not started — ${may.why}`); write(); continue; }
    const from = REPLAY_FROM ? path.join(REPLAY_FROM, name) : null;
    if (MODE === "replay" && !fs.existsSync(path.join(from, "replay.json"))) {
      results.push(scenarioResult({ name, flow, skipped: `the suite replayed has no replay.json for it (${path.relative(HERE, from)})` }));
      write();
      continue;
    }
    const out = path.join(dir, name);
    log(`${name} — ${flow ?? "a scenario"}`);
    const exitCode = await runScenario(name, {
      EXPLORE_CHARTER: name, EXPLORE_MODE: MODE, EXPLORE_OUT: out, EXPLORE_REPLAY: from ?? "",
    });
    const result = scenarioResult({
      name, flow, dir: path.relative(HERE, out), exitCode,
      run: readIf(path.join(out, "run.json")), beats: readIf(path.join(out, "beats.json")), mechanics: readIf(path.join(out, "mechanics.json")),
    });
    results.push(result);
    spent += result.usd ?? 0;
    log(`${name}: ${result.status === "ran" ? `${result.classification} — ${result.beats.done} of ${result.beats.of} beats done, ${result.beats.failed} failed, ${result.beats.notExercised} not exercised; ${result.checks.made} checks, ${result.checks.violated} violated; ${result.calls ?? "—"} calls, $${result.usd ?? "—"}` : `${result.status} — ${result.why}`}`);
    write();
  }

  const summary = write(true);
  log(`SUMMARY ${summary.verdict}`);
  for (const r of summary.results) log(`  ${r.name.padEnd(24)} ${r.status === "ran" ? `${r.classification}${r.reproduced === false ? " DIVERGED" : r.reproduced ? " REPRODUCED" : ""} — beats ${r.beats.done}/${r.beats.failed}/${r.beats.notExercised} of ${r.beats.of}, checks ${r.checks.made}/${r.checks.violated}, ${r.calls ?? "—"} calls, $${r.usd ?? "—"}, ${r.minutes ?? "—"} min — ${r.dir}` : `${r.status}: ${r.why}`}`);
  log(`summary: ${path.relative(HERE, path.join(dir, "summary.md"))}`);
  const bad = summary.results.filter(r => r.status === "crashed" || r.classification === "infrastructure-error" || r.reproduced === false);
  process.exitCode = bad.length ? 1 : 0;
}

main().catch((err) => {
  log(`FAIL  ${err?.stack ?? err}`);
  process.exitCode = 1;
});

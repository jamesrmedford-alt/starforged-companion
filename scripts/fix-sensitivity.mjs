#!/usr/bin/env node
/**
 * fix-sensitivity.mjs — do the regression tests fail while the defect is there?
 *
 * Issue #302 slice A. A regression test is evidence only if it fails while
 * the defect is present. Two ways to put the defect back, each in a temporary
 * git worktree (the checkout you run it from is never touched):
 *
 *   <commit>          Revert a fix. The commit's test files (added or
 *                     changed) run twice: as committed — every test should
 *                     pass — and with the commit's src/ changes undone (the
 *                     files it changed restored from its parent, the files it
 *                     added deleted), its tests kept: the tests that cover
 *                     the fix should now fail. A third run, of the parent's
 *                     own tests against its own source, names the tests the
 *                     parent already had, so the report can tell the new ones
 *                     apart.
 *   --inject <patch>  Inject a defect into HEAD. The patch's preamble (text
 *                     before its first `diff --git` line) names it:
 *                       Defect:  what the patch breaks
 *                       Tests:   the test files to run (space-separated)
 *                       Catches: a test-name substring that must fail with
 *                                the defect in (one line per test; optional)
 *                     The tests run on HEAD (all should pass), then with the
 *                     patch applied. Patches live in scripts/defects/.
 *
 * A test that fails only because an export the fix added is missing ("… is
 * not a function") shows it depends on the fix's code, not that it catches
 * the behaviour; such failures are reported apart and don't count. Injecting
 * the specific defect is the way to show such a test is sensitive.
 *
 * A new test that passes both ways is listed for review: it may be a control
 * (the explicit-target case that must keep working) or a test that misses the
 * defect it was written for — only a reader can tell which.
 *
 * Usage:
 *   node scripts/fix-sensitivity.mjs <commit>... [--inject <patch>]... [--md <file>] [--json <file>] [--tmp <dir>]
 *
 * Exit code 1 when a test fails without the defect, when no assertion fails
 * with it, when a `Catches:` test passes, or when a patch no longer applies.
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const ROOT   = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const VITEST = path.join(ROOT, "node_modules", "vitest", "vitest.mjs");

function git(args, cwd = ROOT) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function parseArgs(argv) {
  const opts = { commits: [], patches: [], md: null, json: null, tmp: os.tmpdir() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--md") opts.md = argv[++i];
    else if (a === "--json") opts.json = argv[++i];
    else if (a === "--tmp") opts.tmp = argv[++i];
    else if (a === "--inject") opts.patches.push(path.resolve(argv[++i]));
    else opts.commits.push(a);
  }
  if (!opts.commits.length && !opts.patches.length) {
    console.error("usage: node scripts/fix-sensitivity.mjs <commit>... [--inject <patch>]... [--md <file>] [--json <file>] [--tmp <dir>]");
    process.exit(2);
  }
  return opts;
}

// vitest's JSON report records a test that timed out as this placeholder error.
const firstLine = (s) => {
  const line = String(s ?? "").replace(/\u001b\[[0-9;]*m/g, "").split("\n").map(l => l.trim()).find(Boolean) ?? "";
  return line === "Error: STACK_TRACE_ERROR" ? "timed out — the test hung" : line;
};

// A missing export fails a test at its call, not at an assertion.
const apiOnly = (message) => /\bis not a (?:function|constructor)\b|does not provide an export/.test(message);

/** Run vitest on `files` in `dir`: per-test status, and files that failed to load. */
function runTests(dir, files) {
  const out = path.join(dir, ".fix-sensitivity.json");
  fs.rmSync(out, { force: true });
  const run = spawnSync(process.execPath, [VITEST, "run", "--reporter=json", `--outputFile=${out}`, ...files],
    { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (!fs.existsSync(out)) throw new Error(`vitest wrote no report in ${dir}:\n${run.stderr || run.stdout}`);
  const report = JSON.parse(fs.readFileSync(out, "utf8"));
  const tests = new Map();
  const loadErrors = [];
  for (const file of report.testResults ?? []) {
    const rel = path.relative(dir, file.name);
    if (!(file.assertionResults ?? []).length && file.status === "failed") loadErrors.push({ file: rel, message: firstLine(file.message) });
    for (const t of file.assertionResults ?? []) {
      tests.set(`${rel} › ${t.fullName}`, { status: t.status, message: firstLine((t.failureMessages ?? [])[0]) });
    }
  }
  return { tests, loadErrors };
}

/** A worktree at `rev` with this checkout's node_modules; fn(dir); then removed. */
function inWorktree(rev, tmpRoot, label, fn) {
  const dir = fs.mkdtempSync(path.join(tmpRoot, `fix-sensitivity-${label}-`));
  git(["worktree", "add", "--detach", "--quiet", dir, rev]);
  try {
    fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");
    return fn(dir);
  } finally {
    git(["worktree", "remove", "--force", dir]);
  }
}

/** Compare a clean run with a run that has the defect in. */
function compare(clean, broken, known = null) {
  const rows = [...clean.tests].map(([name, t]) => {
    const b = broken.tests.get(name);
    return {
      name,
      isNew:   known ? !known.has(name) : false,
      clean:   t.status,
      broken:  b?.status ?? (broken.loadErrors.some(e => name.startsWith(`${e.file} ›`)) ? "load-error" : "missing"),
      message: b?.message ?? "",
    };
  });
  return {
    clean:  { passed: rows.filter(r => r.clean === "passed").length, failed: rows.filter(r => r.clean === "failed").map(r => r.name), loadErrors: clean.loadErrors },
    broken: {
      failed:       rows.filter(r => r.clean === "passed" && r.broken === "failed").map(r => ({ name: r.name, isNew: r.isNew, message: r.message, api: apiOnly(r.message) })),
      loadErrors:   broken.loadErrors,
      stillPassing: rows.filter(r => r.clean === "passed" && r.broken === "passed").map(r => ({ name: r.name, isNew: r.isNew })),
    },
  };
}

// ── revert a fix ─────────────────────────────────────────────────────────────

/** The commit's changes against its first parent: [{ status: "A"|"M"|"D", file }]. */
function changes(commit) {
  return git(["diff", "--name-status", "--no-renames", `${commit}^`, commit])
    .split("\n").filter(Boolean)
    .map((line) => { const [status, file] = line.split("\t"); return { status: status[0], file }; });
}

function checkCommit(commit, tmpRoot) {
  const sha     = git(["rev-parse", "--short", commit]).trim();
  const changed = changes(commit);
  const result  = {
    kind: "revert",
    id: sha,
    title: git(["log", "-1", "--format=%s", commit]).trim(),
    testFiles: changed.filter(c => c.status !== "D" && /^tests\/.*\.test\.js$/.test(c.file)).map(c => c.file),
    srcFiles:  changed.filter(c => c.file.startsWith("src/")).map(c => c.file),
  };
  if (!result.testFiles.length || !result.srcFiles.length) {
    result.skipped = !result.testFiles.length ? "the commit changes no test file" : "the commit changes nothing under src/";
    return result;
  }
  return inWorktree(commit, tmpRoot, sha, (dir) => {
    const fixed = runTests(dir, result.testFiles);
    for (const { status, file } of changed.filter(c => c.file.startsWith("src/"))) {
      if (status === "A") fs.rmSync(path.join(dir, file), { force: true });
      else git(["checkout", `${commit}^`, "--", file], dir);
    }
    const reverted = runTests(dir, result.testFiles);
    const existedBefore = result.testFiles.filter(f => changed.find(c => c.file === f)?.status !== "A");
    git(["checkout", `${commit}^`, "--", "tests"], dir);
    const before = existedBefore.length ? new Set(runTests(dir, existedBefore).tests.keys()) : new Set();
    return { ...result, ...compare(fixed, reverted, before) };
  });
}

// ── inject a defect ──────────────────────────────────────────────────────────

function readPatch(file) {
  const text = fs.readFileSync(file, "utf8");
  const preamble = text.slice(0, Math.max(0, text.indexOf("\ndiff --git ")));
  const field = (name) => [...preamble.matchAll(new RegExp(`^${name}:\\s*(.+)$`, "gm"))].map(m => m[1].trim());
  return {
    defect:  field("Defect")[0] ?? path.basename(file),
    tests:   field("Tests").flatMap(t => t.split(/\s+/)).filter(Boolean),
    catches: field("Catches"),
  };
}

function checkPatch(file, tmpRoot) {
  const meta   = readPatch(file);
  const result = { kind: "inject", id: path.relative(ROOT, file), title: meta.defect, testFiles: meta.tests, catches: meta.catches };
  if (!meta.tests.length) return { ...result, error: "the patch names no Tests:" };
  return inWorktree("HEAD", tmpRoot, path.basename(file, ".patch"), (dir) => {
    const clean = runTests(dir, meta.tests);
    try {
      git(["apply", file], dir);
    } catch (err) {
      return { ...result, error: `the patch no longer applies to HEAD: ${firstLine(err.stderr || err.message)}` };
    }
    const out = { ...result, ...compare(clean, runTests(dir, meta.tests)) };
    out.caught = meta.catches.map(pattern => ({ pattern, failed: out.broken.failed.some(t => !t.api && t.name.includes(pattern)) }));
    return out;
  });
}

// ── report ───────────────────────────────────────────────────────────────────

function verdict(r) {
  if (r.skipped) return { ok: true, note: `skipped: ${r.skipped}` };
  if (r.error) return { ok: false, note: r.error };
  const without = r.kind === "revert" ? "without the fix" : "with the defect";
  if (r.clean.failed.length || r.clean.loadErrors.length) return { ok: false, note: `tests fail ${r.kind === "revert" ? "WITH the fix" : "on HEAD"}` };
  const asserted = r.broken.failed.filter(t => !t.api).length;
  if (!asserted) {
    return { ok: false, note: r.broken.failed.length || r.broken.loadErrors.length
      ? `tests fail ${without} only because an export is missing — no assertion catches the behaviour`
      : `no test fails ${without}` };
  }
  const missed = (r.caught ?? []).filter(c => !c.failed);
  if (missed.length) return { ok: false, note: `${missed.length} named test(s) pass ${without}: ${missed.map(c => `"${c.pattern}"`).join(", ")}` };
  const controls = r.broken.stillPassing.filter(t => t.isNew).length;
  return { ok: true, note: `${asserted} assertion(s) fail ${without}${controls ? `; ${controls} new test(s) pass both ways (controls — check each is meant to)` : ""}` };
}

const mdEscape = (s) => String(s).replace(/\|/g, "\\|").replace(/</g, "&lt;");

function markdown(results) {
  const lines = [];
  for (const r of results) {
    const v = verdict(r);
    const revert = r.kind === "revert";
    lines.push(`### ${revert ? `${r.id} — ${r.title}` : `\`${r.id}\` — ${r.title}`}`, "");
    if (r.skipped || r.error) { lines.push(`${r.skipped ? "Skipped" : "Error"}: ${r.skipped ?? r.error}.`, ""); continue; }
    lines.push(`Test files: ${r.testFiles.map(f => `\`${f}\``).join(", ")}.${revert ? ` Source restored: ${r.srcFiles.length} file(s).` : ""}`, "");
    lines.push(`- ${revert ? "With the fix" : "On HEAD"}: ${r.clean.passed} passed, ${r.clean.failed.length} failed.`);
    lines.push(`- ${revert ? "Without it" : "With the defect"}: ${r.broken.failed.length} failed`
      + `${revert ? ` (${r.broken.failed.filter(t => t.isNew).length} new` : " ("}${revert ? "; " : ""}${r.broken.failed.filter(t => t.api).length} only for a missing export)`
      + `${r.broken.loadErrors.length ? `, ${r.broken.loadErrors.length} file(s) failed to load` : ""}`
      + `; ${r.broken.stillPassing.length} still pass${revert ? ` (${r.broken.stillPassing.filter(t => t.isNew).length} new)` : ""}.`);
    lines.push(`- Verdict: **${v.ok ? "sensitive" : "NOT sensitive"}** — ${v.note}.`, "");
    if (r.broken.failed.length) {
      lines.push(`| Fails ${revert ? "without the fix" : "with the defect"} | First failure line |`, "| --- | --- |");
      for (const t of r.broken.failed) lines.push(`| ${t.isNew ? "(new) " : ""}${t.api ? "(API) " : ""}${mdEscape(t.name)} | ${mdEscape(t.message.slice(0, 160))} |`);
      lines.push("");
    }
    for (const e of r.broken.loadErrors) lines.push(`- Failed to load: \`${e.file}\` — ${mdEscape(e.message.slice(0, 200))}`);
    const controls = r.broken.stillPassing.filter(t => t.isNew);
    for (const t of controls) lines.push(`- New test passing with and without the fix (a control?): ${mdEscape(t.name)}`);
    if (r.broken.loadErrors.length || controls.length) lines.push("");
  }
  return lines.join("\n");
}

const opts = parseArgs(process.argv.slice(2));
const results = [];
for (const [label, run] of [
  ...opts.commits.map(c => [c, () => checkCommit(c, opts.tmp)]),
  ...opts.patches.map(p => [path.relative(ROOT, p), () => checkPatch(p, opts.tmp)]),
]) {
  process.stderr.write(`fix-sensitivity: ${label} … `);
  const r = run();
  results.push(r);
  process.stderr.write(`${verdict(r).note}\n`);
}
const md = markdown(results);
if (opts.md) fs.writeFileSync(opts.md, `${md}\n`);
else console.log(md);
if (opts.json) fs.writeFileSync(opts.json, `${JSON.stringify(results, null, 2)}\n`);
process.exitCode = results.every(r => verdict(r).ok) ? 0 : 1;

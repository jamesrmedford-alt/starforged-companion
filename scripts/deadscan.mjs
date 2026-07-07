#!/usr/bin/env node
/**
 * deadscan.mjs — mechanical reachability scan.
 *
 * The detection half of `rules/reachability.md`: the rules (and the
 * pre-commit reachability check in CLAUDE.md) prevent NEW dead surface;
 * this script finds EXISTING dead surface, which otherwise sits invisible
 * until a flow audit trips over it (the 2026-07 unreachable-code audit —
 * `docs/flows/unreachable-code-audit.md` — found this file's rule doc citing
 * examples that were still dead in the tree).
 *
 * Flags three things:
 *   DEAD exports     — exported symbols with no non-definition reference
 *                      anywhere in src/ or tests/. Multi-definition aware:
 *                      a helper defined in N sibling modules with zero
 *                      external consumers is dead N times, not "mutually
 *                      live" (the SCENERELEVANT-DEAD blind spot).
 *   DEAD settings    — keys passed to game.settings.register(MODULE_ID, …)
 *                      whose raw key string never appears outside the
 *                      registration itself (never read, never written).
 *   TEST-ONLY exports— referenced only from tests/: dead in production.
 *                      Reported separately; many are legitimate seams.
 *                      `_reset*` / `*ForTests` / `_`-prefixed names are
 *                      bucketed as TEST-SEAM (informational), with a marker
 *                      when even tests don't call them.
 *
 * Consumers are counted by word-boundary occurrence, so dynamic-import
 * destructuring and string dispatch both register as consumers. Names on
 * `module.api` are treated as consumed (public surface).
 *
 * Known blind spot (regex, not a resolver): a LIVE same-named function masks
 * parallel-dead sibling definitions — `formatForContext` stayed invisible to
 * this scan because the truths module's live copy shares the name
 * (FORMATFORCONTEXT-DEAD). The flow-trace audits in `docs/flows/` remain the
 * load-bearing check; this script is the cheap first pass.
 *
 * Usage:
 *   node scripts/deadscan.mjs            advisory report, always exits 0
 *   node scripts/deadscan.mjs --strict   exit 1 if any DEAD export/setting
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";

const STRICT = process.argv.includes("--strict");

function walk(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      console.warn(`deadscan: cannot read ${dir}: ${err.message}`);
      continue;
    }
    for (const e of entries) {
      if (e.name === "node_modules") continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (extname(e.name) === ".js") out.push(p);
    }
  }
  return out.sort();
}

const srcFiles = walk("src");
const testFiles = walk("tests");
const srcText = new Map(srcFiles.map((f) => [f, readFileSync(f, "utf8")]));
const testText = new Map(testFiles.map((f) => [f, readFileSync(f, "utf8")]));

// ── exported definitions: name → Set(defining files) ────────────────────────
const DEF_PATTERNS = [
  /export\s+(?:async\s+)?function\s+(\w+)/g,
  /export\s+(?:const|let|var)\s+(\w+)/g,
  /export\s+class\s+(\w+)/g,
];
const REEXPORT = /export\s*\{([^}]*)\}/g;

const definers = new Map();
function addDef(name, file) {
  if (!definers.has(name)) definers.set(name, new Set());
  definers.get(name).add(file);
}
for (const [file, text] of srcText) {
  for (const pat of DEF_PATTERNS) {
    for (const m of text.matchAll(pat)) addDef(m[1], file);
  }
  for (const m of text.matchAll(REEXPORT)) {
    for (const part of m[1].split(",")) {
      const name = part.split(" as ").pop().trim();
      if (/^\w+$/.test(name)) addDef(name, file);
    }
  }
}

// ── module.api names: public console/macro surface counts as consumed ───────
const apiNames = new Set();
for (const [, text] of srcText) {
  for (const m of text.matchAll(/\.api\s*=\s*\{/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < text.length && depth > 0) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      i++;
    }
    for (const t of text.slice(start, i).matchAll(/\b(\w+)\b/g)) {
      apiNames.add(t[1]);
    }
  }
}

const srcAll = [...srcText.values()].join("\n");
const testAll = [...testText.values()].join("\n");

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function countOcc(name, corpus) {
  const re = new RegExp(`(?<![\\w$])${esc(name)}(?![\\w$])`, "g");
  return (corpus.match(re) ?? []).length;
}

// ── classify exports ─────────────────────────────────────────────────────────
const dead = [];
const testOnly = [];
const testSeams = [];
for (const [name, defs] of [...definers].sort(([a], [b]) => a.localeCompare(b))) {
  if (apiNames.has(name)) continue;
  const nonDef = countOcc(name, srcAll) - defs.size;
  if (nonDef > 0) continue; // consumed somewhere in src beyond its definitions
  const inTests = countOcc(name, testAll) > 0;
  const row = { name, files: [...defs].sort(), inTests };
  const isSeam =
    name.startsWith("_reset") || name.endsWith("ForTests") || name.startsWith("_");
  if (isSeam) testSeams.push(row);
  else if (inTests) testOnly.push(row);
  else dead.push(row);
}

// ── settings: registered but raw key never used elsewhere ────────────────────
const REG = /settings\.register(?:Menu)?\(\s*MODULE_ID\s*,\s*["']([^"']+)["']/g;
const registered = new Map(); // key → count of register() lines
for (const [, text] of srcText) {
  for (const m of text.matchAll(REG)) {
    registered.set(m[1], (registered.get(m[1]) ?? 0) + 1);
  }
}
const deadSettings = [];
for (const [key, regCount] of [...registered].sort(([a], [b]) => a.localeCompare(b))) {
  const uses =
    (srcAll.match(new RegExp(esc(`"${key}"`), "g")) ?? []).length +
    (srcAll.match(new RegExp(esc(`'${key}'`), "g")) ?? []).length;
  if (uses - regCount <= 0) deadSettings.push(key);
}

// ── report ───────────────────────────────────────────────────────────────────
function fileLabel(row) {
  const first = row.files[0];
  return row.files.length > 1 ? `${first} [x${row.files.length}]` : first;
}

console.log(
  `deadscan — src: ${srcFiles.length} files, exports scanned: ${definers.size}, ` +
    `settings registered: ${registered.size}\n`,
);

console.log(`DEAD exports (no consumer anywhere; not on module.api): ${dead.length}`);
for (const row of dead) {
  console.log(`  ${row.name.padEnd(36)} ${fileLabel(row)}`);
}

console.log(`\nDEAD settings (registered; raw key never read or written): ${deadSettings.length}`);
for (const key of deadSettings) console.log(`  ${key}`);

console.log(`\nTEST-ONLY exports (dead in production, referenced by tests): ${testOnly.length}`);
for (const row of testOnly) {
  console.log(`  ${row.name.padEnd(36)} ${fileLabel(row)}`);
}

console.log(`\nTEST-SEAM exports (_reset*/…ForTests/_-prefixed; informational): ${testSeams.length}`);
for (const row of testSeams) {
  const marker = row.inTests ? "" : "  ← unused even by tests";
  console.log(`  ${row.name.padEnd(36)} ${fileLabel(row)}${marker}`);
}

console.log(
  `\nRules: rules/reachability.md · Flow-trace audits: docs/flows/ · ` +
    `Provenance: docs/flows/unreachable-code-audit.md`,
);

const failures = dead.length + deadSettings.length;
if (STRICT && failures > 0) {
  console.error(`\ndeadscan --strict: ${failures} DEAD finding(s) — failing.`);
  process.exit(1);
}

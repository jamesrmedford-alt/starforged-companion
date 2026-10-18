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
 * Corpora: PRODUCTION = src/** minus src/integration/** (the Quench suite is
 * test code that merely ships inside the module); QUENCH = src/integration/**;
 * TESTS = tests/**. Comments are stripped from every file before counting
 * (string, template and regex literals are preserved, so "//" inside a URL
 * or a regex is not mistaken for a comment) — a symbol mentioned only in a
 * comment is not consumed.
 *
 * Flags:
 *   DEAD exports       — exported symbols with no non-definition reference in
 *                        production, Quench or tests. Multi-definition aware:
 *                        a helper defined in N sibling modules with zero
 *                        external consumers is dead N times, not "mutually
 *                        live" (the SCENERELEVANT-DEAD blind spot).
 *   DEAD settings      — keys passed to game.settings.register(MODULE_ID, …)
 *                        that production never reads or writes. Keys given as
 *                        string constants are resolved — a constant map
 *                        (`const SETTING = { KEY: "value" }` →
 *                        register(MODULE_ID, SETTING.KEY, …)) or a bare
 *                        `const KEY = "value"`, defined in the registering
 *                        file or imported into it. Every raw "value" string
 *                        counts as a use; a `SETTING.KEY` / `KEY` reference
 *                        counts only where the identifier resolves to that
 *                        same constant — its defining file, or a file that
 *                        imports it from there (named, aliased, namespace,
 *                        dynamic or re-exported). A same-named constant in an
 *                        unrelated file is not a use, and a register() key
 *                        the file neither defines nor imports is reported as
 *                        unresolved rather than guessed.
 *   QUENCH-ONLY        — exports / settings whose only consumers are the
 *                        Quench suite (src/integration/**): dead in production.
 *   TEST-ONLY exports  — referenced only from tests/: dead in production.
 *                        Reported separately; many are legitimate seams.
 *                        `_reset*` / `*ForTests` / `_`-prefixed names are
 *                        bucketed as TEST-SEAM (informational), with a marker
 *                        when even tests don't call them.
 *   UNREACHABLE modules— src modules with no static or literal dynamic import
 *                        path from a production entry point (module.json
 *                        `esmodules`, minus the Quench entry). Each is marked
 *                        when Quench or tests still import it.
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
 *
 * The scan itself (`scan`, `stripComments`) is exported for
 * tests/unit/deadscan.test.js; the report only runs when executed directly.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, extname, posix } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

const QUENCH_DIR = "src/integration/";
const isQuench = (f) => f.startsWith(QUENCH_DIR);

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
      const p = join(dir, e.name).split("\\").join("/");
      if (e.isDirectory()) stack.push(p);
      else if (extname(e.name) === ".js") out.push(p);
    }
  }
  return out.sort();
}

// ── comment stripping ────────────────────────────────────────────────────────
// A small JS lexer: copies code and string / template / regex literals
// verbatim and blanks `//` and `/* */` comments (newlines kept). Template
// `${…}` expressions are lexed as code, so a comment inside one is stripped.

const REGEX_PRECEDERS = new Set("(,=:[!&|?{};+-*%<>~^".split(""));
const REGEX_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
  "throw", "case", "do", "else", "yield", "await",
]);
const WORD_CHAR = /[\w$]/;

/**
 * @param {string} src — JavaScript source
 * @returns {string} the source with comments blanked to spaces
 */
export function stripComments(src) {
  let i = 0;
  const n = src.length;
  let out = "";

  // Is a `/` here the start of a regex literal (vs division)? Decided by the
  // last significant character already emitted.
  function regexAllowed() {
    let k = out.length - 1;
    while (k >= 0 && /\s/.test(out[k])) k--;
    if (k < 0) return true;
    if (REGEX_PRECEDERS.has(out[k])) return true;
    let s = k;
    while (s >= 0 && WORD_CHAR.test(out[s])) s--;
    return s < k && REGEX_KEYWORDS.has(out.slice(s + 1, k + 1));
  }

  function copyQuoted(q) {
    out += src[i++];
    while (i < n) {
      const c = src[i];
      if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
      out += c; i++;
      if (c === q || c === "\n") return;
    }
  }

  function copyRegex() {
    out += src[i++];
    let inClass = false;
    while (i < n) {
      const c = src[i];
      if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
      out += c; i++;
      if (c === "\n") return;               // not a regex after all — bail
      if (inClass) { if (c === "]") inClass = false; continue; }
      if (c === "[") inClass = true;
      else if (c === "/") break;
    }
    while (i < n && /[a-z]/i.test(src[i])) out += src[i++];   // flags
  }

  function copyTemplate() {
    out += src[i++];                         // opening backtick
    while (i < n) {
      const c = src[i];
      if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
      if (c === "`") { out += c; i++; return; }
      if (c === "$" && src[i + 1] === "{") {
        out += "${"; i += 2;
        code(true);
        continue;
      }
      out += c; i++;
    }
  }

  // Lex code until EOF, or (inTemplateExpr) until the `}` closing a `${`.
  function code(inTemplateExpr) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      const d = src[i + 1];
      if (c === "/" && d === "/") {
        while (i < n && src[i] !== "\n") { out += " "; i++; }
        continue;
      }
      if (c === "/" && d === "*") {
        const end = src.indexOf("*/", i + 2);
        const stop = end < 0 ? n : end + 2;
        out += src.slice(i, stop).replace(/[^\n]/g, " ");
        i = stop;
        continue;
      }
      if (c === '"' || c === "'") { copyQuoted(c); continue; }
      if (c === "`") { copyTemplate(); continue; }
      if (c === "/" && regexAllowed()) { copyRegex(); continue; }
      if (inTemplateExpr) {
        if (c === "{") depth++;
        else if (c === "}") {
          if (depth === 0) { out += c; i++; return; }
          depth--;
        }
      }
      out += c; i++;
    }
  }

  code(false);
  return out;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function countOcc(name, corpus) {
  const re = new RegExp(`(?<![\\w$])${esc(name)}(?![\\w$])`, "g");
  return (corpus.match(re) ?? []).length;
}
function countLiteral(str, corpus) {
  return (corpus.match(new RegExp(esc(str), "g")) ?? []).length;
}

const DEF_PATTERNS = [
  /export\s+(?:async\s+)?function\s*\*?\s*(\w+)/g,
  /export\s+(?:const|let|var)\s+(\w+)/g,
  /export\s+class\s+(\w+)/g,
];
const REEXPORT = /export\s*\{([^}]*)\}/g;

const MAP_DEF = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:Object\.freeze\(\s*)?\{([^{}]*)\}/g;
const MAP_ENTRY = /([A-Za-z_$][\w$]*)\s*:\s*(["'])([^"'\n]+)\2/g;
const BARE_DEF = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'])([^"'\n]+)\2\s*[;\n]/g;
const REG = /settings\.register(?:Menu)?\(\s*MODULE_ID\s*,\s*(?:(["'])([^"']+)\1|([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?)/g;

const IMPORT_SPECS = [
  /\bfrom\s*(["'])([^"']+)\1/g,             // import … from / export … from
  /\bimport\s*(["'])([^"']+)\1/g,           // side-effect import
  /\bimport\(\s*(["'])([^"']+)\1\s*\)/g,    // dynamic import with a literal
];
const OPAQUE_IMPORT = /\bimport\(\s*(?!["'])/;

// Binding clauses, parsed per file to resolve which module a constant
// reference comes from (settings). Their spans are blanked before counting
// references — an import / export specifier is not a use.
const STATIC_IMPORT       = /\bimport\s+([\w$\s,{}*]*?)\s*\bfrom\s*(["'])([^"']+)\2/g;
const DYNAMIC_IMPORT      = /\bimport\(\s*(["'])([^"']+)\1\s*\)/g;
const DYNAMIC_DESTRUCTURE = /\{([\w$\s,:]*)\}\s*=\s*(?:await\s+)?import\(\s*(["'])([^"']+)\2\s*\)/g;
const EXPORT_LIST         = /\bexport\s*\{([^{}]*)\}(?:\s*from\s*(["'])([^"']+)\2)?/g;
const EXPORT_STAR         = /\bexport\s*\*\s*from\s*(["'])([^"']+)\1/g;

// A relative import specifier → the repo-relative path it names.
function resolveSpec(file, spec) {
  return spec.startsWith(".") ? posix.normalize(posix.join(posix.dirname(file), spec)) : undefined;
}
// "a, b as c" (sep = / as /) or "a, b: c" (sep = ":") → [[a, a], [b, c]]
function specList(list, sep) {
  return list.split(",").map((p) => p.trim()).filter(Boolean).map((p) => {
    const [first, second] = p.split(sep).map((s) => s.trim());
    return [first, second || first];
  });
}
const blank = (s) => s.replace(/[^\n]/g, " ");

// ── the scan ─────────────────────────────────────────────────────────────────

/**
 * Run the reachability scan over an in-memory source tree.
 *
 * @param {Object} input
 * @param {Map<string,string>} input.files — repo-relative path ("src/…",
 *   "tests/…") → raw source
 * @param {string[]} [input.entries] — production entry modules
 *   (module.json `esmodules`); Quench entries are ignored
 * @returns {Object} findings (see the report below for each bucket)
 */
export function scan({ files, entries = ["src/index.js"] }) {
  const paths     = [...files.keys()].sort();
  const srcFiles  = paths.filter((f) => f.startsWith("src/"));
  const testFiles = paths.filter((f) => f.startsWith("tests/"));
  const prodFiles   = srcFiles.filter((f) => !isQuench(f));
  const quenchFiles = srcFiles.filter(isQuench);

  const stripped = new Map(paths.map((f) => [f, stripComments(files.get(f))]));
  const corpus = (list) => list.map((f) => stripped.get(f)).join("\n");
  const prodAll   = corpus(prodFiles);
  const quenchAll = corpus(quenchFiles);
  const testAll   = corpus(testFiles);

  // Exported definitions: name → Set(defining files).
  const definers = new Map();
  const addDef = (name, file) => {
    if (!definers.has(name)) definers.set(name, new Set());
    definers.get(name).add(file);
  };
  for (const file of srcFiles) {
    const text = stripped.get(file);
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

  // module.api names: public console/macro surface counts as consumed.
  const apiNames = new Set();
  for (const file of prodFiles) {
    const text = stripped.get(file);
    for (const m of text.matchAll(/\.api\s*=\s*\{/g)) {
      let depth = 1;
      let i = m.index + m[0].length;
      const start = i;
      while (i < text.length && depth > 0) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}") depth--;
        i++;
      }
      for (const t of text.slice(start, i).matchAll(/\b(\w+)\b/g)) apiNames.add(t[1]);
    }
  }

  // Classify exports.
  const dead = [];
  const quenchOnly = [];
  const testOnly = [];
  const testSeams = [];
  for (const [name, defs] of [...definers].sort(([a], [b]) => a.localeCompare(b))) {
    if (apiNames.has(name)) continue;
    const prodDefs   = [...defs].filter((f) => !isQuench(f)).length;
    const quenchDefs = defs.size - prodDefs;
    if (countOcc(name, prodAll) - prodDefs > 0) continue;   // consumed in production
    const inQuench = countOcc(name, quenchAll) - quenchDefs > 0;
    const inTests  = countOcc(name, testAll) > 0;
    const row = { name, files: [...defs].sort(), inTests, inQuench };
    const isSeam =
      name.startsWith("_reset") || name.endsWith("ForTests") || name.startsWith("_");
    if (isSeam) testSeams.push(row);
    else if (inQuench) quenchOnly.push(row);
    else if (inTests) testOnly.push(row);
    else dead.push(row);
  }

  // Settings — resolve string constants used as register() keys.
  const constMaps  = new Map();   // file → Map(mapName → Map(key → value))
  const bareConsts = new Map();   // file → Map(constName → value)
  for (const file of prodFiles) {
    const text = stripped.get(file);
    const maps = new Map();
    for (const m of text.matchAll(MAP_DEF)) {
      const entriesOf = new Map();
      for (const e of m[2].matchAll(MAP_ENTRY)) entriesOf.set(e[1], e[3]);
      if (entriesOf.size) maps.set(m[1], entriesOf);
    }
    constMaps.set(file, maps);
    const bares = new Map();
    for (const m of text.matchAll(BARE_DEF)) bares.set(m[1], m[3]);
    bareConsts.set(file, bares);
  }
  // Per-file binding clauses: what each local name is imported as, which
  // modules are imported whole (namespace / non-destructured dynamic), what
  // the file re-exports, and its text with every specifier blanked.
  const moduleInfos = new Map();
  const moduleInfo = (file) => {
    if (moduleInfos.has(file)) return moduleInfos.get(file);
    const text = stripped.get(file) ?? "";
    const mi = {
      named: new Map(),      // local → { from, name }
      whole: new Set(),      // modules imported as a namespace object
      exportAs: new Map(),   // exported → local (`export { local as exported }`)
      reexport: new Map(),   // exported → { from, name }
      star: [],              // `export * from` targets
      refText: text,
    };
    const spans = [];
    for (const m of text.matchAll(STATIC_IMPORT)) {
      spans.push([m.index, m.index + m[0].length]);
      const from = resolveSpec(file, m[3]);
      if (!from) continue;
      if (/\*\s*as\s+[\w$]+/.test(m[1])) mi.whole.add(from);
      const braces = /\{([^{}]*)\}/.exec(m[1]);
      if (braces) {
        for (const [name, local] of specList(braces[1], /\s+as\s+/)) mi.named.set(local, { from, name });
      }
    }
    const destructured = new Set();   // offsets of import( calls bound by destructuring
    for (const m of text.matchAll(DYNAMIC_DESTRUCTURE)) {
      spans.push([m.index, m.index + m[1].length + 2]);   // the `{…}` pattern only
      destructured.add(m.index + m[0].lastIndexOf("import("));
      const from = resolveSpec(file, m[3]);
      if (!from) continue;
      for (const [name, local] of specList(m[1], ":")) mi.named.set(local, { from, name });
    }
    for (const m of text.matchAll(DYNAMIC_IMPORT)) {
      const from = resolveSpec(file, m[2]);
      if (from && !destructured.has(m.index)) mi.whole.add(from);
    }
    for (const m of text.matchAll(EXPORT_LIST)) {
      spans.push([m.index, m.index + m[0].length]);
      const from = m[3] === undefined ? undefined : resolveSpec(file, m[3]);
      for (const [local, exported] of specList(m[1], /\s+as\s+/)) {
        if (m[3] === undefined) mi.exportAs.set(exported, local);
        else if (from) mi.reexport.set(exported, { from, name: local });
      }
    }
    for (const m of text.matchAll(EXPORT_STAR)) {
      const from = resolveSpec(file, m[2]);
      if (from) mi.star.push(from);
    }
    for (const [s, e] of spans) {
      mi.refText = mi.refText.slice(0, s) + blank(mi.refText.slice(s, e)) + mi.refText.slice(e);
    }
    moduleInfos.set(file, mi);
    return mi;
  };

  // Which constant definition ({ file, name }) does an identifier denote?
  // localOrigin: a name in scope in `file`; exportOrigin: a name `file`
  // exports — following import-then-export, `export { a as b }`, named
  // re-exports and `export *`. Undefined when the trail leaves the tree or
  // ends somewhere that does not define a string constant of that name.
  const definesConst = (file, name) =>
    Boolean(bareConsts.get(file)?.has(name) || constMaps.get(file)?.has(name));
  const localOrigin = (file, local, seen = new Set()) => {
    if (definesConst(file, local)) return { file, name: local };
    const imp = moduleInfo(file).named.get(local);
    return imp ? exportOrigin(imp.from, imp.name, seen) : undefined;
  };
  const exportOrigin = (file, name, seen = new Set()) => {
    const tag = `${file}#${name}`;
    if (seen.has(tag) || !stripped.has(file)) return undefined;
    seen.add(tag);
    const mi = moduleInfo(file);
    if (mi.exportAs.has(name)) return localOrigin(file, mi.exportAs.get(name), seen);
    const re = mi.reexport.get(name);
    if (re) return exportOrigin(re.from, re.name, seen);
    const local = localOrigin(file, name, seen);
    if (local) return local;
    for (const from of mi.star) {
      const o = exportOrigin(from, name, seen);
      if (o) return o;
    }
    return undefined;
  };
  const originCache = new Map();
  const originOf = (file, name) => {
    const tag = `${file}#${name}`;
    if (!originCache.has(tag)) originCache.set(tag, exportOrigin(file, name));
    return originCache.get(tag);
  };
  const sameDef = (o, b) => o !== undefined && o.file === b.file && o.name === b.name;

  // `MAP.KEY` / `NAME` in a register() call → its string value and the
  // constant it resolves to, by the registering file's own scope only.
  const lookupConst = (file, name, key) =>
    key === undefined ? bareConsts.get(file)?.get(name) : constMaps.get(file)?.get(name)?.get(key);
  const resolveConst = (file, name, key) => {
    const origin = localOrigin(file, name);
    const value = origin && lookupConst(origin.file, origin.name, key);
    return value === undefined ? undefined : { value, origin };
  };

  // key → { count, via: Map(tag → { file, name, member }) } — `via` holds the
  // constant definitions the register() calls went through.
  const registered = new Map();
  const unresolvedSettings = [];
  for (const file of prodFiles) {
    for (const m of stripped.get(file).matchAll(REG)) {
      const resolved = m[2] === undefined ? resolveConst(file, m[3], m[4]) : undefined;
      const key = m[2] ?? resolved?.value;
      if (key === undefined) {
        unresolvedSettings.push(`${m[4] ? `${m[3]}.${m[4]}` : m[3]} (${file})`);
        continue;
      }
      const rec = registered.get(key) ?? { count: 0, via: new Map() };
      rec.count += 1;
      if (resolved) {
        const { file: defFile, name } = resolved.origin;
        rec.via.set(`${defFile}#${name}.${m[4] ?? ""}`, { file: defFile, name, member: m[4] });
      }
      registered.set(key, rec);
    }
  }

  // References to one constant definition across `list`: in its defining
  // file by its own name, elsewhere only through a local that is imported
  // from it — never a same-named constant in an unrelated file. A map is
  // counted as `LOCAL.MEMBER`; a bare constant's declaration is not a use.
  const constRefs = (b, list) => {
    let n = 0;
    for (const f of list) {
      const mi = moduleInfo(f);
      const locals = new Set();
      if (f === b.file) locals.add(b.name);
      for (const [local, imp] of mi.named) {
        if (sameDef(originOf(imp.from, imp.name), b)) locals.add(local);
      }
      // `ns.NAME` / `(await import(…)).NAME` — counted by the exported name.
      for (const from of mi.whole) if (sameDef(originOf(from, b.name), b)) locals.add(b.name);
      for (const local of locals) {
        n += countOcc(b.member === undefined ? local : `${local}.${b.member}`, mi.refText);
      }
      if (f === b.file && b.member === undefined) {
        n -= (mi.refText.match(new RegExp(`\\b(?:const|let|var)\\s+${esc(b.name)}\\s*=`, "g")) ?? []).length;
      }
    }
    return n;
  };

  // Production uses beyond the register() calls: every quoted "value" (a
  // mirror of the key in another lookup table counts — e.g. a
  // `{ lore: "loreSalienceThreshold" }` map read dynamically) plus every
  // reference to the constant the register() call went through, minus that
  // constant's own "value" definition and the register() calls themselves.
  const settingUses = (key, rec) => {
    let uses = countLiteral(`"${key}"`, prodAll) + countLiteral(`'${key}'`, prodAll);
    for (const b of rec.via.values()) uses += constRefs(b, prodFiles) - 1;
    return uses - rec.count;
  };

  const deadSettings = [];
  const quenchOnlySettings = [];
  for (const [key, rec] of [...registered].sort(([a], [b]) => a.localeCompare(b))) {
    if (settingUses(key, rec) > 0) continue;
    const inQuench =
      countLiteral(`"${key}"`, quenchAll) + countLiteral(`'${key}'`, quenchAll) > 0 ||
      [...rec.via.values()].some((b) => constRefs(b, quenchFiles) > 0);
    (inQuench ? quenchOnlySettings : deadSettings).push(key);
  }

  // Module reachability from the production entry points.
  const prodEntries = entries.filter((e) => !isQuench(e));
  const importsOf = (file) => {
    const out = new Set();
    for (const pat of IMPORT_SPECS) {
      for (const m of (stripped.get(file) ?? "").matchAll(pat)) {
        const dep = resolveSpec(file, m[2]);
        if (dep) out.add(dep);
      }
    }
    return out;
  };
  const reachable = new Set();
  const queue = [...prodEntries];
  while (queue.length) {
    const f = queue.pop();
    if (reachable.has(f) || !stripped.has(f)) continue;
    reachable.add(f);
    for (const dep of importsOf(f)) if (!reachable.has(dep)) queue.push(dep);
  }
  const importedElsewhere = new Set();
  for (const f of [...quenchFiles, ...testFiles]) {
    for (const dep of importsOf(f)) importedElsewhere.add(dep);
  }
  const unreachable = prodFiles
    .filter((f) => !reachable.has(f))
    .map((f) => ({ file: f, elsewhere: importedElsewhere.has(f) }));
  const opaqueImporters = prodFiles.filter((f) => OPAQUE_IMPORT.test(stripped.get(f)));

  return {
    counts: {
      srcFiles: srcFiles.length,
      quenchFiles: quenchFiles.length,
      exports: definers.size,
      settings: registered.size,
    },
    dead, quenchOnly, testOnly, testSeams,
    deadSettings, quenchOnlySettings, unresolvedSettings,
    prodEntries, unreachable, opaqueImporters,
  };
}

// ── report ───────────────────────────────────────────────────────────────────

function fileLabel(row) {
  const first = row.files[0];
  return row.files.length > 1 ? `${first} [x${row.files.length}]` : first;
}

function report(r) {
  console.log(
    `deadscan — src: ${r.counts.srcFiles} files (${r.counts.quenchFiles} Quench), ` +
      `exports scanned: ${r.counts.exports}, settings registered: ${r.counts.settings}\n`,
  );

  console.log(`DEAD exports (no consumer anywhere; not on module.api): ${r.dead.length}`);
  for (const row of r.dead) console.log(`  ${row.name.padEnd(36)} ${fileLabel(row)}`);

  console.log(`\nDEAD settings (registered; never read or written in production): ${r.deadSettings.length}`);
  for (const key of r.deadSettings) console.log(`  ${key}`);
  if (r.unresolvedSettings.length) {
    console.log(`  (unresolved register() keys, not checked: ${r.unresolvedSettings.join(", ")})`);
  }

  console.log(`\nQUENCH-ONLY exports (dead in production, used only by src/integration/): ${r.quenchOnly.length}`);
  for (const row of r.quenchOnly) {
    console.log(`  ${row.name.padEnd(36)} ${fileLabel(row)}${row.inTests ? "  (+ tests)" : ""}`);
  }

  console.log(`\nQUENCH-ONLY settings (never used in production, only by src/integration/): ${r.quenchOnlySettings.length}`);
  for (const key of r.quenchOnlySettings) console.log(`  ${key}`);

  console.log(`\nTEST-ONLY exports (dead in production, referenced by tests): ${r.testOnly.length}`);
  for (const row of r.testOnly) console.log(`  ${row.name.padEnd(36)} ${fileLabel(row)}`);

  console.log(`\nTEST-SEAM exports (_reset*/…ForTests/_-prefixed; informational): ${r.testSeams.length}`);
  for (const row of r.testSeams) {
    const marker = row.inTests || row.inQuench ? "" : "  ← unused even by tests";
    console.log(`  ${row.name.padEnd(36)} ${fileLabel(row)}${marker}`);
  }

  console.log(
    `\nUNREACHABLE modules (no import path from ${r.prodEntries.join(", ")}): ${r.unreachable.length}`,
  );
  for (const row of r.unreachable) {
    console.log(`  ${row.file}${row.elsewhere ? "  (imported by Quench/tests only)" : ""}`);
  }
  if (r.opaqueImporters.length) {
    console.log(`  (non-literal dynamic import() in ${r.opaqueImporters.join(", ")} — targets not resolved)`);
  }

  console.log(
    `\nRules: rules/reachability.md · Flow-trace audits: docs/flows/ · ` +
      `Provenance: docs/flows/unreachable-code-audit.md`,
  );
}

function main() {
  const strict = process.argv.includes("--strict");
  const files = new Map();
  for (const f of [...walk("src"), ...walk("tests")]) files.set(f, readFileSync(f, "utf8"));

  let entries = ["src/index.js"];
  try {
    const manifest = JSON.parse(readFileSync("module.json", "utf8"));
    if (Array.isArray(manifest.esmodules) && manifest.esmodules.length) entries = manifest.esmodules;
  } catch (err) {
    console.warn(`deadscan: cannot read module.json esmodules (${err.message}); using src/index.js`);
  }

  const result = scan({ files, entries });
  report(result);

  const failures = result.dead.length + result.deadSettings.length;
  if (strict && failures > 0) {
    console.error(`\ndeadscan --strict: ${failures} DEAD finding(s) — failing.`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

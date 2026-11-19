/**
 * STARFORGED COMPANION
 * tests/helpers/sourceScan.js — static scans of src/ for the invariant tests
 *
 * Issue #282 item 5. The 2026-10 audit found two bug families with greps no
 * test repeated: hook handlers that run on every connected client and write
 * shared state (no author / canonical-GM gate), and campaignState fields with
 * a writer but no reader (or the reverse). tests/unit/hookGates.test.js and
 * tests/unit/campaignStateFields.test.js turn those greps into checks; this
 * file is their shared lexer — and holds the campaignState field scan itself
 * (campaignStateFields), which campaignStateKeyClassification.test.js reads
 * too: every field found must say who writes it (issue #364).
 *
 * Production source only: src/ minus src/integration/ (Quench is test code —
 * the same corpus split as scripts/deadscan.mjs).
 */

import fs from "node:fs";
import path from "node:path";
import { stripComments } from "../../scripts/deadscan.mjs";
import { CampaignStateSchema } from "../../src/schemas.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const SRC = path.join(ROOT, "src");
const QUENCH_DIR = "src/integration/";

/**
 * Blank every string, template and regex literal's contents (quotes and
 * newlines kept) in comment-stripped code, so bracket matching never trips on
 * a `{` inside a string. Positions are preserved: an index into the mask is
 * the same index into the original text.
 *
 * @param {string} code — output of stripComments
 * @returns {string}
 */
export function maskLiterals(code) {
  const n = code.length;
  let out = "";
  let i = 0;
  const blank = (s) => s.replace(/[^\n]/g, " ");

  const REGEX_PRECEDERS = new Set("(,=:[!&|?{};+-*%<>~^".split(""));
  const REGEX_KEYWORDS = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);
  function regexAllowed() {
    let k = out.length - 1;
    while (k >= 0 && /\s/.test(out[k])) k--;
    if (k < 0) return true;
    if (REGEX_PRECEDERS.has(out[k])) return true;
    let s = k;
    while (s >= 0 && /[\w$]/.test(out[s])) s--;
    return s < k && REGEX_KEYWORDS.has(out.slice(s + 1, k + 1));
  }

  function skipQuoted(q) {
    const start = i;
    i++;
    while (i < n) {
      const c = code[i];
      if (c === "\\") { i += 2; continue; }
      i++;
      if (c === q || c === "\n") break;
    }
    const lit = code.slice(start, i);
    out += lit[0] + blank(lit.slice(1, -1)) + (lit.length > 1 ? lit[lit.length - 1] : "");
  }

  function skipTemplate() {
    const start = i;
    i++;
    let depth = 0;
    while (i < n) {
      const c = code[i];
      if (c === "\\") { i += 2; continue; }
      if (depth === 0 && c === "`") { i++; break; }
      if (c === "$" && code[i + 1] === "{") { depth++; i += 2; continue; }
      if (depth > 0 && c === "}") { depth--; i++; continue; }
      if (depth > 0 && c === "{") { depth++; i++; continue; }
      i++;
    }
    const lit = code.slice(start, i);
    out += "`" + blank(lit.slice(1, -1)) + "`";
  }

  function skipRegex() {
    const start = i;
    i++;
    let inClass = false;
    while (i < n) {
      const c = code[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "\n") break;
      i++;
      if (inClass) { if (c === "]") inClass = false; continue; }
      if (c === "[") inClass = true;
      else if (c === "/") break;
    }
    while (i < n && /[a-z]/i.test(code[i])) i++;
    const lit = code.slice(start, i);
    out += "/" + blank(lit.slice(1));
  }

  while (i < n) {
    const c = code[i];
    if (c === '"' || c === "'") { skipQuoted(c); continue; }
    if (c === "`") { skipTemplate(); continue; }
    if (c === "/" && code[i + 1] !== "/" && code[i + 1] !== "*" && regexAllowed()) { skipRegex(); continue; }
    out += c;
    i++;
  }
  return out;
}

/**
 * Index of the bracket closing the one at `open` (`(`, `{` or `[`), in a
 * masked string; -1 when unbalanced.
 */
export function matchBracket(mask, open) {
  const pairs = { "(": ")", "{": "}", "[": "]" };
  const want = pairs[mask[open]];
  if (!want) throw new Error(`matchBracket: no bracket at ${open}`);
  const stack = [];
  for (let i = open; i < mask.length; i++) {
    const c = mask[i];
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === ")" || c === "}" || c === "]") {
      if (stack.pop() !== c) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

/** 1-based line number of a character index. */
export function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === "\n") line++;
  return line;
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

let _cache = null;

/**
 * Every production source file: { file (repo-relative), text, code
 * (comments blanked), mask (comments and literals blanked) }.
 */
export function productionSources() {
  if (_cache) return _cache;
  _cache = walk(SRC)
    .map(full => path.relative(ROOT, full).split(path.sep).join("/"))
    .filter(file => !file.startsWith(QUENCH_DIR))
    .sort()
    .map(file => {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      const code = stripComments(text);
      return { file, text, code, mask: maskLiterals(code) };
    });
  return _cache;
}

/**
 * Hook registrations in one source file: `Hooks.on("<name>", handler)` and
 * `Hooks.once(…)` with a literal hook name. The handler is either an inline
 * function (its source is returned) or a reference (`fn`, `Class.method`),
 * returned by name for resolveFunctionSource.
 *
 * @returns {Array<{ file, line, hook, once, inline: string|null, ref: string|null }>}
 */
export function hookRegistrations(source) {
  const { file, text, code, mask } = source;
  const out = [];
  const re = /\bHooks\.(on|once)\s*\(/g;
  let m;
  while ((m = re.exec(mask))) {
    const open = m.index + m[0].length - 1;
    const close = matchBracket(mask, open);
    if (close < 0) continue;
    const args = code.slice(open + 1, close);
    const name = /^\s*(["'])([^"']+)\1\s*,/.exec(args);
    if (!name) continue;   // computed hook name — not a literal registration
    const rest = args.slice(name[0].length).trim();
    const restOffset = open + 1 + args.indexOf(rest, name[0].length);
    const ref = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*(?:,|$)/.exec(rest);
    out.push({
      file,
      line: lineOf(text, m.index),
      hook: name[2],
      once: m[1] === "once",
      inline: ref ? null : code.slice(restOffset, close),
      ref: ref ? ref[1] : null,
    });
  }
  return out;
}

/**
 * Source of the function named `name` in a file — a function declaration,
 * a `const name = (…) => …` / `function` expression, or a (static) method.
 * For a dotted reference (`SessionPanelApp.onSettingChanged`) the last
 * segment is looked up. Returns null when no definition is found.
 */
export function resolveFunctionSource(source, name) {
  const { code, mask } = source;
  const bare = name.split(".").pop();
  const esc = bare.replace(/[$]/g, "\\$");
  const patterns = [
    new RegExp(`(?:^|[^\\w$.])(?:export\\s+)?(?:async\\s+)?function\\s*\\*?\\s*${esc}\\s*\\(`, "g"),
    new RegExp(`(?:^|[^\\w$.])(?:const|let|var)\\s+${esc}\\s*=\\s*(?:async\\s+)?(?:function\\b[^(]*)?\\(`, "g"),
    new RegExp(`(?:^|[\\n;{}])\\s*(?:static\\s+)?(?:async\\s+)?#?${esc}\\s*\\(`, "g"),
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(mask))) {
      const paren = m.index + m[0].length - 1;
      const parenClose = matchBracket(mask, paren);
      if (parenClose < 0) continue;
      const after = mask.slice(parenClose + 1);
      const arrow = /^\s*=>\s*/.exec(after);
      const bodyStart = parenClose + 1 + (arrow ? arrow[0].length : after.search(/\S/));
      if (mask[bodyStart] === "{") {
        const bodyEnd = matchBracket(mask, bodyStart);
        if (bodyEnd > 0) return code.slice(m.index, bodyEnd + 1);
      } else if (arrow) {
        // Expression-bodied arrow — up to the end of the statement.
        const end = mask.indexOf(";", bodyStart);
        return code.slice(m.index, end < 0 ? mask.length : end);
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// campaignState fields — who touches which (issue #282 item 5)
// ─────────────────────────────────────────────────────────────────────────────

/** Names that never hold anything but campaignState — fields seen on them join the field list. */
const STRICT_NAMES = ['campaignState', 'cs', 'latestState', 'freshState', 'prevState', 'preState'];
/** Conventional names that usually hold campaignState — counted, but never used to discover fields. */
const LOOSE_NAMES = ['state', 'latest', 'fresh', 'stored', 'working'];

const BIND = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;]{0,80}?settings\??\.get\??\.?\(\s*MODULE_ID\s*,\s*["']campaignState["']\s*\)(?!\s*\??\.)/g;

const WRITE_AFTER = [
  /^\s*(?:=(?!=)|\?\?=|\|\|=|&&=|\+=|-=|\+\+|--)/,                          // cs.f = … / cs.f += … / cs.f++
  /^\??\.(?:push|unshift|splice|pop|shift|sort|reverse|fill)\s*\(/,          // cs.f.push(…)
  /^(?:\??\.[A-Za-z_$][\w$]*|\[[^\]\n]*\])+\s*(?:=(?!=)|\?\?=|\|\|=|&&=)/,  // cs.f.g = … / cs.f[k] = …
];

/** End of the block enclosing `index` (the file's end at top level). */
function enclosingBlockEnd(mask, index) {
  let depth = 0;
  for (let k = index; k >= 0; k--) {
    if (mask[k] === '}') depth++;
    else if (mask[k] === '{') {
      if (depth === 0) return matchBracket(mask, k);
      depth--;
    }
  }
  return mask.length;
}

/** Every `<receiver>.<field>` access in one file, on the strict and loose names. */
function accesses(src) {
  // A variable bound from game.settings.get(…, "campaignState") is strict for
  // the rest of its block only — the same name may hold a DOM node elsewhere.
  const bound = [...src.code.matchAll(BIND)].map(m => ({
    name: m[1], from: m.index, to: enclosingBlockEnd(src.mask, m.index),
  }));
  const isStrict = (receiver, at) =>
    STRICT_NAMES.includes(receiver) || bound.some(b => b.name === receiver && at > b.from && at < b.to);
  const names = [...new Set([...STRICT_NAMES, ...LOOSE_NAMES, ...bound.map(b => b.name)])];
  const access = new RegExp(`(\\bdelete\\s+)?(?<![\\w$.])(${names.join('|')})\\??\\.([A-Za-z_$][\\w$]*)\\b(?!\\s*\\()`, 'g');
  const out = [];
  for (const m of src.mask.matchAll(access)) {
    const [whole, del, receiver, name] = m;
    const strict = isStrict(receiver, m.index);
    if (!strict && !LOOSE_NAMES.includes(receiver)) continue;   // a bound name outside its block
    const after = src.mask.slice(m.index + whole.length, m.index + whole.length + 60);
    out.push({
      name,
      strict,
      write: !!del || WRITE_AFTER.some(re => re.test(after)),
      loc:   `${src.file}:${lineOf(src.text, m.index)}`,
    });
  }
  return out;
}

let _fields = null;

/**
 * Every campaignState field production code knows — the keys of
 * CampaignStateSchema, plus every field written or read on a name that only
 * ever holds campaignState — with where each is written and read. Memoised.
 *
 * @returns {Map<string, { writes: string[], reads: string[] }>}
 */
export function campaignStateFields() {
  if (_fields) return _fields;
  const all = productionSources().flatMap(accesses);
  // Pass 1 — the field list: schema keys, and anything seen on a strict name.
  const fields = new Map();   // name → { writes: [loc], reads: [loc] }
  for (const name of Object.keys(CampaignStateSchema)) fields.set(name, { writes: [], reads: [] });
  for (const a of all) if (a.strict && !fields.has(a.name)) fields.set(a.name, { writes: [], reads: [] });
  // Pass 2 — count every access to a listed field, loose names included.
  for (const a of all) {
    const f = fields.get(a.name);
    if (f) (a.write ? f.writes : f.reads).push(a.loc);
  }
  _fields = fields;
  return fields;
}

/**
 * The names a field-list constant holds — `const NAME = Object.freeze([ '…', … ])`
 * in a production file (the merge policies' lists).
 *
 * @param {string} file — repo-relative
 * @param {string} constName
 * @returns {string[]}
 */
export function listedNames(file, constName) {
  const src = productionSources().find(s => s.file === file);
  if (!src) throw new Error(`${file} not found`);
  const m = new RegExp(`const\\s+${constName}\\s*=\\s*(?:Object\\.freeze\\(\\s*)?\\[([^\\]]*)\\]`).exec(src.code);
  if (!m) throw new Error(`${constName} not found in ${file}`);
  return [...m[1].matchAll(/["']([^"']+)["']/g)].map(x => x[1]);
}

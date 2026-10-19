/**
 * STARFORGED COMPANION
 * tests/helpers/sourceScan.js — static scans of src/ for the invariant tests
 *
 * Issue #282 item 5. The 2026-10 audit found two bug families with greps no
 * test repeated: hook handlers that run on every connected client and write
 * shared state (no author / canonical-GM gate), and campaignState fields with
 * a writer but no reader (or the reverse). tests/unit/hookGates.test.js and
 * tests/unit/campaignStateFields.test.js turn those greps into checks; this
 * file is their shared lexer.
 *
 * Production source only: src/ minus src/integration/ (Quench is test code —
 * the same corpus split as scripts/deadscan.mjs).
 */

import fs from "node:fs";
import path from "node:path";
import { stripComments } from "../../scripts/deadscan.mjs";

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

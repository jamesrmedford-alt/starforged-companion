/**
 * STARFORGED COMPANION
 * tests/helpers/settingScopes.js
 *
 * The scope ("world" / "client" / "user") of every module setting, read from
 * the `game.settings.register(MODULE_ID, …)` calls in src/ — so the
 * permission-faithful settings stub (tests/setup.js) can refuse a player's
 * world-scoped write even in a test that never registered the setting.
 *
 * Statically scanned rather than executed: tests/setup.js must not import
 * src/ (a module imported by the setup file is cached before a test file's
 * vi.mock factories apply). Register keys are string literals or string
 * constants defined in the registering file — a constant map
 * (`SETTING.KEY`) or a bare `const KEY = "…"`, the same two shapes
 * scripts/deadscan.mjs resolves. A register() call whose key or scope this
 * scan cannot resolve is listed in `unresolved`, and
 * tests/unit/permissionStubs.test.js fails on it, so a new registration shape
 * is noticed instead of silently treated as unknown.
 *
 * Settings a test registers itself (game.settings.register in the stub) take
 * precedence — see `settingScope` in tests/setup.js.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "../../scripts/deadscan.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC_DIR   = join(REPO_ROOT, "src");
const MODULE_ID = "starforged-companion";

const REG       = /settings\.register\(\s*MODULE_ID\s*,\s*(?:(["'])([^"']+)\1|([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?)\s*,/g;
const MAP_DEF   = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:Object\.freeze\(\s*)?\{([^{}]*)\}/g;
const MAP_ENTRY = /([A-Za-z_$][\w$]*)\s*:\s*(["'])([^"'\n]+)\2/g;
const BARE_DEF  = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'])([^"'\n]+)\2\s*[;\n]/g;
const SCOPE     = /\bscope\s*:\s*(["'])(world|client|user)\1/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (extname(entry.name) === ".js") out.push(p);
  }
  return out;
}

/** The text of the `{ … }` options literal that starts at or after `from`. */
function optionsLiteral(code, from) {
  const start = code.indexOf("{", from);
  if (start < 0) return "";
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    const c = code[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return code.slice(start, i + 1);
    }
  }
  return "";
}

let _scan = null;

/**
 * @returns {{ scopes: Map<string, string>, unresolved: string[] }}
 *   scopes: "starforged-companion.<key>" → scope
 *   unresolved: "<file>: <key expression>" for every register() call the scan
 *   could not resolve
 */
export function scanSettingScopes() {
  if (_scan) return _scan;
  const scopes = new Map();
  const unresolved = [];

  for (const file of walk(SRC_DIR)) {
    const rel = relative(REPO_ROOT, file).split("\\").join("/");
    if (rel.startsWith("src/integration/")) continue;
    const code = stripComments(readFileSync(file, "utf8"));
    if (!code.includes("settings.register(")) continue;

    const maps = new Map();
    for (const [, name, body] of code.matchAll(MAP_DEF)) {
      const entries = new Map();
      for (const [, k, , v] of body.matchAll(MAP_ENTRY)) entries.set(k, v);
      maps.set(name, entries);
    }
    const bare = new Map();
    for (const [, name, , value] of code.matchAll(BARE_DEF)) bare.set(name, value);

    for (const m of code.matchAll(REG)) {
      const [whole, , literal, ident, member] = m;
      const key = literal
        ?? (member ? maps.get(ident)?.get(member) : bare.get(ident));
      const scope = SCOPE.exec(optionsLiteral(code, m.index + whole.length))?.[2];
      if (!key || !scope) {
        unresolved.push(`${rel}: ${literal ?? (member ? `${ident}.${member}` : ident)}`);
        continue;
      }
      scopes.set(`${MODULE_ID}.${key}`, scope);
    }
  }

  _scan = { scopes, unresolved };
  return _scan;
}

/**
 * The registered scope of a module setting, or null when src/ never
 * registers it (or registers it in a shape the scan cannot read).
 *
 * @param {string} namespace
 * @param {string} key
 * @returns {"world"|"client"|"user"|null}
 */
export function staticSettingScope(namespace, key) {
  return scanSettingScopes().scopes.get(`${namespace}.${key}`) ?? null;
}

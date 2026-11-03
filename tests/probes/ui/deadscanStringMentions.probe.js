/**
 * Probe UI-09 — DEADSCAN-STRING-SELF-MENTION (PRODUCED-BUT-DEAD — the scanner's blind spot)
 *
 * What the user does: CI runs `node scripts/deadscan.mjs --strict` after lint
 * to keep zero-consumer exports out of the tree (rules/reachability.md
 * "Detection").
 *
 * What happens: the scan strips comments but keeps string literals, and counts
 * any word-boundary occurrence of an export's name in the production corpus as
 * a consumer (deadscan.mjs countOcc). The common log line
 * `console.warn(\`… loadEntityAssets(${id}) scan failed …\`)` inside the
 * function's OWN body therefore counts as its consumer. Three exports pass the
 * strict gate that way today: `loadEntityAssets` (art/storage.js:119 — no
 * caller anywhere: DEAD), `isIronswornAvailable` (system/ironswornAssets.js:50)
 * and `listCanonicalEncounters` (system/ironswornPacks.js:198) — called only by
 * tests and Quench (QUENCH-ONLY). The report says 0 dead exports.
 *
 * What should happen: a mention inside a longer string (a log message) is not a
 * consumer; a whole-literal string (`fn: "applyPrivateLinesSync"`, the GM_ACTIONS
 * dispatch) still is.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { scan } from "../../../scripts/deadscan.mjs";

const tree = (obj) => new Map(Object.entries(obj));
const names = (rows) => rows.map(r => r.name);

function realTree() {
  const files = new Map();
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (!p.includes("probes")) walk(p); }   // the probes name these exports themselves
      else if (e.name.endsWith(".js")) files.set(p.split("\\").join("/"), readFileSync(p, "utf8"));
    }
  };
  walk("src");
  walk("tests");
  return files;
}

describe("UI-09 deadscan: a function's own log message is not its consumer", () => {
  it("control: a whole-literal string dispatch still counts (GM_ACTIONS `fn: \"…\"`)", () => {
    const r = scan({ files: tree({
      "src/index.js":  "import './relay.js';",
      "src/relay.js":  "const ACTIONS = { kind: { load: () => import('./h.js'), fn: \"applyThing\" } };",
      "src/h.js":      "export async function applyThing() {}",
    }) });
    expect(names(r.dead)).not.toContain("applyThing");
  });

  it("an export mentioned only in its own console.warn is DEAD", () => {
    const r = scan({ files: tree({
      "src/index.js": "import './util.js';",
      "src/util.js":  "export async function loadAll(id) {\n  try { return []; } catch (err) { console.warn(`m | loadAll(${id}) scan failed:`, err); }\n}",
    }) });
    // FAILS today: the log line counts as a consumer — nothing reported.
    expect(names(r.dead)).toEqual(["loadAll"]);
  });

  it("the real tree: loadEntityAssets is DEAD, isIronswornAvailable and listCanonicalEncounters are QUENCH-ONLY", () => {
    const r = scan({ files: realTree(), entries: ["src/index.js"] });
    // FAILS today: all three are counted live by their own log strings.
    expect({
      dead:       names(r.dead).filter(n => n === "loadEntityAssets"),
      quenchOnly: names(r.quenchOnly).filter(n => ["isIronswornAvailable", "listCanonicalEncounters"].includes(n)).sort(),
    }).toEqual({ dead: ["loadEntityAssets"], quenchOnly: ["isIronswornAvailable", "listCanonicalEncounters"] });
  });
});

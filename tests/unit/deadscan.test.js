/**
 * STARFORGED COMPANION
 * tests/unit/deadscan.test.js
 *
 * Pins the blind spots scripts/deadscan.mjs was taught to see in the 2026-10
 * audit: constant-keyed settings, Quench as test code (QUENCH-ONLY bucket),
 * comment mentions not counting as consumers, and modules no production
 * entry imports. Runs scan() over small in-memory trees.
 */

import { describe, it, expect } from "vitest";
import { scan, stripComments } from "../../scripts/deadscan.mjs";

const tree = (obj) => new Map(Object.entries(obj));
const names = (rows) => rows.map(r => r.name);

describe("stripComments", () => {
  it("blanks line and block comments but keeps code and newlines", () => {
    const src = "const a = 1; // foo()\n/* bar()\n baz() */ const b = 2;";
    const out = stripComments(src);
    expect(out).not.toMatch(/foo|bar|baz/);
    expect(out).toContain("const a = 1;");
    expect(out).toContain("const b = 2;");
    expect(out.split("\n")).toHaveLength(3);
  });

  it("does not treat // inside strings, templates or regexes as a comment", () => {
    const src = [
      'const url = "https://example.com/x"; keep1();',
      "const t = `http://a/${ b /* gone */ }`; keep2();",
      "const re = /\\/\\/ not a comment/g; keep3();",
      "const r2 = x.replace(/[/]/, ''); keep4();",
    ].join("\n");
    const out = stripComments(src);
    expect(out).toContain("https://example.com/x");
    expect(out).toContain("http://a/");
    expect(out).not.toContain("gone");
    for (const k of ["keep1", "keep2", "keep3", "keep4"]) expect(out).toContain(k);
  });

  it("treats a slash after a value as division, not a regex", () => {
    const out = stripComments("const h = (a) / 2; // half\nlive();");
    expect(out).not.toContain("half");
    expect(out).toContain("live();");
  });
});

describe("scan — exports", () => {
  it("a symbol mentioned only in a comment is DEAD", () => {
    const r = scan({ files: tree({
      "src/index.js": "// see helper() in util.js\nimport './util.js';",
      "src/util.js":  "export function helper() {}",
    }) });
    expect(names(r.dead)).toEqual(["helper"]);
  });

  it("Quench is test code: a Quench-only consumer lands in QUENCH-ONLY, not live", () => {
    const r = scan({ files: tree({
      "src/index.js":             "import { live } from './util.js'; live();",
      "src/util.js":              "export function live() {}\nexport function quenchy() {}",
      "src/integration/quench.js":"import { quenchy } from '../util.js'; quenchy();",
    }), entries: ["src/index.js", "src/integration/quench.js"] });
    expect(names(r.quenchOnly)).toEqual(["quenchy"]);
    expect(names(r.dead)).toEqual([]);
  });

  it("test-only consumers are TEST-ONLY", () => {
    const r = scan({ files: tree({
      "src/index.js":        "import './util.js';",
      "src/util.js":         "export function seam() {}",
      "tests/unit/x.test.js":"import { seam } from '../../src/util.js'; seam();",
    }) });
    expect(names(r.testOnly)).toEqual(["seam"]);
  });
});

describe("scan — settings registered via constants", () => {
  const panel = (extra = "") => `
    const MODULE_ID = "m";
    const SETTING = { USED: 'usedKey', UNUSED: 'unusedKey', MIRRORED: 'mirroredKey' };
    const BARE = "bareKey";
    game.settings.register(MODULE_ID, SETTING.USED, {});
    game.settings.register(MODULE_ID, SETTING.UNUSED, {});
    game.settings.register(MODULE_ID, SETTING.MIRRORED, {});
    game.settings.register(MODULE_ID, BARE, {});
    game.settings.register(MODULE_ID, "literalKey", {});
    export function read() { return game.settings.get(MODULE_ID, SETTING.USED); }
    ${extra}
  `;

  it("resolves MAP.KEY / bare constants and counts MAP.KEY references as uses", () => {
    const r = scan({ files: tree({
      "src/index.js": "import { read } from './panel.js'; read();",
      "src/panel.js": panel(),
      "src/other.js": "export const LOOKUP = { x: 'mirroredKey' };",
    }) });
    expect(r.counts.settings).toBe(5);
    expect(r.deadSettings.sort()).toEqual(["bareKey", "literalKey", "unusedKey"]);
  });

  it("a bare-constant or raw-string read makes the setting live", () => {
    const r = scan({ files: tree({
      "src/index.js": "import './panel.js';",
      "src/panel.js": panel("export const a = () => [game.settings.get(MODULE_ID, BARE), game.settings.get(MODULE_ID, 'literalKey')];"),
    }) });
    // mirroredKey has no LOOKUP mirror in this tree, so it is dead here.
    expect(r.deadSettings.sort()).toEqual(["mirroredKey", "unusedKey"]);
  });

  it("a setting read only by Quench is QUENCH-ONLY, not live", () => {
    const r = scan({ files: tree({
      "src/index.js":              "import './panel.js';",
      "src/panel.js":              panel(),
      "src/integration/quench.js": "game.settings.get('m', 'unusedKey');",
    }) });
    expect(r.quenchOnlySettings).toEqual(["unusedKey"]);
    expect(r.deadSettings).not.toContain("unusedKey");
  });

  it("a comment mentioning the key is not a use", () => {
    const r = scan({ files: tree({
      "src/index.js": "import './panel.js';",
      "src/panel.js": panel("// game.settings.get(MODULE_ID, SETTING.UNUSED)"),
    }) });
    expect(r.deadSettings).toContain("unusedKey");
  });
});

describe("scan — module reachability", () => {
  it("reports modules no production entry reaches (static, dynamic, re-export)", () => {
    const r = scan({ files: tree({
      "src/index.js":     "import './a.js'; export * from './c.js'; const m = await import('./lazy.js');",
      "src/a.js":         "import { x } from './sub/b.js';",
      "src/sub/b.js":     "export const x = 1;",
      "src/c.js":         "export const c = 1;",
      "src/lazy.js":      "export const l = 1;",
      "src/orphan.js":    "import './orphanChild.js';",
      "src/orphanChild.js": "export const oc = 1;",
      "src/qonly.js":     "export const q = 1;",
      "src/integration/quench.js": "import '../qonly.js';",
    }), entries: ["src/index.js", "src/integration/quench.js"] });
    expect(r.unreachable).toEqual([
      { file: "src/orphan.js",      elsewhere: false },
      { file: "src/orphanChild.js", elsewhere: false },
      { file: "src/qonly.js",       elsewhere: true },
    ]);
  });
});

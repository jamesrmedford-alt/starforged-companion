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

describe("scan — constant references count only where they resolve to the same constant", () => {
  // The tree's real shape: combatTracker.js and apiTransactionLog.js each
  // declare an unrelated `const SETTING_KEY`. Before the fix the identifier
  // was counted across all of production, so apiTransactionLog's reads kept
  // a combatTrackerEnabled with no reads of its own scoring live.
  const tracker = (reads = "") => `
    const MODULE_ID = "m";
    const SETTING_KEY = 'combatTrackerEnabled';
    export function registerTracker() { game.settings.register(MODULE_ID, SETTING_KEY, {}); }
    ${reads}
  `;
  const txLog = `
    const MODULE_ID = "m";
    const SETTING_KEY = "apiTransactionLog.enabled";
    export const enabled = () => game.settings.get(MODULE_ID, SETTING_KEY) ?? true;
    export const again = () => SETTING_KEY;
  `;

  it("a same-named bare constant in an unrelated file does not mask a dead setting", () => {
    const r = scan({ files: tree({
      "src/index.js":  "import './tracker.js'; import './txLog.js';",
      "src/tracker.js": tracker(),
      "src/txLog.js":   txLog,
    }) });
    expect(r.deadSettings).toEqual(["combatTrackerEnabled"]);
  });

  it("…even when that file imports something else from the defining module", () => {
    const r = scan({ files: tree({
      "src/index.js":   "import './tracker.js'; import './other.js';",
      "src/tracker.js": tracker(),
      "src/other.js":   "import { registerTracker } from './tracker.js'; registerTracker();\n" + txLog,
    }) });
    expect(r.deadSettings).toEqual(["combatTrackerEnabled"]);
  });

  it("the constant read in its own defining file is a use", () => {
    const r = scan({ files: tree({
      "src/index.js":   "import './tracker.js'; import './txLog.js';",
      "src/tracker.js": tracker("export const on = () => game.settings.get(MODULE_ID, SETTING_KEY);"),
      "src/txLog.js":   txLog,
    }) });
    expect(r.deadSettings).toEqual([]);
  });

  it("a same-named constant map in an unrelated file does not mask a dead MAP.KEY setting", () => {
    const r = scan({ files: tree({
      "src/index.js": "import './panel.js'; import './other.js';",
      "src/panel.js": `const MODULE_ID = "m";
        const SETTING = { A: "aKey" };
        game.settings.register(MODULE_ID, SETTING.A, {});`,
      "src/other.js": `const SETTING = { A: "somethingElse" };
        export const f = () => game.settings.get("m", SETTING.A);`,
    }) });
    expect(r.deadSettings).toEqual(["aKey"]);
  });

  const keys = `
    const MODULE_ID = "m";
    export const KEY = "importedKey";
    game.settings.register(MODULE_ID, KEY, {});
  `;
  it.each([
    ["a named import",           "import { KEY } from './keys.js'; export const f = () => game.settings.get('m', KEY);"],
    ["an aliased import",        "import { KEY as K } from './keys.js'; export const f = () => game.settings.get('m', K);"],
    ["a namespace import",       "import * as keys from './keys.js'; export const f = () => game.settings.get('m', keys.KEY);"],
    ["a destructured dynamic import",
      "export async function f() { const { KEY: k } = await import('./keys.js'); return game.settings.get('m', k); }"],
    ["a whole-module dynamic import",
      "export async function f() { return game.settings.get('m', (await import('./keys.js')).KEY); }"],
    ["a re-export barrel",       "import { KEY } from './barrel.js'; export const f = () => game.settings.get('m', KEY);"],
  ])("a bare constant read through %s is a use", (_label, reader) => {
    const r = scan({ files: tree({
      "src/index.js":  "import './keys.js'; import './reader.js';",
      "src/keys.js":   keys,
      "src/barrel.js": "export { KEY } from './keys.js';",
      "src/reader.js": reader,
    }) });
    expect(r.deadSettings).toEqual([]);
  });

  it("an import specifier or re-export alone is not a use", () => {
    const r = scan({ files: tree({
      "src/index.js":  "import './keys.js'; import './reader.js';",
      "src/keys.js":   keys,
      "src/barrel.js": "export { KEY } from './keys.js';",
      "src/reader.js": "import { KEY } from './keys.js';\nconst { KEY: k } = await import('./barrel.js');",
    }) });
    expect(r.deadSettings).toEqual(["importedKey"]);
  });

  it("resolves a register() key imported into the registering file; MAP.KEY uses count only via that map", () => {
    const r = scan({ files: tree({
      "src/index.js":  "import './panel.js';",
      "src/keys.js":   "export const SETTING = { A: 'aKey', B: 'bKey', C: 'cKey' };",
      "src/panel.js":  `import { SETTING as S } from './keys.js';
        const MODULE_ID = "m";
        game.settings.register(MODULE_ID, S.A, {});
        game.settings.register(MODULE_ID, S.B, {});
        game.settings.register(MODULE_ID, S.C, {});
        export const a = () => game.settings.get(MODULE_ID, S.A);`,
      "src/reader.js": `import { SETTING } from './keys.js';
        export const b = () => game.settings.get('m', SETTING.B);`,
      "src/other.js":  `const SETTING = { C: 'unrelated' };
        export const c = () => SETTING.C;`,
    }) });
    expect(r.unresolvedSettings).toEqual([]);
    expect(r.counts.settings).toBe(3);
    expect(r.deadSettings).toEqual(["cKey"]);
  });

  it("a constant the registering file neither defines nor imports is unresolved, not borrowed", () => {
    const r = scan({ files: tree({
      "src/index.js": "import './a.js';",
      "src/a.js":     'game.settings.register(MODULE_ID, ORPHAN_KEY, {});',
      "src/b.js":     'const ORPHAN_KEY = "somebodyElsesKey"; export const f = () => ORPHAN_KEY;',
    }) });
    expect(r.unresolvedSettings).toEqual(["ORPHAN_KEY (src/a.js)"]);
    expect(r.counts.settings).toBe(0);
  });

  it("a setting read only by Quench through the imported constant is QUENCH-ONLY", () => {
    const r = scan({ files: tree({
      "src/index.js":              "import './keys.js';",
      "src/keys.js":               keys,
      "src/integration/quench.js": "import { KEY } from '../keys.js'; game.settings.get('m', KEY);",
    }), entries: ["src/index.js", "src/integration/quench.js"] });
    expect(r.quenchOnlySettings).toEqual(["importedKey"]);
    expect(r.deadSettings).toEqual([]);
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

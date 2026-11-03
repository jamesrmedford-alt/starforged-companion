/**
 * STARFORGED COMPANION
 * tests/unit/langStringsConsumed.test.js
 *
 * Every string in lang/en.json is read where it is shown (issue #326 W84).
 *
 * The file held 159 `STARFORGED.*` keys and nothing read one: no
 * game.i18n.localize / format call, setting name or template named any of
 * them (the only localize call, system/i18n.js, reads the system's
 * `IRONSWORN.*` keys). Every panel and card string is hard-coded English, so
 * an edit to lang/en.json changed nothing on screen and a translation would
 * have translated nothing — a producer with zero consumers
 * (rules/reachability.md §1). The unused keys are deleted; the file stays
 * declared (module.json `languages`) and empty, so a key added later must be
 * read somewhere — this test fails on one that is not.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(dir, e.name)) : (/\.(js|hbs|html)$/.test(e.name) ? [join(dir, e.name)] : []));
}
function keys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
}

describe("lang/en.json strings reach the UI (issue #326 W84)", () => {
  const lang = JSON.parse(readFileSync("lang/en.json", "utf8"));
  const prod = walk("src").filter(f => !f.split("\\").join("/").includes("src/integration/"))
    .map(f => readFileSync(f, "utf8")).join("\n");

  it("control: module.json still declares the file, and it parses", () => {
    const manifest = JSON.parse(readFileSync("module.json", "utf8"));
    expect(manifest.languages.map(l => l.path)).toContain("lang/en.json");
    expect(typeof lang).toBe("object");
  });

  it("every key in it is read somewhere in production src/", () => {
    const unread = keys(lang).filter(k => !(prod.includes(`"${k}"`) || prod.includes(`'${k}'`) || prod.includes(`\`${k}\``)));
    expect(unread).toEqual([]);
  });
});

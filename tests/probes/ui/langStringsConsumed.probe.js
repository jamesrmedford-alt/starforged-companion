/**
 * Probe UI-08 — LANG-FILE-DEAD (PRODUCED-BUT-DEAD)
 *
 * What the user does: nothing in particular — a maintainer edits a UI string in
 * lang/en.json (as the PRIVATE-LINES-PANEL-COPY fix did, known-issues.md:809),
 * or a translator adds lang/de.json; module.json declares the language file.
 *
 * What happens: none of the file's 159 `STARFORGED.*` keys is read by any
 * production code — no game.i18n.localize / format call names one (the only
 * localize call, system/i18n.js, reads the system's `IRONSWORN.*` keys). Every
 * panel and card string is hard-coded English in the JS, so an edit to
 * lang/en.json changes nothing on screen, and a translation would translate
 * nothing. rules/reachability.md §1: a producer with zero consumers is a bug —
 * deadscan does not scan lang/.
 *
 * What should happen: the strings are read where they are shown, or the file's
 * unused keys are deleted (and file-structure.md stops calling it the module's
 * localisation strings).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(dir, e.name)) : (e.name.endsWith(".js") ? [join(dir, e.name)] : []));
}
function keys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
}

describe("UI-08 lang/en.json strings reach the UI", () => {
  const lang = JSON.parse(readFileSync("lang/en.json", "utf8"));
  const all = keys(lang);
  const prod = walk("src").filter(f => !f.includes("integration")).map(f => readFileSync(f, "utf8")).join("\n");

  it("control: module.json ships the file and it holds STARFORGED.* strings", () => {
    const manifest = JSON.parse(readFileSync("module.json", "utf8"));
    expect(manifest.languages.map(l => l.path)).toContain("lang/en.json");
    expect(all.length).toBeGreaterThan(100);
  });

  it("at least the module's own keys are read somewhere in src/", () => {
    const used = all.filter(k => prod.includes(`"${k}"`) || prod.includes(`'${k}'`) || prod.includes(`\`${k}\``));
    // FAILS today: 0 of 159.
    expect(used.length).toBeGreaterThan(0);
  });
});

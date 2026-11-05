/**
 * PROBE — UI-06 SETTINGS-REFERENCE-DEFAULTS-UNSTATED (tenth audit, area ui;
 * DOC-DRIFT, completeness — the help's Settings Reference rows are the
 * documented defaults for the Companion Settings panel, and six rows for
 * registered settings state none)
 *
 * What the user does: a GM reads the help's Settings Reference to learn what
 * a switch does out of the box before deciding whether to change it — the
 * table is the module's statement of its defaults ("Default: on." on fifty
 * rows; the ninth audit's X60 added rows for the two Configure Settings
 * entries that had none, each with its default).
 *
 * What happens: six rows for registered world settings give no default —
 * "Enable pacing classifier" (registered true), "Density window" (5; the row
 * gives only "Range 3–10"), "Enable fact continuity" (true), "Inject the
 * active-scene ledger" (true), "Require a sidecar" (true) and "Scene
 * Interrogation Enabled" (true) — while every neighbouring row does, so the
 * reader cannot tell whether the module ships with the classifier, fact
 * continuity or the sidecar requirement on. (The Narration Model and
 * Perspective rows only imply theirs — "recommended", "Auto (…) or fixed".)
 *
 * What should happen: each row states the registered default, as the
 * others do — the Settings Reference is the single source of truth for the
 * in-game help (CLAUDE.md).
 *
 * Controls: the rows that state a default state the registered one
 * ("Max ledger tokens … Default 400" — registered 400; "Scene Response
 * Length … Default: 2" — registered 2).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/ui/settingsReferenceDefaultsUnstated.probe.js
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PAGES } from "../../../src/help/helpJournal.js";

const panelSrc = readFileSync("src/ui/settingsPanel.js", "utf8");
const plain = (html) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();

/** Every Settings Reference row below the Configure Settings table: label → description text. */
function panelRows() {
  const content = PAGES.find(p => p.name === "Settings Reference")?.text?.content ?? "";
  const rows = new Map();
  for (const table of content.split("Companion Settings Panel")[1].split("<table>").slice(1)) {
    for (const m of table.matchAll(/<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>/g)) rows.set(plain(m[1]), plain(m[2]));
  }
  return rows;
}

/** The registered default of a setting, by its SETTING.* key constant. */
function registeredDefault(key) {
  const block = panelSrc.split(`settings.register(MODULE_ID, SETTING.${key},`)[1]?.split("});")[0] ?? "";
  return block.match(/default:\s*([^,\n]+)/)?.[1]?.trim();
}

// Row label → the registered setting whose default it should state.
const UNSTATED = {
  "Enable pacing classifier":      "PACING_ENABLED",
  "Density window":                "PACING_DENSITY_WINDOW",
  "Enable fact continuity":        "FC_ENABLED",
  "Inject the active-scene ledger": "FC_LEDGER_IN_CONTEXT",
  "Require a sidecar":             "FC_SIDECAR_REQUIRED",
  "Scene Interrogation Enabled":   "SCENE_QUERY_ENABLED",
};

describe("UI-06 every Settings Reference row for a registered setting states its default", () => {
  const rows = panelRows();

  it("control: the rows that state a default state the registered one", () => {
    expect(rows.get("Max ledger tokens")).toMatch(/Default 400/);
    expect(registeredDefault("FC_MAX_LEDGER_TOKENS")).toBe("400");
    expect(rows.get("Scene Response Length")).toMatch(/Default: 2\b/);
    expect(registeredDefault("SCENE_RESPONSE_LENGTH")).toBe("2");
    for (const key of Object.values(UNSTATED)) expect(registeredDefault(key), key).toBeTruthy();   // each is registered with a default
  });

  it.each(Object.entries(UNSTATED))("%s states its registered default (%s)", (label, key) => {
    const text = rows.get(label);
    expect(text, `row "${label}" present`).toBeTruthy();
    // Expected: the row names its default. Today: none of these six does.
    expect(text, `registered default ${registeredDefault(key)}`).toMatch(/default/i);
  });
});

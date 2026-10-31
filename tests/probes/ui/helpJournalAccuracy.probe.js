/**
 * PROBE (ui audit) — HELP-RANK-TICKS-WRONG, HELP-SETTINGS-UNREACHABLE
 *
 * 1. The help journal's Progress Tracks page "Ranks and progress" table has a
 *    "Ticks per mark" column reading Troublesome 3 / Dangerous 2 /
 *    Formidable 1 / Extreme ½ / Epic ¼ ticks. Those are BOXES: the code
 *    (progressTracks.js RANKS) and Starforged mark 12 / 8 / 4 / 2 / 1 ticks.
 *
 * 2. The Settings Reference page documents, under "Companion Settings Panel",
 *    settings that no UI can change: they are registered `config: false` (so
 *    Foundry's Configure Settings hides them) and the Companion Settings panel
 *    renders no input for them; no production code ever writes them. E.g.
 *    Narration Max Tokens, Scene Interrogation Enabled, Contradiction
 *    Notifications, Session Log Auto-Write, Ship Positioning.
 *
 * Asserts the CORRECT behaviour, so it FAILS today.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { StubElement } from "../../helpers/cardDom.js";
import { PAGES } from "../../../src/help/helpJournal.js";

const MODULE_ID = "starforged-companion";

const pageText = (name) => {
  const page = PAGES.find(p => p.name === name);
  return page?.text?.content ?? "";
};

describe("help: Progress Tracks ranks table matches the tick math (HELP-RANK-TICKS-WRONG)", () => {
  let progress;
  let journal;
  let savedJournal;

  beforeAll(async () => {
    foundry.applications.api.DialogV2 = { confirm: async () => true };
    progress = await import("../../../src/ui/progressTracks.js");
  });
  beforeEach(() => {
    const flags = {};
    journal = {
      id: "pt", name: "Starforged Progress Tracks",
      getFlag: (m, k) => flags[`${m}.${k}`],
      setFlag: async (m, k, v) => { flags[`${m}.${k}`] = structuredClone(v); },
    };
    savedJournal = game.journal;
    game.journal = { ...savedJournal, find: (fn) => (fn(journal) ? journal : null) };
  });
  afterEach(() => { game.journal = savedJournal; });

  for (const [rank, label] of [["troublesome", "Troublesome"], ["dangerous", "Dangerous"], ["formidable", "Formidable"], ["epic", "Epic"]]) {
    it(`${label}: the documented ticks per mark equal one Mark Progress`, async () => {
      const track = await progress.addProgressTrack({ label: `A ${rank} fight`, type: "combat", rank });
      const marked = await progress.markProgressById(track.id);

      const html = pageText("Progress Tracks");
      const row = html.match(new RegExp(`<td>${label}</td><td>([^<]*)</td>`));
      expect(row, "rank row present in the help table").toBeTruthy();
      const documented = row[1];   // e.g. "3 ticks (≈3–4 marks to fill)"
      const n = documented.trim().startsWith("½") ? 0.5 : documented.trim().startsWith("¼") ? 0.25 : Number.parseFloat(documented);
      // Today: Troublesome documents 3 ticks; one mark adds 12.
      expect({ rank, documentedTicksPerMark: n }).toEqual({ rank, documentedTicksPerMark: marked.ticks });
    });
  }
});

describe("help: documented panel settings have a control (HELP-SETTINGS-UNREACHABLE)", () => {
  let SettingsPanelApp;
  let registerSettings;

  beforeAll(async () => {
    ({ SettingsPanelApp, registerSettings } = await import("../../../src/ui/settingsPanel.js"));
  });
  beforeEach(() => {
    globalThis.document = { createElement: (tag) => new StubElement(tag) };
    game.settings._store.set(`${MODULE_ID}.campaignState`, {});
  });
  afterEach(() => {
    delete globalThis.document;
    game.settings._store.delete(`${MODULE_ID}.campaignState`);
  });

  /** Every input / select / textarea name the panel renders, across its tabs, for a GM. */
  async function renderedControlNames() {
    registerSettings();
    const panel = new SettingsPanelApp();
    const names = new Set();
    for (const tab of ["safety", "mischief", "narrator", "audio", "about"]) {
      await SettingsPanelApp.DEFAULT_OPTIONS.actions.switchTab.call(
        Object.assign(panel, { render() {} }), {}, { dataset: { tab } },
      );
      const ctx = await panel._prepareContext({});
      const root = await panel._renderHTML(ctx, {});
      for (const el of root.querySelectorAll("input, select, textarea")) {
        const name = el.getAttribute("name");
        if (name) names.add(name);
      }
    }
    return names;
  }

  it("the Settings Reference's documented settings can be changed in the Companion Settings panel", async () => {
    const reference = pageText("Settings Reference");
    // Documented on the page under "Companion Settings Panel (Toolbar → 🛡)":
    const documented = {
      "Narration Max Tokens":         "narrationMaxTokens",
      "Scene Interrogation Enabled":  "sceneQueryEnabled",
      "Contradiction Notifications":  "contradictionNotifications",
      "Session Log Auto-Write":       "sessionLogAutoWrite",
      "Ship Positioning":             "factContinuity.shipPositioning",
    };
    for (const label of Object.keys(documented)) expect(reference).toContain(label);

    const names = await renderedControlNames();
    expect(names.has("narrationLength")).toBe(true);   // control: the panel's real fields are found

    const missing = Object.entries(documented).filter(([, key]) => !names.has(key)).map(([label]) => label);
    // Today: all five are config:false, unrendered and unwritten.
    expect(missing).toEqual([]);
  });
});

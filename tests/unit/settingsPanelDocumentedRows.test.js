/**
 * STARFORGED COMPANION
 * tests/unit/settingsPanelDocumentedRows.test.js
 *
 * Issue #322 V06 (the audit's helpJournalAccuracy probe, HELP-SETTINGS-
 * UNREACHABLE): the help's Settings Reference documents settings "under the
 * Companion Settings panel" that were registered `config: false` and rendered
 * nowhere — Narration Max Tokens, the Scene Interrogation trio, the Chronicle
 * pair, the World Journal group and the four Ship Positioning settings. No UI
 * could change them. Each now has a row: the Narrator tab (saved with the
 * narrator settings) and the Mischief tab's Fact Continuity section. Two
 * defaults the help stated were stale: Narration Max Tokens 300 (registered
 * 16000) and audio "off" (both switches register on).
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { StubElement } from "../helpers/cardDom.js";
import { PAGES } from "../../src/help/helpJournal.js";

const MODULE_ID = "starforged-companion";

const pageText = (name) => PAGES.find(p => p.name === name)?.text?.content ?? "";

// The Settings Reference label → the panel control that sets it (its key).
const DOCUMENTED = {
  "Narration Max Tokens":            "narrationMaxTokens",
  "Scene Interrogation Enabled":     "sceneQueryEnabled",
  "Scene Response Length":           "sceneResponseLength",
  "Scene Context Cards":             "sceneContextCards",
  "Auto-Write Chronicle Entries":    "chronicleAutoEntry",
  "Chronicle Capture Threshold":     "chronicleSalienceThreshold",
  "Private Channel":                 "privateChannel.enabled",
  "Lore in Context":                 "loreInContext",
  "Threats in Context":              "threatsInContext",
  "Faction Landscape in Context":    "factionLandscapeInContext",
  "Contradiction Notifications":     "contradictionNotifications",
  "Session Log Auto-Write":          "sessionLogAutoWrite",
  "Lore Capture Threshold":          "loreSalienceThreshold",
  "Threat Capture Threshold":        "threatSalienceThreshold",
  "Ship Positioning":                "factContinuity.shipPositioning",
  "Auto-Move Ship on Set a Course":  "factContinuity.shipAutoMoveOnCourse",
  "Sector-Scene Ship Token":         "factContinuity.shipTokenEnabled",
  "Ship Token Snap Radius":          "factContinuity.shipTokenSnapRadius",
};

let SettingsPanelApp, registerSettings;

beforeAll(async () => {
  ({ SettingsPanelApp, registerSettings } = await import("../../src/ui/settingsPanel.js"));
});
// The settings these tests write, cleared so each test starts from the defaults.
const TOUCHED = [...Object.values(DOCUMENTED)];

beforeEach(() => {
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  for (const key of TOUCHED) game.settings._store.delete(`${MODULE_ID}.${key}`);
  game.settings._store.set(`${MODULE_ID}.campaignState`, {});
  game.user.isGM = true;
  registerSettings();
});
afterEach(() => {
  delete globalThis.document;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

/** Render one tab of a fresh panel; the panel's element is the rendered root. */
async function renderTab(tab) {
  const panel = Object.assign(new SettingsPanelApp(), { render() {} });
  await SettingsPanelApp.DEFAULT_OPTIONS.actions.switchTab.call(panel, {}, { dataset: { tab } });
  const root = await panel._renderHTML(await panel._prepareContext({}), {});
  Object.defineProperty(panel, "element", { value: root, configurable: true });
  return { panel, root };
}

async function controlNames() {
  const names = new Set();
  for (const tab of ["safety", "mischief", "narrator", "audio", "about"]) {
    const { root } = await renderTab(tab);
    for (const el of root.querySelectorAll("input, select, textarea")) {
      const name = el.getAttribute("name");
      if (name) names.add(name);
    }
  }
  return names;
}

const get = (key) => game.settings.get(MODULE_ID, key);

describe("every setting the Settings Reference places in the panel has a control there", () => {
  it("documents each, and the panel renders a control for each", async () => {
    const reference = pageText("Settings Reference");
    for (const label of Object.keys(DOCUMENTED)) expect(reference, label).toContain(label);

    const names = await controlNames();
    expect(names.has("narrationLength")).toBe(true);   // control: the panel's long-standing rows are found
    const missing = Object.entries(DOCUMENTED).filter(([, key]) => !names.has(key)).map(([label]) => label);
    expect(missing).toEqual([]);
  });

  it("each control shows the stored value", async () => {
    game.settings._store.set(`${MODULE_ID}.sceneResponseLength`, 4);
    game.settings._store.set(`${MODULE_ID}.loreInContext`, false);
    game.settings._store.set(`${MODULE_ID}.threatSalienceThreshold`, "notable");
    game.settings._store.set(`${MODULE_ID}.factContinuity.shipTokenSnapRadius`, 3);
    const { root: narrator } = await renderTab("narrator");
    expect(narrator.querySelector('[name="sceneResponseLength"]').value).toBe("4");
    expect(narrator.querySelector('[name="loreInContext"]').checked).toBe(false);
    expect(narrator.querySelector('[name="sessionLogAutoWrite"]').checked).toBe(true);
    expect(narrator.querySelector('[name="threatSalienceThreshold"]').value).toBe("notable");
    expect(narrator.querySelector('[name="narrationMaxTokens"]').value).toBe("16000");
    const { root: mischief } = await renderTab("mischief");
    expect(mischief.querySelector('[name="factContinuity.shipTokenSnapRadius"]').value).toBe("3");
    expect(mischief.querySelector('[name="factContinuity.shipPositioning"]').checked).toBe(true);
  });

  it("a player sees them disabled", async () => {
    game.user.isGM = false;
    try {
      const { root } = await renderTab("narrator");
      expect(root.querySelector('[name="chronicleAutoEntry"]').disabled).toBe(true);
      expect(root.querySelector('[name="loreSalienceThreshold"]').disabled).toBe(true);
    } finally {
      game.user.isGM = true;
    }
  });
});

describe("the save buttons write them", () => {
  it("Save Narrator Settings writes the narrator tab's new rows, in range", async () => {
    const { panel, root } = await renderTab("narrator");
    root.querySelector('[name="narrationMaxTokens"]').value = "999999";        // clamped to the ceiling
    root.querySelector('[name="sceneQueryEnabled"]').checked = false;
    root.querySelector('[name="sceneResponseLength"]').value = "9";             // clamped to 4
    root.querySelector('[name="sceneContextCards"]').value = "5";
    root.querySelector('[name="chronicleAutoEntry"]').checked = false;
    root.querySelector('[name="privateChannel.enabled"]').checked = false;
    root.querySelector('[name="contradictionNotifications"]').checked = false;
    root.querySelector('[name="chronicleSalienceThreshold"]').value = "scene";
    root.querySelector('[name="loreSalienceThreshold"]').value = "scene";
    root.querySelector('[name="threatSalienceThreshold"]').value = "legendary";       // not a level: the default

    await SettingsPanelApp.DEFAULT_OPTIONS.actions.saveNarratorSettings.call(panel, {}, {});

    expect(get("narrationMaxTokens")).toBe(64000);
    expect(get("sceneQueryEnabled")).toBe(false);
    expect(get("sceneResponseLength")).toBe(4);
    expect(get("sceneContextCards")).toBe(5);
    expect(get("chronicleAutoEntry")).toBe(false);
    expect(get("privateChannel.enabled")).toBe(false);
    expect(get("contradictionNotifications")).toBe(false);
    expect(get("loreInContext")).toBe(true);                 // left as it was
    expect(get("chronicleSalienceThreshold")).toBe("scene");
    expect(get("loreSalienceThreshold")).toBe("scene");
    expect(get("threatSalienceThreshold")).toBe("significant");
  });

  it("Save Fact Continuity Settings writes the four ship-positioning rows", async () => {
    const { panel, root } = await renderTab("mischief");
    root.querySelector('[name="factContinuity.shipPositioning"]').checked = false;
    root.querySelector('[name="factContinuity.shipAutoMoveOnCourse"]').checked = false;
    root.querySelector('[name="factContinuity.shipTokenEnabled"]').checked = false;
    root.querySelector('[name="factContinuity.shipTokenSnapRadius"]').value = "0";   // exact cell is a legal radius

    await SettingsPanelApp.DEFAULT_OPTIONS.actions.saveFactContinuitySettings.call(panel, {}, {});

    expect(get("factContinuity.shipPositioning")).toBe(false);
    expect(get("factContinuity.shipAutoMoveOnCourse")).toBe(false);
    expect(get("factContinuity.shipTokenEnabled")).toBe(false);
    expect(get("factContinuity.shipTokenSnapRadius")).toBe(0);
  });
});

describe("the help states the registered defaults", () => {
  it("Narration Max Tokens defaults to 16000, not 300", () => {
    const reference = pageText("Settings Reference");
    expect(reference).toMatch(/Narration Max Tokens<\/strong><\/td><td>[^<]*Default: 16000/);
    expect(reference).not.toMatch(/Narration Max Tokens<\/strong><\/td><td>[^<]*Default: 300\b/);
  });

  it("both audio switches are documented on by default, as registered", () => {
    const reference = pageText("Settings Reference");
    expect(reference).toMatch(/Enable Audio \(world\)<\/strong><\/td><td>[^<]*Default: on/);
    expect(reference).toMatch(/Enable Audio on this client<\/strong><\/td><td>[^<]*Default: on/);
    expect(pageText("Audio Narration")).not.toMatch(/off by default/);
  });
});

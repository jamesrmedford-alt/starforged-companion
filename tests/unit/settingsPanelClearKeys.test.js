/* global asPlayer */
/**
 * STARFORGED COMPANION
 * tests/unit/settingsPanelClearKeys.test.js
 *
 * Known-issues KEYS-NOT-CLEARABLE. The About tab renders the key fields empty
 * and Save Keys writes only a non-empty one, so no module UI could clear a
 * stored Claude, OpenRouter or ElevenLabs key — Y40's "cleared key" branch
 * (a GM leaving the key registry) was reachable only from the console. Each
 * stored key now has a Clear beside its field, which writes the empty key.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { StubElement } from "../helpers/cardDom.js";

const MODULE_ID = "starforged-companion";
const KEYS = ["claudeApiKey", "openRouterApiKey", "elevenLabsApiKey"];

let SettingsPanelApp, registerSettings;
let savedDialog;
let confirmAnswer;

beforeAll(async () => {
  ({ SettingsPanelApp, registerSettings } = await import("../../src/ui/settingsPanel.js"));
});

beforeEach(() => {
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  game.settings._store.set(`${MODULE_ID}.campaignState`, {});
  for (const key of KEYS) game.settings._store.delete(`${MODULE_ID}.${key}`);
  game.user.isGM = true;
  registerSettings();
  savedDialog = foundry.applications.api.DialogV2;
  confirmAnswer = true;
  foundry.applications.api.DialogV2 = { confirm: async () => confirmAnswer };
});

afterEach(() => {
  delete globalThis.document;
  foundry.applications.api.DialogV2 = savedDialog;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
  for (const key of KEYS) game.settings._store.delete(`${MODULE_ID}.${key}`);
  game.user.isGM = true;
});

/** The About tab of a fresh panel; the panel's element is the rendered root. */
async function renderAbout() {
  const panel = Object.assign(new SettingsPanelApp(), { render() {} });
  await SettingsPanelApp.DEFAULT_OPTIONS.actions.switchTab.call(panel, {}, { dataset: { tab: "about" } });
  const root = await panel._renderHTML(await panel._prepareContext({}), {});
  Object.defineProperty(panel, "element", { value: root, configurable: true });
  return { panel, root };
}

const clearButtons = (root) => root.querySelectorAll('[data-action="clearApiKey"]').map(b => b.dataset.key);
const press = (panel, key) => SettingsPanelApp.DEFAULT_OPTIONS.actions.clearApiKey.call(panel, {}, { dataset: { key } });
const stored = (key) => game.settings.get(MODULE_ID, key);

describe("KEYS-NOT-CLEARABLE — a stored key can be cleared from the About tab", () => {
  it("each stored key has a Clear, and pressing it clears that key only", async () => {
    for (const key of KEYS) await game.settings.set(MODULE_ID, key, `sk-${key}`);
    const { panel, root } = await renderAbout();
    expect(clearButtons(root).sort()).toEqual([...KEYS].sort());

    await press(panel, "elevenLabsApiKey");
    expect(stored("elevenLabsApiKey")).toBe("");
    expect(stored("claudeApiKey")).toBe("sk-claudeApiKey");
    expect(stored("openRouterApiKey")).toBe("sk-openRouterApiKey");

    await press(panel, "claudeApiKey");
    await press(panel, "openRouterApiKey");
    expect(KEYS.map(stored)).toEqual(["", "", ""]);
  });

  it("no Clear is shown for a key that is not stored", async () => {
    await game.settings.set(MODULE_ID, "claudeApiKey", "sk-ant-x");
    const { root } = await renderAbout();
    expect(clearButtons(root)).toEqual(["claudeApiKey"]);
  });

  it("declining the confirmation leaves the key", async () => {
    await game.settings.set(MODULE_ID, "claudeApiKey", "sk-ant-x");
    const { panel } = await renderAbout();
    confirmAnswer = false;
    await press(panel, "claudeApiKey");
    expect(stored("claudeApiKey")).toBe("sk-ant-x");
  });

  it("a player clears their own Claude and ElevenLabs keys (the OpenRouter field is a GM's)", async () => {
    await game.settings.set(MODULE_ID, "claudeApiKey", "sk-ant-pat");
    await game.settings.set(MODULE_ID, "elevenLabsApiKey", "sk_pat");
    const restore = asPlayer();
    try {
      const { panel, root } = await renderAbout();
      expect(clearButtons(root).sort()).toEqual(["claudeApiKey", "elevenLabsApiKey"]);
      await press(panel, "claudeApiKey");
      expect(stored("claudeApiKey")).toBe("");
    } finally {
      restore();
    }
  });

  it("control: a name that is no key setting clears nothing", async () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, { keep: true });
    const { panel } = await renderAbout();
    await press(panel, "campaignState");
    expect(game.settings.get(MODULE_ID, "campaignState")).toEqual({ keep: true });
  });
});

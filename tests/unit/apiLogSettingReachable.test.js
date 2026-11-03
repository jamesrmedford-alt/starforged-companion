// tests/unit/apiLogSettingReachable.test.js
// The API transaction log can be switched off from Companion Settings
// (issue #326 W78). `apiTransactionLog.enabled` was registered config:false
// with no panel row (the issue #322 V06 family): the help said the log "can
// be toggled off in world settings", but only the console could. The
// Narrator tab now has its row.

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { StubElement } from "../helpers/cardDom.js";

const MODULE_ID = "starforged-companion";
const KEY = "apiTransactionLog.enabled";

let SettingsPanelApp, registerSettings;

beforeAll(async () => {
  ({ SettingsPanelApp, registerSettings } = await import("../../src/ui/settingsPanel.js"));
});
beforeEach(() => {
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  game.settings._store.set(`${MODULE_ID}.campaignState`, {});
  game.user.isGM = true;
  registerSettings();
});
afterEach(() => {
  delete globalThis.document;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
  game.settings._store.delete(`${MODULE_ID}.${KEY}`);
});

async function controlNames() {
  const names = new Set();
  for (const tab of ["safety", "mischief", "narrator", "audio", "about"]) {
    const panel = Object.assign(new SettingsPanelApp(), { render() {} });
    await SettingsPanelApp.DEFAULT_OPTIONS.actions.switchTab.call(panel, {}, { dataset: { tab } });
    const root = await panel._renderHTML(await panel._prepareContext({}), {});
    for (const el of root.querySelectorAll("input, select, textarea")) names.add(el.getAttribute("name"));
  }
  return names;
}

describe("the API transaction log switch is reachable (issue #326 W78)", () => {
  it("control: the logger honours the setting", async () => {
    const { isEnabled } = await import("../../src/logging/apiTransactionLog.js");
    game.settings._store.set(`${MODULE_ID}.${KEY}`, false);
    expect(isEnabled()).toBe(false);
  });

  it("a GM can switch the API log off — a panel control or Configure Settings", async () => {
    const inConfigure = game.settings._registry.get(`${MODULE_ID}.${KEY}`)?.config === true;
    const inPanel = (await controlNames()).has(KEY);
    // It was config:false with no panel row.
    expect({ inConfigure, inPanel }).toEqual({ inConfigure: false, inPanel: true });
  });
});

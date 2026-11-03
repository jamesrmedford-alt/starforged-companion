/**
 * Probe UI-07 — API-TX-LOG-UNREACHABLE (PRODUCED-BUT-DEAD / UX — the V06 family)
 *
 * What the user does: a GM who does not want every Anthropic call logged to the
 * "Starforged Companion — API Log" journal looks for the switch. The help's
 * Changelog (v1.7.20) says the log is "Enabled by default; can be toggled off in
 * world settings".
 *
 * What happens: `apiTransactionLog.enabled` is registered `config: false`
 * (settingsPanel.js:626-633), so Foundry's Configure Settings does not list it,
 * and no Companion Settings tab renders a control for it; nothing in src/
 * writes it. Only the logger reads it (logging/apiTransactionLog.js isEnabled).
 * The log can be turned off only from the browser console. deadscan counts the
 * read as a use, so the gap is invisible to it; issue #322 V06 added rows for
 * eighteen such settings and missed this one.
 *
 * What should happen: the setting is reachable — a row in the panel (or
 * `config: true`), as the help says.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { StubElement } from "../../helpers/cardDom.js";

const MODULE_ID = "starforged-companion";
const KEY = "apiTransactionLog.enabled";

let SettingsPanelApp, registerSettings;

beforeAll(async () => {
  ({ SettingsPanelApp, registerSettings } = await import("../../../src/ui/settingsPanel.js"));
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

describe("UI-07 the API transaction log switch is reachable", () => {
  it("control: the logger honours the setting", async () => {
    const { isEnabled } = await import("../../../src/logging/apiTransactionLog.js");
    game.settings._store.set(`${MODULE_ID}.${KEY}`, false);
    expect(isEnabled()).toBe(false);
  });

  it("a GM can switch the API log off — a panel control or Configure Settings", async () => {
    const inConfigure = game.settings._registry.get(`${MODULE_ID}.${KEY}`)?.config === true;
    const inPanel = (await controlNames()).has(KEY);
    // FAILS today: config:false and no panel row.
    expect({ inConfigure, inPanel }).not.toEqual({ inConfigure: false, inPanel: false });
  });
});

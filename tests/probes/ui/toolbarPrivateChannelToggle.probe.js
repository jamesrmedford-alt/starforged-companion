/**
 * Probe UI-02 — TOOLBAR-PC-TOGGLE-STALE (PRODUCED-BUT-DEAD / UX)
 *
 * What the user does: the GM unticks (or ticks) "Private Channel" on the
 * Companion Settings → Narrator tab and saves. The panel's hint and the help's
 * Settings Reference say "Off hides it for everyone" / "When off, the button is
 * hidden for everyone".
 *
 * What happens: the floating toolbar computes its tool list once, when it
 * renders at `ready` (companionToolbar.js _prepareContext). Nothing re-renders
 * it when the setting changes: `privateChannel.enabled` is registered with no
 * onChange (private-channel/index.js:17), no updateSetting hook watches it, and
 * CompanionToolbarApp.rerenderIfOpen() — written for exactly this ("call when
 * tool visibility may have changed (e.g. settings)") — has no caller. Every
 * client keeps the old button set until a reload: switched off, the ✦ button
 * stays (a click only says the feature is disabled); switched on, players get
 * no button at all until they reload.
 *
 * What should happen: a change of the setting re-renders the open toolbar on
 * every client (onChange → CompanionToolbarApp.rerenderIfOpen()).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const MODULE_ID = "starforged-companion";
const KEY = "privateChannel.enabled";

let CompanionToolbarApp;
let registerPrivateChannelSettings;

beforeEach(async () => {
  ({ CompanionToolbarApp } = await import("../../../src/ui/companionToolbar.js"));
  ({ registerPrivateChannelSettings } = await import("../../../src/private-channel/index.js"));
  registerPrivateChannelSettings();
  game.settings._store.set(`${MODULE_ID}.${KEY}`, true);
});

afterEach(() => {
  game.settings._store.delete(`${MODULE_ID}.${KEY}`);
});

/** What Foundry does on every client when a world setting is written. */
async function foundryWritesSetting(value) {
  await game.settings.set(MODULE_ID, KEY, value);
  game.settings._registry.get(`${MODULE_ID}.${KEY}`)?.onChange?.(value);
  Hooks.call("updateSetting", { key: `${MODULE_ID}.${KEY}`, value }, { value }, {}, game.user.id);
}

describe("UI-02 the toolbar follows the Private Channel switch", () => {
  it("switching the Private Channel off re-renders the open toolbar (so the ✦ button goes)", async () => {
    const app = CompanionToolbarApp.open();
    app.rendered = true;
    const render = vi.spyOn(app, "render");

    const before = (await app._prepareContext({})).tools.map(t => t.key);
    expect(before).toContain("sfPrivateChannel");

    await foundryWritesSetting(false);

    // FAILS today: nothing re-renders the toolbar.
    expect(render).toHaveBeenCalled();
  });

  it("control: a re-render would drop the button — _prepareContext reads the live setting", async () => {
    const app = CompanionToolbarApp.open();
    await game.settings.set(MODULE_ID, KEY, false);
    const after = (await app._prepareContext({})).tools.map(t => t.key);
    expect(after).not.toContain("sfPrivateChannel");
  });
});

/**
 * STARFORGED COMPANION
 * tests/unit/toolbarPrivateChannelToggle.test.js
 *
 * The floating toolbar follows the Private Channel switch at once (issue
 * #326 W86).
 *
 * The toolbar computes its buttons when it renders. Nothing re-rendered it
 * when the GM switched the Private Channel off or on: the setting had no
 * onChange, no hook watched it, and CompanionToolbarApp.rerenderIfOpen —
 * written for this — had no caller. Every client kept the old button set
 * until a reload: switched off, the ✦ button stayed (a click only said the
 * feature was disabled); switched on, players had no button until they
 * reloaded. The setting's onChange (which Foundry runs on every client) now
 * notifies the toolbar, which re-renders.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";

const MODULE_ID = "starforged-companion";
const KEY = "privateChannel.enabled";

let CompanionToolbarApp, registerPrivateChannelSettings, onPrivateChannelToggled;

beforeAll(async () => {
  ({ CompanionToolbarApp } = await import("../../src/ui/companionToolbar.js"));
  ({ registerPrivateChannelSettings, onPrivateChannelToggled } = await import("../../src/private-channel/index.js"));
}, 60_000);

beforeEach(() => {
  registerPrivateChannelSettings();
  game.settings._store.set(`${MODULE_ID}.${KEY}`, true);
});

afterEach(() => {
  game.settings._store.delete(`${MODULE_ID}.${KEY}`);
});

/** What Foundry does on every client when the GM saves the switch. */
async function gmSavesSwitch(value) {
  await game.settings.set(MODULE_ID, KEY, value);
  game.settings._registry.get(`${MODULE_ID}.${KEY}`)?.onChange?.(value);
}

const toolKeys = async (app) => (await app._prepareContext({})).tools.map(t => t.key);

describe("the toolbar follows the Private Channel switch (issue #326 W86)", () => {
  it("switching it off re-renders the open toolbar, which drops the ✦ button", async () => {
    const app = CompanionToolbarApp.open();
    app.rendered = true;
    expect(await toolKeys(app)).toContain("sfPrivateChannel");
    const render = vi.spyOn(app, "render");
    await gmSavesSwitch(false);
    expect(render).toHaveBeenCalledTimes(1);
    expect(await toolKeys(app)).not.toContain("sfPrivateChannel");   // what that render shows
  });

  it("switching it on re-renders it too, which brings the button back", async () => {
    game.settings._store.set(`${MODULE_ID}.${KEY}`, false);
    const app = CompanionToolbarApp.open();
    app.rendered = true;
    const render = vi.spyOn(app, "render");
    await gmSavesSwitch(true);
    expect(render).toHaveBeenCalledTimes(1);
    expect(await toolKeys(app)).toContain("sfPrivateChannel");
  });

  it("control: a toolbar that is not rendered is left alone", async () => {
    const app = CompanionToolbarApp.open();
    app.rendered = false;
    const render = vi.spyOn(app, "render");
    await gmSavesSwitch(false);
    expect(render).not.toHaveBeenCalled();
  });

  it("a failing listener does not stop the others, and an unsubscribed one is not called", async () => {
    const calls = [];
    const offBroken = onPrivateChannelToggled(() => { throw new Error("boom"); });
    const offGone   = onPrivateChannelToggled(() => calls.push("gone"));
    const offKept   = onPrivateChannelToggled((enabled) => calls.push(`kept:${enabled}`));
    offGone();
    await gmSavesSwitch(false);
    offBroken(); offKept();
    expect(calls).toEqual(["kept:false"]);
    expect(getCapturedWarns().join("\n")).toMatch(/Private Channel toggle listener failed: boom/);
  });
});

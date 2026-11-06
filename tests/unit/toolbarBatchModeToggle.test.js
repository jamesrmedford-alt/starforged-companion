/**
 * STARFORGED COMPANION
 * tests/unit/toolbarBatchModeToggle.test.js
 *
 * Issue #340 — the toolbar follows the Batch Mode switch at once, on every
 * client (the shape of toolbarPrivateChannelToggle.test.js, issue #326 W86).
 * The toolbar computes its tools when it renders; the switch's onChange
 * (which Foundry runs on every client) notifies it, and it re-renders: the
 * GM's switch shows pressed or not, and players gain or lose the Round tool.
 * The switch is the toolbar's one toggle — rendered with aria-pressed, and
 * labelled "Batch Mode: on" in the compact list.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { StubElement } from "../helpers/cardDom.js";

const MODULE_ID = "starforged-companion";
const KEY = "batchMode.enabled";

let CompanionToolbarApp, registerBatchModeSettings, onBatchModeToggled;

beforeAll(async () => {
  ({ CompanionToolbarApp } = await import("../../src/ui/companionToolbar.js"));
  ({ registerBatchModeSettings, onBatchModeToggled } = await import("../../src/batch/driver.js"));
}, 60_000);

let savedDocument;
beforeEach(() => {
  registerBatchModeSettings();
  game.settings._store.set(`${MODULE_ID}.${KEY}`, false);
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
});

afterEach(() => {
  game.settings._store.delete(`${MODULE_ID}.${KEY}`);
  globalThis.document = savedDocument;
});

/** What Foundry does on every client when the GM saves the switch. */
async function gmSavesSwitch(value) {
  await game.settings.set(MODULE_ID, KEY, value);
  game.settings._registry.get(`${MODULE_ID}.${KEY}`)?.onChange?.(value);
}

const tools = async (app) => (await app._prepareContext({})).tools;

describe("the toolbar follows the Batch Mode switch (issue #340)", () => {
  it("a GM's switch re-renders the open toolbar, pressed once on", async () => {
    const app = CompanionToolbarApp.open();
    app.rendered = true;
    expect((await tools(app)).find(t => t.key === "sfBatchMode")).toMatchObject({ kind: "toggle", pressed: false });
    const render = vi.spyOn(app, "render");
    await gmSavesSwitch(true);
    expect(render).toHaveBeenCalled();
    expect((await tools(app)).find(t => t.key === "sfBatchMode")).toMatchObject({ pressed: true });
    expect((await tools(app)).map(t => t.key)).toContain("sfRound");
  });

  it("switching it off takes the Round tool away again", async () => {
    game.settings._store.set(`${MODULE_ID}.${KEY}`, true);
    const app = CompanionToolbarApp.open();
    app.rendered = true;
    expect((await tools(app)).map(t => t.key)).toContain("sfRound");
    await gmSavesSwitch(false);
    expect((await tools(app)).map(t => t.key)).not.toContain("sfRound");
  });

  it("a player sees no switch, and Round only with a character in the round", async () => {
    const restore = asPlayer();
    try {
      game.settings._store.set(`${MODULE_ID}.${KEY}`, true);
      const app = CompanionToolbarApp.open();
      expect((await tools(app)).map(t => t.key)).not.toContain("sfBatchMode");
      expect((await tools(app)).map(t => t.key)).not.toContain("sfRound");
      game.settings._store.set(`${MODULE_ID}.batchMode.round`, {
        id: "r1", number: 1, phase: "collecting", entries: { [game.user.id]: { userId: game.user.id, status: "waiting" } },
      });
      expect((await tools(app)).map(t => t.key)).toContain("sfRound");
    } finally {
      game.settings._store.delete(`${MODULE_ID}.batchMode.round`);
      restore();
    }
  });

  it("renders the switch with aria-pressed, and the compact list labels it on or off", async () => {
    game.settings._store.set(`${MODULE_ID}.${KEY}`, true);
    const app = CompanionToolbarApp.open();
    const root = await app._renderHTML(await app._prepareContext({}), {});
    const btn = root.querySelector('[data-tool="sfBatchMode"]');
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.getAttribute("title")).toBe("Batch Mode: on");
  });

  it("a failing listener does not stop the others", async () => {
    const calls = [];
    const offBroken = onBatchModeToggled(() => { throw new Error("boom"); });
    const offKept   = onBatchModeToggled((enabled) => calls.push(enabled));
    await gmSavesSwitch(true);
    offBroken(); offKept();
    expect(calls).toEqual([true]);
    expect(getCapturedWarns().join("\n")).toMatch(/Batch Mode switch listener failed: boom/);
  });
});

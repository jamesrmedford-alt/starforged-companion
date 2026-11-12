/**
 * STARFORGED COMPANION
 * tests/unit/entityPanelPortraitToastAndFinalise.test.js
 *
 * Two Entities-panel fixes:
 *
 * ENTITY-PANEL-PORTRAIT-FAILED-TOAST — when the generator returned null after
 * its own specific warning (no OpenRouter key, a refused save, a spent
 * regeneration, another GM making the portrait), the panel added its generic
 * "Portrait generation failed … Check console" beside it. The generator now
 * reports that it told the user (`report.told`), and the panel's generic
 * toast is only for a failure nobody explained.
 *
 * FINALISE-PLAYER-KEY — a player's ✦ Finalise / ↻ Regenerate flavour ran the
 * Claude call on the player's own key and then lost the description at the
 * refused record write (and its portrait is a GM's to make). The buttons
 * render for GMs only, as the portrait buttons do (issue #321 U33), and a
 * player's click on one left from before bills nothing.
 */

/* global expectConsoleError, makeTestActor, asPlayer */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { StubElement } from "../helpers/cardDom.js";

vi.mock("../../src/art/openRouterImage.js", () => ({ generateOpenRouterImage: vi.fn() }));
vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));

import { generateOpenRouterImage } from "../../src/art/openRouterImage.js";
import { apiPost } from "../../src/api-proxy.js";

const MODULE_ID = "starforged-companion";
const CS_KEY    = `${MODULE_ID}.campaignState`;
const KEY       = `${MODULE_ID}.openRouterApiKey`;

const vance = () => ({
  _id: "conn-1", name: "Vance", role: "Pilot", pronouns: "he/him",
  portraitSourceDescription: "A weathered pilot in a patched flight suit",
});

let EntityPanelApp;
let savedDocument;
let warn;

beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  ({ EntityPanelApp } = await import("../../src/ui/entityPanel.js"));
});

beforeEach(() => {
  game.actors._reset();
  const npc = makeTestActor({ id: "npc-1", name: "Vance", flags: { [MODULE_ID]: { connection: vance(), entityType: "connection" } } });
  game.actors._set("npc-1", npc);
  game.settings._store.set(CS_KEY, {});
  generateOpenRouterImage.mockReset();
  apiPost.mockReset();
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  warn = vi.spyOn(ui.notifications, "warn");
});

afterEach(() => {
  globalThis.document = savedDocument;
  game.settings._store.delete(KEY);
  game.settings._store.delete(CS_KEY);
  game.actors._reset();
  warn.mockRestore();
});

const press = (action) => EntityPanelApp.DEFAULT_OPTIONS.actions[action]
  .call(new EntityPanelApp(), {}, { dataset: { journalId: "npc-1" } });
const warnings = () => warn.mock.calls.map(c => String(c[0]));

describe("ENTITY-PANEL-PORTRAIT-FAILED-TOAST — the generator's own reason stands alone", () => {
  it("a GM's Generate with no OpenRouter key shows the key warning only — no generic 'failed, check console' beside it", async () => {
    game.settings._store.delete(KEY);
    await press("generatePortrait");

    expect(generateOpenRouterImage).not.toHaveBeenCalled();
    expect(warnings().filter(w => /No OpenRouter API key/.test(w))).toHaveLength(1);
    expect(warnings().filter(w => /Portrait generation failed/.test(w))).toEqual([]);
  });

  it("a GM's Regenerate of a locked portrait shows the lock warning only", async () => {
    game.settings._store.set(KEY, "sk-or-v1-a-key");
    // The record names a locked portrait, which the Art Cache holds.
    game.actors.get("npc-1").flags[MODULE_ID].connection.portraitId = "art-locked";
    const entry = {
      name: "Art: connection conn-1 art-locked",
      flags: { [MODULE_ID]: { entityType: "artAsset", assetId: "art-locked" } },
      pages: { contents: [{ flags: { [MODULE_ID]: { artAsset: { _id: "art-locked", entityType: "connection", entityId: "conn-1", b64: "AAAA", locked: true } } } }] },
    };
    globalThis.game.journal.contents = [entry];
    try {
      await press("regeneratePortrait");
    } finally {
      delete globalThis.game.journal.contents;
    }
    expect(warnings().filter(w => /locked and cannot be regenerated/.test(w))).toHaveLength(1);
    expect(warnings().filter(w => /Portrait regeneration failed/.test(w))).toEqual([]);
  });

  it("control: a failure the generator did not explain still gets the panel's generic warning", async () => {
    game.settings._store.set(KEY, "sk-or-v1-a-key");
    generateOpenRouterImage.mockRejectedValue(new Error("OpenRouter API error 500: upstream"));
    expectConsoleError(/OpenRouter call failed/);
    await press("generatePortrait");

    expect(generateOpenRouterImage).toHaveBeenCalledTimes(1);
    expect(warnings().filter(w => /Portrait generation failed for Vance/.test(w))).toHaveLength(1);
  });
});

describe("FINALISE-PLAYER-KEY — Finalise / Regenerate flavour are a GM's to press", () => {
  async function detailActions(entity) {
    const root = await new EntityPanelApp()._renderHTML({ view: "detail", entity, isCurrentLocation: false });
    return root.querySelectorAll("[data-action]").map(el => el.dataset.action);
  }
  const entity = (data = vance()) => ({ journalId: "npc-1", name: "Vance", typeKey: "connection", data, art: null });

  it("a player sees neither button", async () => {
    const restore = asPlayer();
    try {
      expect(await detailActions(entity())).not.toContain("finalizeEntity");
      expect(await detailActions(entity({ ...vance(), finalizedAt: "2026-11-01T00:00:00.000Z" }))).not.toContain("regenerateFlavor");
    } finally {
      restore();
    }
  });

  it("control: a GM sees Finalise on an unfinalised entity and Regenerate flavour on a finalised one", async () => {
    expect(await detailActions(entity())).toContain("finalizeEntity");
    expect(await detailActions(entity({ ...vance(), finalizedAt: "2026-11-01T00:00:00.000Z" }))).toContain("regenerateFlavor");
  });

  it("a player's click on a button left from before calls no Claude, and says the GM finalises", async () => {
    const info = vi.spyOn(ui.notifications, "info");
    const restore = asPlayer();
    try {
      await press("finalizeEntity");
      await press("regenerateFlavor");
    } finally {
      restore();
    }
    expect(apiPost).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/finalised by the GM/));
    info.mockRestore();
  });
});

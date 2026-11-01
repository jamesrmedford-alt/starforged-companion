/**
 * STARFORGED COMPANION
 * tests/unit/portraitGmOnly.test.js
 *
 * Issue #321 U33 — a paid portrait is never generated and then thrown away.
 * The Entities panel is on every player's toolbar and showed "Generate
 * portrait" / "Regenerate portrait" to everyone. A player's click ran
 * generatePortrait on their own client with their own OpenRouter key: with a
 * key it paid for the image, then storeArtAsset's journal entry and its world
 * `campaignState` write were refused — the image was never linked or put on
 * the Actor. Portraits are generated on a GM's client only (the one client
 * that can store them; the OpenRouter key field is a GM's), so the panel
 * shows the buttons to GMs only and the generator refuses before billing
 * anything on any other client.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { StubElement } from "../helpers/cardDom.js";

vi.mock("../../src/art/openRouterImage.js", () => ({ generateOpenRouterImage: vi.fn() }));

import { generatePortrait, regeneratePortrait } from "../../src/art/generator.js";
import { generateOpenRouterImage } from "../../src/art/openRouterImage.js";

const MODULE_ID = "starforged-companion";
const CS_KEY    = `${MODULE_ID}.campaignState`;

const vance = () => ({
  _id: "conn-1", name: "Vance", role: "Pilot", pronouns: "he/him",
  portraitSourceDescription: "A weathered pilot in a patched flight suit",
});

let npc;
beforeEach(() => {
  game.actors._reset();
  npc = makeTestActor({ id: "npc-1", name: "Vance", flags: { [MODULE_ID]: { connection: vance(), entityType: "connection" } } });
  game.actors._set("npc-1", npc);
  game.settings._store.set(`${MODULE_ID}.openRouterApiKey`, "sk-or-v1-a-key");
  game.settings._store.set(CS_KEY, {});
  generateOpenRouterImage.mockReset();
  generateOpenRouterImage.mockResolvedValue("A".repeat(400));   // a "generated" image
});

afterEach(() => {
  game.settings._store.delete(`${MODULE_ID}.openRouterApiKey`);
  game.settings._store.delete(CS_KEY);
  game.actors._reset();
});

describe("the portrait generator runs on a GM's client only (issue #321 U33)", () => {
  it("a player's Generate pays for nothing: no image is requested, nothing is written", async () => {
    const restore = asPlayer();
    try {
      await expect(generatePortrait("npc-1", "connection", vance(), {})).resolves.toBeNull();
    } finally {
      restore();
    }
    expect(generateOpenRouterImage).not.toHaveBeenCalled();
    expect(npc.getFlag(MODULE_ID, "connection").portraitId).toBeUndefined();
    expect(game.settings._store.get(CS_KEY)).toEqual({});
  });

  it("a player's Regenerate pays for nothing either", async () => {
    const restore = asPlayer();
    try {
      await expect(regeneratePortrait("npc-1", "connection", { ...vance(), portraitId: "art-old" }, {})).resolves.toBeNull();
    } finally {
      restore();
    }
    expect(generateOpenRouterImage).not.toHaveBeenCalled();
  });

  it("control: the GM's Generate requests the image once, stores it and links it to the NPC", async () => {
    const asset = await generatePortrait("npc-1", "connection", vance(), {});
    expect(generateOpenRouterImage).toHaveBeenCalledTimes(1);
    expect(asset?._id).toBeTruthy();
    expect(npc.getFlag(MODULE_ID, "connection").portraitId).toBe(asset._id);
    expect(Object.keys(game.settings._store.get(CS_KEY).artAssetIds ?? {})).toEqual([asset._id]);
  });
});

describe("the Entities panel shows Generate / Regenerate portrait to GMs only (issue #321 U33)", () => {
  let EntityPanelApp;
  let savedDocument;

  beforeAll(async () => {
    foundry.applications.api.DialogV2 = { confirm: async () => true };
    ({ EntityPanelApp } = await import("../../src/ui/entityPanel.js"));
  });
  beforeEach(() => {
    savedDocument = globalThis.document;
    globalThis.document = { createElement: (tag) => new StubElement(tag) };
  });
  afterEach(() => { globalThis.document = savedDocument; });

  const entity = (art = null) => ({ journalId: "npc-1", name: "Vance", typeKey: "connection", data: vance(), art });
  const portraitArt = { dataUri: "data:image/png;base64,AAAA", locked: false, regenerationUsed: false };

  async function detailActions(e) {
    const root = await new EntityPanelApp()._renderHTML({ view: "detail", entity: e, isCurrentLocation: false });
    return root.querySelectorAll("[data-action]").map(el => el.dataset.action);
  }

  it("a player sees neither button", async () => {
    const restore = asPlayer();
    try {
      expect(await detailActions(entity())).not.toContain("generatePortrait");
      expect(await detailActions(entity(portraitArt))).not.toContain("regeneratePortrait");
    } finally {
      restore();
    }
  });

  it("control: a GM sees Generate on an entity with no portrait, and Regenerate on one with an unlocked portrait", async () => {
    expect(await detailActions(entity())).toContain("generatePortrait");
    expect(await detailActions(entity(portraitArt))).toContain("regeneratePortrait");
  });

  it("a player's click on a button left from before generates nothing and says the GM generates portraits", async () => {
    const info = vi.spyOn(ui.notifications, "info");
    const restore = asPlayer();
    try {
      const app = new EntityPanelApp();
      await EntityPanelApp.DEFAULT_OPTIONS.actions.generatePortrait.call(app, {}, { dataset: { journalId: "npc-1" } });
      await EntityPanelApp.DEFAULT_OPTIONS.actions.regeneratePortrait.call(app, {}, { dataset: { journalId: "npc-1" } });
    } finally {
      restore();
    }
    expect(generateOpenRouterImage).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/portraits are generated by the GM/));
  });
});

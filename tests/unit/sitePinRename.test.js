/**
 * STARFORGED COMPANION
 * tests/unit/sitePinRename.test.js
 *
 * Issue #331 X46 (SITE-PIN-RENAME-STALE). A discovered site's Actor renamed
 * after its discovery: handleSettlementPinRename skipped site pins, so the
 * map kept the generated name while the narrator's Charted sites, the cards
 * and `!clear-site` used the new one — issue #325 W75's two-names complaint,
 * made again after the reveal. A discovered site's pin now follows the
 * rename; an undiscovered one keeps "Unexplored Site".
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { handleSettlementPinRename } from "../../src/sectors/sectorSceneHooks.js";

const MODULE_ID = "starforged-companion";

function pin(id, text, flags) {
  return {
    id, text,
    flags: { [MODULE_ID]: { sectorNote: true, ...flags } },
    update: vi.fn(async function (changes) { Object.assign(this, changes); }),
  };
}

function withScene(notes) {
  const scene = { flags: { [MODULE_ID]: { sectorScene: true, sectorId: "sec-1" } }, notes: { contents: notes } };
  global.game.scenes = { contents: [scene] };
  return scene;
}
const prevScenes = global.game.scenes;
afterEach(() => { global.game.scenes = prevScenes; });

const siteActor = { id: "actor-site", type: "location", name: "Hollow Bride" };

describe("X46 — a discovered site's pin follows its Actor's rename", () => {
  it("renames the discovered site's pin to the Actor's new name", async () => {
    const site = pin("site", "Derelict Starship", { siteNote: true, siteId: "s1", siteType: "derelict", actorId: "actor-site", discovered: true });
    withScene([site]);

    await handleSettlementPinRename(siteActor, { name: "Hollow Bride" });

    // "Hollow Bride", the name the narrator and the cards use (it kept "Derelict Starship").
    expect(site.text).toBe("Hollow Bride");
  });

  it("another Actor's discovered site pin is left alone", async () => {
    const site = pin("site", "Derelict Starship", { siteNote: true, siteId: "s1", siteType: "derelict", actorId: "actor-other", discovered: true });
    withScene([site]);
    await handleSettlementPinRename(siteActor, { name: "Hollow Bride" });
    expect(site.update).not.toHaveBeenCalled();
  });

  it("control: an undiscovered site's pin keeps 'Unexplored Site' — the rename must not leak its name", async () => {
    const site = pin("site", "Unexplored Site", { siteNote: true, siteId: "s1", siteType: "derelict", actorId: "actor-site", discovered: false });
    withScene([site]);
    await handleSettlementPinRename(siteActor, { name: "Hollow Bride" });
    expect(site.text).toBe("Unexplored Site");
    expect(site.update).not.toHaveBeenCalled();
  });

  it("control: a settlement pin follows its Actor's rename (issue #321 U52)", async () => {
    const settlement = pin("pin", "Bleakhold", { settlementId: "gen-1", actorId: "actor-bleak" });
    withScene([settlement]);
    await handleSettlementPinRename({ id: "actor-bleak", type: "location", name: "Bleak Hold Station" }, { name: "Bleak Hold Station" });
    expect(settlement.text).toBe("Bleak Hold Station");
  });
});

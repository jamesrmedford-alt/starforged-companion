/**
 * PROBE — SEC-05 SITE-PIN-RENAME-STALE
 * (src/sectors/sectorSceneHooks.js handleSettlementPinRename lines 92–112:
 *  `if (!flags?.settlementId …) continue;` and
 *  `if (flags.planetNote || flags.stellarNote || flags.siteNote) continue;`)
 *
 * What the user does: a site has been discovered (its pin on the sector map
 * shows its generated name — "Derelict Starship"); the GM then renames the
 * site's location Actor on its sheet ("Hollow Bride").
 *
 * What happens: the rename hook renames settlement pins only. The site's pin
 * keeps "Derelict Starship" while the narrator's Charted sites block, the
 * ◈ Site Discovered / Cleared cards and `!clear-site` all use "Hollow Bride"
 * (siteDisplayName — issue #326 W75: "a site is named by its location
 * Actor"). W75's two-names complaint ("named one way on the map and another
 * in the narrator's Charted sites") is back for any rename after discovery;
 * before discovery the pin rightly keeps "Unexplored Site".
 *
 * What should happen: a DISCOVERED site's pin follows its Actor's name, as a
 * settlement's pin does (issue #321 U52); an undiscovered site's pin keeps
 * "Unexplored Site" (its name must not leak — site-flow §5).
 *
 * Controls (pass today): an undiscovered site's pin stays "Unexplored Site"
 * after its Actor is renamed; a settlement pin follows its rename.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sectors/sitePinRenameStale.probe.js
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { handleSettlementPinRename } from "../../../src/sectors/sectorSceneHooks.js";

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

describe("PROBE SEC-05 — a discovered site's pin follows its Actor's rename", () => {
  it("renames the discovered site's pin to the Actor's new name", async () => {
    const site = pin("site", "Derelict Starship", { siteNote: true, siteId: "s1", siteType: "derelict", actorId: "actor-site", discovered: true });
    withScene([site]);

    await handleSettlementPinRename(siteActor, { name: "Hollow Bride" });

    // Expected: "Hollow Bride" (the name the narrator and the cards use). Today: "Derelict Starship".
    expect(site.text).toBe("Hollow Bride");
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

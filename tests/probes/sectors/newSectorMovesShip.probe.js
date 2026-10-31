/**
 * PROBE — NEW-SECTOR-MOVES-SHIP
 *
 * Creating ANY sector auto-places a command-vehicle token on the new scene
 * (createSectorScene → placeCommandVehicleTokenIfPresent). When the ship
 * already has a position in another sector, the anchor
 * (position.nearestSettlementId) is not on the new map, so the token lands at
 * the new scene's centre — and Foundry's createToken hook
 * (handleCommandVehicleTokenPlacement, canonical GM) records the ship's
 * position from that token: "near <whatever new-sector pin is within 3 cells
 * of the centre>" or deep space IN THE NEW SECTOR. Prepping the next sector
 * silently relocates the crew; `!sector <old>` switches back the active sector
 * but not the ship.
 *
 * Fixtures from the real producers: generateSector, createShip/updateShip,
 * createSectorScene's Token payload; the hook is invoked as Foundry would.
 * Asserts the CORRECT behaviour; fails today.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));

import { generateSector } from "../../../src/sectors/sectorGenerator.js";
import { createSectorScene } from "../../../src/sectors/sceneBuilder.js";
import { handleCommandVehicleTokenPlacement } from "../../../src/sectors/sectorSceneHooks.js";
import { createShip, updateShip, getShip } from "../../../src/entities/ship.js";
import { _resetFolderCache } from "../../../src/entities/folder.js";

const MODULE = "starforged-companion";

describe("PROBE NEW-SECTOR-MOVES-SHIP", () => {
  beforeEach(() => {
    game.actors._reset();
    game.folders._reset();
    _resetFolderCache();
    game.settings._store.clear();
  });

  it("creating a second sector leaves the ship where it is", async () => {
    const cs = { sectors: [{ id: "sector-A", name: "Old Reach" }], activeSectorId: "sector-A", shipIds: [], settlementIds: [] };
    game.settings._store.set(`${MODULE}.campaignState`, cs);
    await createShip({ name: "Wayfarer", isCommandVehicle: true }, cs);
    const shipId = cs.shipIds[0];
    const docked = { sectorId: "sector-A", nearestPlanetId: null, nearestSettlementId: "settlement-in-A", freeText: "", updatedAt: "t0", updatedBy: "set_a_course" };
    await updateShip(shipId, { position: docked });

    // The GM preps the next sector. Its scene build places a CV token.
    const sectorB = generateSector("terminus");
    const scene = {
      id: "scene-B", flags: {}, grid: { size: 100 }, notes: [], tokens: [],
      dimensions: { sceneX: 200, sceneY: 200, sceneWidth: 1792, sceneHeight: 1024 },
      update: vi.fn(async () => scene),
      createEmbeddedDocuments: vi.fn(async (type, data) => {
        const docs = data.map((d, i) => ({ id: `${type}-${scene[type === "Note" ? "notes" : "tokens"]?.length ?? 0}-${i}`, ...d, parent: scene }));
        if (type === "Note")  scene.notes.push(...docs);
        if (type === "Token") scene.tokens.push(...docs);
        return docs;
      }),
    };
    global.Scene = { create: vi.fn(async (data) => { scene.flags = data.flags; return scene; }) };
    await createSectorScene(sectorB, null, {});
    expect(scene.tokens).toHaveLength(1);

    // Foundry fires createToken on every client; the canonical GM records position.
    await handleCommandVehicleTokenPlacement(scene.tokens[0], { render: false }, "test-user-gm");

    const pos = getShip(shipId).position;
    expect.soft(pos.sectorId).toBe("sector-A");                   // today: sectorB.id
    expect.soft(pos.nearestSettlementId).toBe("settlement-in-A"); // today: a sector-B pin near the scene centre, or null
  });
});

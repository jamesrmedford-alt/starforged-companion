/**
 * PROBE — OFF-PIN-TOKEN-READS-DOCKED
 *
 * decisions.md → "Ship position: a sector-map token is authoritative when
 * present": an OFF-pin token placement / reposition writes the position from
 * the token's coordinates — "nearest settlement pin within 3× snap radius →
 * 'near <settlement>', else 'deep space'" — with no move mechanics; only an
 * ON-pin drop is a Set a Course (a roll) that arrives.
 *
 * computeTokenPositionRecord (sectorSceneHooks.js) stamps that merely-near
 * record `updatedBy: "scene_token"` — the same tag the on-pin Set a Course
 * arrival carries — and formatShipPositionLine renders every scene_token
 * record as "docked at <settlement>". So a ship parked 2 cells off a pin (or
 * auto-placed at the scene centre by the wizard / quickstart) is told to the
 * narrator as docked there.
 *
 * Fixtures from the real producers (createSettlement, createSectorScene's Note
 * payloads). Asserts the CORRECT behaviour; fails today.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { createSettlement } from "../../../src/entities/settlement.js";
import { createSectorScene } from "../../../src/sectors/sceneBuilder.js";
import { computeTokenPositionRecord } from "../../../src/sectors/sectorSceneHooks.js";
import { formatShipPositionLine } from "../../../src/factContinuity/shipPosition.js";
import { _resetFolderCache } from "../../../src/entities/folder.js";

const MODULE = "starforged-companion";

describe("PROBE OFF-PIN-TOKEN-READS-DOCKED", () => {
  beforeEach(() => {
    game.actors._reset();
    game.folders._reset();
    _resetFolderCache();
    game.settings._store.clear();
  });

  it("a token parked two cells off a settlement pin reads 'near', not 'docked at'", async () => {
    const cs = { sectors: [{ id: "sec-1", name: "Test Sector" }], activeSectorId: "sec-1", settlementIds: [] };
    game.settings._store.set(`${MODULE}.campaignState`, cs);
    await createSettlement({ name: "Bleakhold", location: "Orbital", sectorId: "sec-1" }, cs, { persist: false });
    const actor = game.actors.get(cs.settlementIds[0]);

    const notes = [];
    const scene = {
      id: "scene-1", flags: {}, grid: { size: 100 },
      dimensions: { sceneX: 200, sceneY: 200, sceneWidth: 1792, sceneHeight: 1024 },
      update: vi.fn(async () => scene),
      createEmbeddedDocuments: vi.fn(async (type, data) => {
        if (type === "Note") for (const d of data) notes.push({ id: `note-${notes.length}`, ...d });
        return data;
      }),
    };
    global.Scene = { create: vi.fn(async (data) => { scene.flags = data.flags; return scene; }) };
    await createSectorScene({
      id: "sec-1", name: "Test Sector",
      settlements: [{ id: "gen-A", name: "Bleakhold", locationType: "orbital", planet: null, stellar: null }],
      mapData: { settlements: [{ id: "gen-A", name: "Bleakhold", type: "orbital", gridX: 3, gridY: 2 }], passages: [], discoveries: [] },
    }, null, { "gen-A": actor });
    scene.notes = notes;
    const pin = notes.find(n => n.flags[MODULE].settlementId === "gen-A" && !n.flags[MODULE].planetNote);

    // GM drags the ship token two cells east of the pin — outside the 1-cell
    // snap radius (no Set a Course), inside the 3-cell "near" radius.
    const record = computeTokenPositionRecord(scene, pin.x + 200, pin.y);
    expect(record.nearestSettlementId).toBe(actor.id);

    const line = formatShipPositionLine(record, cs, "Wayfarer");
    expect(line).toContain("near Bleakhold");        // today: "SHIP POSITION: Wayfarer docked at Bleakhold (Test Sector)"
    expect(line).not.toContain("docked at");
  });
});

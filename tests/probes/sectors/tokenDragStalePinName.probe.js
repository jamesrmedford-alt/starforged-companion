/**
 * PROBE — TOKEN-DRAG-STALE-PIN-NAME
 *
 * A sector-scene settlement pin's label (Note `text`) is written once by
 * createSectorScene and never follows a rename of the settlement Actor (the
 * Actor name is authoritative; the rename sync updates the record's `name`).
 * Dropping the command-vehicle token on that pin dispatches Set a Course with
 * `forcedMoveTarget: settlementNote.text` (sectorSceneHooks.js
 * dispatchSetACourseFromTokenDrag), and the pipeline resolves position and
 * current location BY THAT NAME (maybeUpdateShipPositionFromName →
 * inferShipPosition; resolveCurrentLocationName). The pin's stable link
 * (flags.actorId) is never sent; the payload's destSettlement / destNoteId /
 * destName have no reader.
 *
 * Fixtures come from the real producers: createSettlement, createSectorScene
 * (the Note payloads), updateSettlement (the rename). Asserts the CORRECT
 * behaviour; fails today.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { createSettlement, updateSettlement } from "../../../src/entities/settlement.js";
import { createSectorScene } from "../../../src/sectors/sceneBuilder.js";
import { handleCommandVehicleTokenDrag } from "../../../src/sectors/sectorSceneHooks.js";
import { inferShipPosition } from "../../../src/factContinuity/shipPosition.js";
import { _resetFolderCache } from "../../../src/entities/folder.js";

const MODULE = "starforged-companion";

describe("PROBE TOKEN-DRAG-STALE-PIN-NAME", () => {
  beforeEach(() => {
    game.actors._reset();
    game.folders._reset();
    _resetFolderCache();
    game.settings._store.clear();
    ChatMessage._reset();
  });

  it("dropping the ship on a renamed settlement's pin sets a course for the settlement it links", async () => {
    const cs = { sectors: [{ id: "sec-1", name: "Test Sector" }], activeSectorId: "sec-1", settlementIds: [] };
    game.settings._store.set(`${MODULE}.campaignState`, cs);
    await createSettlement({ name: "Bleakhold", location: "Orbital", sectorId: "sec-1" }, cs, { persist: false });
    const actorId = cs.settlementIds[0];
    const actor   = game.actors.get(actorId);

    // The real scene builder writes the pins.
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
    const sector = {
      id: "sec-1", name: "Test Sector",
      settlements: [{ id: "gen-A", name: "Bleakhold", locationType: "orbital", planet: null, stellar: null }],
      mapData: { settlements: [{ id: "gen-A", name: "Bleakhold", type: "orbital", gridX: 3, gridY: 2 }], passages: [], discoveries: [] },
    };
    await createSectorScene(sector, null, { "gen-A": actor });
    scene.notes = notes;

    // The GM renames the settlement (Actor name + record name, as the sheet + rename sync do).
    await updateSettlement(actorId, { name: "Bleak Hold Station" });
    expect(game.actors.get(actorId).name).toBe("Bleak Hold Station");

    // Drag the command-vehicle token onto the settlement's pin.
    const pin = notes.find(n => n.flags[MODULE].settlementId === "gen-A" && !n.flags[MODULE].planetNote && !n.flags[MODULE].stellarNote);
    const tokenDoc = { id: "tok-1", x: 0, y: 0, flags: { [MODULE]: { commandVehicle: true } }, parent: scene };
    expect(handleCommandVehicleTokenDrag(tokenDoc, { x: pin.x, y: pin.y }, {})).toBe(false);
    await new Promise(r => setTimeout(r, 10));

    const msg = ChatMessage._created.at(-1);
    // CORRECT: the course is set for the settlement the pin links, by its current name…
    expect.soft(msg.flags[MODULE].forcedMoveTarget).toBe("Bleak Hold Station");   // today: "Bleakhold"
    // …so the pipeline's name-based arrival resolves the settlement.
    const pos = inferShipPosition(msg.flags[MODULE].forcedMoveTarget, game.settings.get(MODULE, "campaignState"));
    expect.soft(pos.nearestSettlementId).toBe(actorId);                            // today: null (free text "Bleakhold")
  });
});

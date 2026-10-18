/**
 * STARFORGED COMPANION
 * tests/unit/shipBatteredCanonical.test.js
 *
 * Review findings #7 / #13 — battered is in practice set only on the native
 * starship field `system.debility.battered` (the foundry-ironsworn starship
 * sheet's Battered toggle; sufferDialog's "!battered" requirement reads it).
 * The module ship flag's `battered` is a write-through mirror nothing sets
 * true, so `!repair` (reading the flag) said "was not battered — nothing to
 * clear" for a sheet-battered vehicle and raised its integrity anyway.
 * The native field is now canonical for reads (isShipBattered); clearing
 * writes both stores (clearBattered → updateShip).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { applyRepairSpends } from "../../src/moves/repair.js";
import { getShip, isShipBattered, repairIntegrity, clearBattered } from "../../src/entities/ship.js";

const MODULE_ID = "starforged-companion";
const GM_CTX    = { requesterId: "gm-1", requester: { id: "gm-1", isGM: true }, requesterIsGM: true, local: true };

/** A command vehicle marked battered on the SHEET only (flag mirror false). */
function installSheetBatteredShip({ integrity = 2, sheetBattered = true, flagBattered = false } = {}) {
  const ship = makeTestActor({
    id: "ship-1", type: "starship", name: "Wayfarer",
    system: { debility: { battered: sheetBattered } },
    flags: {
      [MODULE_ID]: {
        entityType: "ship",
        ship: { _id: "ship-guid", name: "Wayfarer", integrity, integrityMax: 5, battered: flagBattered, isCommandVehicle: true },
      },
    },
  });
  game.actors._set("ship-1", ship);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: ["ship-1"], characterIds: [] });
  return ship;
}

function payload(spends) {
  return {
    situation: "facility", outcome: "strong", earned: 5, extra: 0, actorId: null,
    spends: { integrity: 0, clear_battered: 0, companion_health: 0, fix_module: 0, other_device: 0, other_device_cx: 0, ...spends },
  };
}

function lastCard() { return ChatMessage._created.at(-1)?.content ?? ""; }

beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
  ChatMessage._reset();
});

describe("isShipBattered", () => {
  it("reads the native starship field — sheet-battered is battered even when the flag says no", () => {
    const ship = installSheetBatteredShip({ sheetBattered: true, flagBattered: false });
    expect(isShipBattered("ship-1")).toBe(true);
    expect(isShipBattered(ship)).toBe(true);
  });

  it("the native field wins over a stale flag (un-ticked on the sheet)", () => {
    installSheetBatteredShip({ sheetBattered: false, flagBattered: true });
    expect(isShipBattered("ship-1")).toBe(false);
  });

  it("falls back to the flag only when the host has no native debility field", () => {
    const ship = installSheetBatteredShip({ flagBattered: true });
    delete ship.system.debility;   // makeTestActor seeds the starship shape — strip it
    expect(isShipBattered("ship-1")).toBe(true);
  });

  it("is false for an unknown id or no actor", () => {
    expect(isShipBattered("nope")).toBe(false);
    expect(isShipBattered(null)).toBe(false);
  });
});

describe("repairIntegrity / clearBattered on a sheet-battered ship", () => {
  it("repairIntegrity refuses while the sheet says battered", async () => {
    expectConsoleError(/battered/);
    installSheetBatteredShip({ integrity: 1 });
    const after = await repairIntegrity("ship-1", 2);
    expect(after.integrity).toBe(1);
    expect(getShip("ship-1").integrity).toBe(1);
  });

  it("clearBattered clears the native field and the flag mirror, then integrity can rise", async () => {
    const ship = installSheetBatteredShip({ integrity: 1 });
    await clearBattered("ship-1");
    expect(ship.system.debility.battered).toBe(false);
    expect(getShip("ship-1").battered).toBe(false);
    const after = await repairIntegrity("ship-1", 2);
    expect(after.integrity).toBe(3);
  });
});

describe("!repair (applyRepairSpends) on a sheet-battered command vehicle", () => {
  it("clear battered works and the integrity spend in the same repair then lands", async () => {
    const ship = installSheetBatteredShip({ integrity: 1 });
    await applyRepairSpends(payload({ clear_battered: 1, integrity: 2 }), GM_CTX);
    expect(ship.system.debility.battered).toBe(false);
    expect(getShip("ship-1").battered).toBe(false);
    expect(getShip("ship-1").integrity).toBe(3);
    expect(lastCard()).toMatch(/Cleared <strong>battered<\/strong>/);
    expect(lastCard()).not.toMatch(/was not battered/);
  });

  it("refuses integrity until battered is cleared", async () => {
    const ship = installSheetBatteredShip({ integrity: 1 });
    await applyRepairSpends(payload({ integrity: 2 }), GM_CTX);
    expect(getShip("ship-1").integrity).toBe(1);
    expect(ship.system.debility.battered).toBe(true);
    expect(lastCard()).toMatch(/battered — integrity not raised/);
  });

  it("a vehicle un-ticked on the sheet is not battered, whatever the flag mirror says", async () => {
    installSheetBatteredShip({ integrity: 1, sheetBattered: false, flagBattered: true });
    await applyRepairSpends(payload({ integrity: 2 }), GM_CTX);
    expect(getShip("ship-1").integrity).toBe(3);
  });
});

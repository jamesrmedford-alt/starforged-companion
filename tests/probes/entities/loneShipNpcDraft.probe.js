/**
 * PROBE — LONE-SHIP-NPC-DRAFT
 *
 * getCommandVehicle / getCommandVehicleActorId (src/entities/ship.js) fall
 * back to "a single tracked starship is the command vehicle" when no record
 * is flagged isCommandVehicle (a sidebar-made ship without the STARSHIP
 * asset). Every ship the GM confirms from a "New Entities Detected" draft —
 * the pirate cutter the narrator just named — goes through the same
 * createShip into the same campaignState.shipIds, with isCommandVehicle:false
 * like the PC's own ship. The moment one is confirmed the fallback sees two
 * ships and resolves NO command vehicle: the Withstand Damage roll itself
 * (statEnrichment resolveStatValue "integrity" → +0 instead of +integrity),
 * its integrity choices and asset riders (changeIntegrity → "no-vehicle"),
 * `!repair`, `!at` / Set a Course
 * position writes and the narrator's SHIP POSITION line all lose the
 * players' ship. (With no PC ship tracked, the NPC ship would become "your
 * ship" instead.)
 *
 * Correct behaviour (asserted): confirming a detected NPC ship leaves the
 * players' ship as the command vehicle.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createShip, getCommandVehicleActorId, changeIntegrity, ShipSchema } from '../../../src/entities/ship.js';
import { resolveStatValue } from '../../../src/moves/statEnrichment.js';

const MODULE = 'starforged-companion';

beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset?.();
  global.game.user = { isGM: true, id: 'test-user-gm' };
  const wayward = global.makeTestActor({
    id: 'ship-wayward', type: 'starship', name: 'Wayward', ownership: { 'pl-1': 3 },
    flags: { [MODULE]: { entityType: 'ship', entityId: 'rec-wayward',
      ship: { ...ShipSchema, _id: 'rec-wayward', name: 'Wayward', integrity: 5 } } },
  });
  global.game.actors._set(wayward.id, wayward);
  global.game.settings._store.set(`${MODULE}.campaignState`, { shipIds: ['ship-wayward'] });
});

describe('PROBE LONE-SHIP-NPC-DRAFT', () => {
  it("confirming a detected NPC ship keeps the players' ship as the command vehicle", async () => {
    const cs = global.game.settings.get(MODULE, 'campaignState');
    expect(getCommandVehicleActorId(cs)).toBe('ship-wayward');            // lone-ship fallback

    // The draft-confirm creator for a detected "ship" (confirmDraft → ENTITY_CREATORS.ship).
    await createShip({ name: 'Black Fang', description: 'A pirate cutter running dark.', type: 'Corvette' }, cs);

    const after = global.game.settings.get(MODULE, 'campaignState');
    const vehicle = getCommandVehicleActorId(after);
    const damage  = await changeIntegrity(vehicle, -1);                    // a Withstand Damage choice
    silenceConsoleErrors();                                                // the +0 path warns by design
    const withstandAdds = resolveStatValue(null, 'integrity', after);     // Withstand Damage rolls +integrity

    expect({ vehicle, damage: damage.reason ?? 'ok', withstandAdds })
      .toEqual({ vehicle: 'ship-wayward', damage: 'ok', withstandAdds: 5 });
  });
});

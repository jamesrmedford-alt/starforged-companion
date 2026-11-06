// STARFORGED COMPANION
// tests/unit/explorationFlowBareAt.test.js
//
// docs/flows/exploration-flow.md §2 "Location tracking" said "`!at <name>`
// writes BOTH campaignState.currentLocationId/Type and the ship position
// (bare `!at` clears both)". handleAtCommand's bare branch clears the current
// location only and writes no ship position — the deliberate behaviour
// tests/unit/entityPanelCurrentLocation.test.js pins and the help's `!at` row
// states ("Clear the current location"). The flow docs are write-through
// mirrors of the code (CLAUDE.md startup step 6; rules/reachability.md), so
// the map was the stale side (issue #342 Z74, FLOW-DOC-BARE-AT-CLEARS-SHIP).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const DOC = fileURLToPath(new URL('../../docs/flows/exploration-flow.md', import.meta.url));

let table;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

describe('the exploration flow map describes what a bare `!at` does (issue #342 Z74)', () => {
  it('the map does not claim a bare `!at` clears the ship position', () => {
    const text = readFileSync(DOC, 'utf8').replace(/\s+/g, ' ');
    expect(text).not.toMatch(/bare `!at` clears both/);
    expect(text).toMatch(/a bare `!at` clears the current location only; the ship stays where it is/);
  });

  it('control: a bare `!at` clears the current location and leaves the ship where it is', async () => {
    const docked = {
      sectorId: 'sec-1', nearestSettlementId: 'actor-bleak', nearestPlanetId: null, nearestLocationId: null,
      freeText: '', updatedAt: 1, updatedBy: 'at_command', narrationId: null, previous: null,
    };
    await table.reset({ world: { settings: { campaignState: {
      ...CampaignStateSchema, sessionActive: true,
      sectors: [{ id: 'sec-1', name: 'Outlands Mark' }], activeSectorId: 'sec-1',
      settlementIds: ['actor-bleak'], shipIds: ['ship-cv'],
      currentLocationId: 'actor-bleak', currentLocationType: 'settlement',
    } } } });
    const ship = table.addActor({
      id: 'ship-cv', type: 'starship', name: 'Wayfinder',
      flags: { [MODULE_ID]: { entityType: 'ship', ship: { _id: 'rec-ship', name: 'Wayfinder', isCommandVehicle: true, position: docked } } },
    });
    table.addActor({
      id: 'actor-bleak', type: 'location', name: 'Bleakhold',
      flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: 'Bleakhold', sectorId: 'sec-1' } } },
    });

    await table.client('gm-1').chat('!at');
    await table.settle();

    expect(table.world.campaignState().currentLocationId).toBeNull();
    expect(ship.flags[MODULE_ID].ship.position).toMatchObject({ nearestSettlementId: 'actor-bleak' });
  }, 30_000);
});

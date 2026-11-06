/**
 * SECT-4 — the exploration flow map says a bare `!at` clears the ship's
 * position too; it never has.
 *
 * docs/flows/exploration-flow.md §2 "Location tracking": "`!at <name>` writes
 * BOTH `campaignState.currentLocationId/Type` and the ship position (bare
 * `!at` clears both)". handleAtCommand's bare branch clears the current
 * location only and writes no ship position — the deliberate behaviour
 * tests/unit/entityPanelCurrentLocation.test.js pins ("clearing the current
 * location … leaves the ship where it is, like a bare `!at`") and the help's
 * `!at` row states ("Clear the current location"). The flow docs are
 * write-through mirrors of the code (CLAUDE.md startup step 6;
 * rules/reachability.md), so the map is the stale side.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const DOC = fileURLToPath(new URL('../../../docs/flows/exploration-flow.md', import.meta.url));

let table;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

describe('SECT-4: the exploration flow map describes what a bare `!at` does', () => {
  it('the map does not claim a bare `!at` clears the ship position', () => {
    const text = readFileSync(DOC, 'utf8').replace(/\s+/g, ' ');
    expect(text).not.toMatch(/bare `!at` clears both/);   // actual: "(bare `!at` clears both)"
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

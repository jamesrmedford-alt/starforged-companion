/**
 * PROBE — COMMAND-VEHICLE-READY-SCAN-DEAD
 *
 * registerCommandVehicleHook() (src/index.js) is called from inside the
 * module's own Hooks.once("ready") handler, and it registers a SECOND
 * Hooks.once("ready") handler — the "reconcile ships created before
 * asset-detection shipped" scan. Foundry's Hooks.callAll iterates a copy of
 * the handler list (Array.from), so a handler added while "ready" is being
 * dispatched is never called, and "ready" never fires again. The harness
 * models the same copy-then-iterate dispatch (multiClient.js SimHooks.call).
 *
 * Correct behaviour (asserted): after world load, a tracked starship that
 * carries the Command Vehicle asset but whose record says
 * isCommandVehicle:false is flagged by the ready scan.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { ShipSchema } from '../../../src/entities/ship.js';

const MODULE_ID = 'starforged-companion';
let table;
afterEach(async () => { await table?.teardown(); table = null; });

function legacyShip(id, name, { cvAsset }) {
  return {
    id, name, type: 'starship', hasPlayerOwner: false,
    flags: { [MODULE_ID]: {
      entityType: 'ship', entityId: `rec-${id}`,
      ship: { ...ShipSchema, _id: `rec-${id}`, name, isCommandVehicle: false },
    } },
    items: { contents: cvAsset
      ? [{ id: `cv-${id}`, type: 'asset', name: 'Starship', system: { category: 'Command Vehicle' } }]
      : [] },
  };
}

describe('PROBE COMMAND-VEHICLE-READY-SCAN-DEAD', () => {
  it('the ready scan flags a legacy command vehicle at world load', async () => {
    table = await simulateTable({
      users: [USERS.GM],
      boot: false,
      world: { settings: { campaignState: { ...CampaignStateSchema, shipIds: ['ship-a', 'ship-b'] } } },
    });
    table.addActor(legacyShip('ship-a', 'Kobayashi', { cvAsset: true }));
    table.addActor(legacyShip('ship-b', 'Salvage Tug', { cvAsset: false }));

    // Sanity: with two tracked ships and neither flagged, no command vehicle resolves.
    const shipMod = await table.client('gm-1').import('../../src/entities/ship.js');
    expect(table.client('gm-1').run(() =>
      shipMod.getCommandVehicleActorId({ shipIds: ['ship-a', 'ship-b'] }))).toBeNull();

    await table.client('gm-1').boot();
    await table.settle();

    // Evidence of the cause: the scan's Hooks.once("ready") handler was
    // registered during the ready dispatch and is still waiting — never run.
    expect(table.client('gm-1').hooks.count('ready')).toBe(0);

    // Expected: the one-time ready reconcile set the flag from the asset.
    expect(table.actors.get('ship-a').flags[MODULE_ID].ship.isCommandVehicle).toBe(true);
    expect(table.client('gm-1').run(() =>
      shipMod.getCommandVehicleActorId(table.world.campaignState()))).toBe('ship-a');
  }, 30_000);

  it('control: the reconcile itself works on this harness when it is called', async () => {
    table = await simulateTable({
      users: [USERS.GM],
      boot: false,
      world: { settings: { campaignState: { ...CampaignStateSchema, shipIds: ['ship-a', 'ship-b'] } } },
    });
    table.addActor(legacyShip('ship-a', 'Kobayashi', { cvAsset: true }));
    await table.client('gm-1').boot();
    const gm = table.client('gm-1');
    const shipMod = await gm.import('../../src/entities/ship.js');
    await gm.run(() => shipMod.syncCommandVehicleFlag(table.actors.get('ship-a'), table.world.campaignState()));
    await table.settle();
    expect(table.actors.get('ship-a').flags[MODULE_ID].ship.isCommandVehicle).toBe(true);
  }, 30_000);
});

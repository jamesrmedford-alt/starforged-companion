/**
 * STARFORGED COMPANION
 * tests/unit/commandVehicleLoadScan.test.js
 *
 * The command-vehicle reconcile runs at world load (issue #321 U22).
 * registerCommandVehicleHook() (src/index.js) is called from inside the
 * module's own Hooks.once("ready") handler, and it registered a SECOND
 * Hooks.once("ready") handler for the "reconcile ships created before
 * asset-detection shipped" scan. Foundry's Hooks.callAll iterates a copy of
 * the handler list, so a handler added while "ready" is being dispatched is
 * never called, and "ready" never fires again: the scan never ran. The
 * harness models the same copy-then-iterate dispatch (multiClient.js
 * SimHooks.call). The scan now runs directly.
 *
 * Asserted: after world load, a tracked starship that carries the Command
 * Vehicle asset but whose record says isCommandVehicle:false is flagged.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { ShipSchema } from '../../src/entities/ship.js';

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

describe('the command-vehicle reconcile runs at world load (issue #321 U22)', () => {
  it('a legacy command vehicle is flagged when the world loads', async () => {
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

    // No ready handler is left waiting: the scan was registered during the
    // ready dispatch, so it waited forever and never ran.
    expect(table.client('gm-1').hooks.count('ready')).toBe(0);

    // The load reconcile set the flag from the asset.
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

/* global makeTestActor */
/**
 * STARFORGED COMPANION
 * tests/unit/starshipImpactToggledWithNoGmReconciledAtLoad.test.js
 *
 * Issue #364 SHEET-IMPACT-NO-GM-ASSET-STALE (left open by
 * STARSHIP-SHEET-CURSED-TOGGLE; read from the code, reproduced here).
 *
 * A starship's native impacts (`system.debility.battered` / `cursed`) are
 * canonical; its STARSHIP asset card's Battered / Cursed boxes are their
 * mirror, kept in step by the canonical GM's hooks (ship.js
 * registerStarshipConditionSync). An impact toggled on the starship sheet
 * while no GM is connected is mirrored by nobody: the asset card keeps the
 * old box. The next edit of that card's conditions — any box — then reads the
 * stale box as a fresh tick and writes it to the impact: a Cursed (or a
 * Battered) cleared on the sheet is ticked again, against the maintainer's
 * decision that a Cursed un-ticked on the starship sheet stands.
 *
 * Now the canonical GM's world load brings each starship's asset card to its
 * sheet's impacts (ship.js reconcileStarshipAssetConditions, called from the
 * ready pass beside the integrity reconcile), marked as the mirror's own
 * write, writing nothing where the two agree, and telling the GMs what
 * changed on the card.
 *
 * Real path: registerStarshipConditionSync's two hooks, updateShip,
 * actorBridge.readCommandVehicleConditions / setCommandVehicleConditions;
 * and, on a booted table, the canonical GM's ready. Harness as
 * tests/unit/starshipSheetCursedClearStands.test.js.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getShip, isShipCursed, isShipBattered, registerStarshipConditionSync, reconcileStarshipAssetConditions } from '../../src/entities/ship.js';
import { readCommandVehicleConditions } from '../../src/character/actorBridge.js';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';

function starshipAsset({ battered = false, cursed = false } = {}) {
  const item = {
    id: 'asset-starship', type: 'asset', name: 'Starship',
    system: {
      category: 'Command Vehicle',
      track: { enabled: true, name: 'Integrity', max: 5, min: 0, value: 5 },
      conditions: [{ name: 'Battered', ticked: battered }, { name: 'Cursed', ticked: cursed }],
    },
    flags: {},
    update: vi.fn(async (changes) => {
      for (const [path, val] of Object.entries(changes)) {
        const parts = path.split('.');
        let target = item;
        for (let i = 0; i < parts.length - 1; i++) target = (target[parts[i]] ??= {});
        target[parts.at(-1)] = val;
      }
      return item;
    }),
  };
  return item;
}

const shipFlags = () => ({ [MODULE_ID]: {
  entityType: 'ship', entityId: 'ship-guid',
  ship: { _id: 'ship-guid', name: 'Wayfarer', type: 'Courier', integrity: 5, integrityMax: 5,
    integritySheetReconciled: true, battered: false, cursed: false, isCommandVehicle: true },
} });

/** A starship the module tracks: the STARSHIP asset on it, a ship record, listed in the campaign. */
function installTrackedShip() {
  const asset = starshipAsset();
  const ship = makeTestActor({
    id: 'ship-1', type: 'starship', name: 'Wayfarer',
    system: { debility: { battered: false, cursed: false }, notes: '' },
    items: { contents: [asset] }, flags: shipFlags(),
  });
  asset.parent = ship;
  game.actors._set('ship-1', ship);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: ['ship-1'], characterIds: [] });
  return { ship, asset };
}

/** A starship made in the sidebar: the STARSHIP asset on it, no module record, in no module list. */
function installSidebarStarship() {
  const asset = starshipAsset();
  const ship = makeTestActor({
    id: 'ship-9', type: 'starship', name: 'Driftwood',
    system: { debility: { battered: false, cursed: false }, notes: '' },
    items: { contents: [asset] }, flags: {},
  });
  asset.parent = ship;
  game.actors._set('ship-9', ship);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: [], characterIds: [] });
  return { ship, asset };
}

const GM = { id: 'gm-1', isGM: true, active: true };
const PLAYER = { id: 'pl-1', isGM: false, active: true };
/** Who is connected: the first is this client's user. */
function connected(...users) {
  game.user = users[0];
  game.users = { contents: users, filter: (f) => users.filter(f), find: (f) => users.find(f),
    get: (id) => users.find(u => u.id === id) ?? null, [Symbol.iterator]: function* () { yield* users; } };
}

let hooks, savedUser, savedUsers;
beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
  ChatMessage._created.length = 0;
  hooks = {};
  vi.spyOn(Hooks, 'on').mockImplementation((name, fn) => { (hooks[name] ??= []).push(fn); });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  savedUser = game.user; savedUsers = game.users;
  connected(GM);
  registerStarshipConditionSync();
});
afterEach(() => { vi.restoreAllMocks(); game.user = savedUser; game.users = savedUsers; });

const fire = async (name, ...args) => { for (const fn of hooks[name] ?? []) await fn(...args); };
const notices = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.shipConditionsReconciledNotice);

/** The starship sheet's own impact toggle: the native field, then the updateActor hook every connected client runs. */
async function toggleOnSheet(ship, impacts) {
  Object.assign(ship.system.debility, impacts);
  await fire('updateActor', ship, { system: { debility: impacts } }, {}, game.user.id);
}

/** A click on a condition box of the asset card: the Item update, then its hook. */
async function tickOnAssetCard(asset, name, ticked) {
  asset.system.conditions = asset.system.conditions.map(c => (c.name === name ? { ...c, ticked } : c));
  await fire('updateItem', asset, { system: { conditions: asset.system.conditions } }, {}, 'pl-1');
}

/**
 * Cursed marked while the GM is there (mirrored onto the card), then the GM
 * leaves and a player un-ticks it on the sheet: only the player's client runs
 * the hook, and it mirrors nothing. Then the GM is back.
 */
async function cursedClearedOnSheetWithNoGm(ship) {
  await toggleOnSheet(ship, { cursed: true });
  expect(readCommandVehicleConditions(ship), 'mirrored onto the asset (setup)').toEqual({ battered: false, cursed: true });
  connected(PLAYER);
  await toggleOnSheet(ship, { cursed: false });
  expect(ship.system.debility.cursed, 'cleared on the sheet (setup)').toBe(false);
  expect(readCommandVehicleConditions(ship), 'the asset card kept the old box (setup)').toEqual({ battered: false, cursed: true });
  connected(GM, PLAYER);
}

describe('issue #364 SHEET-IMPACT-NO-GM-ASSET-STALE — the GM\'s world load brings the asset card to the sheet\'s impacts', () => {
  it('a Cursed cleared on the sheet with no GM connected: the card\'s box is cleared at load, and the GMs are told', async () => {
    const { ship, asset } = installTrackedShip();
    await cursedClearedOnSheetWithNoGm(ship);
    const writes = asset.update.mock.calls.length;

    expect(await reconcileStarshipAssetConditions()).toEqual({ mirrored: 1 });

    expect(readCommandVehicleConditions(ship)).toEqual({ battered: false, cursed: false });
    expect(asset.update.mock.calls).toHaveLength(writes + 1);
    expect(asset.update.mock.calls.at(-1)[1]?.[MODULE_ID]?.conditionMirror, 'the mirror\'s own write, marked').toBe(true);
    expect(ship.system.debility.cursed, 'the sheet is not written').toBe(false);
    expect(notices()).toHaveLength(1);
    expect(notices()[0].whisper).toEqual(['gm-1']);
    expect(notices()[0].content).toContain('Wayfarer');
    expect(notices()[0].content).toContain('<strong>Cursed</strong>: the card showed it ticked, the sheet has it clear');
    expect(notices()[0].content).not.toContain('Battered');
  });

  it('the next edit of the card\'s conditions no longer ticks the cleared Cursed back (a tracked ship)', async () => {
    const { ship, asset } = installTrackedShip();
    await cursedClearedOnSheetWithNoGm(ship);
    await reconcileStarshipAssetConditions();

    await tickOnAssetCard(asset, 'Battered', true);

    expect(ship.system.debility, 'only the box the player ticked reaches the sheet').toEqual({ battered: true, cursed: false });
    expect(isShipCursed(ship)).toBe(false);
    expect(isShipBattered(ship)).toBe(true);
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: true, cursed: false });
  });

  it('the same for a starship the module holds no record of', async () => {
    const { ship, asset } = installSidebarStarship();
    expect(getShip('ship-9'), 'no module record (setup)').toBeNull();
    await cursedClearedOnSheetWithNoGm(ship);

    expect(await reconcileStarshipAssetConditions()).toEqual({ mirrored: 1 });
    await tickOnAssetCard(asset, 'Battered', true);

    expect(ship.system.debility).toEqual({ battered: true, cursed: false });
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: true, cursed: false });
  });

  it('a Battered repaired on the sheet with no GM connected is not ticked back by the card\'s next edit', async () => {
    const { ship, asset } = installTrackedShip();
    await toggleOnSheet(ship, { battered: true });
    connected(PLAYER);
    await toggleOnSheet(ship, { battered: false });
    expect(readCommandVehicleConditions(ship), 'stale (setup)').toEqual({ battered: true, cursed: false });
    connected(GM, PLAYER);

    await reconcileStarshipAssetConditions();
    await tickOnAssetCard(asset, 'Cursed', true);

    expect(ship.system.debility).toEqual({ battered: false, cursed: true });
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: false, cursed: true });
  });

  it('an impact marked on the sheet with no GM connected reaches the card at load', async () => {
    const { ship } = installTrackedShip();
    connected(PLAYER);
    await toggleOnSheet(ship, { battered: true, cursed: true });
    expect(readCommandVehicleConditions(ship), 'not mirrored (setup)').toEqual({ battered: false, cursed: false });
    connected(GM, PLAYER);

    expect(await reconcileStarshipAssetConditions()).toEqual({ mirrored: 1 });

    expect(readCommandVehicleConditions(ship)).toEqual({ battered: true, cursed: true });
    expect(notices()[0].content).toContain('<strong>Battered</strong>: the card showed it clear, the sheet has it marked');
    expect(notices()[0].content).toContain('<strong>Cursed</strong>: the card showed it clear, the sheet has it marked');
  });
});

describe('issue #364 SHEET-IMPACT-NO-GM-ASSET-STALE — the reconcile writes only where the two disagree', () => {
  it('a card already in step is not written, and nobody is told — a second load changes nothing', async () => {
    const { ship, asset } = installTrackedShip();
    await toggleOnSheet(ship, { battered: true });
    const writes = asset.update.mock.calls.length;

    expect(await reconcileStarshipAssetConditions()).toEqual({ mirrored: 0 });
    expect(asset.update.mock.calls).toHaveLength(writes);
    expect(notices()).toEqual([]);

    connected(PLAYER);
    await toggleOnSheet(ship, { battered: false });
    connected(GM, PLAYER);
    expect(await reconcileStarshipAssetConditions()).toEqual({ mirrored: 1 });
    expect(await reconcileStarshipAssetConditions()).toEqual({ mirrored: 0 });
    expect(asset.update.mock.calls).toHaveLength(writes + 1);
    expect(notices()).toHaveLength(1);
  });

  it('a player\'s client reconciles nothing', async () => {
    const { ship, asset } = installTrackedShip();
    await cursedClearedOnSheetWithNoGm(ship);
    const writes = asset.update.mock.calls.length;
    connected(PLAYER, GM);

    expect(await reconcileStarshipAssetConditions()).toEqual({ mirrored: 0 });
    expect(asset.update.mock.calls).toHaveLength(writes);
    expect(readCommandVehicleConditions(ship).cursed).toBe(true);
  });

  it('a starship with no STARSHIP asset, and an actor that is no starship, are left alone', async () => {
    const tug = makeTestActor({ id: 'ship-2', type: 'starship', name: 'Tug',
      system: { debility: { battered: true, cursed: false } }, items: { contents: [] }, flags: {} });
    game.actors._set('ship-2', tug);
    const pc = makeTestActor({ id: 'pc-1', type: 'character', name: 'Kira' });
    game.actors._set('pc-1', pc);

    expect(await reconcileStarshipAssetConditions()).toEqual({ mirrored: 0 });
    expect(notices()).toEqual([]);
  });

  it('one starship\'s refused write does not stop the next', async () => {
    const { ship: wayfarer, asset: refused } = installTrackedShip();
    await cursedClearedOnSheetWithNoGm(wayfarer);
    refused.update.mockImplementationOnce(async () => { throw new Error('the world refused the write'); });
    const other = starshipAsset({ battered: true });
    const driftwood = makeTestActor({ id: 'ship-9', type: 'starship', name: 'Driftwood',
      system: { debility: { battered: false, cursed: false }, notes: '' }, items: { contents: [other] }, flags: {} });
    other.parent = driftwood;
    game.actors._set('ship-9', driftwood);

    expect(await reconcileStarshipAssetConditions()).toEqual({ mirrored: 1 });
    expect(readCommandVehicleConditions(driftwood)).toEqual({ battered: false, cursed: false });
    expect(readCommandVehicleConditions(wayfarer).cursed, 'left for the next load').toBe(true);
  });
});

describe('issue #364 SHEET-IMPACT-NO-GM-ASSET-STALE — the canonical GM\'s ready runs the reconcile', () => {
  let table;
  afterEach(async () => { await table?.teardown(); table = null; });

  /** A world whose starship had Cursed cleared on its sheet while no GM was connected — the card still ticked — then the GM's page loads. */
  async function loadWithStaleCard(flags) {
    vi.restoreAllMocks();   // the booted table registers the module's own hooks
    table = await simulateTable({
      users: [USERS.GM], boot: false,
      world: { settings: { campaignState: { ...CampaignStateSchema, shipIds: flags ? ['ship-1'] : [] } } },
    });
    const asset = starshipAsset({ cursed: true });
    const ship = table.addActor({
      id: 'ship-1', type: 'starship', name: 'Wayfarer', hasPlayerOwner: false,
      system: { debility: { battered: false, cursed: false }, notes: '' },
      items: { contents: [asset] }, flags: flags ?? {},
    });
    asset.parent = ship;
    await table.client('gm-1').boot();
    await table.drain();
    return { ship, asset };
  }

  /** A player ticks Battered on the asset card: the Item's update, then the hook on the GM's client. */
  async function playerTicksBattered(asset) {
    asset.system.conditions = asset.system.conditions.map(c => (c.name === 'Battered' ? { ...c, ticked: true } : c));
    const gm = table.client('gm-1');
    gm.run(() => gm.hooks.call('updateItem', [asset, { system: { conditions: asset.system.conditions } }, {}, 'pl-1'], false));
    await table.settle(); await table.drain();
  }

  it('a card left stale while no GM was connected matches the sheet once the GM\'s world has loaded', async () => {
    const { ship, asset } = await loadWithStaleCard(shipFlags());

    expect(readCommandVehicleConditions(ship)).toEqual({ battered: false, cursed: false });
    expect(asset.update.mock.calls.at(-1)[1]?.[MODULE_ID]?.conditionMirror).toBe(true);
    expect(table.cards(f => f.shipConditionsReconciledNotice)).toHaveLength(1);
  }, 30_000);

  it('the card\'s next edit after that load does not tick the cleared Cursed back onto the sheet', async () => {
    const { ship, asset } = await loadWithStaleCard(shipFlags());

    await playerTicksBattered(asset);

    expect(ship.system.debility).toEqual({ battered: true, cursed: false });
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: true, cursed: false });
  }, 30_000);

  it('nor for a starship the module holds no record of', async () => {
    const { ship, asset } = await loadWithStaleCard(null);

    await playerTicksBattered(asset);

    expect(ship.system.debility).toEqual({ battered: true, cursed: false });
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: true, cursed: false });
  }, 30_000);
});

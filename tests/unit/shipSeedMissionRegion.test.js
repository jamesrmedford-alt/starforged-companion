/**
 * STARFORGED COMPANION
 * tests/unit/shipSeedMissionRegion.test.js
 *
 * A ship's seed rolls the mission its type names on the active sector's
 * region's table (known-issues SHIP-SEED-MISSION-REGION; issue #338 D5's rule).
 *
 * The ship seed (`seedStarshipActor`: the Auto-Seed, ✦ Finalise, ↻ Regenerate)
 * and the draft Confirm of a detected ship (`rollFreshShipSeed`) rolled
 * `starship_type` with no region. Its "Multipurpose" row — and "Fleet" →
 * "Starship Mission" — names the Starship Mission category, a table per region,
 * so in an Outlands or Expanse sector the type got a Terminus mission while the
 * seed's own `mission` was rolled on the region's table. D5: a mission
 * cross-reference rolls the active sector's region's table, the Terminus one
 * with no sector — the seeds now pass the region they resolve.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

// The real roller, with the Starship Type d100 fixed on "Multipurpose" (68–82)
// and its mission sub-roll on 38 — scripted inside that one roll only (the
// harness's document ids use Math.random too).
const control = vi.hoisted(() => ({ calls: [] }));
vi.mock('../../src/oracles/roller.js', async (original) => {
  const real = await original();
  return {
    ...real,
    rollOracle: vi.fn((tableId, options = {}) => {
      control.calls.push([tableId, options]);
      if (tableId !== 'starship_type') return real.rollOracle(tableId, options);
      const rng = vi.spyOn(Math, 'random').mockReturnValue(0.37);
      try { return real.rollOracle(tableId, { ...options, roll: 70 }); } finally { rng.mockRestore(); }
    }),
  };
});
vi.mock('../../src/system/ironswornPacks.js', async (original) => ({
  ...(await original()),
  getCanonicalAsset: vi.fn(async () => null),   // no compendium here — no module installed
}));

import { seedStarshipActor, getShip } from '../../src/entities/ship.js';
import { _resetFolderCache } from '../../src/entities/folder.js';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

// The sub-roll 38 lands on a different mission in each region.
const AT_38 = { terminus: 'Hold prisoners', outlands: 'Explore a region', expanse: 'Evacuate a location' };
const SECTORS = [
  { id: 'sec-term', name: 'Vega Reach', region: 'terminus', regionLabel: 'Terminus' },
  { id: 'sec-out',  name: 'Long Mile',  region: 'outlands', regionLabel: 'Outlands' },
  { id: 'sec-exp',  name: 'Far Drift',  region: 'expanse',  regionLabel: 'Expanse' },
];

beforeEach(() => { control.calls.length = 0; });

describe('the ship seed (Auto-Seed, Finalise, Regenerate)', () => {
  beforeEach(() => {
    _resetFolderCache();
    global.game.actors._reset();
    global.game.folders._reset();
    global.game.settings._store.clear();   // no Claude key: the Notes are the oracle list
  });

  async function seedIn(activeSectorId) {
    global.game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: [], sectors: SECTORS, activeSectorId });
    const actor = global.makeTestActor({ type: 'starship', name: 'Gull' });
    actor.createEmbeddedDocuments = async () => [];
    global.game.actors._set(actor.id, actor);
    await seedStarshipActor(actor, global.game.settings.get(MODULE_ID, 'campaignState'));
    return getShip(actor.id);
  }

  it("in an Expanse sector a Multipurpose type rolls the Expanse mission, as the seed's own mission does", async () => {
    const ship = await seedIn('sec-exp');

    // It rolled the Terminus table — "Multipurpose: Hold prisoners".
    expect(ship.type).toBe(`Multipurpose: ${AT_38.expanse}`);
    expect(control.calls).toContainEqual(['starship_type', { region: 'expanse' }]);
    expect(control.calls.map(([id]) => id)).toContain('starship_mission_expanse');   // control: the seed's own mission
  });

  it("in an Outlands sector, the Outlands mission", async () => {
    expect((await seedIn('sec-out')).type).toBe(`Multipurpose: ${AT_38.outlands}`);
  });

  it('control: in a Terminus sector, or with no sector active, the Terminus mission', async () => {
    expect((await seedIn('sec-term')).type).toBe(`Multipurpose: ${AT_38.terminus}`);
    expect((await seedIn(null)).type).toBe(`Multipurpose: ${AT_38.terminus}`);
  });
});

// rules/reachability.md §3 — the live wire: a narration names a ship, the GM
// presses Confirm on the draft card, and the ship it makes carries the type.
describe('the draft Confirm of a detected ship', () => {
  let table;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM] }); }, 30_000);
  afterAll(() => table?.teardown());

  async function confirmShipIn(activeSectorId) {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, autoSeedStarship: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, shipIds: [], sectors: SECTORS, activeSectorId },
    } } });
    const gm = table.client('gm-1');
    const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
    await gm.run(() => routeEntityDrafts(
      [{ type: 'ship', name: 'Black Fang', description: 'A cutter running dark.', confidence: 'high' }],
      game.settings.get(MODULE_ID, 'campaignState'),
      {},
    ));
    await table.settle();
    const card = table.cards(f => f.draftEntityCard)[0];
    expect(card).toBeTruthy();
    control.calls.length = 0;
    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    const fang = table.actors.find(a => a.name === 'Black Fang');
    expect(fang?.type).toBe('starship');
    return fang.flags[MODULE_ID].ship;
  }

  it("in an Expanse sector the confirmed ship's Multipurpose type carries an Expanse mission", async () => {
    const ship = await confirmShipIn('sec-exp');
    expect(ship.type).toBe(`Multipurpose: ${AT_38.expanse}`);
    expect(ship.description).toContain(`Type: Multipurpose: ${AT_38.expanse}.`);
    expect(control.calls).toContainEqual(['starship_type', { region: 'expanse' }]);
  }, 30_000);

  it('control: with no sector active, the Terminus mission', async () => {
    expect((await confirmShipIn(null)).type).toBe(`Multipurpose: ${AT_38.terminus}`);
  }, 30_000);
});

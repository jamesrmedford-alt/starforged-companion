/**
 * STARFORGED COMPANION
 * tests/unit/sufferExecutorAssetSchema.test.js
 *
 * SUFFER-EXECUTOR-ASSET-SCHEMA — the Companion Takes a Hit and Withstand
 * Damage suffer-move executors (the "any" suffer picker's two buttons, and
 * Pay the Price's "companion in harm's way" / "vehicle suffers damage"
 * routes) read and wrote `system.condition` / `system.health` /
 * `system.integrity` on an asset Item — not the vendor asset's
 * `system.track`, nor the command vehicle's integrity — and the picker passed
 * no item id, so they posted "not found" and nothing was taken. They now
 * write through the consequence card's writers: the companion's track
 * (actorBridge.applyCompanionHealthChange), a support vehicle's Integrity
 * track, or the command vehicle's integrity (entities/ship.js
 * changeIntegrity); a loss past 0 is momentum (issue #345 AA15).
 *
 * The booted table: a GM and a player; Kira carries a companion asset (its
 * health a vendor condition track); the crew's command vehicle is a starship.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { applyPayThePriceSufferFromRelay } from '../../src/index.js';

let table, kira, ship;
const gm = () => table.client('gm-1');
const pickers = () => table.cards(f => f.sufferCard && f.sufferPrompt);
const sufferResults = (move) => table.cards(f => f.suffer === move);
const integrityOf = () => table.actors.get('ship-a').flags[MODULE_ID].ship.integrity;
const glowcat = () => kira.items.contents.find(i => i.id === 'asset-glowcat');

const COMPANION_TAKES_A_HIT = 5;   // the any-picker's buttons, in order
const WITHSTAND_DAMAGE = 4;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, sessionActive: true } } } });
  const glow = { id: 'asset-glowcat', name: 'Glowcat', type: 'asset',
    system: { category: 'Companion', track: { enabled: true, name: 'Health', value: 3, min: 0, max: 4 }, conditions: [] },
    async update(changes) { if ('system.track.value' in changes) glow.system.track.value = changes['system.track.value']; return glow; } };
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
    system: { momentum: { value: 2 } }, items: { contents: [glow] } });
  ship = table.addActor({ id: 'ship-a', type: 'starship', name: 'Wayfarer',
    system: { debility: { battered: false } }, flags: { [MODULE_ID]: {
      entityType: 'ship', ship: { _id: 'ship-entity', name: 'Wayfarer', integrity: 4, integrityMax: 5, battered: false, isCommandVehicle: true },
    } } });
  await gm().run(() => game.settings.set(MODULE_ID, 'campaignState', { ...table.world.campaignState(), shipIds: [ship.id] }));
  await table.settle();
});

async function relayRoutes(routes) {
  const ctx = () => ({ requesterId: 'pl-1', requester: globalThis.game.users.get('pl-1'), requesterIsGM: false });
  const res = await gm().run(() => applyPayThePriceSufferFromRelay({ routes, actorId: 'pc-kira' }, ctx()));
  await table.settle(); await table.drain();
  return res;
}

async function pick(index) {
  await table.client('pl-1').click(pickers().at(-1)._id, '[data-action="sf-suffer-pick"]', { index });
  await table.settle(); await table.drain();
}

describe('SUFFER-EXECUTOR-ASSET-SCHEMA — the "any" picker\'s two asset buttons', () => {
  it("Companion Takes a Hit takes the companion's health track, with no item id", async () => {
    await relayRoutes([{ move: 'any', amount: 2 }]);
    await pick(COMPANION_TAKES_A_HIT);
    expect(glowcat().system.track.value).toBe(1);
    const card = sufferResults('companion_takes_a_hit').at(-1);
    expect(card.content).toMatch(/Glowcat: 3 → 1/);
    expect(card.content).not.toMatch(/not found/i);
  }, 30_000);

  it("Withstand Damage takes the command vehicle's integrity", async () => {
    await relayRoutes([{ move: 'any', amount: 2 }]);
    await pick(WITHSTAND_DAMAGE);
    expect(integrityOf()).toBe(2);
    const card = sufferResults('withstand_damage').at(-1);
    expect(card.content).toMatch(/Wayfarer: 4 → 2/);
    expect(card.content).not.toMatch(/not found/i);
  }, 30_000);
});

describe("SUFFER-EXECUTOR-ASSET-SCHEMA — Pay the Price's asset routes", () => {
  it("\"companion in harm's way\" takes the companion's health; harm past 0 is momentum", async () => {
    glowcat().system.track.value = 1;
    await relayRoutes([{ move: 'companion_takes_a_hit', amount: 3, soloFallback: 'endure_harm' }]);
    expect(glowcat().system.track.value).toBe(0);
    expect(kira.system.momentum.value).toBe(0);   // 2 more as momentum: 2 → 0
    expect(sufferResults('companion_takes_a_hit').at(-1).content).toMatch(/Glowcat: 1 → 0 — 2 more as momentum: 2 → 0/);
  }, 30_000);

  it('"your vehicle suffers damage" takes the command vehicle\'s integrity', async () => {
    await relayRoutes([{ move: 'withstand_damage', amount: 1 }]);
    expect(integrityOf()).toBe(3);
  }, 30_000);
});

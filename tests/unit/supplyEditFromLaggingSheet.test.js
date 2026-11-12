/**
 * STARFORGED COMPANION
 * tests/unit/supplyEditFromLaggingSheet.test.js
 *
 * A supply edit on a sheet behind the crew's supply moves the crew's supply by
 * that edit (issue #347 SUPPLY-LAGGING-SHEET — AB07's twin).
 *
 * The crew shares one supply track, kept in lockstep on every PC's sheet: the
 * canonical GM mirrors a change on one sheet to the others (sharedSupply.js).
 * It took the edited sheet's new value as the crew's. A sheet can lag the
 * crew's supply — a PC made since (a new sheet starts at 5), an imported
 * export, a sheet whose mirror write was refused — so one ◂ on a new PC's 5
 * set the crew's 2 to 4 for everyone, and one ▸ on a sheet left at 1 set the
 * crew's 4 to 2.
 *
 * Now the client that makes a sheet edit stamps the sheet's supply before it
 * into the update's options, as the shared legacies do, and the GM moves the
 * supply most of the crew's sheets hold by what the edit changed; and a PC
 * created mid-session starts at the crew's supply.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { failWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

describe("a supply edit on a sheet behind the crew's supply (issue #347 SUPPLY-LAGGING-SHEET)", () => {
  let table, kira, ren;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: { chronicleAutoEntry: false, campaignState: { ...CampaignStateSchema } } } });
    // The crew's supply stands at 2, in step on both sheets.
    kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { supply: { value: 2 } } });
    ren  = table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, system: { supply: { value: 2 } } });
  });

  const supply = (...pcs) => pcs.map(pc => pc.system.supply.value);
  // The sheet's supply meter: `system.supply.value = current ± 1`, as its player sees it.
  const stepOnSheet = (userId, pc, step) => table.client(userId).run(() =>
    pc.update({ 'system.supply.value': Math.max(0, Math.min(5, Number(pc.system?.supply?.value ?? 0) + step)) }));
  const quiet = async () => { await table.settle(); await table.drain(); };

  it("a ◂ on a lagging sheet takes one off the crew's supply — not the crew's supply up to the sheet's value", async () => {
    // A sheet nothing brought to the crew's 2 (an imported export): it shows 5.
    const zed = table.addActor({ id: 'pc-zed', name: 'Zed', ownership: { 'pl-2': 3 }, system: { supply: { value: 5 } } });
    await stepOnSheet('pl-2', zed, -1);
    await quiet();
    expect(supply(kira, ren, zed)).toEqual([1, 1, 1]);
  }, 30_000);

  it("a ▸ on a sheet left behind adds one to the crew's supply — not the crew's supply down to the sheet's", async () => {
    await table.client('gm-1').run(() => Promise.all([
      kira.update({ 'system.supply.value': 4 }, { 'starforged-companion': { sharedSupplyMirror: true } }),
      ren.update({ 'system.supply.value': 4 }, { 'starforged-companion': { sharedSupplyMirror: true } }),
    ]));
    // Zed's mirror write was refused: the sheet still shows 1.
    const zed = table.addActor({ id: 'pc-zed', name: 'Zed', ownership: { 'pl-2': 3 }, system: { supply: { value: 1 } } });
    await stepOnSheet('pl-2', zed, +1);
    await quiet();
    expect(supply(kira, ren, zed)).toEqual([5, 5, 5]);
  }, 30_000);

  it("a character created mid-session starts at the crew's supply", async () => {
    let zed;
    await table.client('gm-1').run(async () => {
      zed = await Actor.create({ name: 'Zed', type: 'character', ownership: { 'pl-2': 3 }, system: { supply: { value: 5 } } });
    });
    await quiet();
    expect(zed.system.supply.value).toBe(2);

    await stepOnSheet('pl-2', zed, -1);
    await quiet();
    expect(supply(kira, ren, zed)).toEqual([1, 1, 1]);
  }, 30_000);

  it('two players who each spend one at once spend two', async () => {
    // Both sheets show 2; neither player's ◂ has reached the other's sheet.
    const first = stepOnSheet('pl-1', kira, -1);
    const second = stepOnSheet('pl-2', ren, -1);
    await Promise.all([first, second]);
    await quiet();
    expect(supply(kira, ren)).toEqual([0, 0]);
  }, 30_000);

  it('a ◂ after the last one landed takes one more', async () => {
    await stepOnSheet('pl-1', kira, -1);
    await quiet();
    await stepOnSheet('pl-2', ren, -1);
    await quiet();
    expect(supply(kira, ren)).toEqual([0, 0]);
  }, 30_000);

  it("control: a ◂ on a sheet in step moves everyone's supply by one", async () => {
    await stepOnSheet('pl-2', ren, -1);
    await quiet();
    expect(supply(kira, ren)).toEqual([1, 1]);
  }, 30_000);

  it('control: a change made where nothing stamped it still sets the crew to its value', async () => {
    // A move's write from the GM's own code path, as the hook sees it with no stamp.
    await table.client('gm-1').run(() => Hooks.callAll('updateActor', kira, { system: { supply: { value: 4 } } }, {}, 'gm-1'));
    await quiet();
    expect(ren.system.supply.value).toBe(4);
  }, 30_000);

  it("control: an NPC card made mid-session is not given the crew's supply", async () => {
    let card;
    await table.client('gm-1').run(async () => {
      card = await Actor.create({ name: 'Vance', type: 'character', flags: { 'starforged-companion': { entityType: 'connection' } }, system: { supply: { value: 5 } } });
    });
    await quiet();
    expect(card.system.supply.value).toBe(5);
    expect(supply(kira, ren)).toEqual([2, 2]);
  }, 30_000);
});

describe('SUPPLY-TWO-PC-TIE — two PCs, one sheet a refused mirror write left behind', () => {
  let table, kira, ren;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: { chronicleAutoEntry: false, campaignState: { ...CampaignStateSchema } } } });
    kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { supply: { value: 2 } } });
    ren  = table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, system: { supply: { value: 2 } } });
  });

  const supply = (...pcs) => pcs.map(pc => pc.system.supply.value);
  const stepOnSheet = (userId, pc, step) => table.client(userId).run(() =>
    pc.update({ 'system.supply.value': Math.max(0, Math.min(5, Number(pc.system?.supply?.value ?? 0) + step)) }));
  const quiet = async () => { await table.settle(); await table.drain(); };

  /** Kira spends one; the mirror write to Ren's sheet is refused: 1 and 2, a tie. Then the GM's page reloads. */
  async function lagRenThenReload() {
    const refused = failWrites(table, w => w.kind === 'actor.update' && w.id === 'pc-ren' && w.changes?.['system.supply.value'] === 1);
    await stepOnSheet('pl-1', kira, -1);
    await quiet();
    expect(refused.refused).toBe(1);
    expect(supply(kira, ren)).toEqual([1, 2]);
    expect(table.world.campaignState().crewSupply).toBe(1);       // the crew's supply, stored
    const mod = await table.client('gm-1').import('../../src/multiplayer/sharedSupply.js');
    await table.client('gm-1').run(() => mod._resetSharedSupplyForTests());   // the GM's in-memory pass is gone
  }

  it("a ▸ on the lagging sheet adds one to the crew's 1 — not one to the sheet's 2", async () => {
    await lagRenThenReload();
    await stepOnSheet('pl-2', ren, +1);
    await quiet();
    expect(supply(kira, ren)).toEqual([2, 2]);
  }, 30_000);

  it("control: a ◂ on the sheet in step takes one off the crew's 1", async () => {
    await lagRenThenReload();
    await stepOnSheet('pl-1', kira, -1);
    await quiet();
    expect(supply(kira, ren)).toEqual([0, 0]);
  }, 30_000);
});

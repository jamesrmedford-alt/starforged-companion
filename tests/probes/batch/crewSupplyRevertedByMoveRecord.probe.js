/**
 * PROBE — BATCH · CREW-SUPPLY-REVERTED-BY-MOVE-RECORD (INCOMPLETE-FIX of SUPPLY-TWO-PC-TIE)
 *
 * Scenario: two PCs share the crew's supply (5). A move is in flight — its
 * working copy of campaignState was taken before the roll, as every free-flow
 * move's and every Batch Mode round entry's is. While it runs, the crew's
 * supply drops by one (its own Pay the Price's Sacrifice Resources, or a sheet
 * edit): the shared-supply pass mirrors the sheets and stores the crew's
 * supply on campaignState (`crewSupply`, SUPPLY-TWO-PC-TIE's fix) — here the
 * mirror write to the other sheet is refused, the case that fix is for. Then
 * the move is recorded (persistResolution).
 *
 * Correct: the stored crew supply survives the move's record (it is written by
 * the shared-supply pass alone, like the other store-owned fields), so after a
 * GM reload an edit on the lagging sheet still moves the crew's supply.
 *
 * Today: persistResolution's merge keeps the working copy's value for every
 * field not in STORE_OWNED_FIELDS, and `crewSupply` is not in it — the record
 * writes the pre-move value back. The tie SUPPLY-TWO-PC-TIE settled goes to
 * the edited (lagging) sheet again.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { failWrites } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE = 'starforged-companion';

describe('BATCH — the stored crew supply and a move in flight', () => {
  let table, kira, ren;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: { chronicleAutoEntry: false, campaignState: { ...CampaignStateSchema, crewSupply: 2 } } } });
    kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { supply: { value: 2 } } });
    ren  = table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, system: { supply: { value: 2 } } });
  });

  const supply = (...pcs) => pcs.map(pc => pc.system.supply.value);
  const stepOnSheet = (userId, pc, step) => table.client(userId).run(() =>
    pc.update({ 'system.supply.value': Math.max(0, Math.min(5, Number(pc.system?.supply?.value ?? 0) + step)) }));
  const quiet = async () => { await table.settle(); await table.drain(); };

  /** The GM's pipeline takes its working copy; the supply changes; the move is recorded. */
  async function moveRecordedAcrossASupplyChange({ change }) {
    const gm = table.client('gm-1');
    // The pipeline's working copy, as index.js / batch/driver.js take it before the roll.
    const working = await gm.run(() => foundry.utils.deepClone(game.settings.get(MODULE, 'campaignState')));
    await change();
    await quiet();
    const { persistResolution } = await gm.import('../../src/moves/persistResolution.js');
    await gm.run(() => persistResolution({
      _id: 'res-1', moveId: 'face_danger', moveName: 'Face Danger', outcome: 'strong_hit', consequences: {},
    }, working, 'pc-kira'));
    await quiet();
  }

  it("the crew's supply a pass stored while a move was in flight is still stored once the move is recorded", async () => {
    // Kira spends one mid-move; the mirror write to Ren's sheet is refused: 1 and 2.
    const refused = failWrites(table, w => w.kind === 'actor.update' && w.id === 'pc-ren' && w.changes?.['system.supply.value'] === 1);
    await moveRecordedAcrossASupplyChange({ change: () => stepOnSheet('pl-1', kira, -1) });
    expect(refused.refused, 'setup: the mirror write to Ren was refused').toBe(1);
    expect(supply(kira, ren), 'setup: Ren\'s sheet lags').toEqual([1, 2]);

    // FAILS today: the move's record put the pre-move 2 back.
    expect(table.world.campaignState().crewSupply).toBe(1);
  }, 30_000);

  it('…so after a GM reload a ▸ on the lagging sheet adds one to the crew\'s 1, not to the sheet\'s 2', async () => {
    failWrites(table, w => w.kind === 'actor.update' && w.id === 'pc-ren' && w.changes?.['system.supply.value'] === 1);
    await moveRecordedAcrossASupplyChange({ change: () => stepOnSheet('pl-1', kira, -1) });
    const mod = await table.client('gm-1').import('../../src/multiplayer/sharedSupply.js');
    await table.client('gm-1').run(() => mod._resetSharedSupplyForTests());   // the GM's page reloaded

    await stepOnSheet('pl-2', ren, +1);
    await quiet();
    // FAILS today: [3, 3] — the crew's supply is set from the lagging sheet (SUPPLY-TWO-PC-TIE again).
    expect(supply(kira, ren)).toEqual([2, 2]);
  }, 30_000);

  it('control: with no move in flight, the stored crew supply settles the tie (SUPPLY-TWO-PC-TIE holds)', async () => {
    const refused = failWrites(table, w => w.kind === 'actor.update' && w.id === 'pc-ren' && w.changes?.['system.supply.value'] === 1);
    await stepOnSheet('pl-1', kira, -1);
    await quiet();
    expect(refused.refused).toBe(1);
    expect(table.world.campaignState().crewSupply).toBe(1);
    const mod = await table.client('gm-1').import('../../src/multiplayer/sharedSupply.js');
    await table.client('gm-1').run(() => mod._resetSharedSupplyForTests());
    await stepOnSheet('pl-2', ren, +1);
    await quiet();
    expect(supply(kira, ren)).toEqual([2, 2]);
  }, 30_000);

  it('control: a store-owned field written while the move was in flight survives its record', async () => {
    await moveRecordedAcrossASupplyChange({
      change: () => table.client('gm-1').run(() => game.settings.set(MODULE, 'campaignState',
        { ...game.settings.get(MODULE, 'campaignState'), xCardActive: true })),
    });
    expect(table.world.campaignState().xCardActive).toBe(true);
  }, 30_000);
});

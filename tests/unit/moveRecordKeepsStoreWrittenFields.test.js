/**
 * STARFORGED COMPANION
 * tests/unit/moveRecordKeepsStoreWrittenFields.test.js
 *
 * Issue #362 AC55 MOVE-RECORD-REVERTS-STORE-WRITTEN-FIELDS — persistResolution
 * writes the move pipeline's working copy (taken before the roll) merged onto
 * the store per a field policy (mergeWithLatestState): fields other writers
 * own take the STORED value (STORE_OWNED_FIELDS), every other field keeps the
 * working copy. Four fields only other writers set, straight to the store,
 * were not on the list, so a move's record put back the value they had when
 * the move began:
 *
 *   crewSupply           sharedSupply.js persistCrewSupply — each sync pass (SUPPLY-TWO-PC-TIE)
 *   deletedChatMessages  narrator.js persistDeletedRecord — a card deleted
 *   unsummarisedSession  narrator.js catchUpUnsummarisedSession clears the mint's mark —
 *                        after every narrator card, i.e. inside the move pipeline
 *   sessionPerspective   lifecycle.js beginSession (issue #348 PT03)
 *
 * The crewSupply case: two PCs share the supply; a move is in flight; the
 * crew's supply drops by one and the mirror write to the other sheet is
 * refused (the case SUPPLY-TWO-PC-TIE's stored value is for). The move's
 * record wrote the pre-move value back, so after a GM reload an edit on the
 * lagging sheet set the crew's supply from it again.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { failWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE = 'starforged-companion';

describe('issue #362 AC55 — a move\'s record keeps what other writers stored while it ran', () => {
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

  /** The GM's pipeline takes its working copy; something changes the store; the move is recorded. */
  async function moveRecordedAcross({ change }) {
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
    await moveRecordedAcross({ change: () => stepOnSheet('pl-1', kira, -1) });
    expect(refused.refused, 'setup: the mirror write to Ren was refused').toBe(1);
    expect(supply(kira, ren), 'setup: Ren\'s sheet lags').toEqual([1, 2]);

    expect(table.world.campaignState().crewSupply).toBe(1);
  }, 30_000);

  it('…so after a GM reload a ▸ on the lagging sheet adds one to the crew\'s 1, not to the sheet\'s 2', async () => {
    failWrites(table, w => w.kind === 'actor.update' && w.id === 'pc-ren' && w.changes?.['system.supply.value'] === 1);
    await moveRecordedAcross({ change: () => stepOnSheet('pl-1', kira, -1) });
    const mod = await table.client('gm-1').import('../../src/multiplayer/sharedSupply.js');
    await table.client('gm-1').run(() => mod._resetSharedSupplyForTests());   // the GM's page reloaded

    await stepOnSheet('pl-2', ren, +1);
    await quiet();
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
    await moveRecordedAcross({
      change: () => table.client('gm-1').run(() => game.settings.set(MODULE, 'campaignState',
        { ...game.settings.get(MODULE, 'campaignState'), xCardActive: true })),
    });
    expect(table.world.campaignState().xCardActive).toBe(true);
  }, 30_000);

  it('a value the store took for deletedChatMessages / unsummarisedSession / sessionPerspective mid-move survives that move\'s record', async () => {
    await table.client('gm-1').run(() => game.settings.set(MODULE, 'campaignState', {
      ...game.settings.get(MODULE, 'campaignState'),
      // The session was minted with its predecessor still unsummarised (issue #347 AB15's mark).
      unsummarisedSession: { sessionId: 'pipe-s0', sessionNumber: 0 }, deletedChatMessages: [], sessionPerspective: null,
    }));
    await moveRecordedAcross({
      // While the move runs, three other writers land on the store.
      change: () => table.client('gm-1').run(() => game.settings.set(MODULE, 'campaignState', {
        ...game.settings.get(MODULE, 'campaignState'),
        unsummarisedSession: null,                                                       // the catch-up made LAST SESSION
        deletedChatMessages: [{ id: 'msg-9', deleted: true, flags: {}, whisper: [] }],   // a GM deleted a card
        sessionPerspective:  { sessionId: 'pipe-s1', perspective: 'third_person' },      // Begin a Session decided it
      })),
    });
    const after = table.world.campaignState();
    expect(after.unsummarisedSession, 'the cleared mark is not put back').toBeNull();
    expect(after.deletedChatMessages, 'the deleted card\'s record is kept').toEqual([expect.objectContaining({ id: 'msg-9' })]);
    expect(after.sessionPerspective, 'the session\'s perspective is kept').toEqual({ sessionId: 'pipe-s1', perspective: 'third_person' });
  }, 30_000);

  it('control: what the move itself changes on its working copy is still recorded (sectors keep the pipeline\'s copy)', async () => {
    const gm = table.client('gm-1');
    const working = await gm.run(() => foundry.utils.deepClone(game.settings.get(MODULE, 'campaignState')));
    working.sectors = [{ id: 'sec-1', name: 'The Reach', mapData: { discoveries: [{ id: 'site-1', discovered: true }] } }];
    const { persistResolution } = await gm.import('../../src/moves/persistResolution.js');
    await gm.run(() => persistResolution({
      _id: 'res-2', moveId: 'face_danger', moveName: 'Face Danger', outcome: 'strong_hit', consequences: {},
    }, working, 'pc-kira'));
    await quiet();
    expect(table.world.campaignState().sectors).toEqual([expect.objectContaining({ id: 'sec-1' })]);
  }, 30_000);
});

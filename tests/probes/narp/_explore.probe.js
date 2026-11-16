import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, narrationCallsOf, onGm, moveResolution, narrateMoveOn,
} from '../../helpers/skeletonTable.js';

let table; let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
afterEach(() => restore?.());
beforeEach(async () => {
  restore = await resetSkeletonTable(table, {}, { sessionNumber: 3,
    previousSessionSummary: { sessionId: 's-0', sessionNumber: null, text: 'The crew prepared.' } });
  const store  = await gmOf(table).import('../../src/narration/worldSnapshotStore.js');
  const events = await gmOf(table).import('../../src/narration/snapshotEvents.js');
  gmOf(table).run(() => { store._resetWorldSnapshotStoreForTests(); events._resetSnapshotEventsForTests(); });
});
const gm = () => gmOf(table);
async function onTheGm(work) { const r = await gm().run(work); await table.settle(); await table.drain(); return r; }

describe('explore', () => {
  it('prints', async () => {
    const { createConnection } = await gm().import('../../src/entities/connection.js');
    const { createSettlement } = await gm().import('../../src/entities/settlement.js');
    await onTheGm(async () => {
      const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
      await createSettlement({ name: 'Bleakhold', authority: 'Lawless', trouble: 'Failing life support' }, cs);
      await createConnection({ name: 'Vuldar Archer', role: 'Broker', goal: 'Get out', pronouns: 'he/him' }, cs);
    });
    await narrateMoveOn(table, moveResolution({ playerNarration: 'I ask Vuldar Archer about Bleakhold.' }));
    const call = narrationCallsOf(table).at(-1);
    for (const b of call.body.system) console.log('=====BLOCK cache=', JSON.stringify(b.cache_control), '\n', b.text.length > 6000 ? b.text.slice(0, 200) + '…' : b.text);
    console.log('EVENTS', JSON.stringify(gm().run(() => game.settings.get(MODULE_ID, 'worldSnapshotEvents'))));
    expect(true).toBe(true);
  }, 60_000);
});

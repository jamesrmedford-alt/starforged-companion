// tests/unit/autoSeedFieldWrites.test.js
// With Auto-Seed on, the sector creator's connection keeps its canonical
// lock (issue #326 W69). seedConnectionActor built its replacement record
// from the card as created, awaited the Notes' Claude call, and wrote that
// snapshot whole — reverting `canonicalLocked: true` (and any other record
// write that landed during the call); the narrator card then read "(prefer
// consistency)" instead of "(fixed)". The seed now writes only the fields it
// seeds, by path, onto the record as it is at write time.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, holdWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    autoSeedConnection: true,
    campaignState: { ...CampaignStateSchema, connectionIds: [], settlementIds: [], locationIds: [], sectors: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gm');
});

describe('the Auto-Seed writes its fields onto the connection record as it is then (issue #326 W69)', () => {
  it('the sector connection keeps its canonical lock after the Auto-Seed write lands', async () => {
    silenceConsoleErrors();   // best-effort sector side passes log in the bare harness
    const claude = scriptClaude(table);
    const intro  = claude.hold(call => /introduction to an NPC/.test(call.system ?? ''));
    const LOCK   = `flags.${MODULE_ID}.connection`;
    const lock   = holdWrites(table, w => w.kind === 'actor.update' && w.changes?.[LOCK]?.canonicalLocked === true);

    const gm = table.client('gm-1');
    const { generateSector, createEntityJournals } = await gm.import('../../src/sectors/sectorGenerator.js');
    const sector = gm.run(() => generateSector('terminus'));
    const state  = gm.run(() => game.settings.get(MODULE_ID, 'campaignState'));

    const created = gm.run(() => createEntityJournals(sector, state));
    await lock.arrived;           // the sector's lock write is on its way to the server
    await intro.arrived;          // the seed's Notes-introduction call is in flight
    lock.release();
    await created;                // the lock landed while the call was out

    const card = () => table.actors.find(a => a.flags?.[MODULE_ID]?.entityType === 'connection');
    expect(card().flags[MODULE_ID].connection.canonicalLocked).toBe(true);   // control: the lock landed

    intro.release('A dockhand with a quick smile and quicker hands.');
    await table.drain();

    const record = card().flags[MODULE_ID].connection;
    expect(record.seeded).toBe(true);                                        // control: the seed wrote
    expect(record.canonicalLocked).toBe(true);
  });
});

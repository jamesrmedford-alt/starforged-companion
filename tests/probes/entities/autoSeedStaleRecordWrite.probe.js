/**
 * PROBE — AUTOSEED-STALE-RECORD-WRITE (EN)
 *
 * What the user does: a GM with a Claude key and "Auto-Seed NPC / Connection
 * Details" on creates a sector in the Sector Creator.
 *
 * What happens: the sector's local connection loses its canonical lock.
 * createEntityJournals (src/sectors/sectorGenerator.js ~375-399) creates the
 * NPC card (createConnection → Actor.create) and immediately writes the
 * record back with `canonicalLocked: true`. The Actor.create fired the
 * createActor seed hook (src/index.js ~2551) on the canonical GM, and
 * seedConnectionActor (src/entities/connection.js ~434-461) had already built
 * its whole replacement record `{ ...existing, role, goal, … }` from the card
 * as created — then awaited the Claude call for the Notes introduction
 * (composeConnectionNotesHtml, seconds) and wrote that snapshot over the
 * record (`flags.<module>.connection`), reverting the lock (and any other
 * record write that landed during the call). The narrator card then reads
 * "ESTABLISHED FACTS (prefer consistency)" instead of "(fixed)", and the
 * Entities panel shows the sector NPC unlocked. (rules/reachability.md §9:
 * a snapshot held across an await, written whole.)
 *
 * What should happen: the seed writes only the fields it owns, onto the
 * record as it is when it writes — the sector's lock stays.
 *
 * Timing: in Foundry the lock is a server round trip (setFlag → update →
 * socket), while the seed takes its snapshot a few microtasks after the
 * createActor hook fires; the harness applies writes with no latency, so the
 * probe holds the lock write until the seed's Claude call is in flight.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude, holdWrites } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('PROBE AUTOSEED-STALE-RECORD-WRITE', () => {
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

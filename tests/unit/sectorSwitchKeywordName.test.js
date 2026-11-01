/**
 * STARFORGED COMPANION
 * tests/unit/sectorSwitchKeywordName.test.js
 *
 * Issue #322 V10 (the audit's sectorSwitchKeywordName probe,
 * SECTOR-SWITCH-KEYWORD-PREFIX): handleSectorCommand dispatched on the FIRST
 * word of the argument, so `!sector New Hope` opened the Sector Creator and a
 * sector named "List of Stars" listed the sectors — neither could be switched
 * to, though the help documents `!sector <name>`. `new` and `list` are
 * subcommands only as the whole argument now.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: true,
    sectors: [
      { id: 's1', name: 'Veil', regionLabel: 'Terminus' },
      { id: 's2', name: 'New Hope', regionLabel: 'Outlands' },
      { id: 's3', name: 'List of Stars', regionLabel: 'Expanse' },
    ],
    activeSectorId: 's1',
  } } } });
  silenceConsoleErrors();   // the stub world has no Sector Creator window to open
});

describe('!sector <name> switches to a sector whose name starts with a subcommand (SECTOR-SWITCH-KEYWORD-PREFIX)', () => {
  it('!sector New Hope switches the active sector to "New Hope"', async () => {
    await table.client('gm-1').chat('!sector New Hope');
    await table.settle();
    expect(table.world.campaignState().activeSectorId).toBe('s2');
    expect(table.cards(f => f.sectorSwitch).at(-1).content).toContain('New Hope');
  }, 30_000);

  it('!sector List of Stars switches to "List of Stars", not the list', async () => {
    await table.client('gm-1').chat('!sector List of Stars');
    await table.settle();
    expect(table.world.campaignState().activeSectorId).toBe('s3');
    expect(table.cards(f => f.sectorList)).toHaveLength(0);
  }, 30_000);

  it('control: `!sector list` alone lists the sectors and switches nothing', async () => {
    await table.client('gm-1').chat('!sector list');
    await table.settle();
    expect(table.cards(f => f.sectorList).at(-1).content).toContain('New Hope');
    expect(table.world.campaignState().activeSectorId).toBe('s1');
  }, 30_000);
});

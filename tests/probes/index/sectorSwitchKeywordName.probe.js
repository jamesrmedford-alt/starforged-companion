/**
 * PROBE — SECTOR-SWITCH-KEYWORD-PREFIX
 *
 * handleSectorCommand (src/index.js ~5463) dispatches on the FIRST word of the
 * argument: `sub = parts[0].toLowerCase()`, then `if (sub === "new")` opens
 * the Sector Creator and `if (sub === "list")` lists sectors, before the
 * switch-by-name branch. The help documents `!sector Name` as "Switch the
 * active sector to the named one", but a sector whose name begins with the
 * word "New" or "List" ("New Hope", "List of Stars") can never be switched to:
 * `!sector New Hope` opens the creator instead.
 *
 * Correct behaviour (asserted): `!sector New Hope` switches to "New Hope".
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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
    ],
    activeSectorId: 's1',
  } } } });
  silenceConsoleErrors();   // the stub world has no Sector Creator window to open
});

describe('PROBE SECTOR-SWITCH-KEYWORD-PREFIX', () => {
  it('!sector New Hope switches the active sector to "New Hope"', async () => {
    await table.client('gm-1').chat('!sector New Hope');
    await table.settle();
    expect(table.world.campaignState().activeSectorId).toBe('s2');
  }, 30_000);
});

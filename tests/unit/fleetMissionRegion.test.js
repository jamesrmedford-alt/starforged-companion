/**
 * A Fleet "Starship Mission" row — or Starship Type "Multipurpose" — rolls the
 * mission table of the active sector's region (issue #338 D5, option A;
 * MISSION-REF-REGION-BLIND).
 *
 * Issue #330 D13 follows a cross-reference row in place, "on the table its ref
 * names". Both rows carry `ref: "starship_mission_terminus"`, so `!oracle
 * fleet` / `!oracle starship_type` rolled the Terminus mission table in an
 * Outlands or Expanse sector. The vendored Fleet row links the Starship
 * Mission CATEGORY — one table per region, which differ (issue #321 U63: roll
 * 3 is "Blockade a location" in the Terminus and "Break a blockade" in the
 * Expanse) — and the Sector Creator already picks its tables by region.
 * `!oracle` now passes the active sector's region; a mission ref rolls that
 * region's table, the Terminus one when there is no sector or region.
 * Rejected: option B (keep the Terminus table and say so in the help).
 */

import { describe, it, expect, vi, afterEach, beforeAll, afterAll, beforeEach } from 'vitest';

// The composition test below fixes the d100 and the sub-rolls of the REAL
// roller for the one `!oracle` call it types (the harness's document ids use
// Math.random too, so the dice are scripted inside the roll only).
const control = vi.hoisted(() => ({ roll: null, random: null, calls: [] }));
vi.mock('../../src/oracles/roller.js', async (original) => {
  const real = await original();
  return {
    ...real,
    rollOracle: vi.fn((tableId, options = {}) => {
      control.calls.push([tableId, options]);
      if (control.roll == null) return real.rollOracle(tableId, options);
      const rng = vi.spyOn(Math, 'random').mockReturnValue(control.random);
      try { return real.rollOracle(tableId, { ...options, roll: control.roll }); } finally { rng.mockRestore(); }
    }),
  };
});

import { rollOracle } from '../../src/oracles/roller.js';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

afterEach(() => vi.restoreAllMocks());

// The sub-roll 38 lands on a different mission in each region.
const AT_38 = { terminus: 'Hold prisoners', outlands: 'Explore a region', expanse: 'Evacuate a location' };

describe('a Fleet "Starship Mission" row', () => {
  it('rolls the Expanse mission table in an Expanse sector', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.02);   // every sub-roll lands on 3

    const r = rollOracle('fleet', { roll: 95, region: 'expanse' });

    expect(r.roll).toBe(95);
    // Expanse 3–4 "Break a blockade"; it rolled Terminus 1–3 "Blockade a location".
    expect(r.result).toBe('Starship Mission: Break a blockade');
  });

  it.each(Object.entries(AT_38))("rolls the %s region's own table", (region, mission) => {
    vi.spyOn(Math, 'random').mockReturnValue(0.37);   // the sub-roll lands on 38
    expect(rollOracle('fleet', { roll: 95, region }).result).toBe(`Starship Mission: ${mission}`);
  });

  it('reads the region case-blind (a region label)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.37);
    expect(rollOracle('fleet', { roll: 95, region: 'Outlands' }).result).toBe(`Starship Mission: ${AT_38.outlands}`);
  });

  it('with no sector — or a region no mission table is kept for — rolls the Terminus table, the one its ref names', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.37);
    expect(rollOracle('fleet', { roll: 95 }).result).toBe(`Starship Mission: ${AT_38.terminus}`);
    expect(rollOracle('fleet', { roll: 95, region: null }).result).toBe(`Starship Mission: ${AT_38.terminus}`);
    expect(rollOracle('fleet', { roll: 95, region: 'void' }).result).toBe(`Starship Mission: ${AT_38.terminus}`);
  });
});

describe('Starship Type "Multipurpose" and the chains', () => {
  it("Multipurpose (68–82) rolls the region's mission table too", () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.37);
    expect(rollOracle('starship_type', { roll: 70, region: 'expanse' }).result).toBe(`Multipurpose: ${AT_38.expanse}`);
  });

  it('the region holds down a chain: Starship Type "Fleet" → Fleet "Starship Mission"', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.95)   // the Fleet roll: 96, "Starship Mission"
      .mockReturnValueOnce(0.37);  // the mission roll: 38
    expect(rollOracle('starship_type', { roll: 90, region: 'outlands' }).result)
      .toBe(`Fleet: Starship Mission: ${AT_38.outlands}`);
  });

  it('control: each mission table rolls its own rows, and a non-regional ref is unchanged by a region', () => {
    expect(rollOracle('starship_mission_expanse', { roll: 3 }).result).toBe('Break a blockade');
    expect(rollOracle('starship_mission_terminus', { roll: 3 }).result).toBe('Blockade a location');
    vi.spyOn(Math, 'random').mockReturnValue(0.37);
    expect(rollOracle('fleet', { roll: 5, region: 'expanse' }).result).toBe('Battle fleet');
  });
});

// rules/reachability.md §3 — the live wire: the active sector (campaignState)
// → the typed `!oracle fleet` → the roll → the card everyone sees.
describe('composition: `!oracle fleet` rolls the active sector\'s region', () => {
  let table;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(() => { control.roll = null; control.random = null; control.calls.length = 0; });
  afterEach(() => { control.roll = null; control.random = null; });

  async function rollFleetIn(activeSectorId) {
    await table.reset({ world: { settings: { campaignState: {
      ...CampaignStateSchema, sessionActive: true,
      sectors: [
        { id: 'sec-term', name: 'Vega Reach', region: 'terminus', regionLabel: 'Terminus' },
        { id: 'sec-exp',  name: 'Far Drift',  region: 'expanse',  regionLabel: 'Expanse' },
      ],
      activeSectorId,
    } } } });
    control.roll = 95; control.random = 0.37;
    await table.client('pl-1').chat('!oracle fleet who are they');
    await table.settle();
    return table.cards(f => f.oracleCommandCard)[0];
  }

  it("in an Expanse sector a player's roll lands on the Expanse table", async () => {
    const card = await rollFleetIn('sec-exp');
    expect(control.calls).toContainEqual(['fleet', { region: 'expanse' }]);
    expect(card.content).toContain(`Starship Mission: ${AT_38.expanse}`);
    expect(card.flags[MODULE_ID].oracleMemory.answer).toBe(`Starship Mission: ${AT_38.expanse}`);
  }, 30_000);

  it('control: in a Terminus sector, or with none active, the Terminus table', async () => {
    expect((await rollFleetIn('sec-term')).content).toContain(`Starship Mission: ${AT_38.terminus}`);
    expect((await rollFleetIn(null)).content).toContain(`Starship Mission: ${AT_38.terminus}`);
  }, 30_000);
});

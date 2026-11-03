/**
 * STARFORGED COMPANION
 * tests/unit/sectorRosterLostConnection.test.js
 *
 * Issue #325 W37: the ACTIVE SECTOR roster offered a severed connection as
 * ready cast. listConnections keeps inactive records and
 * formatSectorNpcProfile printed role, goal, disposition and first look with
 * no status, under the CAST DISCIPLINE paragraph that says to reuse the NPCs
 * listed before inventing anyone. The lost bond was on the entity card only —
 * which renders when the player names the NPC; the roster renders every turn.
 * A lost connection is now listed apart, its line saying how it was lost.
 *
 * Converted from the audit probe narration/sectorRosterLostConnection.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { formatActiveSector, formatSectorNpcProfile } from '../../src/narration/narrator.js';
import { loseConnection } from '../../src/entities/connection.js';

const MODULE_ID = 'starforged-companion';

function npc(id, name, extra = {}) {
  game.actors._set(id, makeTestActor({
    id, type: 'character', name, ownership: { default: 3 },
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: `rec-${id}`, name, role: 'Smuggler', goal: 'Clear an old debt',
      disposition: 'friendly', pronouns: 'he/him', sectorId: 'sec-1', active: true, history: [], ...extra,
    } } },
  }));
}

const campaignState = {
  activeSectorId: 'sec-1',
  sectors: [{ id: 'sec-1', name: 'The Reach', mapData: { settlements: [] } }],
  connectionIds: ['npc-vex', 'npc-ana'],
};

beforeEach(() => {
  game.actors._reset();
  npc('npc-vex', 'Vex Marrow');
  npc('npc-ana', 'Ana Sol', { role: 'Courier' });
});

const lineFor = (block, name) => block.split('\n').find(l => l.includes(name));

describe('a lost connection is not offered as friendly cast', () => {
  it('after a severance, the ACTIVE SECTOR line for Vex says the connection was lost, and how', async () => {
    await loseConnection('npc-vex', 'betrayed the crew to the Syndicate', 's1');
    const line = lineFor(formatActiveSector(campaignState), 'Vex Marrow');
    expect(line).toMatch(/connection lost: betrayed the crew to the Syndicate/);
    expect(line).toContain('Initial disposition: friendly');
    expect(line).not.toContain('; Disposition: friendly');
  });

  it('the lost connection is listed apart from the reuse-first cast', async () => {
    await loseConnection('npc-vex', 'betrayed the crew to the Syndicate', 's1');
    const block = formatActiveSector(campaignState);
    const established = block.indexOf('Established NPCs in this sector');
    const lost        = block.indexOf('Lost connections in this sector');
    const cast        = block.indexOf('CAST DISCIPLINE');
    expect(established).toBeGreaterThan(-1);
    expect(lost).toBeGreaterThan(established);
    expect(block.indexOf('Ana Sol')).toBeGreaterThan(established);
    expect(block.indexOf('Ana Sol')).toBeLessThan(lost);
    expect(block.indexOf('Vex Marrow')).toBeGreaterThan(lost);
    expect(cast).toBeGreaterThan(lost);
  });

  it('a record lost with no recorded reason still says "connection lost"', () => {
    expect(formatSectorNpcProfile({ name: 'Kade', role: 'Fixer', active: false, history: [] }))
      .toBe('Kade — Fixer (connection lost)');
  });

  it('control: an active connection is listed with its profile', () => {
    const line = lineFor(formatActiveSector(campaignState), 'Vex Marrow');
    expect(line).toContain('Disposition: friendly');
    expect(line).not.toMatch(/lost/i);
    expect(formatActiveSector(campaignState)).not.toContain('Lost connections');
  });
});

// tests/probes/narration/sectorRosterLostConnection.probe.js
//
// PROBE (eighth audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// NR ROSTER-LOST-CONNECTION — the ACTIVE SECTOR roster offers a connection the
// table lost as ready cast, with nothing about the break.
//
// What the user does: the GM severs Vex Marrow (`!sever Vex Marrow betrayed the
// crew` → loseConnection: `active: false`, history "Connection lost: …").
// Play goes on in the same sector; a later turn needs someone to fill a role.
//
// What happens: every prose narration's [5b] ACTIVE SECTOR block
// (formatActiveSector, src/narration/narrator.js) lists every connection in
// the sector — listConnections keeps the inactive ones — as "Established NPCs
// in this sector … keep them consistent with their recorded profile", each
// line from formatSectorNpcProfile: role, goal, pronouns, *Disposition:
// friendly*, first look. Neither the lost bond nor its history is on the line,
// and the CAST DISCIPLINE paragraph right after tells the narrator to reuse
// "one of the NPCs listed above" before inventing anyone. Issue #286 C5 put a
// connection's standing on its entity card ("Status: connection lost", HISTORY)
// because "a severed connection could be written as a friend" — but a card
// renders only when the player names the NPC; the roster renders every turn.
//
// What should happen: the roster says the connection was lost (or does not
// offer it as reuse-first cast).

import { describe, it, expect, beforeEach } from 'vitest';
import { formatActiveSector } from '../../../src/narration/narrator.js';
import { loseConnection } from '../../../src/entities/connection.js';

const MODULE_ID = 'starforged-companion';

beforeEach(() => {
  game.actors._reset();
  game.actors._set('npc-vex', makeTestActor({
    id: 'npc-vex', type: 'character', name: 'Vex Marrow', ownership: { default: 3 },
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'rec-vex', name: 'Vex Marrow', role: 'Smuggler', goal: 'Clear an old debt',
      disposition: 'friendly', pronouns: 'he/him', sectorId: 'sec-1', active: true, history: [],
    } } },
  }));
});

const campaignState = {
  activeSectorId: 'sec-1',
  sectors: [{ id: 'sec-1', name: 'The Reach', mapData: { settlements: [] } }],
  connectionIds: ['npc-vex'],
};

describe('a lost connection is not offered as friendly cast', () => {
  it('after !sever, the ACTIVE SECTOR line for Vex says the connection was lost', async () => {
    await loseConnection('npc-vex', 'betrayed the crew to the Syndicate', 's1');   // the !sever writer
    const block = formatActiveSector(campaignState);
    const line = block.split('\n').find(l => l.includes('Vex Marrow'));
    expect(line).toBeDefined();
    expect(line).toMatch(/lost/i);
  });

  it('control: an active connection is listed with its profile', () => {
    const line = formatActiveSector(campaignState).split('\n').find(l => l.includes('Vex Marrow'));
    expect(line).toContain('Disposition: friendly');
  });
});

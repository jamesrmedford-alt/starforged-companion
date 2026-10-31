/**
 * PROBE — the End a Session closing vignette features a SEVERED bonded
 * connection as the crew's most personal bond.
 *
 * `!sever` (and loseConnection) set `active: false` on the record and keep
 * `bonded: true` ("the narrator stops treating them as an ally"). Priority 1 of
 * selectEndSessionNPC (src/session/endSessionVignette.js) is
 * `connections.find(c => c?.bonded === true)` with no `active` check — every
 * later priority filters `c?.active !== false`. So after a sever, the closing
 * scene is a tender slice-of-life of the person the crew just lost, framed to
 * the narrator as `bonded_connection`.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/entities/connection.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listConnections: vi.fn(() => [
    { _id: 'c-old', name: 'Vance', bonded: true,  active: false, rank: 'formidable', role: 'Mentor' },  // severed
    { _id: 'c-now', name: 'Ilse',  bonded: true,  active: true,  rank: 'dangerous',  role: 'Pilot' },
  ]),
}));
vi.mock('../../../src/world/worldJournal.js', () => ({ getActiveThreats: vi.fn(() => []) }));

import { selectEndSessionNPC } from '../../../src/session/endSessionVignette.js';

describe('PROBE END-VIGNETTE-SEVERED-BOND', () => {
  it('skips a severed (inactive) bond and features the live one', () => {
    const npc = selectEndSessionNPC({ connectionIds: ['c-old', 'c-now'] });
    expect(npc.kind).toBe('bonded_connection');
    expect(npc.name).toBe('Ilse');   // actual today: 'Vance' (severed)
  });
});

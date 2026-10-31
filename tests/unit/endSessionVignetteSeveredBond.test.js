/**
 * STARFORGED COMPANION
 * tests/unit/endSessionVignetteSeveredBond.test.js
 *
 * The End a Session closing vignette features a bond still in play, never a
 * severed one (issue #321 U61).
 *
 * `!sever` (and loseConnection) set `active: false` on the record and keep
 * `bonded: true`. selectEndSessionNPC's first priority used to be any
 * `bonded === true` connection with no `active` check — every later priority
 * filters `active !== false` — so after a sever, the closing scene was a
 * tender slice of life of the person the crew had just lost, framed to the
 * narrator as `bonded_connection`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/entities/connection.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listConnections: vi.fn(),
}));
vi.mock('../../src/world/worldJournal.js', () => ({ getActiveThreats: vi.fn(() => []) }));

import { listConnections } from '../../src/entities/connection.js';
import { selectEndSessionNPC } from '../../src/session/endSessionVignette.js';

const SEVERED = { _id: 'c-old', name: 'Vance', bonded: true, active: false, rank: 'formidable', role: 'Mentor' };

beforeEach(() => { vi.clearAllMocks(); });

describe('selectEndSessionNPC — a severed bond is not the closing vignette\'s NPC', () => {
  it('skips a severed (inactive) bond and features the live one', () => {
    listConnections.mockReturnValue([
      SEVERED,
      { _id: 'c-now', name: 'Ilse', bonded: true, active: true, rank: 'dangerous', role: 'Pilot' },
    ]);
    const npc = selectEndSessionNPC({ connectionIds: ['c-old', 'c-now'] });
    expect(npc.kind).toBe('bonded_connection');
    expect(npc.name).toBe('Ilse');
  });

  it('with only a severed bond, an active connection is featured instead', () => {
    listConnections.mockReturnValue([
      SEVERED,
      { _id: 'c-2', name: 'Doran', bonded: false, rank: 'dangerous', role: 'Broker' },
    ]);
    const npc = selectEndSessionNPC({ connectionIds: ['c-old', 'c-2'] });
    expect(npc).toMatchObject({ kind: 'connection', name: 'Doran' });
  });

  it('with only a severed bond and nothing else, the vignette falls back — never the lost NPC', () => {
    listConnections.mockReturnValue([SEVERED]);
    const npc = selectEndSessionNPC({ connectionIds: ['c-old'] });
    expect(npc.kind).toBe('fallback');
    expect(npc.name).not.toBe('Vance');
  });
});

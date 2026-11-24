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
 * narrator as `bonded_connection`. Since issue #381 a die chooses among the
 * campaign's people (chooseClosingSubject), and a severed bond is none of
 * them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/entities/connection.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listConnections: vi.fn(),
}));
vi.mock('../../src/world/worldJournal.js', () => ({ getActiveThreats: vi.fn(() => []) }));

import { listConnections } from '../../src/entities/connection.js';
import { chooseClosingSubject } from '../../src/session/endSessionVignette.js';

/** Whom the closing shows — no earlier closing, and a die that would fail if it were asked. */
const subjectOf = (state) => chooseClosingSubject(state, { messages: [], draw: () => { throw new Error('no choice to make'); } });

const SEVERED = { _id: 'c-old', name: 'Vance', bonded: true, active: false, rank: 'formidable', role: 'Mentor' };

beforeEach(() => { vi.clearAllMocks(); });

describe('the closing cutaway — a severed bond is never whom it shows', () => {
  it('skips a severed (inactive) bond and shows the live one', () => {
    listConnections.mockReturnValue([
      SEVERED,
      { _id: 'c-now', name: 'Ilse', bonded: true, active: true, rank: 'dangerous', role: 'Pilot' },
    ]);
    const { option } = subjectOf({ connectionIds: ['c-old', 'c-now'] });
    expect(option.kind).toBe('bonded_connection');
    expect(option.name).toBe('Ilse');
  });

  it('with only a severed bond, an active connection is shown instead', () => {
    listConnections.mockReturnValue([
      SEVERED,
      { _id: 'c-2', name: 'Doran', bonded: false, rank: 'dangerous', role: 'Broker' },
    ]);
    expect(subjectOf({ connectionIds: ['c-old', 'c-2'] }).option).toMatchObject({ kind: 'connection', name: 'Doran' });
  });

  it('with only a severed bond and nothing else, there is no closing — never the lost NPC', () => {
    listConnections.mockReturnValue([SEVERED]);
    expect(subjectOf({ connectionIds: ['c-old'] })).toBeNull();
  });
});

/**
 * PROBE — NARRATION-09 ACTIVE-CONNECTIONS-COUNTS-LOST
 *
 * What the user does: severs a connection (`!sever <name>`, or a failed
 * relationship) and keeps playing.
 *
 * What happens: `loseConnection` (src/entities/connection.js:302-312) sets
 * `active: false` on the record and leaves its id in
 * `campaignState.connectionIds`; the narrator prompt's [7] block
 * (`buildConnectionsSummary`, src/narration/narratorPrompt.js:2242-2250)
 * renders `connectionIds.length` as "N active connection(s) this campaign" —
 * so every prompt after a severance tells the narrator the lost connection is
 * one of the active ones, while the ACTIVE SECTOR block above it lists the
 * same NPC under "Lost connections … the bond with the crew is broken"
 * (issue #325 W37). Misleading text, by the brief's definition.
 *
 * What should happen: the count is the active connections' (W37's rule for
 * the roster: a lost connection is never offered as live cast), or the
 * legacy count-only block goes.
 *
 * Controls: with every connection active the count is right.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/narration/activeConnectionsCount.probe.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const RECORDS = {
  c1: { _id: 'rec-1', name: 'Vance Oduya', role: 'Salvager', active: true },
  c2: { _id: 'rec-2', name: 'Mira Kell',   role: 'Fixer',    active: false },
};

vi.mock('../../../src/entities/connection.js', async () => {
  const actual = await vi.importActual('../../../src/entities/connection.js');
  return {
    ...actual,
    getConnection:   vi.fn((id) => RECORDS[id] ?? null),
    listConnections: vi.fn((cs) => (cs?.connectionIds ?? []).map(id => RECORDS[id]).filter(Boolean)),
  };
});

import { buildNarratorSystemPrompt } from '../../../src/narration/narratorPrompt.js';

beforeEach(() => {
  vi.clearAllMocks();
  game.settings._store.clear();
  global.game.user = { id: 'gm-1', isGM: true };
});

describe('PROBE NARRATION-09 ACTIVE-CONNECTIONS-COUNTS-LOST', () => {
  it('a severed connection is not counted as active', () => {
    const prompt = buildNarratorSystemPrompt({ connectionIds: ['c1', 'c2'] }, {}, null, '', { mode: 'move_resolution' });
    expect(prompt).toContain('## ACTIVE CONNECTIONS');
    // Expected: the one active connection. Today: "2 active connection(s) this campaign."
    expect(prompt).toMatch(/\b1 active connection/);
    expect(prompt).not.toMatch(/\b2 active connection/);
  });

  it('control: with every connection active the count is right', () => {
    const prompt = buildNarratorSystemPrompt({ connectionIds: ['c1'] }, {}, null, '', { mode: 'move_resolution' });
    expect(prompt).toMatch(/\b1 active connection/);
  });
});

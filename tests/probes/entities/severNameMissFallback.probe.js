/**
 * PROBE — SEVER-NAME-MISS-FALLBACK
 *
 * `!sever <name>` (src/index.js handleSeverCommand → connection.js
 * loseConnection) resolves its target with selectConnection
 * (src/moves/developRelationship.js), whose ladder is exact name → substring
 * → SOLE BONDED → sole active. A name that matches nothing (a typo, a
 * connection that isn't one) falls through to the sole-bonded rung, so the
 * table's one forged bond is severed — `active:false`, a "Connection lost"
 * history entry, and a public "💔 Connection severed: <bonded NPC>" card.
 * Severance is permanent (no command re-activates a record), so a wrong
 * guess here is exactly the costly case rules/reachability.md §6 says must
 * stop before guessing.
 *
 * Correct behaviour (asserted): `!sever Vexx` — no connection is named or
 * contains "Vexx" — severs nobody; the bonded ally Mira stays active.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/moves/interpreter.js', () => ({ interpretMove: vi.fn() }));
vi.mock('../../../src/pacing/router.js',     () => ({ routePacedInput: vi.fn() }));

import { CHAT_COMMAND_ROUTES } from '../../../src/index.js';

const MODULE = 'starforged-companion';

function npc(id, name, connection) {
  const actor = global.makeTestActor({
    id, type: 'character', name,
    flags: { [MODULE]: { entityType: 'connection', entityId: `rec-${id}`,
      connection: { _id: `rec-${id}`, name, rank: 'dangerous', active: true, history: [], ...connection } } },
  });
  global.game.actors._set(id, actor);
  return actor;
}

beforeEach(() => {
  global.game.actors._reset();
  global.game.user = { isGM: true, id: 'test-user-gm' };
  global.game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  global.ChatMessage._reset();
  npc('npc-mira', 'Mira Kade',  { bonded: true });
  npc('npc-dex',  'Dex Holloway', { bonded: false });
  global.game.settings._store.set(`${MODULE}.campaignState`, { connectionIds: ['npc-mira', 'npc-dex'] });
});

describe('PROBE SEVER-NAME-MISS-FALLBACK', () => {
  it('!sever with a name that matches no connection severs nobody', async () => {
    const route = CHAT_COMMAND_ROUTES.find(r => r.name === '!sever');
    expect(route).toBeTruthy();

    await route.run({ content: '!sever Vexx', flags: {} });

    const mira = global.game.actors.get('npc-mira').flags[MODULE].connection;
    const dex  = global.game.actors.get('npc-dex').flags[MODULE].connection;
    const severedCards = global.ChatMessage._created.filter(m => m.flags?.[MODULE]?.severCommandCard);

    // Expected: nothing severed. Today Mira (the sole bonded) is.
    expect({ mira: mira.active, dex: dex.active, cards: severedCards.map(c => c.flags[MODULE].connectionName) })
      .toEqual({ mira: true, dex: true, cards: [] });
  });
});

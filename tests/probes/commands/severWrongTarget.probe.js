/**
 * PROBE — SEVER-SUBSTRING-WRONG-TARGET (eighth audit, area index-commands-hooks)
 *
 * What the user does: the GM types `!sever Lyssa Chen` to mark the NPC
 * "Dr. Lyssa Chen" lost, at a table that also has a connection named "Chen"
 * (her brother) — or `!sever Lyssa` with two connections named Lyssa.
 *
 * What happens: handleSeverCommand (src/index.js ~5505) resolves the name
 * with `selectConnection(connections, arg, { strict: true })`
 * (src/moves/developRelationship.js ~171). Strict mode drops the sole-bonded
 * fallback (issue #321 U14), but its substring rung is still bidirectional
 * and first-match: `n.includes(needle) || needle.includes(n)`. "lyssa chen"
 * contains "chen", so the brother — earlier in `connectionIds` — is severed:
 * the record goes inactive, a public "💔 Connection severed: Chen" card posts,
 * and the narrator is told he is lost. With two partial matches the first one
 * is severed with no ambiguity check. Severance is permanent (no command
 * re-activates a record), the case rules/reachability.md §6 says must "stop
 * before guessing".
 *
 * What should happen: the typed name is a fragment OF the connection's name
 * (the help: "The name must match the connection (in full or in part)"), and
 * a fragment that fits several connections severs nobody.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/commands/severWrongTarget.probe.js
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/moves/interpreter.js', () => ({ interpretMove: vi.fn() }));
vi.mock('../../../src/pacing/router.js',     () => ({ routePacedInput: vi.fn() }));

import { CHAT_COMMAND_ROUTES } from '../../../src/index.js';

const MODULE = 'starforged-companion';

function npc(id, name, connection = {}) {
  const actor = global.makeTestActor({
    id, type: 'character', name,
    flags: { [MODULE]: { entityType: 'connection', entityId: `rec-${id}`,
      connection: { _id: `rec-${id}`, name, rank: 'dangerous', active: true, history: [], ...connection } } },
  });
  global.game.actors._set(id, actor);
  return actor;
}

const sever = (content) => CHAT_COMMAND_ROUTES.find(r => r.name === '!sever').run({ content, flags: {} });
const active = (id) => global.game.actors.get(id).flags[MODULE].connection.active;
const severedNames = () => global.ChatMessage._created
  .filter(m => m.flags?.[MODULE]?.severCommandCard)
  .map(c => c.flags[MODULE].connectionName);

beforeEach(() => {
  global.game.actors._reset();
  global.game.user = { isGM: true, id: 'test-user-gm' };
  global.game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  global.ChatMessage._reset();
});

describe('PROBE SEVER-SUBSTRING-WRONG-TARGET', () => {
  it('`!sever Lyssa Chen` severs Dr. Lyssa Chen — not the connection named "Chen"', async () => {
    npc('npc-chen',  'Chen');
    npc('npc-lyssa', 'Dr. Lyssa Chen');
    global.game.settings._store.set(`${MODULE}.campaignState`, { connectionIds: ['npc-chen', 'npc-lyssa'] });

    await sever('!sever Lyssa Chen');

    // Expected: Lyssa severed, Chen untouched. Today: Chen severed, Lyssa active.
    expect({ chen: active('npc-chen'), lyssa: active('npc-lyssa'), cards: severedNames() })
      .toEqual({ chen: true, lyssa: false, cards: ['Dr. Lyssa Chen'] });
  });

  it('a fragment that fits two connections severs nobody', async () => {
    npc('npc-l1', 'Lyssa Chen');
    npc('npc-l2', 'Lyssa Okafor');
    global.game.settings._store.set(`${MODULE}.campaignState`, { connectionIds: ['npc-l1', 'npc-l2'] });

    await sever('!sever Lyssa');

    // Expected: nobody severed (ambiguous). Today: "Lyssa Chen" severed.
    expect({ l1: active('npc-l1'), l2: active('npc-l2'), cards: severedNames() })
      .toEqual({ l1: true, l2: true, cards: [] });
  });

  it('control: a unique fragment severs that connection', async () => {
    npc('npc-chen',  'Chen');
    npc('npc-lyssa', 'Dr. Lyssa Chen');
    global.game.settings._store.set(`${MODULE}.campaignState`, { connectionIds: ['npc-chen', 'npc-lyssa'] });

    await sever('!sever lyssa');

    expect({ chen: active('npc-chen'), lyssa: active('npc-lyssa'), cards: severedNames() })
      .toEqual({ chen: true, lyssa: false, cards: ['Dr. Lyssa Chen'] });
  });
});

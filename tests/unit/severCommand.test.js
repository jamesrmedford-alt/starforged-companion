/**
 * STARFORGED COMPANION
 * tests/unit/severCommand.test.js
 *
 * `!sever <name>` resolves its target strictly (issue #321 U14). Severance is
 * permanent — no command re-activates a record — so a name that matches no
 * connection severs nobody, and a bare `!sever` acts only when exactly one
 * connection is active. The develop ladder's sole-bonded fallback used to
 * sever the table's one forged bond on a typo (rules/reachability.md §6).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/moves/interpreter.js', () => ({ interpretMove: vi.fn() }));
vi.mock('../../src/pacing/router.js',     () => ({ routePacedInput: vi.fn() }));

import { CHAT_COMMAND_ROUTES } from '../../src/index.js';

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

describe('!sever resolves its target strictly', () => {
  beforeEach(() => {
    npc('npc-mira', 'Mira Kade',    { bonded: true });
    npc('npc-dex',  'Dex Holloway', { bonded: false });
    global.game.settings._store.set(`${MODULE}.campaignState`, { connectionIds: ['npc-mira', 'npc-dex'] });
  });

  it('a name that matches no connection severs nobody — not the sole bonded one', async () => {
    await sever('!sever Vexx');

    expect({ mira: active('npc-mira'), dex: active('npc-dex'), cards: severedNames() })
      .toEqual({ mira: true, dex: true, cards: [] });
  });

  it('a bare !sever with several connections active severs nobody', async () => {
    await sever('!sever');

    expect({ mira: active('npc-mira'), dex: active('npc-dex'), cards: severedNames() })
      .toEqual({ mira: true, dex: true, cards: [] });
  });

  it('control: an exact or partial name severs that connection only', async () => {
    await sever('!sever dex');

    expect({ mira: active('npc-mira'), dex: active('npc-dex'), cards: severedNames() })
      .toEqual({ mira: true, dex: false, cards: ['Dex Holloway'] });
  });
});

describe('a bare !sever with one active connection', () => {
  it('control: severs it', async () => {
    npc('npc-mira', 'Mira Kade', { bonded: true });
    npc('npc-old',  'Old Friend', { bonded: true, active: false });
    global.game.settings._store.set(`${MODULE}.campaignState`, { connectionIds: ['npc-mira', 'npc-old'] });

    await sever('!sever');

    expect({ mira: active('npc-mira'), cards: severedNames() })
      .toEqual({ mira: false, cards: ['Mira Kade'] });
  });
});

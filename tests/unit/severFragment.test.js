/**
 * STARFORGED COMPANION
 * tests/unit/severFragment.test.js
 *
 * Issue #325 W30: `!sever`'s strict mode kept the selection ladder's
 * bidirectional substring rung. `!sever Lyssa Chen` severed the connection
 * named "Chen" (earlier in the list — "lyssa chen" contains "chen"), and a
 * fragment that fit two connections severed the first. A severance is
 * permanent (a public card, the record inactive, the narrator told), so the
 * typed name is now a whole-word fragment OF the connection's name, and a
 * fragment that fits several severs nobody — the GM is told which it fits.
 *
 * The vow payoff ladder (resolveVowItemCopies) had the same rung: "Kade is
 * avenged" resolved the vow "Ade".
 *
 * Converted from the audit probe commands/severWrongTarget.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/moves/interpreter.js', () => ({ interpretMove: vi.fn() }));
vi.mock('../../src/pacing/router.js',     () => ({ routePacedInput: vi.fn() }));

import { CHAT_COMMAND_ROUTES, resolveVowItemCopies } from '../../src/index.js';

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

describe('!sever — the typed name is a fragment of one connection\'s name', () => {
  let warn;
  beforeEach(() => {
    global.game.actors._reset();
    global.game.user = { isGM: true, id: 'test-user-gm' };
    global.game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
    global.ChatMessage._reset();
    warn = vi.spyOn(global.ui.notifications, 'warn');
  });
  afterEach(() => warn.mockRestore());

  it('`!sever Lyssa Chen` severs Dr. Lyssa Chen — not the connection named "Chen"', async () => {
    npc('npc-chen',  'Chen');
    npc('npc-lyssa', 'Dr. Lyssa Chen');
    global.game.settings._store.set(`${MODULE}.campaignState`, { connectionIds: ['npc-chen', 'npc-lyssa'] });

    await sever('!sever Lyssa Chen');

    expect({ chen: active('npc-chen'), lyssa: active('npc-lyssa'), cards: severedNames() })
      .toEqual({ chen: true, lyssa: false, cards: ['Dr. Lyssa Chen'] });
  });

  it('a fragment that fits two connections severs nobody, and says which it fits', async () => {
    npc('npc-l1', 'Lyssa Chen');
    npc('npc-l2', 'Lyssa Okafor');
    global.game.settings._store.set(`${MODULE}.campaignState`, { connectionIds: ['npc-l1', 'npc-l2'] });

    await sever('!sever Lyssa');

    expect({ l1: active('npc-l1'), l2: active('npc-l2'), cards: severedNames() })
      .toEqual({ l1: true, l2: true, cards: [] });
    expect(warn.mock.calls.at(-1)?.[0]).toMatch(/fits 2 connections \(Lyssa Chen, Lyssa Okafor\).*Nobody was severed/);
  });

  it('a fragment inside another word severs nobody', async () => {
    npc('npc-ren', 'Ren');
    global.game.settings._store.set(`${MODULE}.campaignState`, { connectionIds: ['npc-ren'] });

    await sever('!sever Lorenzo');

    expect({ ren: active('npc-ren'), cards: severedNames() }).toEqual({ ren: true, cards: [] });
  });

  it('control: a unique fragment, or the exact name, severs that connection', async () => {
    npc('npc-chen',  'Chen');
    npc('npc-lyssa', 'Dr. Lyssa Chen');
    global.game.settings._store.set(`${MODULE}.campaignState`, { connectionIds: ['npc-chen', 'npc-lyssa'] });

    await sever('!sever lyssa');
    await sever('!sever Chen');

    expect({ chen: active('npc-chen'), lyssa: active('npc-lyssa'), cards: severedNames() })
      .toEqual({ chen: false, lyssa: false, cards: ['Dr. Lyssa Chen', 'Chen'] });
  });
});

describe('resolveVowItemCopies — a vow named inside another word is not that vow', () => {
  const vowItem = (id, name) => ({ id, name, type: 'progress', system: { subtype: 'vow', rank: 'dangerous', current: 0 }, flags: { [MODULE]: {} } });

  beforeEach(() => {
    global.game.actors._reset();
    global.game.actors._setAll([
      global.makeTestActor({ id: 'pc-a', name: 'Ash', items: { contents: [vowItem('v-ade', 'Ade'), vowItem('v-arc', 'Find the Archive')] } }),
    ]);
  });

  it('"Kade is avenged" resolves neither of two open vows', () => {
    expect(resolveVowItemCopies('Kade is avenged').primary).toBeNull();
  });

  it('control: a phrase naming the vow in whole words resolves it', () => {
    expect(resolveVowItemCopies('the archive').primary?.item.id).toBe('v-arc');
  });
});

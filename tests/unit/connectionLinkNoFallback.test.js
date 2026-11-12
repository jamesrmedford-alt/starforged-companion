/* global makeTestActor */
/**
 * STARFORGED COMPANION
 * tests/unit/connectionLinkNoFallback.test.js
 *
 * Known-issues DEEPEN-LINK-FALLBACK — a vow's 🤝 Deepen (the won-fight card's,
 * the fulfilment's payoff and its Retry: index.js deepenLinkedConnection)
 * found its connection by the vow's linked name through selectConnection's
 * full ladder, whose last rung is the sole bonded — else the sole active —
 * connection. A vow whose linked connection was severed or renamed deepened
 * that one instead. The link is now matched by name alone (the `strict`
 * ladder, issue #321 U14): nothing found is reported not found, for the GMs'
 * payoff card.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { deepenLinkedConnection } from '../../src/index.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';

/** An NPC card hosting a connection record (the store getConnection reads and updateConnection writes). */
function connectionCard(id, record) {
  const actor = makeTestActor({ id, name: record.name, type: 'character' });
  const flags = { [MODULE_ID]: { connection: { _id: id, history: [], active: true, ...record } } };
  actor.flags = flags;
  actor.getFlag = (mod, key) => flags[mod]?.[key];
  actor.setFlag = async (mod, key, value) => { (flags[mod] ??= {})[key] = value; };
  actor.update = async () => actor;
  game.actors._set(id, actor);
  return actor;
}
const ticks = (actor) => actor.getFlag(MODULE_ID, 'connection').relationshipTicks ?? 0;

let rook;
beforeEach(() => {
  game.actors._reset();
  game.user = { id: 'gm-1', isGM: true, active: true };
  game.users = Object.assign([game.user], { get: (id) => (id === 'gm-1' ? game.user : null) });
  game.settings._store.clear();
  rook = connectionCard('npc-rook', { name: 'Rook', rank: 'dangerous', bonded: true });
  game.settings._store.set(`${MODULE_ID}.campaignState`,
    JSON.parse(JSON.stringify({ ...CampaignStateSchema, currentSessionId: 's1', connectionIds: ['npc-rook'] })));
});

describe('a vow deepens the connection it names, or none (DEEPEN-LINK-FALLBACK)', () => {
  it('a link to a connection renamed or gone deepens nothing — not the table\'s one bond', async () => {
    const res = await deepenLinkedConnection('Vance', 1);

    expect(res).toMatchObject({ ok: false, reason: 'not-found' });
    expect(ticks(rook)).toBe(0);
  });

  it('a link to a severed connection deepens nothing — not the one still active', async () => {
    connectionCard('npc-vance', { name: 'Vance', rank: 'dangerous', bonded: true, active: false });
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    game.settings._store.set(`${MODULE_ID}.campaignState`, { ...cs, connectionIds: ['npc-rook', 'npc-vance'] });

    const res = await deepenLinkedConnection('Vance', 1);

    expect(res).toMatchObject({ ok: false, reason: 'not-found' });
    expect(ticks(rook)).toBe(0);
  });

  it('control: the connection the link names is deepened', async () => {
    const res = await deepenLinkedConnection('Rook', 1);

    expect(res).toMatchObject({ ok: true });
    expect(ticks(rook)).toBe(8);                                       // one dangerous mark
  });
});

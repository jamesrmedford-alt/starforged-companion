/**
 * STARFORGED COMPANION
 * tests/unit/cardActions.test.js
 *
 * GM-side handlers for one-shot chat-card buttons (src/moves/cardActions.js):
 *   - "connection.pick" — the connection picker posts its forced move ONCE,
 *     speaking as the clicker's PC (credit the roller), validated against the
 *     card's own choices and the requester's ownership;
 *   - "fightVow.markMilestone" / "fightVow.deepenBond" — the won-fight card's
 *     actions apply once per card (double-click / two-player idempotency).
 * Plus parseCardButtons and the relayCardAction button-honesty helper.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/index.js', () => ({
  markLinkedVowMilestone: vi.fn(async () => {}),
  deepenLinkedConnection: vi.fn(async () => {}),
}));

import {
  applyConnectionPick,
  applyFightVowMarkMilestone,
  applyFightVowDeepenBond,
  parseCardButtons,
  relayCardAction,
} from '../../src/moves/cardActions.js';
import { markLinkedVowMilestone, deepenLinkedConnection } from '../../src/index.js';
import { GM_RELAY_SOCKET, _resetGmRelayForTests } from '../../src/multiplayer/gmRelay.js';

const MODULE_ID = 'starforged-companion';
const GM = { id: 'gm-1', isGM: true,  active: true };
const P1 = { id: 'pl-1', isGM: false, active: true };
const P2 = { id: 'pl-2', isGM: false, active: true };
const GM_CTX = { requesterId: 'gm-1', requester: GM, requesterIsGM: true };
const P1_CTX = { requesterId: 'pl-1', requester: P1, requesterIsGM: false };

function setUsers(users, currentUserId) {
  global.game.users = Object.assign([...users], {
    get: (id) => users.find(u => u.id === id) ?? null,
  });
  global.game.user = users.find(u => u.id === currentUserId) ?? null;
}

function makeCard(id, flags, content = '') {
  const msg = {
    id, content,
    flags: { [MODULE_ID]: { ...flags } },
    update: vi.fn(async (changes) => {
      for (const [path, val] of Object.entries(changes)) {
        const parts = path.split('.').slice(2);   // drop "flags.<module>"
        let cur = msg.flags[MODULE_ID];
        for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {});
        cur[parts[parts.length - 1]] = val;
      }
    }),
  };
  return msg;
}

let pcA, pcB, picker, fight, messages;

beforeEach(() => {
  ChatMessage._reset();
  game.socket._reset();
  _resetGmRelayForTests();
  markLinkedVowMilestone.mockClear();
  deepenLinkedConnection.mockClear();
  pcA = makeTestActor({ id: 'pc-a', name: 'Ash' });
  pcB = makeTestActor({ id: 'pc-b', name: 'Bex' });
  pcB.ownership = { 'pl-1': 3 };
  const npc = makeTestActor({ id: 'npc-1', name: 'Kira', flags: { [MODULE_ID]: { entityType: 'connection' } } });
  game.actors._setAll([pcA, pcB, npc]);
  picker = makeCard('pick-1', {
    connectionPicker: true, pickAction: 'forge', resolved: false,
    choices: [{ hostId: 'conn-1', name: 'Kira' }, { hostId: 'conn-2', name: 'Sable' }],
  });
  fight = makeCard('fight-1', {
    fightVowCard: true, vowName: 'Find the Archive', marks: 2,
    connectionName: 'Kira', vowRank: 'formidable', actorId: 'pc-b',
  });
  messages = [picker, fight];
  game.messages = { get: (id) => messages.find(m => m.id === id) ?? null };
});

afterEach(() => {
  delete ChatMessage.getSpeaker;
});

// ─────────────────────────────────────────────────────────────────────────────
// connection.pick
// ─────────────────────────────────────────────────────────────────────────────

describe('applyConnectionPick', () => {
  beforeEach(() => setUsers([GM, P1, P2], 'gm-1'));

  it('posts the forced move once, speaking as the clicker\'s PC, and resolves the card', async () => {
    const res = await applyConnectionPick({ messageId: 'pick-1', hostId: 'conn-1', connectionName: 'Kira', actorId: 'pc-b' }, P1_CTX);
    expect(res).toEqual({ posted: true });
    expect(ChatMessage._created).toHaveLength(1);
    const posted = ChatMessage._created[0];
    expect(posted.content).toBe('Forge a bond with Kira.');
    expect(posted.speaker).toEqual({ actor: 'pc-b', alias: 'Bex' });
    expect(posted.flags[MODULE_ID]).toEqual({ bypassPacing: true, forcedMoveId: 'forge_a_bond' });
    expect(picker.flags[MODULE_ID].resolved).toBe(true);
  });

  it('uses Foundry\'s speaker builder when it is available', async () => {
    ChatMessage.getSpeaker = vi.fn(({ actor }) => ({ scene: 's1', token: null, actor: actor.id, alias: actor.name }));
    await applyConnectionPick({ messageId: 'pick-1', hostId: 'conn-2', actorId: 'pc-b' }, P1_CTX);
    expect(ChatMessage._created[0].speaker).toEqual({ scene: 's1', token: null, actor: 'pc-b', alias: 'Bex' });
    expect(ChatMessage._created[0].content).toBe('Forge a bond with Sable.');
  });

  it('a second click — by anyone — posts nothing (already resolved)', async () => {
    await applyConnectionPick({ messageId: 'pick-1', hostId: 'conn-1', actorId: 'pc-b' }, P1_CTX);
    const again = await applyConnectionPick({ messageId: 'pick-1', hostId: 'conn-2', actorId: 'pc-a' }, GM_CTX);
    expect(again).toEqual({ posted: false, reason: 'already-resolved' });
    expect(ChatMessage._created).toHaveLength(1);
  });

  it('two near-simultaneous clicks post exactly one move', async () => {
    const [a, b] = await Promise.all([
      applyConnectionPick({ messageId: 'pick-1', hostId: 'conn-1', actorId: 'pc-b' }, P1_CTX),
      applyConnectionPick({ messageId: 'pick-1', hostId: 'conn-2', actorId: 'pc-b' }, P1_CTX),
    ]);
    expect([a.posted, b.posted].filter(Boolean)).toHaveLength(1);
    expect(ChatMessage._created).toHaveLength(1);
  });

  it('refuses a connection that is not on the card', async () => {
    const res = await applyConnectionPick({ messageId: 'pick-1', hostId: 'conn-9', connectionName: 'Mallory', actorId: 'pc-b' }, P1_CTX);
    expect(res).toEqual({ posted: false, reason: 'not-on-card' });
    expect(ChatMessage._created).toHaveLength(0);
    expect(picker.flags[MODULE_ID].resolved).toBe(false);
  });

  it('refuses to speak as a PC the requester does not own', async () => {
    const res = await applyConnectionPick({ messageId: 'pick-1', hostId: 'conn-1', actorId: 'pc-a' }, P1_CTX);
    expect(res).toEqual({ posted: false, reason: 'not-owner' });
    expect(ChatMessage._created).toHaveLength(0);
  });

  it('refuses an NPC card as the speaker', async () => {
    const res = await applyConnectionPick({ messageId: 'pick-1', hostId: 'conn-1', actorId: 'npc-1' }, GM_CTX);
    expect(res).toEqual({ posted: false, reason: 'not-a-pc' });
  });

  it('a GM requester may act for any PC; no PC → posts without a speaker override', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const res = await applyConnectionPick({ messageId: 'pick-1', hostId: 'conn-1', actorId: null }, GM_CTX);
    expect(res).toEqual({ posted: true });
    expect(ChatMessage._created[0].speaker).toBeUndefined();
    expect(debug.mock.calls.some(c => /no clicker PC relayed/.test(String(c[0])))).toBe(true);
  });

  it('validates a card that predates the choices flag against its button HTML (develop)', async () => {
    const old = makeCard('pick-old', { connectionPicker: true, pickAction: 'develop', resolved: false },
      '<div><button type="button" class="sf-followup-btn" data-action="sf-connection-pick" data-host-id="conn-3" '
      + 'data-pick-action="develop" data-connection-name="Ren &amp; Co">Ren</button></div>');
    messages.push(old);
    expect((await applyConnectionPick({ messageId: 'pick-old', hostId: 'conn-1', actorId: 'pc-b' }, P1_CTX)).reason)
      .toBe('not-on-card');
    const res = await applyConnectionPick({ messageId: 'pick-old', hostId: 'conn-3', actorId: 'pc-b' }, P1_CTX);
    expect(res).toEqual({ posted: true });
    expect(ChatMessage._created[0].content).toBe('Develop my relationship with Ren & Co.');
    expect(ChatMessage._created[0].flags[MODULE_ID].forcedMoveId).toBe('develop_your_relationship');
  });

  it('leaves the card open for a retry when the forced-move post fails', async () => {
    const create = vi.spyOn(ChatMessage, 'create').mockRejectedValueOnce(new Error('offline'));
    const res = await applyConnectionPick({ messageId: 'pick-1', hostId: 'conn-1', actorId: 'pc-b' }, P1_CTX);
    expect(res).toEqual({ posted: false, reason: 'post-failed' });
    expect(picker.flags[MODULE_ID].resolved).toBe(false);
    create.mockRestore();
  });

  it('warns when the card is gone or is not a picker', async () => {
    expect((await applyConnectionPick({ messageId: 'gone' }, GM_CTX)).reason).toBe('no-message');
    expect((await applyConnectionPick({ messageId: 'fight-1' }, GM_CTX)).reason).toBe('not-a-picker');
    expect(getCapturedWarns().length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fightVow.*
// ─────────────────────────────────────────────────────────────────────────────

describe('won-fight card actions', () => {
  beforeEach(() => setUsers([GM, P1], 'gm-1'));

  it('Mark milestone applies the card\'s own values once, credited to the card\'s roller', async () => {
    const res = await applyFightVowMarkMilestone({ messageId: 'fight-1', vowName: 'forged', marks: 99 }, P1_CTX);
    expect(res).toEqual({ applied: true });
    expect(markLinkedVowMilestone).toHaveBeenCalledWith('Find the Archive', 2, 'pc-b');
    expect(fight.flags[MODULE_ID].resolvedActions.markMilestone).toBe(true);
  });

  it('a repeat Mark milestone (double-click / second player) marks nothing', async () => {
    await applyFightVowMarkMilestone({ messageId: 'fight-1' }, P1_CTX);
    const again = await applyFightVowMarkMilestone({ messageId: 'fight-1' }, GM_CTX);
    expect(again).toEqual({ applied: false, reason: 'already-resolved' });
    expect(markLinkedVowMilestone).toHaveBeenCalledTimes(1);
  });

  it('two near-simultaneous Mark milestone clicks mark once', async () => {
    await Promise.all([
      applyFightVowMarkMilestone({ messageId: 'fight-1' }, P1_CTX),
      applyFightVowMarkMilestone({ messageId: 'fight-1' }, GM_CTX),
    ]);
    expect(markLinkedVowMilestone).toHaveBeenCalledTimes(1);
  });

  it('Deepen bond deepens the card\'s connection by the vow rank\'s marks, once — independent of Mark milestone', async () => {
    await applyFightVowMarkMilestone({ messageId: 'fight-1' }, P1_CTX);
    const res = await applyFightVowDeepenBond({ messageId: 'fight-1' }, P1_CTX);
    expect(res).toEqual({ applied: true });
    expect(deepenLinkedConnection).toHaveBeenCalledTimes(1);
    expect(deepenLinkedConnection.mock.calls[0][0]).toBe('Kira');
    expect(deepenLinkedConnection.mock.calls[0][1]).toBeGreaterThan(0);
    expect((await applyFightVowDeepenBond({ messageId: 'fight-1' }, P1_CTX)).reason).toBe('already-resolved');
    expect(deepenLinkedConnection).toHaveBeenCalledTimes(1);
  });

  it('Deepen bond on a card with no linked connection warns and stays unresolved', async () => {
    const lone = makeCard('fight-2', { fightVowCard: true, vowName: 'X', marks: 1, connectionName: null });
    messages.push(lone);
    const res = await applyFightVowDeepenBond({ messageId: 'fight-2' }, GM_CTX);
    expect(res).toEqual({ applied: false, reason: 'nothing-to-apply' });
    expect(lone.flags[MODULE_ID].resolvedActions).toBeUndefined();
    expect(getCapturedWarns().some(w => /no linked connection/.test(w))).toBe(true);
  });

  it('ignores a message that is not a won-fight card', async () => {
    expect((await applyFightVowMarkMilestone({ messageId: 'pick-1' }, GM_CTX)).reason).toBe('not-a-fight-card');
    expect(markLinkedVowMilestone).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('parseCardButtons', () => {
  it('returns the camel-cased, unescaped data attributes of matching buttons only', () => {
    const html = '<p><button data-action="sf-x" data-vow-id="v1" data-actor-id="a&amp;b">One</button>'
      + '<button data-action="sf-other" data-vow-id="v2">Two</button>'
      + '<button type="button" data-action="sf-x" data-vow-id="&quot;v3&quot;">Three</button></p>';
    expect(parseCardButtons(html, 'sf-x')).toEqual([
      { action: 'sf-x', vowId: 'v1', actorId: 'a&b' },
      { action: 'sf-x', vowId: '"v3"' },
    ]);
    expect(parseCardButtons(null, 'sf-x')).toEqual([]);
  });
});

describe('relayCardAction', () => {
  it('re-arms the button when no GM is connected', async () => {
    setUsers([P1], 'pl-1');
    const restore = vi.fn();
    const res = await relayCardAction({ kind: 'connection.pick', payload: { messageId: 'pick-1' }, isResolved: () => false, restore });
    expect(res).toEqual({ ok: false, reason: 'no-gm' });
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('relays from a player and re-arms only if the card is still unresolved after the recovery window', async () => {
    vi.useFakeTimers();
    try {
      setUsers([GM, P1], 'pl-1');
      const restore = vi.fn();
      let resolved = false;
      await relayCardAction({ kind: 'connection.pick', payload: { messageId: 'pick-1', hostId: 'conn-1' }, isResolved: () => resolved, restore, recoveryMs: 1000 });
      expect(game.socket._emitted).toEqual([{
        event: GM_RELAY_SOCKET,
        payload: { kind: 'gmRelay.connection.pick', payload: { messageId: 'pick-1', hostId: 'conn-1' }, requesterId: 'pl-1' },
      }]);
      await vi.advanceTimersByTimeAsync(1000);
      expect(restore).toHaveBeenCalledTimes(1);

      restore.mockClear();
      resolved = true;
      await relayCardAction({ kind: 'connection.pick', payload: { messageId: 'pick-1' }, isResolved: () => resolved, restore, recoveryMs: 1000 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(restore).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('warns and re-arms when the card has no id', async () => {
    const restore = vi.fn();
    expect(await relayCardAction({ kind: 'connection.pick', payload: {}, isResolved: () => false, restore })).toBeNull();
    expect(restore).toHaveBeenCalledTimes(1);
  });
});

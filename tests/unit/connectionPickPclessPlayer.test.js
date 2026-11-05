/* global makeTestActor */
/**
 * STARFORGED COMPANION
 * tests/unit/connectionPickPclessPlayer.test.js
 *
 * Issue #331 X19 (CONNECTION-PICK-PCLESS-PLAYER). A player who owns no player
 * character (an observer, a player whose character is not assigned yet)
 * presses a connection on the "Which connection?" picker. Their client sends
 * `actorId: null`; applyConnectionPick refused only a PC the requester did
 * not own, so with none it posted the forced Develop / Forge — GM-authored,
 * no speaker — and the pipeline rolled it as the GM's first PC: another
 * player's character developed or forged the bond. Like every W11 handler
 * (relayedClickerPc), only a GM's press may speak as nobody (#326 D8,
 * #321 U23).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyConnectionPick } from '../../src/moves/cardActions.js';
import { _resetGmRelayForTests } from '../../src/multiplayer/gmRelay.js';

const MODULE_ID = 'starforged-companion';
const GM = { id: 'gm-1', isGM: true,  active: true };
const P1 = { id: 'pl-1', isGM: false, active: true };
const P9 = { id: 'pl-9', isGM: false, active: true };   // owns no character
const GM_CTX = { requesterId: 'gm-1', requester: GM, requesterIsGM: true };
const P1_CTX = { requesterId: 'pl-1', requester: P1, requesterIsGM: false };
const P9_CTX = { requesterId: 'pl-9', requester: P9, requesterIsGM: false };

function makeCard(id, flags) {
  const msg = {
    id, author: GM,
    flags: { [MODULE_ID]: { ...flags } },
    update: vi.fn(async (changes) => {
      for (const [path, val] of Object.entries(changes)) {
        const parts = path.split('.').slice(2);
        let cur = msg.flags[MODULE_ID];
        for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {});
        cur[parts[parts.length - 1]] = val;
      }
    }),
  };
  return msg;
}

let picker;

beforeEach(() => {
  ChatMessage._reset();
  game.socket?._reset?.();
  _resetGmRelayForTests();
  game.users = Object.assign([GM, P1, P9], { get: (id) => [GM, P1, P9].find(u => u.id === id) ?? null });
  game.user = GM;
  const pcA = makeTestActor({ id: 'pc-a', name: 'Ash' });
  const pcB = makeTestActor({ id: 'pc-b', name: 'Bex' });
  pcB.ownership = { 'pl-1': 3 };
  const npc = makeTestActor({ id: 'npc-1', name: 'Kira', flags: { [MODULE_ID]: { entityType: 'connection' } } });
  game.actors._setAll([pcA, pcB, npc]);
  picker = makeCard('pick-1', {
    connectionPicker: true, pickAction: 'develop', resolved: false,
    choices: [{ hostId: 'npc-1', name: 'Kira' }],
  });
  game.messages = { get: (id) => (id === picker.id ? picker : null) };
});

describe('X19 — a connection pick from a player with no character', () => {
  it('is refused, not rolled as the first PC', async () => {
    const res = await applyConnectionPick({ messageId: 'pick-1', hostId: 'npc-1', connectionName: 'Kira', actorId: null }, P9_CTX);

    // It was { posted: true } — a GM-authored forced move with no speaker, rolled as Ash.
    expect(res.posted).toBe(false);
    expect(res.reason).toBe('not-owner');
    expect(ChatMessage._created).toHaveLength(0);
    expect(picker.flags[MODULE_ID].resolved).toBe(false);   // left for a player with a character
  });

  it('a player\'s pick naming a PC they do not own is refused as before', async () => {
    const res = await applyConnectionPick({ messageId: 'pick-1', hostId: 'npc-1', connectionName: 'Kira', actorId: 'pc-a' }, P1_CTX);
    expect(res).toEqual({ posted: false, reason: 'not-owner' });
    expect(ChatMessage._created).toHaveLength(0);
  });

  it('a pick naming an NPC card as the clicker is refused', async () => {
    const res = await applyConnectionPick({ messageId: 'pick-1', hostId: 'npc-1', connectionName: 'Kira', actorId: 'npc-1' }, GM_CTX);
    expect(res).toEqual({ posted: false, reason: 'not-a-pc' });
  });

  it('control: a GM\'s pick with no PC is posted (the pipeline resolves the GM\'s PC)', async () => {
    const res = await applyConnectionPick({ messageId: 'pick-1', hostId: 'npc-1', connectionName: 'Kira', actorId: null }, GM_CTX);
    expect(res.posted).toBe(true);
    expect(ChatMessage._created).toHaveLength(1);
  });

  it('control: a player\'s pick for their own PC is posted as that PC', async () => {
    const res = await applyConnectionPick({ messageId: 'pick-1', hostId: 'npc-1', connectionName: 'Kira', actorId: 'pc-b' }, P1_CTX);
    expect(res.posted).toBe(true);
    expect(ChatMessage._created.at(-1).speaker.actor).toBe('pc-b');
  });
});

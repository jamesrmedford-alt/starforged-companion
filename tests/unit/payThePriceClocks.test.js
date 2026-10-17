/**
 * STARFORGED COMPANION
 * tests/unit/payThePriceClocks.test.js
 *
 * Pay the Price advances countdown clocks (src/clocks/payThePriceClocks.js).
 * A player-typed `!ptp` runs on the typist's client, which cannot write world
 * state, so the advance relays to the canonical GM through
 * GM_ACTIONS "payThePrice.advanceClocks" (before the 2026-10 audit it only
 * happened because the GM's client re-ran the whole command with its own dice).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/clocks/clocks.js', async (importOriginal) => ({
  ...(await importOriginal()),
  advanceTensionClocksForPayThePrice: vi.fn(async () => [
    { _id: 'c1', name: 'Reactor Breach', filled: 3, segments: 6, triggered: false },
  ]),
}));
vi.mock('../../src/character/actorBridge.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getPlayerActors:  vi.fn(() => []),
  advanceVowClocks: vi.fn(async () => []),
}));

import {
  advanceClocksOnPayThePrice,
  advanceClocksForPayThePriceRelay,
} from '../../src/clocks/payThePriceClocks.js';
import { advanceTensionClocksForPayThePrice } from '../../src/clocks/clocks.js';
import { requestGmAction, GM_RELAY_SOCKET } from '../../src/multiplayer/gmRelay.js';

const MODULE_ID = 'starforged-companion';
const GM     = { id: 'gm-1', isGM: true,  active: true };
const PLAYER = { id: 'pl-1', isGM: false, active: true };

function setUsers(users, currentUserId) {
  global.game.users = Object.assign([...users], {
    get: (id) => users.find(u => u.id === id) ?? null,
  });
  global.game.user = users.find(u => u.id === currentUserId) ?? null;
}

beforeEach(() => {
  ChatMessage._reset();
  game.socket._reset();
  advanceTensionClocksForPayThePrice.mockClear();
});

describe('advanceClocksOnPayThePrice', () => {
  it('advances tension clocks on a GM client and posts the clock card', async () => {
    setUsers([GM], 'gm-1');
    const advanced = await advanceClocksOnPayThePrice();
    expect(advanced).toEqual([
      { _id: 'c1', name: 'Reactor Breach', type: 'tension', filled: 3, segments: 6, triggered: false },
    ]);
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.payThePriceAdvance);
    expect(card.content).toContain('Reactor Breach — 3/6');
  });

  it('does nothing on a player client (world writes are GM-only)', async () => {
    setUsers([GM, PLAYER], 'pl-1');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    expect(await advanceClocksOnPayThePrice()).toEqual([]);
    expect(advanceTensionClocksForPayThePrice).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalled();
  });
});

describe('payThePrice.advanceClocks relay', () => {
  it('a player requests the advance over the GM relay instead of writing locally', async () => {
    setUsers([GM, PLAYER], 'pl-1');
    const res = await requestGmAction('payThePrice.advanceClocks', {});
    expect(res).toEqual({ ok: true, relayed: true });
    expect(game.socket._emitted[0]).toMatchObject({
      event:   GM_RELAY_SOCKET,
      payload: { kind: 'gmRelay.payThePrice.advanceClocks' },
    });
    expect(advanceTensionClocksForPayThePrice).not.toHaveBeenCalled();
  });

  it('the canonical GM runs the relay handler, which advances the clocks', async () => {
    setUsers([GM, PLAYER], 'gm-1');
    await advanceClocksForPayThePriceRelay({}, { requesterId: 'pl-1', requesterIsGM: false, local: false });
    expect(advanceTensionClocksForPayThePrice).toHaveBeenCalledTimes(1);
    expect(ChatMessage._created.some(m => m.flags?.[MODULE_ID]?.payThePriceAdvance)).toBe(true);
  });
});

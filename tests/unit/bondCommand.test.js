/**
 * STARFORGED COMPANION
 * tests/unit/bondCommand.test.js
 *
 * `!bond` (bonded Develop Your Relationship) after the 2026-10 multiplayer
 * split: the authoring client rolls and posts the card, then relays the world
 * writes to the canonical GM ("bond.apply" → applyBondEffects). Momentum is
 * credited to the ROLLER (the message's speaker), not the GM's character or
 * the first PC.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/moves/resolver.js', async (importOriginal) => ({
  ...(await importOriginal()),
  rollActionDie:     vi.fn(() => 6),
  rollChallengeDice: vi.fn(() => [1, 2]),
}));
vi.mock('../../src/entities/connection.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getConnection:    vi.fn(),
  updateConnection: vi.fn(async () => {}),
}));

import { handleBondCommand, applyBondEffects } from '../../src/moves/bondCommand.js';
import { rollActionDie, rollChallengeDice } from '../../src/moves/resolver.js';
import { getConnection, updateConnection } from '../../src/entities/connection.js';
import { GM_RELAY_SOCKET } from '../../src/multiplayer/gmRelay.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const GM = { id: 'gm-1', isGM: true,  active: true };
const P1 = { id: 'pl-1', isGM: false, active: true };

function setUsers(users, currentUserId) {
  global.game.users = Object.assign([...users], {
    get: (id) => users.find(u => u.id === id) ?? null,
  });
  global.game.user = users.find(u => u.id === currentUserId) ?? null;
}

function state() {
  return game.settings._store.get(`${MODULE_ID}.campaignState`);
}

let pcA, pcB;

beforeEach(() => {
  ChatMessage._reset();
  game.socket._reset();
  updateConnection.mockClear();
  rollActionDie.mockReturnValue(6);
  rollChallengeDice.mockReturnValue([1, 2]);
  pcA = makeTestActor({ id: 'pc-a', name: 'Ash' });
  pcB = makeTestActor({ id: 'pc-b', name: 'Bex' });
  game.actors._setAll([pcA, pcB]);
  getConnection.mockImplementation((hostId) => hostId === 'conn-1'
    ? { name: 'Sable', rank: 'dangerous', bonded: true, active: true }
    : null);
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    ...CampaignStateSchema, connectionIds: ['conn-1'], legacyTracks: {},
  });
});

describe('handleBondCommand — author client', () => {
  it('posts the card and relays a strong hit\'s legacy ticks to the GM (player client)', async () => {
    setUsers([GM, P1], 'pl-1');
    await handleBondCommand({ content: '!bond Sable', author: { id: 'pl-1' } });

    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.bondCommandCard);
    expect(card.content).toMatch(/Strong hit/);
    // The player client must not write world state itself.
    expect(state().legacyTracks.bonds).toBeUndefined();

    expect(game.socket._emitted).toHaveLength(1);
    const { event, payload } = game.socket._emitted[0];
    expect(event).toBe(GM_RELAY_SOCKET);
    expect(payload.kind).toBe('gmRelay.bond.apply');
    expect(payload.requesterId).toBe('pl-1');
    expect(payload.payload).toMatchObject({ ticksOnBonds: 2, momentumChange: 0, raiseRank: false });
  });

  it('credits a weak hit\'s momentum to the speaking PC, not the first PC', async () => {
    setUsers([GM, P1], 'pl-1');
    rollActionDie.mockReturnValue(3);          // 3 + 2 (dangerous) = 5
    rollChallengeDice.mockReturnValue([4, 9]); // beats one → weak hit
    await handleBondCommand({ content: '!bond Sable', author: { id: 'pl-1' }, speaker: { actor: 'pc-b' } });

    const relayed = game.socket._emitted[0].payload.payload;
    expect(relayed).toMatchObject({ momentumChange: 2, ticksOnBonds: 0, actorId: 'pc-b' });
  });

  it('a hit with a match relays the rank raise with the target host id', async () => {
    setUsers([GM, P1], 'pl-1');
    rollChallengeDice.mockReturnValue([3, 3]);
    await handleBondCommand({ content: '!bond Sable', author: { id: 'pl-1' } });
    const relayed = game.socket._emitted[0].payload.payload;
    expect(relayed).toMatchObject({ raiseRank: true, targetHostId: 'conn-1', targetName: 'Sable', raisedRank: 'formidable' });
  });

  it('a miss relays nothing', async () => {
    setUsers([GM, P1], 'pl-1');
    rollActionDie.mockReturnValue(1);
    rollChallengeDice.mockReturnValue([9, 10]);
    await handleBondCommand({ content: '!bond Sable', author: { id: 'pl-1' } });
    expect(game.socket._emitted ?? []).toHaveLength(0);
  });

  it('on the canonical GM the effects apply locally (no socket)', async () => {
    setUsers([GM, P1], 'gm-1');
    await handleBondCommand({ content: '!bond Sable', author: { id: 'gm-1' } });
    expect(game.socket._emitted ?? []).toHaveLength(0);
    expect(state().legacyTracks.bonds.ticks).toBe(2);
  });

  it('bad usage posts the usage card and relays nothing', async () => {
    setUsers([GM, P1], 'pl-1');
    getConnection.mockReturnValue(null);
    await handleBondCommand({ content: '!bond', author: { id: 'pl-1' } });
    expect(ChatMessage._created[0].content).toMatch(/Usage/);
    expect(game.socket._emitted ?? []).toHaveLength(0);
  });
});

describe('applyBondEffects — canonical GM handler', () => {
  beforeEach(() => setUsers([GM, P1], 'gm-1'));

  it('marks bonds legacy ticks', async () => {
    await applyBondEffects({ ticksOnBonds: 2 }, { requesterIsGM: false });
    expect(state().legacyTracks.bonds.ticks).toBe(2);
  });

  it('gives momentum to the relayed roller', async () => {
    await applyBondEffects({ momentumChange: 2, actorId: 'pc-b' }, {});
    expect(pcB._updateHistory.some(u => u['system.momentum.value'] === 4)).toBe(true);
    expect(pcA._updateHistory).toHaveLength(0);
  });

  it('falls back to the first PC when the roller is unknown', async () => {
    await applyBondEffects({ momentumChange: 2, actorId: null }, {});
    expect(pcA._updateHistory.some(u => u['system.momentum.value'] === 4)).toBe(true);
  });

  it('raises the connection rank', async () => {
    await applyBondEffects({ raiseRank: true, targetHostId: 'conn-1', targetName: 'Sable', raisedRank: 'formidable' }, {});
    expect(updateConnection).toHaveBeenCalledWith('conn-1', { rank: 'formidable' });
  });

  it('refuses a malformed rank raise with a warning', async () => {
    const warn = vi.spyOn(console, 'warn');
    await applyBondEffects({ raiseRank: true, targetHostId: 'conn-1', raisedRank: 'legendary' }, {});
    expect(updateConnection).not.toHaveBeenCalled();
    expect(warn.mock.calls.some(c => /rank raise requested without a valid/.test(String(c[0])))).toBe(true);
  });
});

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
    ? { _id: 'rec-sable', name: 'Sable', rank: 'dangerous', bonded: true, active: true }
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

  // Issue #311 P01: an action roll, so the roller's negative momentum cancels a
  // matching die — the full 3 counted, a strong hit where the score is 2.
  it("the roller's negative momentum cancels a matching action die", async () => {
    setUsers([GM, P1], 'pl-1');
    pcB.system.momentum.value = -3;
    rollActionDie.mockReturnValue(3);          // cancelled: 0 + 2 (dangerous) = 2
    rollChallengeDice.mockReturnValue([1, 4]); // beats 1 only → weak hit (5 would beat both)
    await handleBondCommand({ content: '!bond Sable', author: { id: 'pl-1' }, speaker: { actor: 'pc-b' } });

    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.bondCommandCard);
    expect(card.content).toMatch(/<s>3<\/s> \(cancelled by momentum -3\) \+ 2 = <strong>2<\/strong>/);
    expect(card.content).toMatch(/Weak hit/);
    expect(game.socket._emitted[0].payload.payload).toMatchObject({ momentumChange: 2, actorId: 'pc-b' });
  });

  it("a negative momentum that does not match the die leaves it", async () => {
    setUsers([GM, P1], 'pl-1');
    pcB.system.momentum.value = -2;
    rollActionDie.mockReturnValue(3);
    rollChallengeDice.mockReturnValue([1, 4]);
    await handleBondCommand({ content: '!bond Sable', author: { id: 'pl-1' }, speaker: { actor: 'pc-b' } });
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.bondCommandCard);
    expect(card.content).toMatch(/Action: 3 \+ 2 = <strong>5<\/strong>/);
    expect(card.content).toMatch(/Strong hit/);
  });

  it('a hit with a match relays the rank raise with the target host id', async () => {
    setUsers([GM, P1], 'pl-1');
    rollChallengeDice.mockReturnValue([3, 3]);
    await handleBondCommand({ content: '!bond Sable', author: { id: 'pl-1' } });
    const relayed = game.socket._emitted[0].payload.payload;
    expect(relayed).toMatchObject({ raiseRank: true, targetHostId: 'conn-1', raisedRank: 'formidable' });
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
    pcB.ownership = { 'pl-1': 3 };
    await applyBondEffects({ momentumChange: 2, actorId: 'pc-b' }, { requesterId: 'pl-1', requester: P1, requesterIsGM: false });
    expect(pcB._updateHistory.some(u => u['system.momentum.value'] === 4)).toBe(true);
    expect(pcA._updateHistory).toHaveLength(0);
  });

  it('falls back to the first PC when the roller is unknown (GM requester)', async () => {
    await applyBondEffects({ momentumChange: 2, actorId: null }, { requesterId: 'gm-1', requester: GM, requesterIsGM: true });
    expect(pcA._updateHistory.some(u => u['system.momentum.value'] === 4)).toBe(true);
  });

  it('refuses momentum for a PC the requester does not own', async () => {
    pcB.ownership = { 'pl-2': 3 };
    await applyBondEffects({ momentumChange: 2, actorId: 'pc-b' }, { requesterId: 'pl-1', requester: P1, requesterIsGM: false });
    expect(pcB._updateHistory).toHaveLength(0);
    expect(getCapturedWarns().some(w => /does not own Bex — momentum refused/.test(w))).toBe(true);
  });

  it('clamps an inflated legacy-tick payload to the legal 2 ticks', async () => {
    await applyBondEffects({ ticksOnBonds: 40 }, { requesterIsGM: false });
    expect(state().legacyTracks.bonds.ticks).toBe(2);
    expect(getCapturedWarns().some(w => /ticksOnBonds=40 is not a legal roll result/.test(w))).toBe(true);
  });

  it('clamps an inflated momentum payload to +2', async () => {
    await applyBondEffects({ momentumChange: 10, actorId: 'pc-a' }, { requesterIsGM: true });
    expect(pcA._updateHistory.some(u => u['system.momentum.value'] === 4)).toBe(true);
  });

  it('refuses a payload asking for both legacy ticks and momentum', async () => {
    const res = await applyBondEffects({ ticksOnBonds: 2, momentumChange: 2, actorId: 'pc-a' }, { requesterIsGM: true });
    expect(res).toEqual({ applied: false, reason: 'invalid' });
    expect(state().legacyTracks.bonds).toBeUndefined();
    expect(pcA._updateHistory).toHaveLength(0);
  });

  it('refuses a rank raise that skips a rank (not the connection\'s next rank)', async () => {
    await applyBondEffects({ raiseRank: true, targetHostId: 'conn-1', targetName: 'Sable', raisedRank: 'epic' }, {});
    expect(updateConnection).not.toHaveBeenCalled();
    expect(getCapturedWarns().some(w => /is not the next rank of bonded connection/.test(w))).toBe(true);
  });

  it('a non-boolean raiseRank is not a raise', async () => {
    const res = await applyBondEffects({ raiseRank: 'yes', targetHostId: 'conn-1', raisedRank: 'formidable' }, {});
    expect(res).toEqual({ applied: false });
    expect(updateConnection).not.toHaveBeenCalled();
  });

  it('raises the connection rank', async () => {
    await applyBondEffects({ raiseRank: true, targetHostId: 'conn-1', raisedRank: 'formidable' }, {});
    expect(updateConnection).toHaveBeenCalledWith('conn-1', { rank: 'formidable' });
  });

  // Issue #314 Q04: the mirror was keyed by the host Actor id, which no Item
  // carries, and a name match wrote a same-named sibling's Item.
  it("mirrors the rank onto the Item keyed by the record's _id — renamed or not — and leaves a same-named sibling's Item alone", async () => {
    const bondItem = (id, name, connectionId) => ({
      id, name, type: 'progress', system: { subtype: 'bond', current: 0, rank: 'dangerous' },
      flags: { [MODULE_ID]: { connectionId } },
      update: vi.fn(async function (c) { this.system.rank = c['system.rank']; }),
    });
    const sable   = bondItem('b-sable',   'Old Sable', 'rec-sable');    // the record's, named before a rename
    const sibling = bondItem('b-sibling', 'Sable',     'rec-other');    // another Sable's
    pcA.items = { contents: [sable, sibling] };

    await applyBondEffects({ raiseRank: true, targetHostId: 'conn-1', raisedRank: 'formidable' }, {});

    expect(sable.system.rank).toBe('formidable');
    expect(sibling.system.rank).toBe('dangerous');
    expect(sibling.update).not.toHaveBeenCalled();
  });

  it('refuses a malformed rank raise with a warning', async () => {
    const warn = vi.spyOn(console, 'warn');
    await applyBondEffects({ raiseRank: true, targetHostId: 'conn-1', raisedRank: 'legendary' }, {});
    expect(updateConnection).not.toHaveBeenCalled();
    expect(warn.mock.calls.some(c => /rank raise requested without a valid/.test(String(c[0])))).toBe(true);
  });
});

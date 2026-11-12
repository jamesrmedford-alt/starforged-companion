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
    // The roll's result, not its effects: the GM pays it from the shared table.
    expect(payload.payload).toMatchObject({ outcome: 'strong_hit', isMatch: false, targetHostId: null, raisedRank: null });
    expect(payload.payload).not.toHaveProperty('ticksOnBonds');
  });

  it('credits a weak hit\'s momentum to the speaking PC, not the first PC', async () => {
    setUsers([GM, P1], 'pl-1');
    rollActionDie.mockReturnValue(3);          // 3 + 2 (dangerous) = 5
    rollChallengeDice.mockReturnValue([4, 9]); // beats one → weak hit
    await handleBondCommand({ content: '!bond Sable', author: { id: 'pl-1' }, speaker: { actor: 'pc-b' } });

    const relayed = game.socket._emitted[0].payload.payload;
    expect(relayed).toMatchObject({ outcome: 'weak_hit', actorId: 'pc-b' });
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
    expect(game.socket._emitted[0].payload.payload).toMatchObject({ outcome: 'weak_hit', actorId: 'pc-b' });
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

  it('a strong hit with a match relays the rank raise with the target host id', async () => {
    setUsers([GM, P1], 'pl-1');
    rollChallengeDice.mockReturnValue([3, 3]);
    await handleBondCommand({ content: '!bond Sable', author: { id: 'pl-1' } });
    const relayed = game.socket._emitted[0].payload.payload;
    expect(relayed).toMatchObject({ outcome: 'strong_hit', isMatch: true, targetHostId: 'conn-1', raisedRank: 'formidable' });
    expect(ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.bondCommandCard).content).toMatch(/rank rises to <strong>formidable/);
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

  // Known-issues BOND-COMMAND-FALLBACK: a typed name matched by none of the
  // bonds fell to selectConnection's sole-bond rung — `!bond Vexx` at a
  // one-bond table rolled with Sable and the warning never fired. The name
  // is matched by itself alone (`strict`, issue #321 U14's rung).
  it('a name no bond matches warns and rolls nothing with the table\'s one bond', async () => {
    setUsers([GM, P1], 'pl-1');
    const warn = vi.spyOn(ui.notifications, 'warn');
    try {
      await handleBondCommand({ content: '!bond Vexx', author: { id: 'pl-1' } });

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no bonded connection matched "Vexx"'));
      expect(ChatMessage._created[0].content).toMatch(/Usage/);
      expect(ChatMessage._created.find(m => /Strong hit|Weak hit|Miss/.test(m.content ?? ''))).toBeUndefined();
      expect(game.socket._emitted ?? []).toHaveLength(0);
    } finally {
      warn.mockRestore();
    }
  });

  it('control: a name part of the bond\'s own still finds it', async () => {
    setUsers([GM, P1], 'pl-1');
    getConnection.mockImplementation((hostId) => hostId === 'conn-1'
      ? { _id: 'rec-sable', name: 'Captain Sable', rank: 'dangerous', bonded: true, active: true }
      : null);
    await handleBondCommand({ content: '!bond Sable', author: { id: 'pl-1' } });

    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.bondCommandCard);
    expect(card.content).toContain('bonded: Captain Sable, dangerous');
    expect(game.socket._emitted[0].payload.payload).toMatchObject({ outcome: 'strong_hit' });
  });
});

describe('applyBondEffects — canonical GM handler', () => {
  beforeEach(() => setUsers([GM, P1], 'gm-1'));

  it("pays a strong hit's bonds legacy ticks from the shared table", async () => {
    await applyBondEffects({ outcome: 'strong_hit', isMatch: false }, { requesterIsGM: false });
    expect(state().legacyTracks.bonds.ticks).toBe(2);
  });

  it("gives a weak hit's +2 momentum to the relayed roller, and no ticks", async () => {
    pcB.ownership = { 'pl-1': 3 };
    await applyBondEffects({ outcome: 'weak_hit', actorId: 'pc-b' }, { requesterId: 'pl-1', requester: P1, requesterIsGM: false });
    expect(pcB._updateHistory.some(u => u['system.momentum.value'] === 4)).toBe(true);
    expect(pcA._updateHistory).toHaveLength(0);
    expect(state().legacyTracks.bonds).toBeUndefined();
  });

  it('falls back to the first PC when the roller is unknown (GM requester)', async () => {
    await applyBondEffects({ outcome: 'weak_hit', actorId: null }, { requesterId: 'gm-1', requester: GM, requesterIsGM: true });
    expect(pcA._updateHistory.some(u => u['system.momentum.value'] === 4)).toBe(true);
  });

  it('refuses momentum for a PC the requester does not own', async () => {
    pcB.ownership = { 'pl-2': 3 };
    await applyBondEffects({ outcome: 'weak_hit', actorId: 'pc-b' }, { requesterId: 'pl-1', requester: P1, requesterIsGM: false });
    expect(pcB._updateHistory).toHaveLength(0);
    expect(getCapturedWarns().some(w => /does not own Bex — momentum refused/.test(w))).toBe(true);
  });

  it('a miss pays nothing', async () => {
    const res = await applyBondEffects({ outcome: 'miss', isMatch: true, actorId: 'pc-a' }, { requesterIsGM: true });
    expect(res).toEqual({ applied: false });
    expect(state().legacyTracks.bonds).toBeUndefined();
    expect(pcA._updateHistory).toHaveLength(0);
  });

  // Issue #322 V01: the old payload named its effects and the clamp turned any
  // tick count into 2. Now the payload names a roll result and the table pays
  // it, so no request asks for more — or for ticks and momentum together.
  it('effects named in the payload are ignored: the outcome is paid from the table', async () => {
    await applyBondEffects({ outcome: 'strong_hit', ticksOnBonds: 40, momentumChange: 10, actorId: 'pc-a' }, { requesterIsGM: true });
    expect(state().legacyTracks.bonds.ticks).toBe(2);
    // No momentum: the only write to the PC is the two ticks on its sheet's
    // bonds legacy (the shared track mirrored — issue #326 D3).
    expect(pcA._updateHistory).toEqual([{ 'system.legacies.bonds': 2 }]);
  });

  it.each([
    [{ ticksOnBonds: 2 }],
    [{ outcome: 'great_hit' }],
    [{ outcome: 'toString' }],
    [{ outcome: null, momentumChange: 2, actorId: 'pc-a' }],
  ])('refuses a payload whose outcome is not a roll result: %j', async (payload) => {
    const res = await applyBondEffects(payload, { requesterIsGM: true });
    expect(res).toEqual({ applied: false, reason: 'invalid' });
    expect(state().legacyTracks.bonds).toBeUndefined();
    expect(pcA._updateHistory).toHaveLength(0);
    expect(getCapturedWarns().some(w => /is not a roll result — refused/.test(w))).toBe(true);
  });

  it('refuses a rank raise that skips a rank (not the connection\'s next rank)', async () => {
    await applyBondEffects({ outcome: 'strong_hit', isMatch: true, targetHostId: 'conn-1', raisedRank: 'epic' }, {});
    expect(updateConnection).not.toHaveBeenCalled();
    expect(getCapturedWarns().some(w => /is not the next rank of bonded connection/.test(w))).toBe(true);
  });

  it('a non-boolean match is not a match: no raise', async () => {
    await applyBondEffects({ outcome: 'strong_hit', isMatch: 'yes', targetHostId: 'conn-1', raisedRank: 'formidable' }, {});
    expect(updateConnection).not.toHaveBeenCalled();
    expect(state().legacyTracks.bonds.ticks).toBe(2);
  });

  it('raises the connection rank on a strong hit with a match', async () => {
    await applyBondEffects({ outcome: 'strong_hit', isMatch: true, targetHostId: 'conn-1', raisedRank: 'formidable' }, {});
    expect(updateConnection).toHaveBeenCalledWith('conn-1', { rank: 'formidable' });
  });

  it('a weak hit raises no rank, whatever the payload says', async () => {
    await applyBondEffects({ outcome: 'weak_hit', isMatch: true, targetHostId: 'conn-1', raisedRank: 'formidable', actorId: 'pc-a' }, { requesterIsGM: true });
    expect(updateConnection).not.toHaveBeenCalled();
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

    await applyBondEffects({ outcome: 'strong_hit', isMatch: true, targetHostId: 'conn-1', raisedRank: 'formidable' }, {});

    expect(sable.system.rank).toBe('formidable');
    expect(sibling.system.rank).toBe('dangerous');
    expect(sibling.update).not.toHaveBeenCalled();
  });

  it('refuses a malformed rank raise with a warning', async () => {
    const warn = vi.spyOn(console, 'warn');
    await applyBondEffects({ outcome: 'strong_hit', isMatch: true, targetHostId: 'conn-1', raisedRank: 'legendary' }, {});
    expect(updateConnection).not.toHaveBeenCalled();
    expect(warn.mock.calls.some(c => /rank raise requested without a valid/.test(String(c[0])))).toBe(true);
  });
});

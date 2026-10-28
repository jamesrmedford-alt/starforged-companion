/**
 * STARFORGED COMPANION
 * tests/unit/nativePayoffOnce.test.js
 *
 * Issue #306 R04 — a vow fulfilled on the foundry-ironsworn sheet is paid by
 * payFulfilledVowNative (the Quests legacy, the linked connection, the
 * promised reward), once per vow through its `fulfilPaid` flag. The flag lands
 * only when its write returns, so two fulfilments of one vow arriving
 * together — a duplicate sheet roll — both passed the check and both paid:
 * twice the legacy, and the XP of a box it filled. A claim taken before the
 * first await now pays once. payForgedBondNative had the same race on
 * `bonded` (the bonds legacy, twice).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { payFulfilledVowNative, payForgedBondNative } from '../../src/index.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const legacy = (track) => game.settings.get(MODULE_ID, 'campaignState').legacyTracks?.[track]?.ticks ?? 0;

beforeEach(() => {
  game.actors._reset();
  game.user = { id: 'gm-1', isGM: true, active: true };
  game.users = Object.assign([game.user], { get: (id) => (id === 'gm-1' ? game.user : null) });
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.campaignState`, structuredClone({ ...CampaignStateSchema, currentSessionId: 's1' }));
});

/** A completed vow Item whose fulfilPaid write is held until `gate` resolves. */
function heldVow(actor, id, name, gate) {
  const vow = {
    id, name, type: 'progress',
    system: { subtype: 'vow', rank: 'dangerous', current: 40, completed: true },
    flags: { [MODULE_ID]: { vowId: id } },
    setFlag: async (mod, key, value) => { await gate; vow.flags[mod][key] = value; },
  };
  actor.items.contents.push(vow);
  return vow;
}

function pc(id) {
  const actor = makeTestActor({ id, name: id, items: { contents: [] } });
  game.actors._set(id, actor);
  return actor;
}

describe('a native vow fulfilment pays once (issue #306 R04)', () => {
  it('two fulfilments of one vow that overlap pay the Quests legacy once', async () => {
    const actor = pc('pc-a');
    const gate = deferred();
    heldVow(actor, 'v1', 'Find the archive', gate.promise);

    const one = payFulfilledVowNative('Find the archive', 'strong_hit', { actorId: 'pc-a' });
    const two = payFulfilledVowNative('Find the archive', 'strong_hit', { actorId: 'pc-a' });
    gate.resolve();
    await Promise.all([one, two]);

    expect(legacy('quests')).toBe(2);           // a dangerous vow, strong hit: one payment
  });

  it('two different vows that overlap are both paid', async () => {
    const actor = pc('pc-a');
    const gate = deferred();
    heldVow(actor, 'v1', 'Find the archive', gate.promise);
    heldVow(actor, 'v2', 'Avenge Kade', gate.promise);

    const one = payFulfilledVowNative('Find the archive', 'strong_hit', { actorId: 'pc-a' });
    const two = payFulfilledVowNative('Avenge Kade', 'strong_hit', { actorId: 'pc-a' });
    gate.resolve();
    await Promise.all([one, two]);

    expect(legacy('quests')).toBe(4);
  });

  it('a fulfilment after the first has finished pays nothing — the paid flag', async () => {
    const actor = pc('pc-a');
    heldVow(actor, 'v1', 'Find the archive', Promise.resolve());

    await payFulfilledVowNative('Find the archive', 'strong_hit', { actorId: 'pc-a' });
    await payFulfilledVowNative('Find the archive', 'strong_hit', { actorId: 'pc-a' });

    expect(legacy('quests')).toBe(2);
  });

  it('the legacy is written on a copy — a refused write leaves the cached campaign as it was', async () => {
    const actor = pc('pc-a');
    heldVow(actor, 'v1', 'Find the archive', Promise.resolve());
    const cached = game.settings.get(MODULE_ID, 'campaignState');
    const set = vi.spyOn(game.settings, 'set').mockRejectedValueOnce(new Error('refused'));

    await payFulfilledVowNative('Find the archive', 'strong_hit', { actorId: 'pc-a' });

    expect(set).toHaveBeenCalled();
    expect(cached.legacyTracks?.quests?.ticks ?? 0).toBe(0);
  });
});

describe('a native Forge a Bond pays once (issue #306 R04, the same race on `bonded`)', () => {
  let rook, held, writes;

  // A connection is hosted on its NPC card (an Actor) — the real store
  // getConnection / forgeBond read and write. Its first write is held until
  // `held` resolves, so a second forging can arrive before the bond lands.
  beforeEach(() => {
    held = null;
    writes = 0;
    rook = makeTestActor({ id: 'npc-rook', name: 'Rook', type: 'character' });
    const flags = { [MODULE_ID]: { connection: { _id: 'npc-rook', name: 'Rook', rank: 'dangerous', bonded: false, active: true, history: [] } } };
    rook.flags = flags;
    rook.getFlag = (mod, key) => flags[mod]?.[key];
    rook.setFlag = async (mod, key, value) => {
      writes += 1;
      if (writes === 1) await held;
      (flags[mod] ??= {})[key] = value;
    };
    game.actors._set(rook.id, rook);
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    game.settings._store.set(`${MODULE_ID}.campaignState`, { ...cs, connectionIds: ['npc-rook'] });
  });

  it('two forgings of one bond that overlap pay the bonds legacy once', async () => {
    const gate = deferred();
    held = gate.promise;

    const one = payForgedBondNative('Rook');
    const two = payForgedBondNative('Rook');
    gate.resolve();
    await Promise.all([one, two]);

    expect(rook.getFlag(MODULE_ID, 'connection').bonded).toBe(true);
    expect(legacy('bonds')).toBe(2);
  });

  it('a forging after the bond has formed pays nothing', async () => {
    await payForgedBondNative('Rook');
    await payForgedBondNative('Rook');
    expect(legacy('bonds')).toBe(2);
  });
});

/**
 * STARFORGED COMPANION
 * tests/unit/actorEntitySync.test.js
 *
 * v1.7.10 playtest findings #2 and #5 (resolution half):
 *
 * - syncEntityRecordNameOnUpdate — the updateActor hook handler that mirrors
 *   Actor renames into the entity flag record (the Entities panel and
 *   narrator context read the record's denormalised name; before this hook
 *   a rename left the registration-time snapshot in place).
 *
 * - resolveCurrentLocationName — `!at <name>` resolution. Settlements /
 *   locations / planets are Actor-hosted post-migration; the original
 *   journal-page read never matched them, so `!at` reported "not found"
 *   for every sector-created place.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Same heavy-dependency mocks the other index.js test files use — the chat
// pipeline is irrelevant here, but importing index.js pulls it in.
vi.mock('../../src/moves/interpreter.js', () => ({
  interpretMove: vi.fn(),
}));
vi.mock('../../src/pacing/router.js', () => ({
  routePacedInput: vi.fn(),
}));

import {
  syncEntityRecordNameOnUpdate,
  resolveCurrentLocationName,
} from '../../src/index.js';

const MODULE = 'starforged-companion';

beforeEach(() => {
  global.game.actors._reset();
  // Canonical GM: setup.js seeds game.users with the single active GM
  // 'test-user-gm' and game.user matches — restore in case a test changed it.
  global.game.user = { isGM: true, id: 'test-user-gm' };
  global.game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
});

describe('syncEntityRecordNameOnUpdate', () => {
  function npcCard(id, recordName) {
    const actor = global.makeTestActor({
      id, type: 'character', name: recordName,
      flags: { [MODULE]: { entityType: 'connection', connection: { _id: `rec-${id}`, name: recordName } } },
    });
    global.game.actors._set(id, actor);
    return actor;
  }

  it('mirrors a rename into the entity flag record', async () => {
    const actor = npcCard('npc-1', 'Ship');
    actor.name = 'Kobayashi 8';   // Foundry applies the change before updateActor fires

    syncEntityRecordNameOnUpdate(actor, { name: 'Kobayashi 8' }, {}, 'test-user-gm');
    await Promise.resolve();      // flag write is fire-and-forget

    expect(actor.flags[MODULE].connection.name).toBe('Kobayashi 8');
    expect(actor.flags[MODULE].connection.updatedAt).toBeTruthy();
  });

  it('ignores updates that do not change the name', () => {
    const actor = npcCard('npc-2', 'Sable');
    actor.update = vi.fn();

    syncEntityRecordNameOnUpdate(actor, { system: { biography: 'x' } }, {}, 'test-user-gm');
    expect(actor.update).not.toHaveBeenCalled();
  });

  it('ignores PCs and journal-hosted entity types', () => {
    const pc = global.makeTestActor({ id: 'pc-1', type: 'character', name: 'Kayla', flags: {} });
    pc.update = vi.fn();
    syncEntityRecordNameOnUpdate(pc, { name: 'Kayla Vayan' }, {}, 'test-user-gm');
    expect(pc.update).not.toHaveBeenCalled();

    const faction = global.makeTestActor({
      id: 'f-1', type: 'character', name: 'Old',
      flags: { [MODULE]: { entityType: 'faction', faction: { name: 'Old' } } },
    });
    faction.update = vi.fn();
    syncEntityRecordNameOnUpdate(faction, { name: 'New' }, {}, 'test-user-gm');
    expect(faction.update).not.toHaveBeenCalled();
  });

  it('does not recurse: the echo update carries no name key', async () => {
    const actor = npcCard('npc-3', 'Ship');
    actor.name = 'Kobayashi 8';
    const realUpdate = actor.update.bind(actor);
    const updateSpy = vi.fn(realUpdate);
    actor.update = updateSpy;

    syncEntityRecordNameOnUpdate(actor, { name: 'Kobayashi 8' }, {}, 'test-user-gm');
    await Promise.resolve();
    // Simulate the echo updateActor for the flag write — no `name` in changes.
    syncEntityRecordNameOnUpdate(actor, updateSpy.mock.calls[0][0], {}, 'test-user-gm');
    await Promise.resolve();

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('is canonical-GM gated', () => {
    global.game.user = { isGM: false, id: 'player-1' };
    const actor = npcCard('npc-4', 'Ship');
    actor.update = vi.fn();

    syncEntityRecordNameOnUpdate(actor, { name: 'Renamed' }, {}, 'player-1');
    expect(actor.update).not.toHaveBeenCalled();
  });
});

describe('resolveCurrentLocationName — actor-hosted reads (finding #5)', () => {
  function hostSettlement(id, name) {
    global.game.actors._set(id, global.makeTestActor({
      id, type: 'location', name,
      flags: { [MODULE]: { entityType: 'settlement', settlement: { _id: `rec-${id}`, name } } },
    }));
  }

  it('resolves an actor-hosted settlement by exact name', () => {
    hostSettlement('actor-astra', 'Astra');
    const match = resolveCurrentLocationName('Astra', { settlementIds: ['actor-astra'] });
    expect(match?.id).toBe('actor-astra');
    expect(match?.type).toBe('settlement');
    expect(match?.entity.name).toBe('Astra');
  });

  it('falls through exact → prefix → substring', () => {
    hostSettlement('actor-mudd', 'Mudd Orbital');
    const state = { settlementIds: ['actor-mudd'] };
    expect(resolveCurrentLocationName('Mudd', state)?.id).toBe('actor-mudd');
    expect(resolveCurrentLocationName('orbital', state)?.id).toBe('actor-mudd');
    expect(resolveCurrentLocationName('Nerio', state)).toBeNull();
  });

  it('still resolves a journal-hosted location type through the registry', () => {
    // `location` is actor-hosted too post-migration; this pins that the
    // group list routes every type through the registry rather than journals.
    global.game.actors._set('actor-derelict', global.makeTestActor({
      id: 'actor-derelict', type: 'location', name: 'Sepulcher Wreck',
      flags: { [MODULE]: { entityType: 'location', location: { _id: 'rec-d', name: 'Sepulcher Wreck' } } },
    }));
    const match = resolveCurrentLocationName('Sepulcher', { locationIds: ['actor-derelict'] });
    expect(match?.type).toBe('location');
  });
});

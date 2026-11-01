/**
 * STARFORGED COMPANION
 * tests/unit/dedupNameTitles.test.js
 *
 * A PC or an established NPC re-detected without its title is not offered as
 * a new connection (issue #321 U30).
 *
 * The draft dedup gate (routeEntityDrafts → entityExistsAnyType →
 * normalizeEntityName) stripped one leading honorific, but only those in
 * HONORIFIC_PREFIXES (dr, captain, lt, prof, …). The titles the module itself
 * writes into NPC names (connection.js NAME_TITLE_ROLES: Doctor,
 * Administrator, Overseer, Warden, …) were kept, so "Doctor Chen" never
 * matched a detection of "Dr. Chen", and the vow target "Administrator Lyssa
 * Chen" never matched "Lyssa Chen": each was offered to the GM as a new NPC,
 * and Confirm made a duplicate card. The gate now strips one shared title set
 * — the honorifics and the NAME_TITLE_ROLES titles.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { routeEntityDrafts } from '../../src/entities/entityExtractor.js';

const MODULE = 'starforged-companion';

beforeEach(() => {
  global.game.actors._reset();
  global.game.user = { isGM: true, id: 'test-user-gm' };
  global.ChatMessage._reset();
  global.game.messages = { contents: [], get: () => null };
  global.game.actors._set('pc-chen', global.makeTestActor({ id: 'pc-chen', type: 'character', name: 'Doctor Chen' }));
  global.game.actors._set('npc-lyssa', global.makeTestActor({
    id: 'npc-lyssa', type: 'character', name: 'Administrator Lyssa Chen',
    flags: { [MODULE]: { entityType: 'connection', connection: { _id: 'rec-lyssa', name: 'Administrator Lyssa Chen', active: true } } },
  }));
});

describe('the draft dedup gate strips the module\'s own NPC titles', () => {
  it('a PC or NPC re-detected without its title is not offered as a new connection', async () => {
    const cs = { connectionIds: ['npc-lyssa'], dismissedEntities: [] };
    const { queued } = await routeEntityDrafts([
      { type: 'connection', name: 'Dr. Chen',   description: 'The ship\'s medic.',         confidence: 'high' },
      { type: 'connection', name: 'Lyssa Chen', description: 'The station administrator.', confidence: 'high' },
    ], cs, { autoCreateConnection: false });

    expect(queued.map(e => e.name)).toEqual([]);
    expect(global.ChatMessage._created.filter(m => m.flags?.[MODULE]?.draftEntityCard)).toHaveLength(0);
  });

  it('a titled detection of a bare-named connection is not offered either', async () => {
    global.game.actors._set('npc-kell', global.makeTestActor({
      id: 'npc-kell', type: 'character', name: 'Kell',
      flags: { [MODULE]: { entityType: 'connection', connection: { _id: 'rec-kell', name: 'Kell', active: true } } },
    }));
    const cs = { connectionIds: ['npc-lyssa', 'npc-kell'], dismissedEntities: [] };
    const { queued } = await routeEntityDrafts([
      { type: 'connection', name: 'Overseer Kell', description: 'Controls docking rights.', confidence: 'high' },
    ], cs, { autoCreateConnection: false });

    expect(queued.map(e => e.name)).toEqual([]);
  });

  it('control: a genuinely new NPC is still offered', async () => {
    const cs = { connectionIds: ['npc-lyssa'], dismissedEntities: [] };
    const { queued } = await routeEntityDrafts([
      { type: 'connection', name: 'Warden Ilse Varo', description: 'Keeps the brig.', confidence: 'high' },
    ], cs, { autoCreateConnection: false });

    expect(queued.map(e => e.name)).toEqual(['Warden Ilse Varo']);
  });
});

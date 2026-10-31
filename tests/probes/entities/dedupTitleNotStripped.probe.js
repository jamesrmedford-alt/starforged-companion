/**
 * PROBE — DEDUP-TITLE-NOT-STRIPPED
 *
 * The draft dedup gate (routeEntityDrafts → entityExistsAnyType →
 * normalizeEntityName, src/entities/entityExtractor.js) strips one leading
 * honorific — but only the abbreviations and military ranks in
 * HONORIFIC_PREFIXES (dr, captain, commander, lt, sgt, prof, …). The titles
 * the module itself writes into NPC names (connection.js NAME_TITLE_ROLES:
 * Doctor, Administrator, Admiral, Ambassador, Chancellor, Chief, Councilor,
 * Director, Elder, Foreman, Governor, Magistrate, Overseer, Warden) are not
 * stripped, so "Doctor Chen" normalises to "doctor chen" and never equals a
 * detection of "Dr. Chen" or "Chen" — although isPlayerCharacterName's own
 * comment says a PC named "Doctor Chen" matches both. A PC or an
 * established NPC re-detected under its bare name is offered to the GM as a
 * new connection, and Confirm makes a duplicate NPC card.
 *
 * Correct behaviour (asserted): neither the PC "Doctor Chen" nor the
 * inciting vow target "Administrator Lyssa Chen" is re-proposed when the
 * narration calls them "Dr. Chen" / "Lyssa Chen".
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { routeEntityDrafts } from '../../../src/entities/entityExtractor.js';

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

describe('PROBE DEDUP-TITLE-NOT-STRIPPED', () => {
  it('a PC or NPC re-detected without its title is not offered as a new connection', async () => {
    const cs = { connectionIds: ['npc-lyssa'], dismissedEntities: [] };
    const { queued } = await routeEntityDrafts([
      { type: 'connection', name: 'Dr. Chen',   description: 'The ship\'s medic.',            confidence: 'high' },
      { type: 'connection', name: 'Lyssa Chen', description: 'The station administrator.',    confidence: 'high' },
    ], cs, { autoCreateConnection: false });

    expect(queued.map(e => e.name)).toEqual([]);
  });
});

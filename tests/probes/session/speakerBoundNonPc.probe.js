/**
 * PROBE — resolveSpeakerActorId (src/multiplayer/speaker.js) refuses a non-PC
 * `speaker.actor` (step 1: "a selected ship, NPC card, or other non-PC token
 * falls through — observed in playtest: chat attributed to 'Ship'"), but step 2
 * returns `message.author.character.id` with NO such check. A user whose
 * assigned character (User Configuration → Character) is the crew's starship
 * or an NPC card has every message attributed to it.
 *
 * Downstream the pipeline takes the speaker as the roller with no PC check
 * (src/index.js: `rollerActor = speakerActor ?? getPlayerActors()[0]`): the
 * move reads the ship's (absent) stats, momentum is written to the ship, and
 * the narrator's CHARACTER block describes the starship (getActiveCharacter
 * → readCharacterSnapshot(ship)) — the same "attributed to Ship" symptom step 1
 * was added to stop.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resolveSpeakerActorId } from '../../../src/multiplayer/speaker.js';

const MODULE_ID = 'starforged-companion';

beforeEach(() => { game.actors._reset(); });

function setup() {
  const pc   = { id: 'pc-pat', type: 'character', name: 'Kira', flags: {},
    testUserPermission: (user, level) => user?.id === 'pl-1' && level === 'OWNER' };
  const ship = { id: 'ship-1', type: 'starship', name: 'ISV Vesta', flags: {},
    testUserPermission: () => true };   // the crew's ship: every player owns it
  const npc  = { id: 'npc-1', type: 'character', name: 'Vance', flags: { [MODULE_ID]: { entityType: 'connection' } },
    testUserPermission: () => true };
  for (const a of [pc, ship, npc]) game.actors._set(a.id, a);
  return { pc, ship, npc };
}

describe('PROBE SPEAKER-BOUND-NONPC', () => {
  it("a user whose assigned character is the starship is attributed to their PC, not the ship", () => {
    const { ship } = setup();
    const msg = { speaker: { actor: null, alias: 'Pat' }, author: { id: 'pl-1', character: ship } };
    expect(resolveSpeakerActorId(msg, {})).toBe('pc-pat');   // actual today: 'ship-1'
  });

  it('a user whose assigned character is an NPC card is attributed to their PC, not the NPC', () => {
    const { npc } = setup();
    const msg = { speaker: { actor: null, alias: 'Pat' }, author: { id: 'pl-1', character: npc } };
    expect(resolveSpeakerActorId(msg, {})).toBe('pc-pat');   // actual today: 'npc-1'
  });

  it('control: the same ship as a SELECTED token (speaker.actor) already falls through to the PC', () => {
    setup();
    const msg = { speaker: { actor: 'ship-1', alias: 'ISV Vesta' }, author: { id: 'pl-1', character: null } };
    expect(resolveSpeakerActorId(msg, {})).toBe('pc-pat');
  });
});

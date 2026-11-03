/**
 * STARFORGED COMPANION
 * tests/unit/galleySoloGm.test.js
 *
 * Issue #325 W32: collectGalleyParticipants counted a PC present only when a
 * connected user had it as `User.character`, which nothing in the module sets
 * for the GM's PCs (the Quickstart's and Campaign Start's included). A solo
 * GM's lone PC was "absent" and the narrator was told "Active players: (No
 * active players have a character set …)". Each connected player's PC now
 * resolves through resolveUserActorId, and a PC no player has is the GM's —
 * at the table while a GM is connected.
 *
 * Converted from the audit probe session/galleySoloGmAbsent, plus the mixed
 * table: the GM owns every actor, which must not put an offline player's PC
 * in the galley.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { collectGalleyParticipants, buildGalleyVignetteUserMessage } from '../../src/session/galleyVignette.js';

let savedUsers;
beforeEach(() => {
  savedUsers = game.users;
  game.actors._reset();
});
afterEach(() => { game.users = savedUsers; });

function setTable(users, pcs) {
  game.users = Object.assign([...users], { contents: users, get: (id) => users.find(u => u.id === id) ?? null });
  game.actors._setAll(pcs);
}
const ids = (list) => list.map(p => p.actor.id).sort();

describe('the galley vignette counts the PCs of the users at the table', () => {
  it('control: a GM who set User.character has their PC in the galley', () => {
    const kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character' });
    const gm = { id: 'gm-1', name: 'Gina', isGM: true, active: true, character: kira };
    setTable([gm], [kira]);
    expect(ids(collectGalleyParticipants().active)).toEqual(['pc-kira']);
  });

  it('solo GM without a User.character: the lone PC is in the galley, not absent', () => {
    const kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character' });
    setTable([{ id: 'gm-1', name: 'Gina', isGM: true, active: true, character: null }], [kira]);

    const parts = collectGalleyParticipants();

    expect({ active: ids(parts.active), absent: ids(parts.absent) }).toEqual({ active: ['pc-kira'], absent: [] });
    expect(buildGalleyVignetteUserMessage(parts, {})).not.toContain('No active players have a character set');
  });

  it('solo GM running two PCs: both are in the galley', () => {
    const kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character' });
    const bex  = makeTestActor({ id: 'pc-bex',  name: 'Bex',  type: 'character' });
    setTable([{ id: 'gm-1', name: 'Gina', isGM: true, active: true, character: null }], [kira, bex]);

    expect(ids(collectGalleyParticipants().active)).toEqual(['pc-bex', 'pc-kira']);
  });

  it('a mixed table: a connected player\'s own PC is present, an offline player\'s absent, a GM-run PC present', () => {
    const pat   = makeTestActor({ id: 'pc-pat',   name: 'Pat',   type: 'character', ownership: { 'pl-1': 3 } });
    const quinn = makeTestActor({ id: 'pc-quinn', name: 'Quinn', type: 'character', ownership: { 'pl-2': 3 } });
    const drone = makeTestActor({ id: 'pc-drone', name: 'Drone', type: 'character' });
    setTable([
      { id: 'gm-1', name: 'Gina', isGM: true,  active: true,  character: null },
      { id: 'pl-1', name: 'Pat',  isGM: false, active: true,  character: null },
      { id: 'pl-2', name: 'Quin', isGM: false, active: false, character: null },
    ], [quinn, pat, drone]);

    const parts = collectGalleyParticipants();

    expect({ active: ids(parts.active), absent: ids(parts.absent) })
      .toEqual({ active: ['pc-drone', 'pc-pat'], absent: ['pc-quinn'] });
    expect(parts.active.find(p => p.actor.id === 'pc-pat').user.id).toBe('pl-1');
  });

  it('with no GM connected, a GM-run PC is absent', () => {
    const pat   = makeTestActor({ id: 'pc-pat',   name: 'Pat',   type: 'character', ownership: { 'pl-1': 3 } });
    const drone = makeTestActor({ id: 'pc-drone', name: 'Drone', type: 'character' });
    setTable([
      { id: 'gm-1', name: 'Gina', isGM: true,  active: false, character: null },
      { id: 'pl-1', name: 'Pat',  isGM: false, active: true,  character: null },
    ], [pat, drone]);

    const parts = collectGalleyParticipants();

    expect({ active: ids(parts.active), absent: ids(parts.absent) })
      .toEqual({ active: ['pc-pat'], absent: ['pc-drone'] });
  });
});

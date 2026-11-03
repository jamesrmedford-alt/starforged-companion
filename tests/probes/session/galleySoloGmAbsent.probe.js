/**
 * PROBE SC — GALLEY-SOLO-PC-ABSENT (WRONG-DETAIL)
 *
 * What the user does: plays solo as the GM (the module's "dominant solo-GM
 * use case") — e.g. after the ✦ Playtest Quickstart / ✦ Campaign Start, whose
 * PCs are created without a User.character — and presses Begin a Session
 * with "Include an opening galley vignette" on (the default).
 *
 * What happens: collectGalleyParticipants (galleyVignette.js) counts a PC as
 * present only when a connected user has it as `User.character`. The GM's
 * own PC (no User.character set — nothing in src/ ever sets one) is listed
 * ABSENT, the active list is empty, and the narrator is told
 * "Active players: (No active players have a character set on their Foundry
 * user.)" and asked to write the galley scene with the GM's PC away, the
 * subject of banter by nobody. The file header promises the opposite:
 * "Solo-GM mode … the vignette describes the lone PC in the galley".
 *
 * What should happen: each connected user's own PC is present — the same
 * resolution every other "whose PC is this user?" path uses
 * (multiplayer/speaker.js resolveUserActorId: User.character, else a PC the
 * user owns, else the first PC for a GM / in solo play).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { collectGalleyParticipants, buildGalleyVignetteUserMessage } from '../../../src/session/galleyVignette.js';

let savedUsers;
beforeEach(() => {
  savedUsers = game.users;
  game.actors._reset();
});
afterEach(() => { game.users = savedUsers; });

function soloGmTable(pcs) {
  const gm = { id: 'gm-1', name: 'Gina', isGM: true, active: true, character: null };
  game.users = Object.assign([gm], { contents: [gm], get: (id) => (id === gm.id ? gm : null) });
  game.actors._setAll(pcs);
  return gm;
}

describe('PROBE GALLEY-SOLO-PC-ABSENT', () => {
  it('control: a GM who set User.character has their PC in the galley', () => {
    const kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character' });
    const gm = soloGmTable([kira]);
    gm.character = kira;
    expect(collectGalleyParticipants().active.map(p => p.actor.id)).toEqual(['pc-kira']);
  });

  it("solo GM without a User.character: the lone PC is in the galley, not absent", () => {
    const kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character' });
    soloGmTable([kira]);
    const parts = collectGalleyParticipants();
    // Actual: active [], absent [Kira].
    expect(parts.active.map(p => p.actor.id)).toEqual(['pc-kira']);
    const msg = buildGalleyVignetteUserMessage(parts, {});
    expect(msg).not.toContain('No active players have a character set');
  });
});

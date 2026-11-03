// tests/probes/narration/perspectiveAutoCountsGm.probe.js
//
// PROBE (eighth audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// NR PERSPECTIVE-AUTO-GM — "Auto" perspective counts the GM as a player: a GM
// running one player's character gets third-person narration.
//
// What the user does: a guided game — the GM and one player, one player
// character (Kira); Perspective is left on Auto ("second person for solo,
// third person for multiplayer").
//
// What happens: resolveNarrationPerspective (src/narration/narratorPrompt.js)
// counts `game.users.filter(u => u.active)` — two (the GM and the player) — and
// picks third person, so every narration reads "Kira feels the deck shudder"
// with "Refer to characters by name". In the same request the PARTY block
// treats the game as solo (buildPartyContext returns null under two PCs), and
// decisions.md ("Narrator tone and perspective") says Auto is "resolved at
// narration time from the count of active non-GM users". A solo GM with a
// second browser window (a phone, a player login to test) also flips to third
// person.
//
// What should happen: one player character → second person ("you").

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildNarratorSystemPrompt, resolveNarrationPerspective } from '../../../src/narration/narratorPrompt.js';

let savedUsers;

beforeEach(() => {
  savedUsers = global.game.users;
  game.actors._reset();
  game.actors._set('pc-kira', makeTestActor({ id: 'pc-kira', type: 'character', name: 'Kira' }));
  const users = [
    { id: 'gm-1', isGM: true,  active: true },
    { id: 'pl-1', isGM: false, active: true, character: game.actors.get('pc-kira') },
  ];
  global.game.users = Object.assign(users, { get: (id) => users.find(u => u.id === id) ?? null });
});

afterEach(() => { global.game.users = savedUsers; });


describe('Auto perspective follows the player characters, not the logged-in users', () => {
  it('a GM and one player with one PC: second person', () => {
    expect(resolveNarrationPerspective('auto')).toBe('second_person');
    const system = buildNarratorSystemPrompt({}, { narrationPerspective: 'auto' }, { name: 'Kira' }, '', { mode: 'move_resolution' });
    expect(system).toContain('Address the player character directly as "you"');
  });

  it('control: a solo GM alone is second person', () => {
    global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], { get: () => null });
    expect(resolveNarrationPerspective('auto')).toBe('second_person');
  });
});

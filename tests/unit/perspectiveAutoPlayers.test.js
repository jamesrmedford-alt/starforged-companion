// tests/unit/perspectiveAutoPlayers.test.js
//
// "Auto" perspective counts the active non-GM users, not the GM (issue #325
// W21; decisions.md "Narrator tone and perspective"). A guided game — the GM
// and one player with one PC — got third-person narration ("Kira feels the
// deck shudder", "Refer to characters by name"), as did a solo GM with a
// second browser window open.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildNarratorSystemPrompt, resolveNarrationPerspective } from '../../src/narration/narratorPrompt.js';

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

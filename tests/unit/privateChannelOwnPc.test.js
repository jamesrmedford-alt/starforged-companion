/**
 * A published Private Channel reflection is attributed to the publisher's own
 * PC, never another player's (issue #321 U23).
 *
 * The Private Channel resolved "whose character" only from User#character. A
 * player who OWNS their PC but never bound it as their User character (common
 * — speaker.js's ownership rung exists for exactly this) passed actorId null,
 * and getActiveCharacter fell back to campaignState.characterIds[0] — another
 * player's PC. A published reflection is canon (the ring, the summary, the
 * tier pass), and it was posted as "◈ <other PC> — private reflection". It now
 * resolves through resolveUserActorId: User#character → an owned PC → the
 * first PC only for a GM or in solo play.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { publishToMainChat } from '../../src/private-channel/publish.js';

const MODULE_ID = 'starforged-companion';
let saved;

beforeEach(() => {
  saved = { users: global.game.users };
  global.game.actors._setAll([
    makeTestActor({ id: 'pc-kira', name: 'Kira', ownership: { 'player-2': 3 } }),
    makeTestActor({ id: 'pc-dax',  name: 'Dax',  ownership: { 'player-1': 3 } }),
  ]);
  const users = new Map([
    ['player-1', { id: 'player-1', name: 'Sam', isGM: false, active: true, character: null }],
    ['player-2', { id: 'player-2', name: 'Ali', isGM: false, active: true, character: { id: 'pc-kira', name: 'Kira' } }],
    ['player-3', { id: 'player-3', name: 'Lee', isGM: false, active: true, character: null }],
  ]);
  global.game.users = { get: (id) => users.get(id) ?? null, get contents() { return [...users.values()]; } };
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 'ses-1', characterIds: ['pc-kira', 'pc-dax'] });
  global.ChatMessage._reset();
});

afterEach(() => {
  global.game.actors._reset();
  global.game.users = saved.users;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

describe('publishing a Private Channel reflection', () => {
  it("attributes it to the publisher's own PC, not the campaign's first PC", async () => {
    const msg = await publishToMainChat({ userId: 'player-1', content: 'I keep the ring. I always will.' });
    expect(msg.speaker.alias).toBe('Dax');
    expect(msg.content).toContain('◈ Dax — private reflection');
  });

  it("a player with no PC of their own publishes as themselves, never as another player's PC", async () => {
    const msg = await publishToMainChat({ userId: 'player-3', content: 'Something to remember.' });
    expect(msg.speaker.alias).toBe('You');
  });

  it('control: a bound player publishes as their bound PC', async () => {
    const msg = await publishToMainChat({ userId: 'player-2', content: 'Noted.' });
    expect(msg.speaker.alias).toBe('Kira');
  });
});

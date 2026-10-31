/**
 * PROBE — PC-FIRST-PC-ATTRIBUTION (src/private-channel/app.js, publish.js, context.js)
 *
 * The Private Channel resolves "whose character" only from User#character
 * (`game.users.get(userId).character?.id`). A player who OWNS their PC but
 * never bound it as their User character (common — see the v1.7.13 galley
 * vignette bug, and speaker.js rung 3 "a player can own a PC without setting
 * it as their User#character") passes actorId null, and getActiveCharacter
 * falls back to campaignState.characterIds[0] — another player's PC. The
 * private narrator then talks to them as that PC (its CHARACTER block), and a
 * published reflection — canon, fed to the ring, the summary and the tier
 * pass — is posted as "◈ <other PC> — private reflection".
 *
 * The move pipeline resolves the same question with resolveSpeakerActorId
 * (src/multiplayer/speaker.js): User#character, then an OWNED PC, and only then
 * the first PC.
 *
 * Asserts the CORRECT behaviour (the publisher's own PC); fails today.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { publishToMainChat } from '../../../src/private-channel/publish.js';

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
  });
});

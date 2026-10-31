/**
 * PROBE — PC-XCARD-BYPASS (src/private-channel/publish.js, narrate.js)
 *
 * decisions.md → "X-Card: anyone plays it, a GM resumes it": while
 * campaignState.xCardActive is set "every narrator entry point stands down"
 * and nothing narrated is "shown, voiced or remembered". The Private Channel
 * never reads the flag: the private narrator keeps answering, and Publish
 * posts the reflection to MAIN CHAT as a narrator card (narratorCard /
 * narrationText / sessionId — canon for the recent-narration ring, the rolling
 * summary and the tier pass) in the middle of the pause — so the material the
 * X-Card stopped can come straight back to the table, and into the narrator's
 * memory for after the resume.
 *
 * Asserts the CORRECT behaviour (no canon narrator card while paused); fails today.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { publishToMainChat } from '../../../src/private-channel/publish.js';

const MODULE_ID = 'starforged-companion';
let saved;

beforeEach(() => {
  saved = { users: global.game.users };
  global.game.actors._setAll([makeTestActor({ id: 'pc-dax', name: 'Dax', ownership: { 'player-1': 3 } })]);
  const users = new Map([['player-1', { id: 'player-1', name: 'Sam', isGM: false, active: true, character: { id: 'pc-dax', name: 'Dax' } }]]);
  global.game.users = { get: (id) => users.get(id) ?? null, get contents() { return [...users.values()]; } };
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    currentSessionId: 'ses-1', characterIds: ['pc-dax'], xCardActive: true, xCardPlays: 1,
  });
  global.ChatMessage._reset();
});

afterEach(() => {
  global.game.actors._reset();
  global.game.users = saved.users;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

describe('publishing a reflection while the X-Card is active', () => {
  it('puts no narrator (canon) card into main chat during the pause', async () => {
    await publishToMainChat({ userId: 'player-1', content: 'I keep thinking about what they did to the prisoner.' })
      .catch(() => null);
    const canon = global.ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.narratorCard);
    expect(canon).toHaveLength(0);
  });
});

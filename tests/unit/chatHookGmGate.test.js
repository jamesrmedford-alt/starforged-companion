/**
 * STARFORGED COMPANION
 * tests/unit/chatHookGmGate.test.js
 *
 * Regression coverage for the v1.3.4 2-player session failure:
 *   "Chat gets duplicated across both users."
 *   "Player Boblikescheese lacks permission to update Setting […]."
 *
 * Root cause: the createChatMessage hook fires on every connected client
 * and ran the move-interpretation pipeline (Haiku + Sonnet API calls +
 * ChatMessage.create + game.settings.set) on every client. The fix
 * gates the pipeline entry on isCanonicalGM().
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the heavy pipeline modules — we only want to assert who CALLS them,
// not actually execute them.
vi.mock('../../src/moves/interpreter.js', () => ({
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', statUsed: 'iron', rationale: 'test' })),
}));
vi.mock('../../src/pacing/router.js', () => ({
  routePacedInput: vi.fn(async () => ({ runMove: false, decision: 'NARRATIVE', suggestedMove: null })),
}));

import { registerChatHook } from '../../src/index.js';
import { interpretMove }    from '../../src/moves/interpreter.js';
import { routePacedInput }  from '../../src/pacing/router.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';

function makeNarration() {
  return {
    type:    'ic',
    content: 'I draw my blade and step toward the alien.',
    author:  { isGM: false, id: 'player-1' },
    flags:   {},
  };
}

beforeEach(() => {
  Hooks._handlers.clear();
  interpretMove.mockClear();
  routePacedInput.mockClear();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { ...CampaignStateSchema, pendingMove: false });
});

async function runHookAs(currentUser, users) {
  global.game.users = users;
  global.game.user  = currentUser;
  registerChatHook();
  const handler = Hooks._handlers.get('createChatMessage').slice(-1)[0];
  await handler(makeNarration());
}


describe('createChatMessage hook — canonical-GM gate', () => {
  it('does NOT run the pipeline on a non-GM client (player who sees the message)', async () => {
    const users = [
      { id: 'gm-1',     isGM: true,  active: true },
      { id: 'player-1', isGM: false, active: true },
    ];
    await runHookAs(users[1], users);

    expect(routePacedInput).not.toHaveBeenCalled();
    expect(interpretMove).not.toHaveBeenCalled();
  });

  it('runs the pipeline exactly once on the canonical (lowest-id) GM client', async () => {
    const users = [
      { id: 'gm-1', isGM: true, active: true },
      { id: 'gm-2', isGM: true, active: true },   // assistant GM, higher id
    ];
    await runHookAs(users[0], users);

    expect(routePacedInput).toHaveBeenCalledTimes(1);
  });

  it('does NOT run the pipeline on the non-canonical GM client (assistant GM with higher id)', async () => {
    const users = [
      { id: 'gm-1', isGM: true, active: true },
      { id: 'gm-2', isGM: true, active: true },
    ];
    await runHookAs(users[1], users);

    expect(routePacedInput).not.toHaveBeenCalled();
  });

  it('does NOT run when no GM is active (player-only session pauses gracefully — no permission errors)', async () => {
    const users = [
      { id: 'gm-1',     isGM: true,  active: false },   // GM offline
      { id: 'player-1', isGM: false, active: true  },
    ];
    await runHookAs(users[1], users);

    expect(routePacedInput).not.toHaveBeenCalled();
  });
});

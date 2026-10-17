/**
 * STARFORGED COMPANION
 * tests/unit/pipelineNextMoveAdd.test.js
 *
 * Composition test: the move pipeline (registerChatHook) consumes Take a
 * Break's single-use +1 (campaignState.nextMoveAdd) on the next action roll —
 * the wiring hop the unit tests of src/moves/nextMoveAdd.js cannot see.
 * resolveMove is mocked to capture the interpretation and then stop the run.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', () => ({
  interpretMove: vi.fn(async () => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => ({
  ...(await importOriginal()),
  resolveMove: vi.fn(() => { throw new Error('stop-after-resolve'); }),
}));

import { registerChatHook } from '../../src/index.js';
import { resolveMove } from '../../src/moves/resolver.js';
import { interpretMove } from '../../src/moves/interpreter.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';

function narration() {
  return {
    type: 'ic', content: 'I brace against the hull and push through the breach.',
    author: { id: 'gm-1', isGM: true }, flags: {},
  };
}

async function runPipeline() {
  const handler = Hooks._handlers.get('createChatMessage').slice(-1)[0];
  await handler(narration());
}

beforeEach(() => {
  Hooks._handlers.clear();
  resolveMove.mockClear();
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  silenceConsoleErrors();   // the mocked resolveMove throws to end the run
  registerChatHook();
});

describe('Take a Break +1 in the move pipeline', () => {
  it('adds +1 to the next action roll and clears the stored grant', async () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      ...CampaignStateSchema, sessionActive: true, pendingMove: false,
      nextMoveAdd: { value: 1, source: 'take_a_break', setAt: '2026-10-17T00:00:00.000Z' },
    });

    await runPipeline();

    expect(resolveMove).toHaveBeenCalledTimes(1);
    expect(resolveMove.mock.calls[0][0].adds).toBe(1);
    expect(game.settings._store.get(`${MODULE_ID}.campaignState`).nextMoveAdd).toBeUndefined();
  });

  it('leaves the grant pending when the next move is a progress move', async () => {
    interpretMove.mockResolvedValueOnce({
      moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', statUsed: null, adds: 0, rationale: 'test',
    });
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      ...CampaignStateSchema, sessionActive: true, pendingMove: false,
      nextMoveAdd: { value: 1, source: 'take_a_break', setAt: '2026-10-17T00:00:00.000Z' },
    });

    await runPipeline();

    expect(resolveMove).toHaveBeenCalledTimes(1);
    expect(resolveMove.mock.calls[0][0].adds ?? 0).toBe(0);
    expect(game.settings._store.get(`${MODULE_ID}.campaignState`).nextMoveAdd).toBeDefined();
  });
});

/**
 * PROBE — NARRATION-THROW-SKIPS-PERSIST
 *
 * The move pipeline (src/index.js registerChatHook ~1491) awaits
 * narrateResolution with no catch of its own, and runs persistResolution —
 * the roller's meters, the session log, legacy ticks, the suffer card — only
 * after it (~1495). The documented contract (faultMatrix.test.js header,
 * decisions.md) is that "a move's result stands when its narration fails",
 * and narrateResolution handles a failed Claude call by posting a fallback
 * card. But when the narrator card cannot be posted (its ChatMessage.create
 * is refused), narrateResolution's catch posts the fallback card, that create
 * is refused too, and the rejection escapes into the pipeline's catch: the
 * move card is already on the table showing the result, and the result is
 * never applied — no momentum, no session-log record — and the GM is told
 * "Move interpretation failed. Check your API key".
 *
 * Correct behaviour (asserted): the move's result is applied even though its
 * narration could not be posted.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const STRONG = [0.25, 0.35, 0.9];   // challenge 3, 4; action 6 (+iron 3 = 9): strong hit, +1 momentum
const control = vi.hoisted(() => ({ dice: null }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
    playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const [c1, c2, action] = control.dice;
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(c1).mockReturnValueOnce(c2).mockReturnValueOnce(action);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { failWrites, scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
let table;
const world = () => table.world.campaignState();
const momentumOf = (id) => table.actors.get(id)?.system?.momentum?.value;
const sessionLog = () => world().sessionLogs?.['sess-1'] ?? [];

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = STRONG;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
  silenceConsoleErrors();
});

describe('PROBE NARRATION-THROW-SKIPS-PERSIST', () => {
  it('the narrator card cannot be posted: the strong hit still lands (+1 momentum, recorded)', async () => {
    scriptClaude(table, { fallback: () => REPLY });
    // Refuse the narration card and the fallback card (a server hiccup on chat posts).
    const refused = failWrites(table,
      w => w.kind === 'message.create' && w.data?.flags?.[MODULE_ID]?.narratorCard === true,
      { times: 2 });

    await table.client('pl-1').chat('I brace against the hull and push through the breach.', { speaker: { actor: 'pc-pat' } });
    await table.settle(); await table.drain();

    expect(refused.refused).toBeGreaterThan(0);
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);   // the result card is on the table
    // Expected: the result applied. Actual: persistResolution never ran.
    expect(momentumOf('pc-pat')).toBe(3);
    expect(sessionLog().filter(e => e.moveId === 'face_danger')).toHaveLength(1);
    expect(world().pendingMove).toBe(false);
  }, 30_000);
});

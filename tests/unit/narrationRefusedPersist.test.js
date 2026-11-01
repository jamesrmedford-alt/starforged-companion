/**
 * STARFORGED COMPANION
 * tests/unit/narrationRefusedPersist.test.js
 *
 * Issue #322 V09 (the audit's narrationCardRefusedSkipsPersist probe,
 * NARRATION-THROW-SKIPS-PERSIST): the move pipeline awaited narrateResolution
 * with no catch of its own and ran persistResolution — the roller's meters,
 * the session log, legacy ticks, the suffer card — only after it. A failed
 * Claude call posts a fallback card; but when the narrator card could not be
 * posted (its ChatMessage.create refused) and the fallback was refused too,
 * the rejection escaped into the pipeline's catch: the move card showed the
 * result, the result was never applied, and the GM was told "Move
 * interpretation failed". The contract (faultMatrix.test.js, decisions.md) is
 * that a move's result stands when its narration fails: the pipeline now
 * catches the rejection, warns, and persists.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const STRONG = [0.25, 0.35, 0.9];   // challenge 3, 4; action 6 (+iron 3 = 9): strong hit, +1 momentum
const control = vi.hoisted(() => ({ dice: null }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
    playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { failWrites, scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

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

describe('a narration that cannot be posted leaves the result applied (NARRATION-THROW-SKIPS-PERSIST)', () => {
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
    // The result applied — persistResolution used to be skipped.
    expect(momentumOf('pc-pat')).toBe(3);
    expect(sessionLog().filter(e => e.moveId === 'face_danger')).toHaveLength(1);
    expect(world().pendingMove).toBe(false);
    // The GM is told the narration, not the move, failed.
    expect(getCapturedWarns().some(w => /narration could not be posted — its result is applied all the same/.test(w))).toBe(true);
  }, 30_000);
});

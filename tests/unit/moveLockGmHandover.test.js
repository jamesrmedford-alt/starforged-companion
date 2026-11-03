/**
 * A move lock held by a GM who disconnects is released by the new canonical GM
 * (issue #325 W25).
 *
 * Two GMs are connected. The canonical GM (gm-1) runs a player's move and
 * holds `campaignState.pendingMove` while the narration is in flight. gm-1's
 * browser goes away; gm-2 becomes the canonical GM at once, but nothing
 * cleared the lock — the only stale-lock reset was the `ready` hook of the
 * client canonical at ITS OWN load — so every move was refused ("A move is
 * already being resolved") until such a GM reloaded. The lock now records its
 * claimant (`pendingMoveBy`); on `userConnected(gm-1, false)` the new
 * canonical GM releases it and whispers the GMs.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
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

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const world = () => table.world.campaignState();

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-1', currentSceneId: 'sc-1', sceneTruths: [],
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  await table.setClaudeKey('gm-2', 'sk-ant-gus');
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
});

describe('a move lock whose GM left', () => {
  it('after the canonical GM disconnects mid-move, the new canonical GM resolves the next move', async () => {
    silenceConsoleErrors();
    // gm-1's narration call never answers (its browser is about to go).
    let held = false;
    table.claude.respond((call) => {
      if (!held && call.client === 'gm-1' && call.model === NARRATION_MODEL) {
        held = true;
        return new Promise(() => {});
      }
      return DEFAULT_REPLY;
    });

    await table.client('pl-1').chat('I brace against the hull and push through the breach.', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    expect(world().pendingMove).toBe(true);                 // gm-1 holds the lock
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);

    await table.leave('gm-1');                              // the lock holder is gone

    await table.client('pl-1').chat('I slip through the hatch before it seals.', { speaker: { actor: 'pc-pat' } });
    await table.settle();

    const notices = table.client('gm-2').notifications.map(n => n.message);
    // gm-2, now canonical, resolves the move: the lock nobody holds is gone.
    expect({
      moveCards: table.cards(f => f.moveResolution).length,
      refusedNotice: notices.some(m => /already being resolved/i.test(m)),
    }).toEqual({ moveCards: 2, refusedNotice: false });
  });

  it('the lock records its claimant, the GMs are told when it is released, and a player leaving releases nothing', async () => {
    silenceConsoleErrors();
    table.claude.respond((call) => (call.client === 'gm-1' && call.model === NARRATION_MODEL ? new Promise(() => {}) : DEFAULT_REPLY));
    await table.client('pl-1').chat('I brace against the hull and push through the breach.', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    expect(world()).toMatchObject({ pendingMove: true, pendingMoveBy: 'gm-1' });

    await table.leave('pl-1');
    await table.settle();
    expect(world().pendingMove).toBe(true);              // a player leaving holds no lock

    await table.leave('gm-1');
    await table.settle();
    expect(world()).toMatchObject({ pendingMove: false, pendingMoveBy: null });
    expect(table.cards(f => f.moveLockReleasedCard)).toHaveLength(1);
  });
});

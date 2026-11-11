/**
 * STARFORGED COMPANION
 * tests/unit/moveLockWriteNeverAnswered.test.js
 *
 * A move-lock claim whose write the server never answers is given up after a
 * bound (issue #347 AB05).
 *
 * claimPendingMoveLock marked the claim in flight and awaited its own write
 * with no bound: the campaignState chain passes a hung write for the writes
 * behind it, but the claim's own `finally` never ran. Every later move on that
 * GM answered "A move is already being resolved" though the world's lock was
 * free, held card moves never drained, and a waiting round waited forever —
 * until the GM's browser reloaded. A claim that lands after its bound is
 * released at once: its pipeline has gone.
 */
/* global silenceConsoleErrors */
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (orig) => ({
  ...(await orig()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (orig) => ({
  ...(await orig()), interpretMove: vi.fn(async (text) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: text, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (orig) => ({
  ...(await orig()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (orig) => ({
  ...(await orig()), confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude, campaignStateWrite } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
afterEach(() => { vi.useRealTimers(); table?.teardown(); });

const world = () => table.world.campaignState();
const SETTINGS = { chronicleAutoEntry: false, narratorSessionSummary: false, autoRecapEnabled: false, 'factContinuity.enabled': false };
const liveSession = () => ({
  ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: new Date().toISOString(),
  currentSessionId: 'sess-1', sessionStartedId: 'sess-1', sessionNumber: 1,
  lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [],
});

async function tableOfOneGm() {
  table = await simulateTable({
    users: [USERS.GM, USERS.P1],
    world: { settings: { ...SETTINGS, campaignState: liveSession() } },
  });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-1', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table);
}

const busyToasts = () => table.client('gm-1').notifications.filter(n => /already being resolved/.test(n.message)).length;

describe('a move-lock claim the server never answers (issue #347 AB05)', () => {
  it('control: a claim write the world REFUSES frees the mark — the next move starts', async () => {
    silenceConsoleErrors();
    await tableOfOneGm();

    let refused = 0;
    table.interceptWrites((w) => {
      if (refused === 0 && campaignStateWrite('gm-1')(w) && w.value?.pendingMove === true) {
        refused += 1;
        return new Error('The server refused the claim (test fault)');
      }
      return undefined;
    });

    table.client('pl-1').chat('Kira slips past the sentry and forces the hatch open.', { speaker: { actor: 'pc-1' } });
    await table.settle(); await table.drain();
    expect(refused).toBe(1);
    expect(table.cards(f => f.moveResolution)).toHaveLength(0);

    table.client('pl-1').chat('Kira hauls herself through the hatch and runs.', { speaker: { actor: 'pc-1' } });
    await table.settle(); await table.drain();

    expect({ moveCards: table.cards(f => f.moveResolution).length, busyToasts: busyToasts() })
      .toEqual({ moveCards: 1, busyToasts: 0 });
  }, 60_000);

  it('five minutes after a claim write that never lands, the next move still starts', async () => {
    silenceConsoleErrors();
    await tableOfOneGm();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

    // The first move's claim write is never answered (the socket dropped under it).
    let hung = 0;
    table.interceptWrites((w) => {
      if (hung === 0 && campaignStateWrite('gm-1')(w) && w.value?.pendingMove === true) {
        hung += 1;
        return new Promise(() => {});
      }
      return undefined;
    });

    table.client('pl-1').chat('Kira slips past the sentry and forces the hatch open.', { speaker: { actor: 'pc-1' } });
    await table.settle();
    expect(hung, 'the claim write was sent and never answered').toBe(1);
    expect(world().pendingMove, 'the world never took the claim: its lock is free').toBeFalsy();

    // Minutes pass; the table plays on.
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await table.settle();

    table.client('pl-1').chat('Kira hauls herself through the hatch and runs.', { speaker: { actor: 'pc-1' } });
    await table.settle();
    await vi.advanceTimersByTimeAsync(60_000);
    await table.settle();

    expect({ moveCards: table.cards(f => f.moveResolution).length, busyToasts: busyToasts() })
      .toEqual({ moveCards: 1, busyToasts: 0 });
  }, 60_000);

  it('control: a claim that lands after its bound is released at once — the lock is not left held by a pipeline that gave up', async () => {
    silenceConsoleErrors();
    await tableOfOneGm();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

    let release = null;
    table.interceptWrites((w) => {
      if (!release && campaignStateWrite('gm-1')(w) && w.value?.pendingMove === true) {
        return new Promise(resolve => { release = resolve; });   // answered — but late
      }
      return undefined;
    });

    table.client('pl-1').chat('Kira slips past the sentry and forces the hatch open.', { speaker: { actor: 'pc-1' } });
    await table.settle();
    expect(release, 'the claim write is out (setup)').toBeTypeOf('function');
    await vi.advanceTimersByTimeAsync(60_000);                 // past the claim's bound: given up
    await table.settle();
    expect(table.cards(f => f.moveResolution)).toHaveLength(0);

    release();                                                // the world takes the claim after all
    await table.settle();
    await vi.advanceTimersByTimeAsync(15_000);
    await table.settle(); await table.drain();
    expect(world().pendingMove, 'the late claim is released').toBeFalsy();
  }, 60_000);
});

/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/heldMoveRetriedAfterRefusal.test.js
 *
 * Issue #347 HELD-MOVES-WAIT-FOR-WRITE (AB24's residual) — a held move whose
 * claim the world refused is tried again after a bounded wait.
 *
 * A card button's forced move held behind the move lock, handed back and
 * refused (issue #345 AA48), waited for the next campaignState write that
 * landed: at a quiet table that could be a long while, its card claimed and
 * its button reading taken. It is now tried again after 10 s × the attempt,
 * five times (two and a half minutes in all), then left for a write that
 * lands; a lasting refusal is still not retried claim after claim (the issue
 * #342 Z25 shape).
 *
 * The set-up below is heldMoveRefusedTwice.test.js's (AA48):
 *
 * Issue #345 AA48 REFUSED-CLAIM-DRAIN-DROPS-HELD-MOVE (the round-2 pipeline
 * auditor's R2P-2 probe) — a regression of
 * FREE-FLOW-DEFERRED-AFTER-REFUSED-ROUND-CLAIM.
 *
 * A card button's forced move that meets the move lock is held (issue #325
 * W02: its card is claimed and its button reads taken everywhere, so a drop
 * loses the action) and handed back by the next campaignState write that
 * leaves the lock free. The fix for FREE-FLOW-DEFERRED-AFTER-REFUSED-ROUND-
 * CLAIM made a REFUSED claim hand one back at once (claimPendingMoveLock →
 * drainDeferredForcedMoves). When the handed-back move's own claim was refused
 * too — the refusal still going on — onMessage gave it the "could not start
 * … Try again" toast and returned: not held again, its card still claimed,
 * never rolled. It is now held again, at the front, until a campaignState
 * write lands; the drain does not hand it back meanwhile (a lasting refusal
 * would otherwise loop, claim after refused claim — the issue #342 Z25 shape).
 *
 * GM + two players; Vex is a PC no connected player owns, so its card moves
 * run as free-flow (tests/unit/heldMoveAfterRefusedClaim.test.js's set-up).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false })),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, holdWrites, failWrites, campaignStateWrite } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'The corridor holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const STRONG = [0.25, 0.35, 0.9];

let table;
const world = () => table.world.campaignState();
const vexCards = () => table.cards(f => f.moveResolution && f.actorId === 'pc-vex');

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [STRONG, STRONG, STRONG, STRONG];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-vex',  name: 'Vex',  ownership: {}, items: { contents: [] } });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});
afterEach(async () => { vi.useRealTimers(); await table.settle(); await table.drain(); });

/** A card button whose roller is Vex: a forced move, held while the lock is busy. */
async function vexForcedMove(text) {
  await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: text,
    speaker: { actor: 'pc-vex', alias: 'Vex' },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'face_danger', deferWhileBusy: true } },
  }));
}

/** A move-lock claim write: it takes the lock while the world has it free. */
const isClaim = (w) => campaignStateWrite('gm-1')(w) && w.value?.pendingMove === true && !world().pendingMove;

/** The world takes writes again: the GM's next campaignState write lands, the lock free. */
async function aWriteLands() {
  await table.client('gm-1').run(() => game.settings.set(MODULE_ID, 'campaignState',
    { ...game.settings.get(MODULE_ID, 'campaignState'), loreRecap: 'the writes are saved again' }));
  await table.settle(); await table.drain();
}

/** Time passes on the clients' timers (setTimeout faked); the table settles. */
async function pass(ms) {
  await vi.advanceTimersByTimeAsync(ms);
  await table.settle(); await table.drain();
}

/** A move held behind a claim the world refuses, and its own claim refused too. */
async function heldAndRefused(refusals) {
  const claim = holdWrites(table, isClaim);
  await vexForcedMove('Vex braces the hatch against the pressure.');
  await claim.arrived;
  await vexForcedMove('Vex checks the seals on the cargo pods.');
  await table.settle();
  const refused = failWrites(table, isClaim, { times: refusals });
  claim.fail();
  await table.settle(); await table.drain();
  return refused;
}

describe('issue #347 HELD-MOVES-WAIT-FOR-WRITE — a held move the world refused is tried again', () => {
  it('rolled when its retry comes, though no write lands meanwhile', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await heldAndRefused(1);
    expect(vexCards(), 'held after its refused claim (setup)').toHaveLength(0);

    await pass(9_000);
    expect(vexCards(), 'not before its retry').toHaveLength(0);
    await pass(1_000);
    expect(vexCards()).toHaveLength(1);
    expect(world().pendingMove).toBe(false);
  }, 60_000);

  it('a lasting refusal is tried five times, ever further apart, then left for a write that lands', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const lasting = await heldAndRefused(50);
    expect(lasting.refused, 'its own refused claim').toBe(1);

    await pass(10_000);
    expect(lasting.refused, 'the first retry, at 10 s').toBe(2);
    await pass(19_000);
    expect(lasting.refused, 'the next is 20 s after it').toBe(2);
    await pass(1_000);
    expect(lasting.refused).toBe(3);
    await pass(30_000 + 40_000 + 50_000);
    expect(lasting.refused, 'five retries in all').toBe(6);
    await pass(10 * 60_000);
    expect(lasting.refused, 'and no more').toBe(6);
    expect(vexCards()).toHaveLength(0);

    lasting.off();
    await aWriteLands();
    expect(vexCards(), 'rolled once the world saves again').toHaveLength(1);
  }, 60_000);

  it('control: a write that lands before the retry rolls it at once, and the retry rolls nothing more', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await heldAndRefused(1);
    await aWriteLands();
    expect(vexCards()).toHaveLength(1);
    await pass(10 * 60_000);
    expect(vexCards()).toHaveLength(1);
  }, 60_000);
});

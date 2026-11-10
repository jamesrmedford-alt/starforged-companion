/* global silenceConsoleErrors -- tests/setup.js */
/**
 * PROBE R2P-2 — REFUSED-CLAIM-DRAIN-DROPS-HELD-MOVE (LOSE-STATE)
 * A regression of FREE-FLOW-DEFERRED-AFTER-REFUSED-ROUND-CLAIM (the eleventh
 * audit's open items).
 *
 * A card button's forced move that meets the move lock is held (issue #325
 * W02: its card is claimed, its button reads taken everywhere, so a drop loses
 * the action) and handed back by the next campaignState write that leaves the
 * lock free. The fix made a REFUSED claim hand one back at once:
 *   src/index.js:2170-2174 claimPendingMoveLock — `outcome === "refused"` →
 *     drainDeferredForcedMoves() (:1409-1435), which shifts the held move out
 *     of `_deferredForcedMoves` and runs it through the pipeline at once;
 *   src/index.js:983-1001 onMessage — the held move's own claim, sent while the
 *     world is still refusing, comes back `refused` (not `busy`), so the move is
 *     not held again: "the move could not start … Try again" on the GM's screen
 *     and `return`. Nothing re-holds it, and its card stays claimed.
 * Before the fix the refused claim drained nothing and the held move waited
 * for the first write that landed with the lock free — the world taking writes
 * again — and was rolled then. Now a refusal that lasts two writes (the first
 * move's claim and the drained move's) loses the held move for good; the next
 * write that lands finds nothing held.
 *
 * Scenario (GM + two players; Vex is a PC no connected player owns, so its card
 * moves run as free-flow — tests/unit/heldMoveAfterRefusedClaim.test.js's set-up):
 *   1. A card's forced move for Vex claims the lock; its claim is on its way.
 *   2. A second card's forced move for Vex arrives: held behind that claim.
 *   3. The world refuses the first claim, and the next campaignState write too.
 *   4. The world takes writes again: the next campaignState write lands, the
 *      lock free.
 *   Expected: the held move is rolled (one Vex move card), as before the fix.
 *   Actual: it was handed straight into a claim the world refused and dropped —
 *     no Vex move card; nothing is held any more.
 *
 * Control: a refusal of the first claim alone — the held move's claim lands and
 * it is rolled (the fix's own case).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));

vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false })),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude, holdWrites, failWrites, campaignStateWrite } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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
afterEach(async () => { await table.settle(); await table.drain(); });

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

async function holdSecondBehindRefusedFirst({ refuseHeldClaimToo }) {
  const claim = holdWrites(table, isClaim);
  await vexForcedMove('Vex braces the hatch against the pressure.');
  await claim.arrived;

  await vexForcedMove('Vex checks the seals on the cargo pods.');
  await table.settle();
  expect(table.client('gm-1').notifications.some(n => /already being resolved/.test(n.message)), 'held behind the claim').toBe(true);

  // The refusal lasts one more claim: the drained move's own.
  if (refuseHeldClaimToo) failWrites(table, isClaim, { times: 1 });
  claim.fail();
  await table.settle(); await table.drain();
}

describe('R2P-2 — a forced move held behind a claim the world refuses', () => {
  it('control: the world refuses the first claim only — the held move is rolled', async () => {
    await holdSecondBehindRefusedFirst({ refuseHeldClaimToo: false });
    expect(vexCards()).toHaveLength(1);
    expect(world().pendingMove).toBe(false);
  }, 60_000);

  it('a refusal lasting two writes does not lose the held move: it is rolled once a write lands again', async () => {
    await holdSecondBehindRefusedFirst({ refuseHeldClaimToo: true });
    await aWriteLands();
    expect(world().loreRecap, 'the world takes writes again').toBe('the writes are saved again');
    expect(world().pendingMove).toBe(false);
    expect(vexCards(), 'the held card move is rolled').toHaveLength(1);
  }, 60_000);
});

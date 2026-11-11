/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/heldMoveRefusedTwice.test.js
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

describe('issue #345 AA48 — a forced move held behind a claim the world refuses', () => {
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

  it('the GM is told the held move stays held — the "try again" is the first move\'s alone', async () => {
    await holdSecondBehindRefusedFirst({ refuseHeldClaimToo: true });
    const notes = table.client('gm-1').notifications.map(n => n.message);
    expect(notes.filter(m => /held move could not start .* stays held/i.test(m))).toHaveLength(1);
    // The first move's own claim was refused: it was never held (LOCK-CLAIM-WEDGE's toast).
    expect(notes.filter(m => /could not start — the world did not save it\. Try again/.test(m))).toHaveLength(1);
    await aWriteLands();
    expect(vexCards()).toHaveLength(1);
  }, 60_000);

  it('while the world still refuses, the held move is not handed back claim after claim — it waits for a write that lands', async () => {
    const claim = holdWrites(table, isClaim);
    await vexForcedMove('Vex braces the hatch against the pressure.');
    await claim.arrived;
    await vexForcedMove('Vex checks the seals on the cargo pods.');
    await table.settle();
    const lasting = failWrites(table, isClaim, { times: 50 });
    claim.fail();
    await table.settle(); await table.drain();
    expect(lasting.refused, 'one refused claim of its own, then it waits').toBe(1);
    expect(vexCards()).toHaveLength(0);
    lasting.off();
    await aWriteLands();
    expect(vexCards(), 'rolled once the world saves again').toHaveLength(1);
    expect(world().pendingMove).toBe(false);
  }, 60_000);
});

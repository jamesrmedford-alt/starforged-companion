/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/heldMovesKeepOrderAfterRefusedClaims.test.js
 *
 * Two card moves held behind a refused lock claim are rolled oldest first,
 * whatever the world refuses (issue #347 AB24; AA48's fix).
 *
 * A held move handed back whose own claim is refused is held again at the
 * front, and the held moves wait for a campaignState write that lands
 * (decisions.md AA48 — "the refused claim's immediate drain is suppressed
 * meanwhile"). It was not for the drain made inside that older move's own
 * refusal: claimPendingMoveLock's refused branch handed the YOUNGER held move
 * to the pipeline before the older was held again, so a ⚑ Mark Progress was
 * scored after the 🏁 Attempt to Fulfill pressed after it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], rolled: [] }));

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
  // The GM's confirm: one per move that reached the roll, in the order they ran.
  confirmInterpretation: vi.fn(async (interpretation) => {
    control.rolled.push(String(interpretation?.playerNarration ?? ''));
    return true;
  }),
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
const OLDER   = 'OLDER: Vex checks the seals on the cargo pods.';
const YOUNGER = 'YOUNGER: Vex vents the bay.';

let table;
const world = () => table.world.campaignState();
const vexCards = () => table.cards(f => f.moveResolution && f.actorId === 'pc-vex');
const rolledOrder = () => control.rolled.map(t => (/OLDER|YOUNGER|FIRST/.exec(t) ?? ['?'])[0]);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [STRONG, STRONG, STRONG, STRONG];
  control.rolled = [];
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

/** Two card moves held, oldest first, behind a claim on its way that the world then refuses. */
async function twoHeldBehindARefusedClaim({ refuseTheOlderOnesClaimToo }) {
  const claim = holdWrites(table, isClaim);
  await vexForcedMove('FIRST: Vex braces the hatch against the pressure.');
  await claim.arrived;
  await vexForcedMove(OLDER);
  await table.settle();
  await vexForcedMove(YOUNGER);
  await table.settle();
  expect(table.client('gm-1').notifications.filter(n => /already being resolved/.test(n.message)), 'both are held').toHaveLength(2);
  if (refuseTheOlderOnesClaimToo) failWrites(table, isClaim, { times: 1 });
  claim.fail();
  await table.settle(); await table.drain();
}

describe('two card moves held behind a refused claim are rolled oldest first (issue #347 AB24)', () => {
  it('control: the world refuses the first claim only — the held moves are rolled in the order they were pressed', async () => {
    await twoHeldBehindARefusedClaim({ refuseTheOlderOnesClaimToo: false });
    expect(vexCards()).toHaveLength(2);
    expect(rolledOrder()).toEqual(['OLDER', 'YOUNGER']);
    expect(world().pendingMove).toBe(false);
  }, 60_000);

  it('the refusal lasts one more claim (the older held move\'s own): the older move is still rolled before the younger one', async () => {
    await twoHeldBehindARefusedClaim({ refuseTheOlderOnesClaimToo: true });
    // The older move's own refusal wakes nothing: both wait, held, for a write
    // that lands (decisions.md AA48) — the younger was handed to the pipeline
    // inside that refusal, and rolled first.
    expect(vexCards(), 'nothing rolled while the world refuses').toHaveLength(0);
    expect(rolledOrder()).toEqual([]);

    // The world saves again: any campaignState write that lands.
    await table.client('gm-1').run(() => globalThis.game.settings.set(MODULE_ID, 'campaignState',
      { ...globalThis.game.settings.get(MODULE_ID, 'campaignState'), dismissedEntities: ['Vex'] }));
    await table.settle(); await table.drain();

    // Nothing is lost (AA48): both are rolled — the older press first.
    expect(vexCards(), 'both held moves are rolled').toHaveLength(2);
    expect(world().pendingMove).toBe(false);
    expect(rolledOrder(), 'the older held move is rolled first').toEqual(['OLDER', 'YOUNGER']);
  }, 60_000);
});

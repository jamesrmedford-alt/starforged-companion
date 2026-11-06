/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/heldMoveAfterRefusedClaim.test.js
 *
 * FREE-FLOW-DEFERRED-AFTER-REFUSED-ROUND-CLAIM (found while fixing issue #342
 * Z25).
 *
 * A card button's forced move that meets the move lock is held and handed
 * back to the free-flow pipeline by the next campaignState write that leaves
 * the lock free (issue #325 W02). Since Z25 a Batch Mode round's claim on its
 * way to the server counts as taken, so a forced move arriving in that round
 * trip is held behind it. When the world refused the claim nothing was
 * written, and the held move waited for some later write to free the lock
 * (the GMs were told the round did not start; Send now recovered it). The
 * held move is handed back on a refused claim now — the round's, and the
 * free-flow pipeline's own (whose claim, set on the cache before its write,
 * holds a forced move behind it the same way).
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
import { scriptClaude, holdWrites, campaignStateWrite } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'The corridor holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const STRONG = [0.25, 0.35, 0.9];

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const vexCards = () => table.cards(f => f.moveResolution && f.actorId === 'pc-vex');
let seq = 0;

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
  // Vex: a PC no connected player owns — no round participant; their card moves run as free-flow.
  table.addActor({ id: 'pc-vex',  name: 'Vex',  ownership: {}, items: { contents: [] } });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});
afterEach(async () => { await table.settle(); await table.drain(); });

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

/** The GM presses a card button whose roller is Vex: a forced move, held while the lock is busy. */
async function vexForcedMove(text) {
  await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: text,
    speaker: { actor: 'pc-vex', alias: 'Vex' },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'face_danger', deferWhileBusy: true } },
  }));
}

/** Hold the GM's next move-lock claim — a write that takes the lock while the world has it free. */
const holdNextClaim = () =>
  holdWrites(table, (w) => campaignStateWrite('gm-1')(w) && w.value?.pendingMove === true && !world().pendingMove);

describe('FREE-FLOW-DEFERRED-AFTER-REFUSED-ROUND-CLAIM — a move held behind a claim the world refuses', () => {
  it('a forced move held behind the round\'s claim in flight is rolled once the claim is refused', async () => {
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();

    // The round becomes ready; its lock claim is on its way to the server.
    const claim = holdNextClaim();
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: `sub-${++seq}` });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    const r = round();
    await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
    await claim.arrived;

    // Vex's card move arrives meanwhile: held behind the round's claim (Z25).
    await vexForcedMove('Vex braces the hatch against the pressure.');
    await table.settle();
    expect(table.client('gm-1').notifications.some(n => /already being resolved/.test(n.message)), 'held behind the claim').toBe(true);
    expect(vexCards()).toHaveLength(0);

    // The world refuses the round's claim: the round stays collecting, the GMs are told.
    claim.fail();
    await table.settle(); await table.drain();
    expect(round().phase).toBe('collecting');
    expect(table.cards(f => f.batchNotice).some(m => /did not start/.test(m.content))).toBe(true);

    // Vex's held move was handed back and rolled — and freed the lock after.
    expect(vexCards()).toHaveLength(1);
    expect(world().pendingMove).toBe(false);
  }, 30_000);

  it('a forced move held behind a free-flow move\'s claim is rolled once that claim is refused', async () => {
    const claim = holdNextClaim();
    await vexForcedMove('Vex braces the hatch against the pressure.');
    await claim.arrived;

    await vexForcedMove('Vex checks the seals on the cargo pods.');
    await table.settle();
    expect(table.client('gm-1').notifications.some(n => /already being resolved/.test(n.message)), 'held behind the claim').toBe(true);

    claim.fail();
    await table.settle(); await table.drain();
    // The first move could not start; the second, held behind it, is rolled.
    expect(table.client('gm-1').notifications.some(n => /could not start/.test(n.message))).toBe(true);
    expect(vexCards()).toHaveLength(1);
    expect(vexCards()[0].content).toMatch(/Face Danger/);
    expect(world().pendingMove).toBe(false);
  }, 30_000);

  it('control: a forced move held behind a claim that lands is rolled after that move releases the lock', async () => {
    const claim = holdNextClaim();
    await vexForcedMove('Vex braces the hatch against the pressure.');
    await claim.arrived;
    await vexForcedMove('Vex checks the seals on the cargo pods.');
    await table.settle();
    claim.release();
    await table.settle(); await table.drain();
    expect(vexCards()).toHaveLength(2);
    expect(world().pendingMove).toBe(false);
  }, 30_000);
});

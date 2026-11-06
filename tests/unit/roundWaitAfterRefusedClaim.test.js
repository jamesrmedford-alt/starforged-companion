/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/roundWaitAfterRefusedClaim.test.js
 *
 * ROUND-WAIT-AFTER-REFUSED-CLAIM (found while fixing the issue #342 open
 * items; FREE-FLOW-DEFERRED-AFTER-REFUSED-ROUND-CLAIM's mirror).
 *
 * A Batch Mode round that becomes ready while a free-flow move's lock claim
 * is on its way waits for the lock (driver.js waitForLock — the claim in
 * flight counts as taken), and is woken by the campaignState write that frees
 * it (onCampaignStateChanged). When the world refused that claim nothing was
 * written, so nothing woke the round: it sat collecting, ready, until someone
 * submitted again or a GM pressed Send now. A refused claim now wakes a round
 * waiting for the lock (noteMoveLockFreed), as it hands a held forced move
 * back.
 */
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


describe('ROUND-WAIT-AFTER-REFUSED-CLAIM — a round waiting behind a free-flow claim the world refuses', () => {
  it('the round resolves once the free-flow claim is refused', async () => {
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
    const claim = holdNextClaim();
    await vexForcedMove('Vex braces the hatch against the pressure.');
    await claim.arrived;

    // The round becomes ready while Vex's claim is on its way: it waits.
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: `sub-${++seq}` });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    const r = round();
    await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
    await table.settle();
    expect(round().phase, 'the round waits for the lock').toBe('collecting');

    // The world refuses Vex's claim: no write frees the lock.
    claim.fail();
    await table.settle(); await table.drain();
    expect(table.client('gm-1').notifications.some(n => /could not start/.test(n.message))).toBe(true);
    expect(vexCards()).toHaveLength(0);

    // The round resolved all the same: Kira's move rolled, the round narrated, round 2 open.
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-kira'), `round ${round()?.number} ${round()?.phase}`).toHaveLength(1);
    expect(table.cards(f => f.narratorCard && f.roundId)).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(world().pendingMove).toBe(false);
  }, 30_000);

  it('control: the free-flow claim lands — the round waits for that move, then resolves', async () => {
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
    const claim = holdNextClaim();
    await vexForcedMove('Vex braces the hatch against the pressure.');
    await claim.arrived;
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: `sub-${++seq}` });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    const r = round();
    await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
    await table.settle();
    claim.release();
    await table.settle(); await table.drain();
    expect(vexCards()).toHaveLength(1);
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-kira')).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);
});

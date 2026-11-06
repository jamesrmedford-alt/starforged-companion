/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundClaimVisibleToFreeFlow.test.js
 *
 * Issue #342 Z25 ROUND-CLAIM-INVISIBLE-TO-FREE-FLOW (the eleventh audit's
 * PIPE-4).
 *
 * The Batch Mode round's move-lock claim (index.js claimPendingMoveLock) is
 * written as a copy, so while it was on its way to the server the canonical
 * GM's own cache still read the lock free, and a free-flow move checked in
 * that window claimed it too: two pipelines ran at once. The free-flow claim
 * sets `pendingMove` on the cached campaignState in place before its write,
 * so a second line on the same GM sees it at once (the tenth audit's X08
 * note). A held forced move and a round waiting for the lock wake on the same
 * write — the lock's release — so the drained free-flow move checks the lock
 * inside the round's claim round trip, deterministically. The round's claim
 * is now marked in flight on its client until the write lands, and the
 * free-flow check treats it as taken. The write is held here for that round
 * trip.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));

vi.mock('../../src/pacing/router.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
    decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  };
});
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
import { scriptClaude, holdWrites, campaignStateWrite, traceTable } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const KEY = `${MODULE_ID}.campaignState`;
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = 'The corridor holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const STRONG = [0.25, 0.35, 0.9];

let table;
let script;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
let seq = 0;
let lockLog = [];

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
  script = scriptClaude(table, { fallback: () => REPLY });
  // Every lock state the world takes, in order (read as each campaignState write applies).
  lockLog = [];
  table.onEvent((e) => {
    if (e.type !== 'write' || e.kind !== 'setting' || e.key !== KEY || e.outcome !== 'applied') return;
    const cs = world();
    const last = lockLog.at(-1);
    const now = cs.pendingMove ? cs.pendingMoveClaim : null;
    if (!last || last.claim !== now) lockLog.push({ claim: now });
  });
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

/** Claims that landed over a lock already held by another claim — two holders at once. */
const claimsOverHeld = () => lockLog.filter((s, i) => i > 0 && s.claim && lockLog[i - 1].claim && lockLog[i - 1].claim !== s.claim);

describe('Z25 — the round\'s claim and a free-flow move\'s claim never both hold the lock', () => {
  it('a held free-flow move and a waiting round, woken by the same release, do not both claim', async () => {
    const trace = traceTable(table);
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();

    // Vex's first card move runs as free-flow and holds the lock through its narration.
    const narration = script.hold(call => call.model === NARRATION_MODEL);
    await vexForcedMove('Vex braces the hatch against the pressure.');
    await narration.arrived;
    expect(world().pendingMove, 'Vex\'s free-flow move holds the lock').toBe(true);

    // The round becomes ready meanwhile: it waits for the lock.
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: `sub-${++seq}` });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    const r = round();
    await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
    expect(round().phase, 'the round waits for the lock').toBe('collecting');

    // A second card move for Vex arrives: held for the lock (W02).
    await vexForcedMove('Vex checks the seals on the cargo pods.');
    await table.settle();

    // The next lock claim is on its way to the server (a round trip): hold
    // it until the drained free-flow move has checked the lock — and let it
    // land the moment that move's own claim has (a round trip is
    // milliseconds; a move takes seconds).
    // (A claim: a write that takes the lock while the world has it free.)
    const claim = holdWrites(table, (w) => campaignStateWrite('gm-1')(w) && w.value?.pendingMove === true && !world().pendingMove);
    let heldClaimId = null;
    let landed = false;
    table.onEvent((e) => {
      if (landed || !heldClaimId || e.type !== 'write' || e.kind !== 'setting' || e.key !== KEY || e.outcome !== 'applied') return;
      if (world().pendingMove && world().pendingMoveClaim !== heldClaimId) { landed = true; claim.release(); }
    });
    trace.mark('release narration');
    narration.release();
    const heldWrite = await claim.arrived;
    heldClaimId = heldWrite.value?.pendingMoveClaim ?? null;
    trace.mark('held claim arrived: ' + JSON.stringify({ claim: heldClaimId, store: world().pendingMoveClaim, round: round()?.phase }));
    await table.settle(); await table.drain();
    claim.release();
    await table.settle(); await table.drain();

    // Sanity: Vex's two moves and Kira's round entry all rolled.
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-vex')).toHaveLength(2);
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-kira')).toHaveLength(1);

    expect(claimsOverHeld()).toEqual([]);
  }, 30_000);

  it('control: two free-flow lines on one GM — the second sees the first\'s claim at once and is held', async () => {
    const narration = script.hold(call => call.model === NARRATION_MODEL);
    await vexForcedMove('Vex braces the hatch against the pressure.');
    await narration.arrived;
    await vexForcedMove('Vex checks the seals on the cargo pods.');
    await table.settle();
    expect(table.client('gm-1').notifications.some(n => /already being resolved/.test(n.message))).toBe(true);
    narration.release();
    await table.settle(); await table.drain();
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-vex')).toHaveLength(2);
    expect(claimsOverHeld()).toEqual([]);
  }, 30_000);
});

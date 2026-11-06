/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundLockWaitMarkedLate.test.js
 *
 * ROUND-LOCK-WAIT-MARKED-LATE (found while fixing issue #342 Z19 / Z25).
 *
 * A Batch Mode round whose move-lock claim meets a busy lock waits for the
 * campaignState write that frees it (onCampaignStateChanged sees
 * `_waitingForLock` and runs the advance pass again). The driver marked the
 * wait only once the busy claim's answer had come back, so a release landing
 * between the claim's read and that mark was heard with nothing waiting — and
 * no later write woke the round: it sat collecting until someone acted again.
 * In Foundry the window is the time a release's delivery would need to land
 * inside the claim's answer, practically never; the test opens it by holding
 * the busy answer, at the driver's host seam (configureBatchDriver), until
 * the release has landed. After marking the wait the driver now re-checks the
 * lock and, already free, goes round again.
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
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = 'The corridor holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const STRONG = [0.25, 0.35, 0.9];

let table;
let script;
let gm;
let driver;
let index;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
let seq = 0;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
  gm = table.client('gm-1');
  driver = await gm.import('../../src/batch/driver.js');
  index = await gm.import('../../src/index.js');
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [STRONG, STRONG, STRONG];
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
  silenceConsoleErrors();
});
afterEach(async () => {
  await table.settle(); await table.drain();
  // The driver's host as index.js configures it.
  gm.run(() => driver.configureBatchDriver({ claimMoveLock: index.claimPendingMoveLock, releaseMoveLock: index.releasePendingMoveLock }));
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

/** The GM presses a card button whose roller is Vex: a forced move (free-flow, outside the round). */
async function vexForcedMove(text) {
  await gm.run(() => globalThis.ChatMessage.create({
    content: text,
    speaker: { actor: 'pc-vex', alias: 'Vex' },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'face_danger', deferWhileBusy: true } },
  }));
}

/**
 * The round's claims go through index.js's claim, but the first busy answer
 * is held until `gap()` — the busy lock's release — has landed on this GM.
 */
function holdFirstBusyAnswer(gap) {
  let armed = true;
  gm.run(() => driver.configureBatchDriver({
    claimMoveLock: async () => {
      const lock = await index.claimPendingMoveLock();
      if (lock.busy && armed) { armed = false; await gap(); }
      return lock;
    },
    releaseMoveLock: index.releasePendingMoveLock,
  }));
  return { get used() { return !armed; } };
}

/** Kira acts and confirms, Ren passes: the round is ready while Vex's move holds the lock. */
async function roundReady() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: `sub-${++seq}` });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  const r = round();
  await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
}

describe('ROUND-LOCK-WAIT-MARKED-LATE — a release landing before the round marks its wait', () => {
  it('the busy lock is released while the claim\'s answer comes back: the round still resolves', async () => {
    await gm.setSetting('batchMode.enabled', true);
    await table.settle();

    // Vex's free-flow move holds the lock through its narration.
    const narration = script.hold(call => call.model === NARRATION_MODEL);
    await vexForcedMove('Vex braces the hatch against the pressure.');
    await narration.arrived;
    expect(world().pendingMove, 'Vex\'s move holds the lock').toBe(true);

    // The round's claim reads the lock busy; before its answer is acted on,
    // Vex's move finishes and its release lands on this GM.
    const seam = holdFirstBusyAnswer(async () => {
      narration.release();
      while (globalThis.game.settings.get(MODULE_ID, 'campaignState')?.pendingMove) {
        await new Promise(r => setTimeout(r, 5));
      }
    });
    await roundReady();
    await table.settle(); await table.drain();

    // Sanity: the busy answer was held, and Vex's move rolled and freed the lock.
    expect(seam.used).toBe(true);
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-vex')).toHaveLength(1);

    // The round resolved: Kira's move rolled, the round narrated, round 2 open.
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-kira'), `round ${round()?.number} ${round()?.phase}`).toHaveLength(1);
    expect(table.cards(f => f.narratorCard && f.roundId)).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(world().pendingMove).toBe(false);
  }, 30_000);

  it('control: the release lands after the round marks its wait — the release wakes the round', async () => {
    await gm.setSetting('batchMode.enabled', true);
    await table.settle();
    const narration = script.hold(call => call.model === NARRATION_MODEL);
    await vexForcedMove('Vex braces the hatch against the pressure.');
    await narration.arrived;
    await roundReady();
    expect(round().phase, 'the round waits for the lock').toBe('collecting');
    narration.release();
    await table.settle(); await table.drain();
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-kira')).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);
});

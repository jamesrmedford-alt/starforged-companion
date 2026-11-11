/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchSendNowForItsRound.test.js
 *
 * Issue #345 AA38 SEND-NOW-OUTLIVES-ITS-ROUND (the twelfth audit's BATCH-3).
 *
 * A GM's Send now on a collecting round set the driver's module flag
 * `_sendNowRequested` (src/batch/driver.js requestSendNow) and ran the
 * advance pass. When the move lock is busy — another move (here a
 * non-participant's card move, which runs as free-flow "now while the round
 * collects") is being narrated — startResolution waits for it and keeps the
 * request. It was cleared only by startResolution itself, and was not tied to
 * the round it was pressed for: nothing cleared it when that round stopped
 * collecting another way — a GM's Discard round, End a Session, the mode off.
 *
 * So when the lock freed, the lock-free wake ran a pass over the NEXT round,
 * read the stale request and resolved that round at once as a GM's Send now:
 * a reading its player had not confirmed was "used as read" and rolled —
 * nobody pressed Send now for it. (With the round closed and none open — End
 * a Session — it waited for the next session's first round in the same page
 * load.)
 *
 * The fix: the request is the id of the round it was pressed for, and
 * resolves only that round.
 *
 * Harness: batchCardMoveHeldForNextRound.test.js's (real driver, relays,
 * free-flow pipeline; pacing / interpreter / ability scan / detection mocked,
 * dice scripted). Ash is a PC no connected player owns, so his card's move
 * is a non-participant's: free-flow, holding the lock while its narration —
 * held by scriptClaude — is written.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

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
      for (const d of control.dice.shift() ?? [0.25, 0.35, 0.9]) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = 'The thrusters flare.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
let claude;
const round = () => table.world.getSetting('batchMode.round');
const kiraRoundRolls = () => table.cards(f => f.moveResolution && f.roundUserId === 'pl-1');

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  // A PC no connected player owns: his card's move is a non-participant's.
  table.addActor({ id: 'pc-ash',  name: 'Ash',  ownership: {}, items: { contents: [] } });
  claude = scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

/**
 * Round 1: Kira has confirmed, Ren's action is read. Ash's card move runs as
 * free-flow and holds the move lock while its narration is written (held).
 */
async function roundOneWithTheLockBusy() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I cover the hatch.', submissionId: 'r1' });
  await table.drain();
  const held = claude.hold(call => call.model === NARRATION_MODEL);
  await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: 'Ash fires the thrusters.', speaker: { actor: 'pc-ash', alias: 'Ash' },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'face_danger', deferWhileBusy: true } },
  }));
  await held.arrived;
  await table.settle();
  expect(table.world.getSetting('campaignState').pendingMove).toBe(true);
  return held;
}

/** Kira's round-2 action is read, not confirmed — then the lock frees. */
async function kiraReadsThenLockFrees(held, submissionId) {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I check the vent again.', submissionId });
  await table.settle();
  expect(round().entries['pl-1'].status).toBe('read');                // read, not confirmed
  held.release();                                                     // Ash's narration lands; the lock frees
  await table.drain();
}

const roundNow = () => ({
  round:      round().number,
  phase:      round().phase,
  kiraStatus: round().number === 2 ? round().entries['pl-1'].status : 'round 2 resolved',
  kiraRolled: kiraRoundRolls().length,
});

describe('issue #345 AA38 — a Send now that waited on the lock resolves only the round it was pressed for', () => {
  it('control: Send now while the lock is busy resolves round 1 once the lock frees (the intended wait)', async () => {
    const held = await roundOneWithTheLockBusy();
    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
    held.release();
    await table.drain();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(table.cards(f => f.moveResolution && f.roundNumber === 1)).toHaveLength(2);
  }, 60_000);

  it("control: with no Send now, a discarded round's successor waits for its players once the lock frees", async () => {
    const held = await roundOneWithTheLockBusy();
    await relay('gm-1', 'batch.discard', { roundId: round().id });
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    await kiraReadsThenLockFrees(held, 'k2');
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(round().entries['pl-1'].status).toBe('read');
  }, 60_000);

  it("Send now (waiting), then Discard: round 2 is not resolved by round 1's Send now — Kira's unconfirmed reading is not rolled", async () => {
    const held = await roundOneWithTheLockBusy();
    await relay('gm-1', 'batch.sendNow', { roundId: round().id });       // waits for the lock
    await relay('gm-1', 'batch.discard', { roundId: round().id });       // the GM gives up on round 1
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    await kiraReadsThenLockFrees(held, 'k2');
    expect(roundNow()).toEqual({ round: 2, phase: 'collecting', kiraStatus: 'read', kiraRolled: 0 });
  }, 60_000);

  it('Send now (waiting), then the mode off and on again: the new round is not resolved on its first reading', async () => {
    const held = await roundOneWithTheLockBusy();
    await relay('gm-1', 'batch.sendNow', { roundId: round().id });       // waits for the lock
    await table.client('gm-1').setSetting('batchMode.enabled', false);   // the round, collecting, closes
    await table.settle();
    expect(round()).toMatchObject({ number: 1, phase: 'closed', closeReason: 'mode-off' });
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    await kiraReadsThenLockFrees(held, 'k2');
    expect(roundNow()).toEqual({ round: 2, phase: 'collecting', kiraStatus: 'read', kiraRolled: 0 });
  }, 60_000);

  it("Send now (waiting), then End a Session: the next session's first round does not resolve on its first reading", async () => {
    const held = await roundOneWithTheLockBusy();
    await relay('gm-1', 'batch.sendNow', { roundId: round().id });       // waits for the lock
    // End a Session (its campaignState write): the collecting round closes.
    await table.client('gm-1').setSetting('campaignState', { ...table.world.getSetting('campaignState'), sessionActive: false });
    await table.settle();
    expect(round()).toMatchObject({ number: 1, phase: 'closed', closeReason: 'session-ended' });
    held.release();                                                     // the lock frees with no round open
    await table.drain();
    // Begin a Session later in the same page load: round 1 of session 2.
    await table.client('gm-1').setSetting('campaignState', {
      ...table.world.getSetting('campaignState'), sessionActive: true, currentSessionId: 'sess-2', sessionNumber: 2,
    });
    await table.settle();
    await table.drain();
    expect(round()).toMatchObject({ number: 1, sessionId: 'sess-2', phase: 'collecting' });
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I wake in the med bay.', submissionId: 'k3' });
    await table.drain();
    const r = round();
    expect({
      session: r.sessionId, round: r.number, phase: r.phase,
      kiraStatus: r.number === 1 ? r.entries['pl-1'].status : 'round 1 resolved',
    }).toEqual({ session: 'sess-2', round: 1, phase: 'collecting', kiraStatus: 'read' });
  }, 60_000);
});

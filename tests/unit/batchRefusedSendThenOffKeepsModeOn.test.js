/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchRefusedSendThenOffKeepsModeOn.test.js
 *
 * Issue #345 AA39 REFUSED-SEND-THEN-OFF-STILL-TURNS-OFF (the twelfth audit's
 * BATCH-4).
 *
 * The toolbar's switch, pressed while a collecting round has actions
 * submitted, asks "Send now, then turn off / Discard the round / Cancel"
 * (src/ui/roundWindow.js toggleBatchMode). "Send now, then turn off" relays
 * `batch.sendNow` with `modeOffAfter`. On the canonical GM, requestSendNow
 * (src/batch/driver.js) wrote the round's `modeOffAfter` mark FIRST and only
 * then checked whether the round could be sent: with the X-Card in play it
 * returns `{ ok: false, reason: "x-card" }` — with readings to run and no
 * Claude key, "no-key" — and the GM is told why the send changed nothing
 * (relay.js SEND_NOW_REFUSALS). The mark stayed on the round.
 *
 * The GM, told nothing happened, kept playing in Batch Mode. Once the round
 * resolved the ordinary way (everyone ready), finishRound read the stale mark
 * and switched Batch Mode off: every Round window closed, no next round
 * opened — a mode change the GM had been told did not happen.
 *
 * The fix: a collecting round is marked only once its send is accepted.
 *
 * Harness: batchModeOffWhileUpgrading.test.js's Batch Mode table; the X-Card
 * is played with `!x` by a player and resumed with `!x clear` by the GM.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

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
    // challenge 3 and 4, action 6 (+edge): a strong hit — no upgrade to wait for.
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const round = () => table.world.getSetting('batchMode.round');
const world = () => table.world.getSetting('campaignState');
const gmNotices = () => table.client('gm-1').notifications.map(n => n.message).join('\n');

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => REPLY });
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

/** Kira confirmed, Ren's action read; then Ren plays the X-Card. */
async function roundUnderTheXCard() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I cover the hatch.', submissionId: 'r1' });
  await table.drain();
  await table.client('pl-2').chat('!x');
  await table.settle();
  await table.drain();
  expect(world().xCardActive).toBe(true);
}

async function gmSwitchesOff(choice) {
  const gm = table.client('gm-1');
  gm.answerDialogs(d => d.choose(choice));
  const mod = await gm.import('../../src/ui/roundWindow.js');
  await gm.run(() => mod.toggleBatchMode());
  await table.settle();
  await table.drain();
}

/** The GM resumes; Ren confirms; the round resolves the ordinary way. */
async function resumeAndResolve() {
  await table.client('gm-1').chat('!x clear');
  await table.settle();
  await table.drain();
  expect(world().xCardActive).toBe(false);
  await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
  await table.drain();
}

describe('issue #345 AA39 — a refused "Send now, then turn off" leaves Batch Mode on', () => {
  it('control: the send is refused and the GM is told; the mode stays on and the round still collects', async () => {
    await roundUnderTheXCard();
    await gmSwitchesOff('send');
    expect(table.world.getSetting('batchMode.enabled')).toBe(true);
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
    expect(gmNotices()).toMatch(/X-Card is in play — the round can't be resolved/);
  }, 60_000);

  it('control: answered Cancel instead, the round resolves after the resume and round 2 opens, the mode on', async () => {
    await roundUnderTheXCard();
    await gmSwitchesOff('cancel');
    await resumeAndResolve();
    expect(table.world.getSetting('batchMode.enabled')).toBe(true);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 60_000);

  it('after the send the X-Card refused, the round resolving later does not switch Batch Mode off', async () => {
    await roundUnderTheXCard();
    await gmSwitchesOff('send');
    expect(table.world.getSetting('batchMode.enabled')).toBe(true);     // told it was refused
    expect.soft(round().modeOffAfter, 'nothing is armed').toBe(false);
    await resumeAndResolve();
    expect({
      enabled: table.world.getSetting('batchMode.enabled'),
      round:   round().number,
      phase:   round().phase,
    }).toEqual({ enabled: true, round: 2, phase: 'collecting' });
  }, 60_000);

  it('after the send refused for want of a key to read with, the round resolving once a key is entered does not switch Batch Mode off', async () => {
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'k1' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    await table.drain();
    await table.setClaudeKey('gm-1', '');
    await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I cover the hatch.', submissionId: 'r1' });
    await table.drain();
    expect(round().entries['pl-2']).toMatchObject({ status: 'submitted', error: null });   // waits to be read

    await gmSwitchesOff('send');
    expect(gmNotices()).toMatch(/No GM with a Claude key is connected/);
    expect(table.world.getSetting('batchMode.enabled')).toBe(true);
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
    expect.soft(round().modeOffAfter, 'nothing is armed').toBe(false);

    // The key entered: Ren's action is read, he confirms, the round resolves the ordinary way.
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    await table.drain();
    expect(round().entries['pl-2']).toMatchObject({ status: 'read' });
    await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
    await table.drain();
    expect({ enabled: table.world.getSetting('batchMode.enabled'), round: round().number, phase: round().phase })
      .toEqual({ enabled: true, round: 2, phase: 'collecting' });
  }, 60_000);

  it('control: "Send now, then turn off" accepted still turns the mode off once the round is done', async () => {
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'k1' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    await table.drain();
    await gmSwitchesOff('send');
    expect(table.world.getSetting('batchMode.enabled')).toBe(false);
    expect(round()).toMatchObject({ number: 1, phase: 'closed', modeOffAfter: true });
  }, 60_000);
});

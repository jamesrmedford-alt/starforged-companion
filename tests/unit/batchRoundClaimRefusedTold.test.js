/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundClaimRefusedTold.test.js
 *
 * Issue #345 AA40 ROUND-NARRATION-CLAIM-REFUSED-SILENT (the twelfth audit's
 * BATCH-5).
 *
 * A Batch Mode round claims the move lock twice: once for its rolls and
 * records (startResolution), once again for its narration (narrateTheRound).
 * A pass re-entering a round still rolling (after a refused step, on Send
 * now) claims it for the rolls in rollRound. A claim the world refuses comes
 * back `{ claim: null, refused: true }` (index.js claimPendingMoveLock).
 *
 *   - startResolution handles it: the round stays collecting and the GMs are
 *     whispered "the round did not start … Press Send now to try again".
 *   - narrateTheRound and rollRound's own claim handled only `busy`: refused,
 *     they returned false — the advance pass ended, nothing was whispered
 *     (tellRoundStopped ran only on a throw), nothing waited for the lock.
 *     The round sat in "narrating" (or "rolling") with no narration, every
 *     window saying "The round is being resolved…", no next round, typed chat
 *     still table talk — against the help: "If the world doesn't save a step
 *     of a round being resolved, the round stops and the GMs are told; Send
 *     now tries again."
 *
 * The fix: a refused claim there stops the round and tells the GMs (the
 * round-stopped notice); Send now claims it again.
 *
 * Harness: batchRoundWriteRefusedMidRoll.test.js's; the refusal is the one
 * campaignState write that claims the lock while the round is in a phase.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: narration, inputMethod: 'chat',
  })),
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
    // challenge 3 and 4, action 6 (+iron): a strong hit — no upgrade to wait for.
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { failWrites, scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const NARRATION_MODEL = 'claude-sonnet-5-5';

let table;
const round = () => table.world.getSetting('batchMode.round');
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
const gmBatchWhispers = () => table.cards(f => f.batchNotice).filter(m => (m.whisper ?? []).includes('gm-1'));
const gmStoppedNotices = () => table.cards(f => f.batchNotice && f.batchRoundStoppedNotice).filter(m => (m.whisper ?? []).includes('gm-1'));
const roundWrite = (w) => w.kind === 'setting' && w.key === `${MODULE_ID}.batchMode.round` && w.client === 'gm-1';
/** The campaignState write that claims the move lock, made while the round is in `phase`. */
const lockClaimDuring = (phase) => (w) => w.kind === 'setting' && w.key === `${MODULE_ID}.campaignState`
  && w.value?.pendingMove === true && table.world.getSetting('batchMode.round')?.phase === phase;

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

/** Kira acts, Ren passes: the round resolves. */
async function kiraActsRenPasses() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I brace the hatch.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await table.drain();
}

describe('issue #345 AA40 — a refused lock claim for a round already resolving is said to the GMs', () => {
  it('control: the same refusal of the rolls\' claim (round collecting) is told to the GMs, the round still collecting', async () => {
    const refused = failWrites(table, lockClaimDuring('collecting'));
    await kiraActsRenPasses();
    expect(refused.refused).toBe(1);
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
    expect(gmBatchWhispers().some(m => /did not start/.test(m.content))).toBe(true);
  }, 60_000);

  it('control: with nothing refused the round is narrated and round 2 opens', async () => {
    await kiraActsRenPasses();
    expect(narrations()).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(gmStoppedNotices()).toHaveLength(0);
  }, 60_000);

  it('control: the round the refused narration claim stalled goes on when a GM presses Send now', async () => {
    failWrites(table, lockClaimDuring('narrating'), { times: 1 });
    await kiraActsRenPasses();
    expect(round()).toMatchObject({ number: 1, phase: 'narrating' });
    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.drain();
    expect(narrations()).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 60_000);

  it('refused at the narration: the round stops and the GMs are told; Send now narrates it once and round 2 opens', async () => {
    const refused = failWrites(table, lockClaimDuring('narrating'), { times: 1 });
    await kiraActsRenPasses();
    expect(refused.refused).toBe(1);
    // Every move rolled and recorded; nothing narrated.
    expect(round().entries['pl-1'].status).toBe('recorded');
    expect(round()).toMatchObject({ number: 1, phase: 'narrating' });
    expect(narrations()).toHaveLength(0);
    expect(gmStoppedNotices(), 'the GMs are told the round stopped').toHaveLength(1);
    expect(gmStoppedNotices()[0].content).toMatch(/Send now/);

    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.drain();
    expect(narrations()).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(table.world.campaignState().pendingMove).toBe(false);
  }, 60_000);

  it('refused when Send now re-enters a round a refused step left rolling: the GMs are told again; the next Send now goes on', async () => {
    // A refused "recorded" write stops the round while it rolls (issue #342 Z18): told once.
    failWrites(table, (w) => roundWrite(w) && w.value?.entries?.['pl-1']?.status === 'recorded', { times: 1 });
    await kiraActsRenPasses();
    expect(round()).toMatchObject({ number: 1, phase: 'rolling' });
    expect(gmStoppedNotices()).toHaveLength(1);

    // Send now re-enters the rolls; their lock claim is refused.
    const refused = failWrites(table, lockClaimDuring('rolling'), { times: 1 });
    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.drain();
    expect(refused.refused).toBe(1);
    expect(round()).toMatchObject({ number: 1, phase: 'rolling' });
    expect(gmStoppedNotices(), 'the refused claim is said too').toHaveLength(2);

    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.drain();
    expect(narrations()).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(table.cards(f => f.moveResolution && f.roundId)).toHaveLength(1);   // rolled once
  }, 60_000);
});

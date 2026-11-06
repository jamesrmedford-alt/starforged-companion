/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundWriteRefusedMidRoll.test.js
 *
 * Issue #342 Z18 ROUND-WRITE-REFUSED-LOSES-RECORD (the eleventh audit's
 * BATCH-1).
 *
 * A Batch Mode round rolls an entry (rollMove posts its result card), then
 * stamps `rolled` on the round, then records the move (recordMove →
 * persistResolution: the roller's meters and the move's record). When the
 * world refused that one round write, the exception left rollEntry before
 * recordMove ran — the strong hit's +1 momentum never landed — and the round
 * sat silently in `rolling`: nothing re-entered the advance pass (Send now
 * answered "resolving" and did nothing; the window's was disabled). Now the
 * round's bookkeeping never gates the move's record, a stopped pass is said
 * to the GMs, and Send now runs it again (the window offers it while the
 * round rolls or narrates).
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
    // challenge 3 and 4, action 6 (+iron): a strong hit, +1 momentum.
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { failWrites, scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { buildRoundView } from '../../src/batch/roundView.js';

const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';

let table;
const round = () => table.world.getSetting('batchMode.round');
const momentum = (id) => table.actors.get(id).system.momentum.value;
const roundWrite = (w) => w.kind === 'setting' && w.key === `${MODULE_ID}.batchMode.round` && w.client === 'gm-1';
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
const gmWhispers = (flag) => table.cards(f => f.batchNotice && f[flag]).filter(m => (m.whisper ?? []).includes('gm-1'));

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
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

async function kiraActsRenPasses() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I brace against the hull and push through.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await table.drain();
}

describe('Z18 — a round write refused between a move\'s roll and its record', () => {
  it('control: with no refusal the strong hit is recorded (+1 momentum) and round 2 opens', async () => {
    const before = momentum('pc-kira');
    await kiraActsRenPasses();
    expect(momentum('pc-kira')).toBe(before + 1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);

  it('the move\'s record still lands (its +1 momentum) when the round\'s "rolled" write is refused', async () => {
    const before = momentum('pc-kira');
    const refused = failWrites(table, (w) => roundWrite(w) && w.value?.entries?.['pl-1']?.status === 'rolled', { times: 1 });
    await kiraActsRenPasses();
    expect(refused.refused).toBe(1);
    // The result card is up — the move was rolled.
    expect(table.cards(f => f.moveResolution && f.roundId)).toHaveLength(1);
    // The record is the move's, not the round's bookkeeping.
    expect(momentum('pc-kira')).toBe(before + 1);
  }, 30_000);

  it('the round is not left silently wedged in "rolling": it goes on, narrating the move as rolled', async () => {
    failWrites(table, (w) => roundWrite(w) && w.value?.entries?.['pl-1']?.status === 'rolled', { times: 1 });
    await kiraActsRenPasses();
    // The GM's Send now while a round resolves.
    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.drain();
    const told = table.cards(f => f.batchNotice).some(m => (m.whisper ?? []).includes('gm-1'));
    const movedOn = round()?.phase !== 'rolling';
    expect(told || movedOn, `GMs told: ${told}; round phase: ${round()?.phase}`).toBe(true);
    expect(roundCards()).toHaveLength(1);
    expect(narrations().at(-1)?.userText ?? '').toMatch(/Face Danger[^\n]*: strong hit/);
  }, 30_000);

  it('a refused "recorded" write stops the round: the GMs are told, and Send now goes on — the move recorded once', async () => {
    const before = momentum('pc-kira');
    const refused = failWrites(table, (w) => roundWrite(w) && w.value?.entries?.['pl-1']?.status === 'recorded', { times: 1 });
    await kiraActsRenPasses();
    expect(refused.refused).toBe(1);
    expect(round()).toMatchObject({ number: 1, phase: 'rolling' });
    expect(gmWhispers('batchRoundStoppedNotice')).toHaveLength(1);
    expect(momentum('pc-kira')).toBe(before + 1);                    // the record landed

    // The GM's window offers Send now while the round rolls.
    const view = buildRoundView(round(), { userId: 'gm-1', isGM: true }, {
      enabled: true, sessionActive: true, gmConnected: true, keyedGm: true, connectedUserIds: ['gm-1', 'pl-1', 'pl-2'],
    });
    expect(view.gm.sendNow).toMatchObject({ enabled: true, reason: null });

    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.drain();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(roundCards()).toHaveLength(1);
    expect(narrations().at(-1)?.userText ?? '').toMatch(/Face Danger[^\n]*: strong hit/);
    expect(momentum('pc-kira')).toBe(before + 1);                    // not rolled or recorded again
    expect(table.cards(f => f.moveResolution && f.roundId)).toHaveLength(1);
    expect(gmWhispers('batchIncompleteNotice')).toHaveLength(0);     // this GM recorded it: nothing to check
  }, 30_000);

  it('a refused narration claim stops the round while it narrates: the GMs are told, and Send now narrates it once', async () => {
    failWrites(table, (w) => roundWrite(w) && w.value?.phase === 'narrating' && !!w.value?.narrationClaim, { times: 1 });
    await kiraActsRenPasses();
    expect(round()).toMatchObject({ number: 1, phase: 'narrating' });
    expect(gmWhispers('batchRoundStoppedNotice')).toHaveLength(1);
    expect(roundCards()).toHaveLength(0);

    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.drain();
    expect(roundCards()).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(table.world.campaignState().pendingMove).toBe(false);
  }, 30_000);
});

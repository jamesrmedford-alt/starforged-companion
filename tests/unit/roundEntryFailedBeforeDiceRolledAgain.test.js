/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/roundEntryFailedBeforeDiceRolledAgain.test.js
 *
 * A round entry whose roll fails before its dice is rolled again on recovery
 * (issue #347 residual ROUND-ENTRY-THROW-BEFORE-DICE).
 *
 * AB20 stamped an entry "rolling" before rollMove, so that a roll whose
 * effects were applied but whose result card never posted is reported rather
 * than rolled twice. But a roll that failed before its dice — an enrichment,
 * a +1's claim — had rolled and applied nothing, and was reported all the
 * same: "may be incomplete", narrated as an action with no roll. The stamp
 * is now made from rollMove's `onDiceRolled`, which rollMove awaits before
 * any effect: a roll that fails before its dice is rolled normally when the
 * round goes on, and one whose dice rolled is still never rolled again.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ calls: 0, failOnCall: 0 }));

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 't', mischiefApplied: false })),
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
    // challenge 9 and 10, action die 1: every roll a miss (it pays the price).
    resolveMove: vi.fn((...args) => {
      // A failure before the dice are rolled (the roll's enrichment, a +1's
      // claim): nothing is rolled or applied.
      control.calls += 1;
      if (control.calls === control.failOnCall) throw new Error('enrichment failed (test fault)');
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.85).mockReturnValueOnce(0.95).mockReturnValueOnce(0.0);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, holdWrites, failWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { resolveMove } from '../../src/moves/resolver.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
let table;
const round = () => table.world.getSetting('batchMode.round');
const roundNarrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /THIS ROUND/.test(c.userText ?? ''));
const priceCards = () => table.cards(f => f.payThePriceCard);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.calls = 0;
  control.failOnCall = 0;
  resolveMove.mockClear();
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  await table.setClaudeKey('gm-2', 'sk-ant-gus');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => 'The round turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
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

async function bothConfirm() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'k1' });
  await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I vault the barricade.', submissionId: 'r1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
}

describe('issue #347 residual ROUND-ENTRY-THROW-BEFORE-DICE — a roll that fails before its dice', () => {
  it('stops the round with nothing stamped; Send now rolls the entry — no "may be incomplete" notice, no action without a roll', async () => {
    // Kira's roll goes through; Ren's fails before its dice.
    control.failOnCall = 2;
    await bothConfirm();
    await table.drain();

    expect(round()).toMatchObject({ phase: 'rolling' });
    expect(table.cards(f => f.batchRoundStoppedNotice)).toHaveLength(1);
    expect(round().entries['pl-2'].rolled?.rollingAt ?? null, 'nothing was rolled, so nothing is stamped').toBeNull();

    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.drain();

    expect(table.cards(f => f.moveResolution && f.roundUserId === 'pl-2'), "Ren's move is rolled").toHaveLength(1);
    expect(table.cards(f => f.batchIncompleteNotice)).toHaveLength(0);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(roundNarrations()).toHaveLength(1);
    expect(roundNarrations()[0].userText).toMatch(/Face Danger/);
  }, 30_000);

  it('control: a roll whose dice rolled is stamped before its effects — its price card posts with the stamp already on the round', async () => {
    let stampedAtPrice = null;
    const held = holdWrites(table, w => w.kind === 'message.create' && w.client === 'gm-1'
      && w.data?.flags?.[MODULE_ID]?.payThePriceCard === true);
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'k1' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await held.arrived;
    stampedAtPrice = round().entries['pl-1'].rolled?.rollingAt ?? null;
    held.release();
    await table.settle(); await table.drain();
    expect(stampedAtPrice, 'the entry was stamped rolling before its Pay the Price').toEqual(expect.any(String));
    expect(resolveMove).toHaveBeenCalledTimes(1);
  }, 30_000);
});

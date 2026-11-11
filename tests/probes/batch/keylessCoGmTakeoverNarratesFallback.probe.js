/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION — bug-audit probe (thirteenth audit, 2026-11-11)
 * tests/probes/batch/keylessCoGmTakeoverNarratesFallback.probe.js
 *
 * BATCH: the driver keeps a round's READINGS for a GM with a Claude key
 * (startReading: "with no key here the entry waits"; requestSendNow refuses
 * "no-key"), but not its NARRATION. When the keyed GM resolving a round
 * reloads, the keyless co-GM is canonical for those seconds, takes the round
 * over (recoverRound "resolver-left") and narrates it at once: narrateRound
 * has no key, posts the "narration unavailable" fallback card, and the round
 * closes — its rolled moves are never narrated, though the keyed GM is back
 * within a page load.
 *
 * Nearest recorded stance: known-issues SHEET-ROLL-KEYLESS-ROUND ("a round
 * needs a keyed GM anyway") — a table with NO keyed GM. Here the table has
 * one; it reloaded.
 *
 * The probe asserts that the round is not closed behind a fallback card by
 * the keyless takeover, so it fails today.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 't', mischiefApplied: false })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    // a strong hit: nothing to upgrade, the round goes straight to its narration
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The round turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
let table;
const round = () => table.world.getSetting('batchMode.round');
const roundCards = (pred = () => true) => table.cards(f => f.narratorCard && f.roundId && pred(f));

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

let claude;
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');     // gm-2 (an assistant GM) has no key
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
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

async function kiraActsRenPasses() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
}

describe('BATCH — the keyed GM reloads while narrating a round; the co-GM has no Claude key', () => {
  it('control: the keyed GM stays — the round is narrated on its key and closes', async () => {
    await kiraActsRenPasses();
    await table.drain();
    expect(roundCards(f => !f.narrationFallback)).toHaveLength(1);
    expect(roundCards(f => f.narrationFallback)).toHaveLength(0);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);

  it('the keyed GM\'s page goes away mid-narration — the keyless co-GM must not close the round behind "narration unavailable"', async () => {
    const narration = claude.hold(call => /THIS ROUND/.test(call.userText ?? ''));
    await kiraActsRenPasses();
    await narration.arrived;
    expect(round()).toMatchObject({ number: 1, phase: 'narrating', resolverId: 'gm-1' });
    const roundId = round().id;

    await table.leave('gm-1');           // the keyed GM presses F5
    await table.settle();

    const fallbacks = table.cards(f => f.narratorCard && f.roundId === roundId && f.narrationFallback).length;
    const stored = round();
    // The round is still this one, waiting to be narrated by a GM who can.
    expect({ fallbackCards: fallbacks, round: stored.id === roundId ? stored.phase : `closed — round ${stored.number} open` })
      .toEqual({ fallbackCards: 0, round: 'narrating' });
    narration.fail();
    await table.settle();
    await table.join('gm-1');
  }, 30_000);
});

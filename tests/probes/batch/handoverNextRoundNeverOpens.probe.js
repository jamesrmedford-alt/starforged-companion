/* global silenceConsoleErrors -- tests/setup.js and Node globals, as in tests/unit */
/**
 * Probe — BATCH-6 HANDOVER-NEXT-ROUND-NOT-OPENED (eleventh audit).
 *
 * The canonical GM can change while it is resolving a round without leaving:
 * a second GM with a lower user id enters their Claude key (or joins with one)
 * and the keyed-GM registry makes them canonical. The new canonical GM's
 * recoverRound("keyed-gm") leaves the round to the GM resolving it (still
 * connected). That GM finishes it — narrates, posts the round card, closes
 * the round — but finishRound's openRoundIfDue now returns at once
 * (`!isCanonicalGM()`), and the new canonical GM hears nothing it acts on: the
 * driver listens to the keyed-GM registry and campaignState only, never to
 * `batchMode.round`. The table is left with no open round — every window says
 * "No round is open yet" — until some later campaignState write happens to
 * reach onCampaignStateChanged. Correct: a round closes and the next opens
 * (decisions.md: "rounds open by themselves while a session is active").
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: narration, inputMethod: 'chat',
  })),
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
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const round = () => table.world.getSetting('batchMode.round');
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  // Only Gus (gm-2) has a key: he is the canonical GM, though Gina's id is lower.
  await table.setClaudeKey('gm-1', '');
  await table.setClaudeKey('gm-2', 'sk-ant-gus');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  silenceConsoleErrors();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

async function playRound1() {
  await table.client('gm-2').setSetting('batchMode.enabled', true);
  await table.settle();
  expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
}

describe('BATCH-6 — the canonical GM changes while the round is being narrated', () => {
  it('control: no handover — the round is narrated by Gus and round 2 opens', async () => {
    scriptClaude(table, { fallback: () => REPLY });
    await playRound1();
    await table.drain();
    expect(roundCards()).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);

  it('Gina enters her key mid-narration (canonical now): the round still closes into round 2', async () => {
    const held = scriptClaude(table, { fallback: () => REPLY }).hold(c => c.model === NARRATION_MODEL);
    await playRound1();
    await held.arrived;
    expect(round()).toMatchObject({ phase: 'narrating', resolverId: 'gm-2' });

    await table.setClaudeKey('gm-1', 'sk-ant-gina');     // Gina is canonical from here
    held.release(REPLY);
    await table.drain();

    expect(roundCards()).toHaveLength(1);                 // Gus finished the round he was narrating
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);
});

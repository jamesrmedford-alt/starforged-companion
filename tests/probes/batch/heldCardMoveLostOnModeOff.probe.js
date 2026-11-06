/* global silenceConsoleErrors -- tests/setup.js and Node globals, as in tests/unit */
/**
 * Probe — BATCH-12 HELD-CARD-MOVE-LOST-ON-MODE-OFF (eleventh audit).
 *
 * A card button's move for a participant, pressed while a round resolves,
 * "joins the next round" (holdForNextRound whispers exactly that). The card
 * is claimed — its button reads taken everywhere. When the GM has switched
 * Batch Mode off during that resolution, finishRound turns the mode off
 * (`modeOffAfter`) instead of opening a next round, and runs only the
 * NON-participants' held moves as free-flow (runHeldFreeFlowMoves); the
 * participants' `_heldForRound` is never drained. Ren's card move is lost:
 * not rolled now, not rolled in free-flow, and its button stays claimed. (If
 * the mode is ever switched on again, it joins a round from much later.)
 * Correct: with no next round to join, a held card move runs as free-flow —
 * decisions.md "a forced move whose roller isn't a participant runs as
 * free-flow", and W02's rule that a claimed card's forced move is held, not
 * dropped.
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
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
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
    // a weak hit a burn of 9 raises (the round waits on Kira's decision)
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.35).mockReturnValueOnce(0.75).mockReturnValueOnce(0.4);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const round = () => table.world.getSetting('batchMode.round');
const rensResults = () => table.cards((f, m) => f.moveResolution && m.speaker?.actor === 'pc-ren');

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
  table.actors.get('pc-kira').system.momentum.value = 9;
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

/** A card button's move, as a GM handler posts it: the roller's line, forced and claimed. */
async function rensCardMove() {
  await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: 'I cover Kira from the doorway.',
    speaker: { actor: 'pc-ren' },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'face_danger', deferWhileBusy: true } },
  }));
  await table.settle();
  await table.drain();
}

async function weakHitWaitingForKira() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await table.drain();
  expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });
}

describe('BATCH-12 — a card move held for the next round, when no next round comes', () => {
  it('control: the round ends normally — Ren\'s held card move becomes his round-2 entry', async () => {
    await weakHitWaitingForKira();
    await rensCardMove();
    expect(table.cards(f => f.batchHeldMoveNotice)).not.toHaveLength(0);
    await relay('pl-1', 'batch.keep', { roundId: round().id });
    await table.drain();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(round().entries['pl-2']).toMatchObject({ text: 'I cover Kira from the doorway.', reading: { moveId: 'face_danger' } });
  }, 30_000);

  it('the GM switched the mode off meanwhile — Ren\'s held card move still runs (as free-flow)', async () => {
    await weakHitWaitingForKira();
    await rensCardMove();
    const c = table.client('gm-1');
    const mod = await c.import('../../src/ui/roundWindow.js');
    await c.run(() => mod.toggleBatchMode());            // "Batch Mode turns off when it finishes"
    await table.settle();
    await table.drain();
    expect(table.world.getSetting('batchMode.enabled')).toBe(false);
    expect(rensResults()).toHaveLength(1);
  }, 30_000);
});

/**
 * Probe — BATCH-2 RIDER-PROMPT-HOLDS-NEXT-ROUND (eleventh audit).
 *
 * After a round is narrated, finishRound opens the next round and then runs
 * each entry's finishMove — the asset consequence riders, whose optional /
 * choice / progress riders open the GM's "✦ Apply asset effects" dialog
 * (riderDialog.js, DialogV2.wait). finishRound runs inside the driver's one
 * advance pass (advanceRound → advanceOnce → narrateTheRound → finishRound),
 * so while that dialog is unanswered `_advancing` stays pending: every later
 * advanceRound call only sets `_advanceAgain`. Round 2 — every participant
 * ready, or a GM's Send now — does not resolve until the GM answers a dialog
 * about round 1. The free-flow pipeline releases the move lock before this
 * prompt precisely so an unanswered dialog cannot hold up the next move
 * (PLAYTEST-1712 M/N, decisions.md "Move-concurrency lock covers narration +
 * persistence, not post-roll prompts"); the round driver re-creates that
 * lock-up one level up.
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
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: narration, inputMethod: 'chat',
  })),
}));
// Kira's asset: "on a hit you may take +1 momentum" — an optional rider, so prompted.
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => [
    { key: 'ace:0', assetName: 'Ace', abilityName: 'Steady', text: 'When you Face Danger, on a hit you may take +1 momentum.', adds: 0, detection: 'structured' },
  ]),
}));
vi.mock('../../../src/moves/consequenceRiders.js', async (importOriginal) => ({
  ...(await importOriginal()),
  extractRiders: vi.fn(async () => [
    { key: 'ace:0', assetName: 'Ace', riders: [{ resource: 'momentum', condition: 'hit', amount: 1, optional: true, label: '+1 momentum' }] },
  ]),
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
    // a strong hit every roll
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude, deferred } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
let seq = 0;
const round = () => table.world.getSetting('batchMode.round');
const riderDialogs = () => table.dialogs.filter(d => /Apply asset effects/.test(d.title));

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

async function kiraActsRenPasses(text) {
  const sub = `k${++seq}`;
  await relay('pl-1', 'batch.submit', { roundId: round().id, text, submissionId: sub });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: sub, choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
}

describe('BATCH-2 — the asset-rider prompt after a round holds every later round', () => {
  it('control: the GM answers the prompt — round 2 resolves on its last ready', async () => {
    table.client('gm-1').answerDialogs((d) => (/Apply asset effects/.test(d.title) ? d.choose('skip') : null));
    await kiraActsRenPasses('I brace against the hull and push through.');
    await table.drain();
    expect(riderDialogs()).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });

    await kiraActsRenPasses('I seal the breach behind us.');
    await table.drain();
    expect(round()).toMatchObject({ number: 3, phase: 'collecting' });
  }, 30_000);

  it('with round 1\'s rider prompt still open, round 2 resolves once everyone is ready (and on Send now)', async () => {
    const unanswered = deferred();
    table.client('gm-1').answerDialogs((d) => (/Apply asset effects/.test(d.title) ? unanswered.promise : null));
    await kiraActsRenPasses('I brace against the hull and push through.');
    await table.settle();
    expect(riderDialogs()).toHaveLength(1);                      // the GM hasn't answered it yet
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });

    // Round 2: Kira acts and confirms, Ren passes — every connected participant is ready.
    await kiraActsRenPasses('I seal the breach behind us.');
    await table.settle();
    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.settle();
    const phase = round()?.number === 2 ? round().phase : `round ${round()?.number}`;
    unanswered.resolve(null);            // the GM answers round 1's prompt at last
    await table.drain();
    const afterAnswer = `${round()?.number}:${round()?.phase}`;
    // Round 2 resolved only once the dialog about round 1 was answered.
    expect(phase, `round 2 while the prompt was open (after it was answered: ${afterAnswer})`).not.toBe('collecting');
  }, 30_000);
});

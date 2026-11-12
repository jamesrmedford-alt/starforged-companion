/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundRiderPromptHold.test.js
 *
 * Issue #342 Z03 RIDER-PROMPT-HOLDS-NEXT-ROUND (the eleventh audit's BATCH-2).
 *
 * After a Batch Mode round is narrated, each entry's finishMove runs — the
 * asset consequence riders, whose optional / choice / two-track progress
 * riders open the GM's "✦ Apply asset effects" dialog (riderDialog.js,
 * DialogV2.wait). They ran inside the driver's one advance pass, so while the
 * dialog was unanswered every later advanceRound only queued another pass:
 * round 2 — every participant ready, then a GM's Send now — did not resolve
 * until the GM answered a dialog about round 1. Free-flow runs the same
 * prompt with the move lock released so it holds no later move (PLAYTEST-1712
 * M/N); the round's riders now run off the advance pass.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

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
// Kira's asset: "on a hit you may take +1 momentum" — an optional rider, so prompted.
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => [
    { key: 'ace:0', assetName: 'Ace', abilityName: 'Steady', text: 'When you Face Danger, on a hit you may take +1 momentum.', adds: 0, detection: 'structured' },
  ]),
}));
vi.mock('../../src/moves/consequenceRiders.js', async (importOriginal) => ({
  ...(await importOriginal()),
  extractRiders: vi.fn(async () => [
    { key: 'ace:0', assetName: 'Ace', riders: [{ resource: 'momentum', condition: 'hit', amount: 1, optional: true, label: '+1 momentum' }] },
  ]),
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
    // a strong hit every roll
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude, deferred } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
let seq = 0;
let unanswered = null;
const round = () => table.world.getSetting('batchMode.round');
const riderDialogs = () => table.dialogs.filter(d => /Apply asset effects/.test(d.title));
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());
// A prompt a test leaves unanswered is answered before the next test: the
// riders run one round after another on the GM's client.
afterEach(async () => { unanswered?.resolve(null); unanswered = null; await table.drain(5000).catch(() => {}); });

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

async function kiraActs(text) {
  const sub = `k${++seq}`;
  await relay('pl-1', 'batch.submit', { roundId: round().id, text, submissionId: sub });
  // The Round window's confirm as it opens: the ability with an effect on the
  // outcome pre-checked (RIDERS-IGNORE-UNCHECKED).
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: sub, choices: { abilityIds: ['ace:0'] } });
}

async function kiraActsRenPasses(text) {
  await kiraActs(text);
  await relay('pl-2', 'batch.pass', { roundId: round().id });
}

describe('Z03 — the asset-effects prompt after a round holds no later round', () => {
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

  it('with round 1\'s rider prompt still open, round 2 resolves once everyone is ready', async () => {
    unanswered = deferred();
    table.client('gm-1').answerDialogs((d) => (/Apply asset effects/.test(d.title) ? unanswered.promise : null));
    await kiraActsRenPasses('I brace against the hull and push through.');
    await table.settle();
    expect(riderDialogs()).toHaveLength(1);                      // the GM hasn't answered it yet
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });

    // Round 2: Kira acts and confirms, Ren passes — every connected participant is ready.
    await kiraActsRenPasses('I seal the breach behind us.');
    await table.settle();
    expect(roundCards()).toHaveLength(2);                         // round 2 was narrated …
    expect(round()).toMatchObject({ number: 3, phase: 'collecting' });
    expect(riderDialogs()).toHaveLength(1);                       // … with round 1's prompt still open

    // The GM answers round 1's prompt at last: round 2's own prompt follows it.
    unanswered.resolve(null);
    await table.drain();
    expect(riderDialogs()).toHaveLength(2);
  }, 30_000);

  it('with round 1\'s rider prompt still open, a GM\'s Send now resolves round 2', async () => {
    unanswered = deferred();
    table.client('gm-1').answerDialogs((d) => (/Apply asset effects/.test(d.title) ? unanswered.promise : null));
    await kiraActsRenPasses('I brace against the hull and push through.');
    await table.settle();
    expect(riderDialogs()).toHaveLength(1);

    // Round 2: Kira is ready; Ren has not acted — the GM sends the round.
    await kiraActs('I seal the breach behind us.');
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.settle();
    expect(roundCards()).toHaveLength(2);
    expect(round()).toMatchObject({ number: 3, phase: 'collecting' });
  }, 30_000);
});

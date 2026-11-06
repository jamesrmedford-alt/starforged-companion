/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundRiderPromptExtracted.test.js
 *
 * Issue #342 Z03 RIDER-PROMPT-HOLDS-NEXT-ROUND (the eleventh audit's UPG-7):
 * the asset-effects prompt and the next round, with the rider read by the
 * real extractor (its Haiku pass answered at the Claude boundary).
 *
 * Kira's asset has an optional effect on her move — "you may take +1
 * momentum": the extractor marks it optional, so it is prompted
 * (riderDialog.js promptRiders, a DialogV2.wait on the canonical GM). Round 1
 * narrates and round 2 opens; while the GM has not answered round 1's
 * prompt, round 2 still resolves on Kira's confirm — the riders run off the
 * driver's advance pass, one round after another.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

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
const KIT = {
  key: 'kit:0', assetId: 'kit', assetName: 'Salvage Rig', abilityName: '', category: 'Path', source: 'character',
  text: 'When you Face Danger by burning the rig\'s reserves, you may take +1 momentum.',
  adds: 0, detection: 'structured', resultImprovement: null, statReplacement: null,
};
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => [KIT]),
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
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude, deferred } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const ROUND_REPLY = 'Kira forces the hatch as the rig sputters.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const RIDERS = JSON.stringify({ abilities: [{ key: 'kit:0', riders: [
  { condition: 'any', resource: 'momentum', amount: 1, optional: true, choiceGroup: null, label: '+1 momentum' },
] }] });
// challenge 3 and 4, action die 6 (+edge 2 = 8): a strong hit — no upgrade to wait for.
const STRONG = [0.25, 0.35, 0.9];

let table, gate;
const round = () => table.world.getSetting('batchMode.round');
const riderDialogs = () => table.client('gm-1').dialogs.filter(d => /Apply asset effects/.test(d.title));
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

async function act(text, submissionId) {
  control.dice.push(STRONG);
  await relay('pl-1', 'batch.submit', { roundId: round().id, text, submissionId });
  await table.settle();
  const r = round();
  await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
  await table.settle();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
// Each test's held prompt is answered before the next test: the riders run
// one round after another on the GM's client.
afterEach(async () => { gate?.resolve('cleanup'); await table.drain(5000).catch(() => {}); });
beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] }, system: { momentum: { value: 2 } } });
  scriptClaude(table, { fallback: () => ROUND_REPLY })
    .when(call => /CONSEQUENCE RIDERS/.test(call.system ?? ''), RIDERS, { times: 99 });
  // The GM has not answered the asset-effects dialog yet.
  gate = deferred();
  table.client('gm-1').answerDialogs(() => gate.promise.then(() => null));
  silenceConsoleErrors();
});

describe('Z03 — the GM\'s unanswered asset-effects prompt from one round, and the next', () => {
  it('round 2 resolves while round 1\'s prompt waits on the GM', async () => {
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
    await act('I burn the rig\'s reserves to force the hatch.', 'r1');
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });   // round 1 narrated and closed
    expect(riderDialogs()).toHaveLength(1);                              // its prompt is up on the GM's screen

    await act('I slip through before it closes.', 'r2');                 // Kira confirms round 2 …
    expect(roundCards()).toHaveLength(2);                                // … and it is narrated
    expect(round().number).toBe(3);
    expect(riderDialogs()).toHaveLength(1);                              // round 1's prompt is still the only one
  }, 30_000);

  it('once the GM answers round 1\'s prompt, round 2\'s own prompt follows it — the riders run in round order', async () => {
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
    await act('I burn the rig\'s reserves to force the hatch.', 'r1');
    expect(riderDialogs()).toHaveLength(1);
    await act('I slip through before it closes.', 'r2');
    expect(round()).toMatchObject({ number: 3 });

    gate.resolve('answered');
    await table.drain(5000);
    expect(riderDialogs()).toHaveLength(2);
    expect(round()).toMatchObject({ number: 3, phase: 'collecting' });
  }, 30_000);
});

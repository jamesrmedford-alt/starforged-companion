/**
 * Eleventh audit — multiplayer probe (MP-3).
 *
 * The GM's Batch Mode switch (src/ui/roundWindow.js toggleBatchMode), pressed
 * while a round resolves, relays `batch.sendNow` with `modeOffAfter: true`
 * and tells the GM "the round is being resolved — Batch Mode turns off when
 * it finishes" (the help: "A round already resolving finishes, then the mode
 * turns off"). requestSendNow (src/batch/driver.js) says "While the round
 * resolves it only records `modeOffAfter`" — true while it rolls or narrates.
 * But in the upgrade step the same relay is Send now: keepUndecidedUpgrades
 * forces Keep on every roller still choosing Burn Momentum / Improve Result.
 * The roller's choice — theirs to make (decisions "Batch Mode": "A roller
 * offered Burn Momentum or Improve Result chooses Burn / Improve / Keep in the
 * window") — is taken by a switch the GM pressed to stop Batch Mode after the
 * round, and nobody is told: the window's choice vanishes and the narration
 * tells the result as rolled.
 *
 * Correct: the switch only records modeOffAfter; the round still waits for
 * the roller, and turns the mode off once it finishes.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 't', mischiefApplied: false })),
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
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

// challenge 4 and 8, action die 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
const WEAK = [0.35, 0.75, 0.4];
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = 'The round turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const round = () => table.world.getSetting('batchMode.round');
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

/** Kira rolls a weak hit her momentum could burn to a strong hit; the round waits for her choice. */
async function weakHitRound() {
  table.actors.get('pc-kira').system.momentum.value = 9;
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
  control.dice = [WEAK];
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await table.drain();
  expect(round()).toMatchObject({ phase: 'upgrading' });
  expect(round().entries['pl-1'].upgrade).toMatchObject({ burn: { previewOutcome: 'strong_hit' }, decided: null });
}

/** Gina presses the toolbar's Batch Mode switch (off). */
async function gmTurnsBatchModeOff() {
  const gm = table.client('gm-1');
  const mod = await gm.import('../../src/ui/roundWindow.js');
  await gm.run(() => mod.toggleBatchMode());
  await table.settle();
  await table.drain();
}

describe('MP-3 — turning Batch Mode off while a roller decides an upgrade', () => {
  it('control: the GM\'s notice says only that the mode turns off when the round finishes', async () => {
    await weakHitRound();
    await gmTurnsBatchModeOff();
    expect(table.client('gm-1').notifications.map(n => n.message))
      .toContain('Starforged Companion: the round is being resolved — Batch Mode turns off when it finishes.');
  }, 30_000);

  it('Kira still chooses: the switch records mode-off-after and the round waits for her', async () => {
    await weakHitRound();
    await gmTurnsBatchModeOff();
    // Correct: her choice is still hers. Today the switch's Send now kept it
    // for her: decided "keep", the round narrated as a weak hit, mode off.
    expect(round().entries['pl-1'].upgrade.decided).toBeNull();
    expect(narrations()).toHaveLength(0);
  }, 30_000);
});

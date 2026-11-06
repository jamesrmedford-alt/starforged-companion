/**
 * UI-2 BATCH-OFF-DURING-UPGRADE-FORCES-KEEP (eleventh audit, ui).
 *
 * The toolbar's Batch Mode switch, pressed off while a round resolves, is
 * documented as "A round already resolving finishes, then the mode turns
 * off" (help, Batch Mode page; toggleBatchMode's own doc comment: "Off while
 * a round resolves: it finishes, then the mode turns off"). The switch asks
 * nothing and relays `batch.sendNow` with `modeOffAfter` for every resolving
 * phase — and during the upgrade step Send now "counts as Keep"
 * (requestSendNow → keepUpgrades(null)). A roller still deciding Burn
 * Momentum / Improve Result in their window has the decision taken from
 * them: Keep is recorded, the card's Burn is closed, and the round is
 * narrated as rolled.
 *
 * Correct: turning the mode off records `modeOffAfter` and lets the round
 * finish — the roller still decides (decisions.md #340: "the round waits
 * for them"); Send now is the GM's separate, explicit choice.
 *
 * Set-up copied from tests/unit/batchModeTable.test.js (the simulated table,
 * the mocked leaves, the weak-hit round a burn of 9 raises).
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false })),
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

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const ROUND_REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 4 and 8, action die 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
const WEAK = [0.35, 0.75, 0.4];

let table;
const round = () => table.world.getSetting('batchMode.round');
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
let seq = 0;

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
  scriptClaude(table, { fallback: () => ROUND_REPLY });
  silenceConsoleErrors();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

/** Kira's weak hit, with momentum 9 to burn: the round waits for her decision. */
async function weakHitRound() {
  table.actors.get('pc-kira').system.momentum.value = 9;
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
  control.dice = [WEAK];
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: `sub-${++seq}` });
  const r = round();
  await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await table.drain();
}

/** The GM presses the toolbar's Batch Mode switch (toggleBatchMode on their client). */
async function gmTurnsBatchModeOff() {
  const gm = table.client('gm-1');
  const mod = await gm.import('../../src/ui/roundWindow.js');
  await gm.run(() => mod.toggleBatchMode());
  await table.settle();
  await table.drain();
}

describe('UI-2: turning Batch Mode off during the upgrade step', () => {
  it('control: the round waits for the roller\'s Burn / Improve / Keep, with the move lock free', async () => {
    await weakHitRound();
    expect(round()).toMatchObject({ phase: 'upgrading' });
    expect(round().entries['pl-1'].upgrade).toMatchObject({ burn: { previewOutcome: 'strong_hit' }, decided: null });
    expect(narrations()).toEqual([]);
  }, 30_000);

  it('the round still waits for Kira\'s decision — the switch takes no upgrade from her', async () => {
    await weakHitRound();
    await gmTurnsBatchModeOff();

    // The switch was heard: the mode turns off once the round is done.
    expect(round().modeOffAfter).toBe(true);
    // The finding: Kira's choice is still hers to make.
    expect(round().entries['pl-1'].upgrade?.decided ?? null).toBe(null);
    expect(narrations()).toEqual([]);

    // She burns from her window; the round is narrated as a strong hit, then the mode turns off.
    const cardId = round().entries['pl-1'].rolled.cardId;
    await relay('pl-1', 'move.burnMomentum', { messageId: cardId });
    await table.drain();
    expect(table.world.message(cardId).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(narrations().at(-1)?.userText ?? '').toMatch(/Face Danger[^\n]*: strong hit/);
    expect(table.world.getSetting('batchMode.enabled')).toBe(false);
  }, 30_000);
});

/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchModeOffWhileUpgrading.test.js
 *
 * Issue #342 Z04 MODE-OFF-FORCES-KEEP (the eleventh audit's BATCH-9, MP-3 and
 * UI-2 — one finding, three probes).
 *
 * The toolbar's Batch Mode switch, pressed while a round resolves, relays
 * `batch.sendNow` with `modeOffAfter` and tells the GM "the round is being
 * resolved — Batch Mode turns off when it finishes" (the help: "A round
 * already resolving finishes, then the mode turns off"). During the upgrade
 * step that relay was a Send now: every roller still deciding was kept and
 * their result card's Burn Momentum / Improve Result closed (`roundClosed`).
 * The switch now only marks the round: it finishes as it would — the roller
 * still decides — then the mode turns off. The GM's own Send now still means
 * Keep (batchModeTable.test.js).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

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
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 4 and 8, action die 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
const WEAK = [0.35, 0.75, 0.4];

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

/** Kira's weak hit, with momentum 9 to burn: the round waits for her decision. */
async function weakHitWaitingForKira() {
  control.dice = [WEAK];
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await table.drain();
  expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });
  expect(round().entries['pl-1'].upgrade).toMatchObject({ burn: { previewOutcome: 'strong_hit' }, decided: null });
}

/** The GM presses the toolbar's Batch Mode switch (toggleBatchMode on their client). */
async function gmSwitchesOff() {
  const c = table.client('gm-1');
  const mod = await c.import('../../src/ui/roundWindow.js');
  await c.run(() => mod.toggleBatchMode());
  await table.settle();
  await table.drain();
}

describe('Z04 — the GM switches Batch Mode off while a roller decides Burn / Keep', () => {
  it('control: pressed while the round collects (nothing submitted), the mode turns off at once', async () => {
    await gmSwitchesOff();
    expect(table.world.getSetting('batchMode.enabled')).toBe(false);
  }, 30_000);

  it('control: the round waits for the roller\'s Burn / Improve / Keep, with no narration yet', async () => {
    await weakHitWaitingForKira();
    expect(narrations()).toEqual([]);
  }, 30_000);

  it('the roller is still deciding: her Burn stays hers to press (BATCH-9)', async () => {
    await weakHitWaitingForKira();
    const cardId = round().entries['pl-1'].rolled.cardId;
    await gmSwitchesOff();
    const burn = table.world.message(cardId).flags[MODULE_ID].burn;
    const kira = round().entries['pl-1'];
    expect({ decided: kira?.upgrade?.decided ?? null, roundClosed: !!burn.roundClosed })
      .toEqual({ decided: null, roundClosed: false });
  }, 30_000);

  it('the switch records mode-off-after; the GM is told only that the mode turns off when the round finishes (MP-3)', async () => {
    await weakHitWaitingForKira();
    await gmSwitchesOff();
    expect(table.client('gm-1').notifications.map(n => n.message))
      .toContain('Starforged Companion: the round is being resolved — Batch Mode turns off when it finishes.');
    expect(round().modeOffAfter).toBe(true);
    expect(round().entries['pl-1'].upgrade.decided).toBeNull();
    expect(narrations()).toHaveLength(0);
    expect(table.world.getSetting('batchMode.enabled')).toBe(true);
  }, 30_000);

  it('she burns from her window: the round is narrated as the strong hit, then the mode turns off (UI-2)', async () => {
    await weakHitWaitingForKira();
    await gmSwitchesOff();
    expect(round().entries['pl-1'].upgrade?.decided ?? null).toBe(null);
    expect(narrations()).toEqual([]);

    const cardId = round().entries['pl-1'].rolled.cardId;
    await relay('pl-1', 'move.burnMomentum', { messageId: cardId });
    await table.drain();
    expect(table.world.message(cardId).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(narrations().at(-1)?.userText ?? '').toMatch(/Face Danger[^\n]*: strong hit/);
    expect(table.world.getSetting('batchMode.enabled')).toBe(false);
  }, 30_000);
});

/**
 * Eleventh audit — multiplayer probe (MP-5).
 *
 * A Batch Mode round "doesn't wait for one who disconnected"
 * (round.js readyToResolve: every CONNECTED participant ready or passed), and
 * its lifecycle says the upgrade step ends when "each offered roller chose;
 * Send now = Keep; the roller left = Keep" (round.js header). The driver
 * keeps a leaver's upgrade only when they leave DURING the upgrade step
 * (driver.js onUserConnected → keepUpgrades). A player who confirms and then
 * drops (a closed laptop, a crashed tab) before the round resolves is not
 * waited for — the round resolves on the others' readiness — but their
 * confirmed move is rolled, and when its result offers Burn Momentum or
 * Improve Result, beginUpgrades offers it to them and the round waits in the
 * upgrade step for a player who is not there. Nobody leaves again, so nothing
 * keeps it: the round sits "Deciding upgrade" until a GM presses Send now.
 *
 * Correct: a roller who is not connected when the upgrade step begins is
 * treated as having left — Keep — and the round is narrated.
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
const WEAK   = [0.35, 0.75, 0.4];
// challenge 3 and 4, action die 6 (+edge 2 = 8): a strong hit.
const STRONG = [0.25, 0.35, 0.9];
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
  table.actors.get('pc-kira').system.momentum.value = 9;
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

async function bothSubmit() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I vault the barricade.', submissionId: 'r1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
}

describe('MP-5 — the upgrade step and a roller who is gone', () => {
  it('control: Pat leaves DURING the upgrade step — his Burn is kept for him and the round is narrated', async () => {
    control.dice = [WEAK, STRONG];
    await bothSubmit();
    await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
    await table.drain();
    expect(round()).toMatchObject({ phase: 'upgrading' });
    await table.leave('pl-1');
    try {
      await table.drain();
      expect(narrations()).toHaveLength(1);
      expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    } finally {
      await table.join('pl-1');
    }
  }, 30_000);

  it('Pat confirms, then drops before the round resolves: the round does not wait for his Burn', async () => {
    control.dice = [WEAK, STRONG];
    await bothSubmit();
    await table.leave('pl-1');                 // Kira is ready; Pat's browser closes
    try {
      // Quinn's confirm: every CONNECTED participant is ready — the round resolves.
      await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
      await table.drain();
      // Kira's weak hit was rolled, and it offers a burn to a player who is not here.
      expect(round().entries['pl-1'].rolled).toMatchObject({ outcome: 'weak_hit' });
      // Correct: Pat left — Keep — and the round is narrated. Today it waits
      // in the upgrade step for him, with nobody left to decide.
      expect(round().phase).not.toBe('upgrading');
      expect(narrations()).toHaveLength(1);
    } finally {
      await table.join('pl-1');
    }
  }, 30_000);
});

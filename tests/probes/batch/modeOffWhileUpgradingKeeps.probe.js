/**
 * Probe — BATCH-9 MODE-OFF-FORCES-KEEP (eleventh audit).
 *
 * The toolbar's Batch Mode switch, pressed while a round resolves, relays
 * `batch.sendNow` with `modeOffAfter` (roundWindow.js toggleBatchMode) and
 * tells the GM "the round is being resolved — Batch Mode turns off when it
 * finishes"; the help says "A round already resolving finishes, then the mode
 * turns off", and requestSendNow's own doc says "While the round resolves it
 * only records `modeOffAfter`". But during the upgrade step requestSendNow
 * runs keepUpgrades(null): every roller still deciding is kept, and their
 * result card's Burn Momentum / Improve Result is closed (`roundClosed`) — a
 * player who was about to burn loses the choice because the GM switched the
 * mode off. Correct: the round finishes as it would (waiting on the roller's
 * decision), then the mode turns off.
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
    // a weak hit a burn of 9 raises to a strong hit
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

async function weakHitWaitingForKira() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await table.drain();
  expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });
}

async function gmSwitchesOff() {
  const c = table.client('gm-1');
  const mod = await c.import('../../src/ui/roundWindow.js');
  await c.run(() => mod.toggleBatchMode());
  await table.settle();
  await table.drain();
}

describe('BATCH-9 — the GM switches Batch Mode off while a roller decides Burn / Keep', () => {
  it('control: pressed while the round collects (nothing submitted), the mode turns off at once', async () => {
    await gmSwitchesOff();
    expect(table.world.getSetting('batchMode.enabled')).toBe(false);
  }, 30_000);

  it('the roller is still deciding: her Burn stays hers to press, and the round finishes after it', async () => {
    await weakHitWaitingForKira();
    const cardId = round().entries['pl-1'].rolled.cardId;
    await gmSwitchesOff();
    const burn = table.world.message(cardId).flags[MODULE_ID].burn;
    const kira = round().entries['pl-1'];
    // Correct: the switch did not decide for Kira.
    expect({ decided: kira?.upgrade?.decided ?? null, roundClosed: !!burn.roundClosed })
      .toEqual({ decided: null, roundClosed: false });
  }, 30_000);
});

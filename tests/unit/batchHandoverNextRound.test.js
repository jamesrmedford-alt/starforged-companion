/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchHandoverNextRound.test.js
 *
 * Issue #342 Z22 HANDOVER-NEXT-ROUND-NOT-OPENED (the eleventh audit's BATCH-6
 * and MP-1 — one finding, two probes).
 *
 * Two GMs: Gina (`gm-1`, the lower id) and Gus (`gm-2`); only Gus holds a
 * Claude key, so the keyed-GM registry makes him canonical and he resolves
 * the round. While he narrates it, Gina enters her key: the registry names
 * her, so she is canonical now, and her recovery leaves the round to the GM
 * resolving it (still connected). Gus finishes — the round card, the close —
 * but his openRoundIfDue returned at once (no longer canonical), and Gina
 * heard nothing she acted on: the driver listened to the registry and
 * campaignState, never to `batchMode.round`. No round opened until some later
 * campaignState write. The canonical GM now opens the next round when it
 * hears a round's close, whoever closed it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: narration, inputMethod: 'chat',
  })),
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
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
let claude;
const round = () => table.world.getSetting('batchMode.round');
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  // Only Gus (gm-2) has a key: he is the canonical GM, though Gina's id is lower.
  await table.setClaudeKey('gm-1', '');
  await table.setClaudeKey('gm-2', 'sk-ant-gus');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  claude = scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
  await table.client('gm-2').setSetting('batchMode.enabled', true);
  await table.settle();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

/** Kira acts, Ren passes, Kira confirms: the round resolves on the canonical GM. */
async function playRoundOne() {
  expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'k1' });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
}

describe('Z22 — the canonical GM changes while another GM narrates the round', () => {
  it('control: with no handover the resolving GM opens round 2', async () => {
    await playRoundOne();
    await table.drain();
    expect(roundCards()).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);

  it('Gina enters her Claude key while Gus narrates round 1: Gus finishes it, and round 2 still opens', async () => {
    const held = claude.hold(call => call.model === NARRATION_MODEL);
    await playRoundOne();
    await held.arrived;
    expect(round()).toMatchObject({ number: 1, phase: 'narrating', resolverId: 'gm-2' });

    // Gina (gm-1, the lower id) enters her key: the keyed-GM registry now
    // names her, so she is the canonical GM. Gus is still narrating round 1.
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    expect(table.world.getSetting('keyedGmUserIds')).toEqual(expect.arrayContaining(['gm-1', 'gm-2']));

    held.release(REPLY);
    await table.drain();

    expect(roundCards()).toHaveLength(1);                 // Gus finished the round he was narrating, once
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);

  it('control: a round that turns the mode off when it finishes opens no next round', async () => {
    const held = claude.hold(call => call.model === NARRATION_MODEL);
    await playRoundOne();
    await held.arrived;
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    // The switch pressed while the round resolves: off once it finishes.
    await relay('gm-1', 'batch.sendNow', { roundId: round().id, modeOffAfter: true });
    expect(round()).toMatchObject({ number: 1, modeOffAfter: true });
    held.release(REPLY);
    await table.drain();
    expect(roundCards()).toHaveLength(1);
    expect(round()).toMatchObject({ number: 1, phase: 'closed' });
    expect(table.world.getSetting('batchMode.enabled')).toBe(false);
  }, 30_000);
});

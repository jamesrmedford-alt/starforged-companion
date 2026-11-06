/**
 * Eleventh audit — multiplayer probe (MP-1).
 *
 * Batch Mode's next round opens only on the canonical GM: finishRound calls
 * openRoundIfDue, which returns at once on any other client
 * (src/batch/driver.js). A round is resolved by the GM that began it
 * (`resolverId`); recoverRound leaves it alone while that GM is connected.
 * When canonicity moves to another GM while the round resolves (a GM with a
 * lower id adds a Claude key, or joins keyed — the keyed-GM registry), the
 * resolver finishes the round, its openRoundIfDue does nothing, and the new
 * canonical GM hears only the round's close (a `batchMode.round` write,
 * which onBatchSettingWrite ignores): no next round opens. Every Round window
 * says "No round is open yet" until a campaignState write or a user joining
 * wakes the canonical GM — chat is table talk in Batch Mode, so nothing does.
 *
 * Correct: the round closes and round 2 opens, as it does with no handover.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ calls: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  decidePacing: vi.fn(async ({ playerText }) => {
    control.calls.push({ fn: 'decidePacing', client: globalThis.game?.user?.id ?? null, text: playerText });
    return { runMove: true, decision: 'MOVE', suggestedMove: null };
  }),
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
    // challenge 3 and 4, action die 6 (+edge 2): a strong hit — no upgrade offered.
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of [0.25, 0.35, 0.9]) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = 'The round turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const SESSION = { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] };

let table;
let claude;
const round = () => table.world.getSetting('batchMode.round');

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.calls = [];
  await table.reset({ world: { settings: { chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false, campaignState: SESSION } } });
  // Only Gus (gm-2) holds a Claude key: he is the canonical GM, though Gina's id is lower.
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

describe('MP-1 — a round finishing on a GM who is no longer canonical', () => {
  it('control: with no handover the resolving GM opens round 2', async () => {
    await playRoundOne();
    await table.drain();
    expect(table.cards(f => f.narratorCard && f.roundId)).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);

  it('Gina adds her Claude key while Gus narrates round 1: round 2 still opens', async () => {
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

    // The round was narrated once, and closed.
    expect(table.cards(f => f.narratorCard && f.roundId)).toHaveLength(1);
    // Correct: the next round opens. Today round 1 stays closed and nothing
    // opens round 2 — no campaignState write follows the close.
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);
});

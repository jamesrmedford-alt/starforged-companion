/**
 * Probe — BATCH-8 RESOLVING-ROUND-CLOSED-BY-RECOVERY (eleventh audit).
 *
 * The help (Batch Mode → "Sessions, the X-Card and turning it off"): "End a
 * Session closes a round that is still collecting … A round already resolving
 * finishes first." The driver's campaignState listener does exactly that — it
 * closes only a collecting round. But recoverRound, which runs on the
 * canonical GM's `ready`, on every user connecting and on a keyed-GM registry
 * write, closes ANY open round of an ended session, resolving or not, with
 * closeRound("session-ended"): no narration, no fallback card, no notice, the
 * entries' finishMove (asset riders) never run, and an upgrade wait abandoned
 * with its card's Burn / Improve left open. So: Kira rolls a weak hit, the
 * round waits for her Burn / Keep, the GM ends the session, a player's
 * browser reconnects — the round is gone, its rolled move never narrated, and
 * Kira's Keep answers "That round has ended."
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
    // challenge 4 and 8, action 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.35).mockReturnValueOnce(0.75).mockReturnValueOnce(0.4);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = 'Kira slips through the vent, scraped and late.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const roundNarrations = () => table.cards(f => f.roundId && (f.narratorCard || f.narrationPaused));
const narrationCalls = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);

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
  expect(round().entries['pl-1'].upgrade).toMatchObject({ burn: { previewOutcome: 'strong_hit' }, decided: null });
}

async function endTheSession() {
  await table.client('gm-1').setSetting('campaignState', { ...world(), sessionActive: false, sessionEndedId: 'sess-1' });
  await table.settle();
}

describe('BATCH-8 — End a Session while the round waits on an upgrade, then a recovery runs', () => {
  it('control: no recovery in between — the round finishes on Kira\'s Keep and is narrated', async () => {
    await weakHitWaitingForKira();
    await endTheSession();
    expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });    // "a round already resolving finishes first"
    await relay('pl-1', 'batch.keep', { roundId: round().id });
    await table.drain();
    expect(narrationCalls()).toHaveLength(1);
    expect(roundNarrations()).toHaveLength(1);
  }, 30_000);

  it('a player reconnects first: the round still finishes on Kira\'s Keep and is narrated', async () => {
    await weakHitWaitingForKira();
    await endTheSession();
    await table.leave('pl-2');
    await table.join('pl-2');                                           // recoverRound("user-joined")
    await table.settle();
    await relay('pl-1', 'batch.keep', { roundId: round().id });
    await table.drain();
    expect(roundNarrations(), `round now: ${round()?.phase} (${round()?.closeReason ?? '-'})`).toHaveLength(1);
  }, 30_000);
});

/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchSessionEndedResolvingRound.test.js
 *
 * Issue #342 Z23 RESOLVING-ROUND-CLOSED-BY-RECOVERY (the eleventh audit's
 * BATCH-8, as the refuter narrowed it).
 *
 * The help (Batch Mode → "Sessions, the X-Card and turning it off"): "End a
 * Session closes a round that is still collecting … A round already resolving
 * finishes first." The driver's campaignState listener does that. But
 * recoverRound — run on the canonical GM's `ready`, the resolving GM leaving,
 * every user connecting and every keyed-GM registry write — closed ANY open
 * round of an ended session: Kira's weak hit waiting on her Burn / Keep, the
 * GM presses End a Session, a player's browser reconnects — the round is
 * gone, never narrated, and Kira's Keep is refused. On `ready` and when the
 * resolving GM leaves, closing it is issue #340's own Recovery rule ("A round
 * from an ended session is closed"); on a user joining or a GM entering a key
 * the round now finishes first.
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
    // challenge 4 and 8, action 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.35).mockReturnValueOnce(0.75).mockReturnValueOnce(0.4);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const REPLY = 'Kira slips through the vent, scraped and late.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const roundNarrations = () => table.cards(f => f.roundId && (f.narratorCard || f.narrationPaused));
const narrationCalls = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  // Gina (gm-1) holds the key and resolves the round; Gus (gm-2) has none yet.
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  await table.setClaudeKey('gm-2', '');
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
  expect(round()).toMatchObject({ number: 1, phase: 'upgrading', resolverId: 'gm-1' });
  expect(round().entries['pl-1'].upgrade).toMatchObject({ burn: { previewOutcome: 'strong_hit' }, decided: null });
}

/** End a Session's own first write: the gate shut, the session marked ended (merged as owned fields). */
async function endTheSession() {
  await table.client('gm-1').setSetting('campaignState', { ...world(), sessionActive: false, sessionEndedId: 'sess-1' });
  await table.settle();
}

async function kiraKeeps() {
  await relay('pl-1', 'batch.keep', { roundId: round().id });
  await table.drain();
}

describe('Z23 — End a Session while the round waits on an upgrade, then a recovery runs', () => {
  it('control: no recovery in between — the round finishes on Kira\'s Keep and is narrated', async () => {
    await weakHitWaitingForKira();
    await endTheSession();
    expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });    // "a round already resolving finishes first"
    await kiraKeeps();
    expect(narrationCalls()).toHaveLength(1);
    expect(roundNarrations()).toHaveLength(1);
  }, 30_000);

  it('a player reconnects first: the round still finishes on Kira\'s Keep and is narrated', async () => {
    await weakHitWaitingForKira();
    await endTheSession();
    await table.leave('pl-2');
    await table.join('pl-2');                                           // recoverRound("user-joined")
    await table.settle();
    expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });
    await kiraKeeps();
    expect(roundNarrations(), `round now: ${round()?.phase} (${round()?.closeReason ?? '-'})`).toHaveLength(1);
    expect(round()).toMatchObject({ number: 1, phase: 'closed', closeReason: 'resolved' });
  }, 30_000);

  it('a GM enters a Claude key first: the round still finishes on Kira\'s Keep and is narrated', async () => {
    await weakHitWaitingForKira();
    await endTheSession();
    await table.setClaudeKey('gm-2', 'sk-ant-gus');                     // recoverRound("keyed-gm") on Gina
    expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });
    await kiraKeeps();
    expect(roundNarrations()).toHaveLength(1);
  }, 30_000);

  it('control: the GM resolving it leaves — issue #340\'s rule: a round from an ended session is closed', async () => {
    await weakHitWaitingForKira();
    await endTheSession();
    try {
      await table.leave('gm-1');                                        // recoverRound("resolver-left") on Gus
      await table.settle();
      await table.drain();
      expect(round()).toMatchObject({ number: 1, phase: 'closed', closeReason: 'session-ended' });
      expect(roundNarrations()).toHaveLength(0);
    } finally {
      await table.join('gm-1');
    }
  }, 30_000);
});

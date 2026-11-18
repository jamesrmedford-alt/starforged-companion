/* global silenceConsoleErrors -- tests/setup.js */
// tests/unit/roundUpgradeUnsavedReceipt.test.js
//
// Issue #344 A01 — a Batch Mode round's Burn Momentum is committed (momentum
// spent, card upgraded), but the round write that records the decision is
// refused. acceptRoundUpgrade logged it and still told the upgrade path "the
// round took it", so no separate narration ran; the entry stayed undecided,
// its card "in flight", and the GM's Send now kept the result the burn
// replaced — the round narrated the weak hit the player paid to leave.
//
// Now the committed upgrade leaves a receipt (on its result card and the
// canonical GM's page), the GMs are told, and the round decides the entry from
// it — on its next pass, or at Send now — never as Keep on the original.
//
// Production entry point on two GMs and two players (the multi-client
// harness): the real relay handlers, round transitions, persistence, burn and
// narration. Pacing, the interpreter, ability detection and dice are
// controlled at their boundaries (the probe's setup, issue #344 Appendix A).

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
    // A weak hit that a burn of 9 raises to a strong hit: the round waits on Kira's decision.
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.35).mockReturnValueOnce(0.75).mockReturnValueOnce(0.4);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, failWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const SESSION = { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] };

let table;
const round = () => table.world.getSetting('batchMode.round');
const momentum = () => table.actors.get('pc-kira').system.momentum.value;
const roundCards = (roundId) => table.cards(f => f.narratorCard && f.roundId === roundId);
const unsavedNotices = () => table.cards(f => f.batchUpgradeUnsavedNotice);
// The round save that records Kira's burn.
const burnDecision = (w) => w.kind === 'setting' && w.key === `${MODULE_ID}.batchMode.round`
  && w.value?.entries?.['pl-1']?.upgrade?.decided === 'burn';

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false, campaignState: SESSION,
  } } });
  await table.setClaudeKey('gm-1', 'test-fixture-key');
  await table.setClaudeKey('gm-2', 'test-fixture-key');
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

describe('issue #344 A01 — a burn the round did not save is still the round\'s', () => {
  it('control: a burn the round saves narrates the upgraded outcome once', async () => {
    await weakHitWaitingForKira();
    const r = round();
    await relay('pl-1', 'move.burnMomentum', { messageId: r.entries['pl-1'].rolled.cardId });
    await table.drain();
    expect(round().number).toBe(2);
    expect(roundCards(r.id)).toHaveLength(1);
    expect(roundCards(r.id)[0].flags[MODULE_ID].roundEntries[0].outcome).toBe('strong_hit');
    expect(unsavedNotices()).toHaveLength(0);
  }, 30_000);

  it('the round\'s save of the burn refused once: the round narrates the strong hit, momentum spent once, the GMs told', async () => {
    await weakHitWaitingForKira();
    const r = round();
    const cardId = r.entries['pl-1'].rolled.cardId;
    const fault = failWrites(table, burnDecision);
    await relay('pl-1', 'move.burnMomentum', { messageId: cardId });
    await table.drain();

    expect(fault.refused).toBe(1);
    expect(table.world.message(cardId).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(momentum()).toBe(3);
    // It was: still upgrading, decided null — and Send now narrated the weak hit.
    expect(round().number).toBe(2);
    expect(roundCards(r.id)).toHaveLength(1);
    expect(roundCards(r.id)[0].flags[MODULE_ID].roundEntries[0].outcome).toBe('strong_hit');
    expect(table.world.message(cardId).flags[MODULE_ID].roundUpgradeReceipt).toMatchObject({ roundId: r.id, userId: 'pl-1', decision: 'burn' });
    expect(unsavedNotices().map(m => m.whisper)).toEqual([expect.arrayContaining(['gm-1', 'gm-2'])]);
  }, 30_000);

  it('while the world keeps refusing it, Send now never keeps the weak hit; once it lets the save through, the round narrates the strong hit', async () => {
    await weakHitWaitingForKira();
    const r = round();
    const cardId = r.entries['pl-1'].rolled.cardId;
    const fault = failWrites(table, burnDecision, { times: 1_000 });
    await relay('pl-1', 'move.burnMomentum', { messageId: cardId });
    await table.drain();
    expect(fault.refused).toBeGreaterThanOrEqual(1);
    expect(round()).toMatchObject({ id: r.id, phase: 'upgrading' });

    // Send now during the refusal: it kept the in-flight burn as the weak hit.
    await relay('gm-1', 'batch.sendNow', { roundId: r.id });
    await table.drain();
    expect(round()).toMatchObject({ id: r.id, phase: 'upgrading' });
    expect(roundCards(r.id)).toHaveLength(0);

    fault.off();
    await relay('gm-1', 'batch.sendNow', { roundId: r.id });
    await table.drain();

    expect(round().number).toBe(2);
    expect(roundCards(r.id)).toHaveLength(1);
    expect(roundCards(r.id)[0].flags[MODULE_ID].roundEntries[0].outcome, 'the burn the player paid for').toBe('strong_hit');
    expect(momentum()).toBe(3);
  }, 30_000);
});

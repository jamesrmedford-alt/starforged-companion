/* global silenceConsoleErrors -- tests/setup.js */
// tests/unit/upgradeOpenStampRefused.test.js
//
// Issue #344 A02 — once a move's original outcome is recorded, recordMove
// stamps its card `burn.originalApplied` (and `improve.…`), which opens the
// card's Burn Momentum / Improve Result: the GM handlers refuse an upgrade
// until then ("original-pending", issue #300 F02). The world refused that
// stamp and recordMove only warned. A Batch Mode round then read the card as
// offering no upgrade, went straight to its narration and closed the card —
// the player lost a legal Burn though nobody chose Keep; in free-flow the
// card's buttons stayed "available once the result is recorded" for good.
// Nobody was told.
//
// Now the stamp is tried again; refused again, the GMs are told, with a Retry
// that opens the card, and a round keeps the stamp it owes on its entry: it
// opens the card before its upgrade step, waits for the roller's decision all
// the same, and a press opens the card from the round's record — the gate
// itself stands.
//
// Production entry points on a booted table (the multi-client harness): the
// real relay handlers, round transitions, move pipeline, burn and narration.
// Pacing, the interpreter, ability detection and the dice are controlled at
// their boundaries (the probe's setup, issue #344 Appendix A).

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
    // A weak hit that a burn of 9 raises to a strong hit.
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.35).mockReturnValueOnce(0.75).mockReturnValueOnce(0.4);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, failWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { upgradeStampOwed } from '../../src/batch/round.js';

const REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const SESSION = { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] };

let table;
const round = () => table.world.getSetting('batchMode.round');
const momentum = () => table.actors.get('pc-kira').system.momentum.value;
const burnFlags = (cardId) => table.world.message(cardId).flags[MODULE_ID].burn;
const roundCards = (roundId) => table.cards(f => f.narratorCard && f.roundId === roundId);
const kirasCards = () => table.cards(f => f.moveResolution && f.actorId === 'pc-kira');
const unopenedNotices = () => table.cards(f => f.payoffFailureCard && f.steps?.some(s => s.step === 'upgradeOpen'));
// The write that opens the card's Burn Momentum — recordMove's, the round's, a press's, a Retry's.
const openStamp = (w) => w.kind === 'message.update' && w.changes?.[`flags.${MODULE_ID}.burn.originalApplied`] === true;

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
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

async function batchMode() {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
}

/** Kira's weak hit is rolled and recorded by the round; Ren passes. */
async function kiraRollsInTheRound() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await table.drain();
}

async function kiraBurns(cardId) {
  await relay('pl-1', 'move.burnMomentum', { messageId: cardId });
  await table.drain();
}

describe('issue #344 A02 — a Batch Mode round waits for a Burn whose card the world would not open', () => {
  beforeEach(batchMode);

  it('control: the round waits for Kira\'s decision on an opened card', async () => {
    await kiraRollsInTheRound();
    const r = round();
    expect(r).toMatchObject({ number: 1, phase: 'upgrading' });
    expect(burnFlags(r.entries['pl-1'].rolled.cardId)).toMatchObject({ canBurn: true, originalApplied: true });
    expect(r.entries['pl-1'].rolled.stampOwed).toBeUndefined();
    expect(unopenedNotices()).toHaveLength(0);
  }, 30_000);

  it('the stamp refused once: it is tried again, the round waits, and Kira\'s Burn is narrated', async () => {
    const fault = failWrites(table, openStamp);
    await kiraRollsInTheRound();
    expect(fault.refused).toBe(1);
    // It was: collecting round 2, the card closed `roundClosed`.
    expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });
    const r = round();
    const cardId = r.entries['pl-1'].rolled.cardId;
    expect(burnFlags(cardId)).toMatchObject({ originalApplied: true });
    expect(burnFlags(cardId).roundClosed).not.toBe(true);
    expect(r.entries['pl-1'].rolled.stampOwed, 'the second try landed').toBeUndefined();
    expect(unopenedNotices()).toHaveLength(0);

    await kiraBurns(cardId);
    expect(round().number).toBe(2);
    expect(roundCards(r.id)).toHaveLength(1);
    expect(roundCards(r.id)[0].flags[MODULE_ID].roundEntries[0].outcome).toBe('strong_hit');
    expect(momentum()).toBe(3);
  }, 30_000);

  it('refused at the record and again: the GMs are told, with a Retry, and the round opens the card before it asks', async () => {
    const fault = failWrites(table, openStamp, { times: 2 });
    await kiraRollsInTheRound();
    expect(fault.refused).toBe(2);
    const r = round();
    expect(r).toMatchObject({ number: 1, phase: 'upgrading' });
    expect(r.entries['pl-1'].rolled.stampOwed).toEqual(['burn']);
    const cardId = r.entries['pl-1'].rolled.cardId;
    expect(burnFlags(cardId).originalApplied, 'the round opened it before its upgrade step').toBe(true);
    const notices = unopenedNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0].whisper).toEqual(expect.arrayContaining(['gm-1', 'gm-2']));
    expect(notices[0].flags[MODULE_ID].steps).toEqual([{ step: 'upgradeOpen', messageId: cardId, moveName: 'Face Danger', kinds: ['burn'] }]);

    await kiraBurns(cardId);
    expect(round().number).toBe(2);
    expect(roundCards(r.id)[0].flags[MODULE_ID].roundEntries[0].outcome).toBe('strong_hit');
    expect(momentum()).toBe(3);
  }, 30_000);

  it('while the world keeps refusing it, the round still waits for Kira; once it lets the stamp through, her Burn opens the card and is narrated', async () => {
    const fault = failWrites(table, openStamp, { times: 1_000 });
    await kiraRollsInTheRound();
    const r = round();
    expect(r).toMatchObject({ number: 1, phase: 'upgrading' });
    expect(r.entries['pl-1'].upgrade).toMatchObject({ burn: { momentum: 9, previewOutcome: 'strong_hit' }, decided: null });
    const cardId = r.entries['pl-1'].rolled.cardId;
    expect(burnFlags(cardId).originalApplied).not.toBe(true);

    // A press while the world refuses the stamp: refused, nothing spent — and
    // the round's passes do not keep the offer as one its card cannot take.
    const refusedPress = fault.refused;
    await kiraBurns(cardId);
    expect(fault.refused).toBeGreaterThan(refusedPress);
    expect(momentum()).toBe(9);
    expect(burnFlags(cardId).consumed).not.toBe(true);
    await relay('pl-2', 'batch.pass', { roundId: r.id }).catch(() => null);
    await table.drain();
    expect(round()).toMatchObject({ id: r.id, phase: 'upgrading' });
    expect(round().entries['pl-1'].upgrade.decided).toBeNull();

    fault.off();
    await kiraBurns(cardId);
    expect(burnFlags(cardId)).toMatchObject({ originalApplied: true, consumed: true });
    expect(round().number).toBe(2);
    expect(roundCards(r.id)).toHaveLength(1);
    expect(roundCards(r.id)[0].flags[MODULE_ID].roundEntries[0].outcome, 'the burn the player paid for').toBe('strong_hit');
    expect(momentum()).toBe(3);
  }, 30_000);

  it('control: a press on a card the round did not record is still refused while its original is pending', async () => {
    await kiraRollsInTheRound();
    const cardId = round().entries['pl-1'].rolled.cardId;
    // Not the round's: a card whose stamp is owed by no entry.
    const gm = table.client('gm-1');
    const other = await gm.run(() => globalThis.ChatMessage.create({ content: 'a move card', flags: { [MODULE_ID]: {
      moveResolution: true, actorId: 'pc-kira', burn: { ...game.messages.get(cardId).flags[MODULE_ID].burn, originalApplied: false },
    } } }));
    await table.settle();
    await kiraBurns(other.id);
    expect(burnFlags(other.id).consumed).not.toBe(true);
    expect(burnFlags(other.id).originalApplied).toBe(false);
    expect(momentum()).toBe(9);
  }, 30_000);
});

describe('issue #344 A02 — free-flow: a card the world would not open goes to the GMs, with a Retry', () => {
  it('the stamp refused: the GMs are told; their Retry opens the card, and Kira can burn', async () => {
    const fault = failWrites(table, openStamp, { times: 1_000 });
    await table.client('pl-1').chat('I slip through the vent before the drones turn.', { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();
    const card = kirasCards().at(-1);
    expect(card.flags[MODULE_ID].burn).toMatchObject({ canBurn: true });
    expect(burnFlags(card._id).originalApplied).not.toBe(true);
    const notices = unopenedNotices();
    expect(notices, 'the GMs are told, with a Retry').toHaveLength(1);
    expect(notices[0].whisper).toEqual(expect.arrayContaining(['gm-1', 'gm-2']));

    fault.off();
    await table.client('gm-1').click(notices[0]._id, '[data-action="sf-payoff-retry"]');
    await table.settle(); await table.drain();
    expect(burnFlags(card._id).originalApplied).toBe(true);

    await relay('pl-1', 'move.burnMomentum', { messageId: card._id });
    await table.drain();
    expect(burnFlags(card._id).consumed).toBe(true);
    expect(momentum()).toBe(3);
  }, 30_000);
});

describe('issue #344 A02 — the round\'s record stands in for the stamp only while the decision is owed', () => {
  const entry = (over = {}) => ({ userId: 'pl-1', status: 'recorded', rolled: { cardId: 'card-1', stampOwed: ['burn'] }, ...over });
  const at = (phase, e = entry()) => ({ phase, acting: ['pl-1'], entries: { 'pl-1': e } });

  it('owed while the round rolls or asks, for the kind it owes and the card it recorded', () => {
    expect(upgradeStampOwed(at('rolling'), 'card-1', 'burn')).toBe(true);
    expect(upgradeStampOwed(at('upgrading'), 'card-1', 'burn')).toBe(true);
    expect(upgradeStampOwed(at('upgrading'), 'card-1', 'improve')).toBe(false);
    expect(upgradeStampOwed(at('upgrading'), 'card-2', 'burn')).toBe(false);
  });

  it('not once the entry is decided, the round narrating, or the entry not recorded', () => {
    expect(upgradeStampOwed(at('upgrading', entry({ upgrade: { burn: {}, decided: 'keep' } })), 'card-1', 'burn')).toBe(false);
    expect(upgradeStampOwed(at('narrating'), 'card-1', 'burn')).toBe(false);
    expect(upgradeStampOwed(at('collecting'), 'card-1', 'burn')).toBe(false);
    expect(upgradeStampOwed(at('upgrading', entry({ status: 'rolled' })), 'card-1', 'burn')).toBe(false);
    expect(upgradeStampOwed(null, 'card-1', 'burn')).toBe(false);
  });
});

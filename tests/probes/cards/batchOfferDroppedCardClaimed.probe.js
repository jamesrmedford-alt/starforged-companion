/**
 * CARD-2 — Batch Mode: a card button's move offered beside its roller's
 * confirmed action is dropped when the round resolves, and its card stays
 * claimed (eleventh audit, cards).
 *
 * Batch Mode (issue #340): "a card button's move becomes its roller's entry"
 * — or, when they have already submitted their own action, an offer beside it
 * and "the window asks which to keep" (src/batch/round.js offerForcedMove).
 * Kira has confirmed her action for the round. While Ren and Ash are still
 * deciding, her player presses "⚔ Attempt to Finish the Fight" on her Strike
 * card from the round before: the canonical GM claims the card
 * (`decisiveActionAttempted`, cardActions.applyCardRollerFollowup) and posts
 * the forced Take Decisive Action, which the round records as an offer on her
 * READY entry. Ren and Ash pass: the round is ready (readyToResolve counts a
 * READY entry with an offer as ready) and resolves at once. The offer is a
 * field of round 1's entry; round 2 opens with fresh entries — the card's move
 * is gone, and the card's button reads pressed on every client. Kira never
 * chose; nothing tells her. The press made while a round RESOLVES is held for
 * the next round (holdForNextRound) — an offer the round outran is not.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ pace: null, interpret: null, dice: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
    decidePacing: vi.fn(async ({ playerText }) => control.pace(playerText)),
  };
});
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => control.interpret(text)),
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

const P3 = Object.freeze({ id: 'pl-3', name: 'Rook', isGM: false });
const ROUND_REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 3 and 4, action die 6 (+edge 2 = 8): a strong hit.
const STRONG = [0.25, 0.35, 0.9];
const FACE_DANGER = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false };
const MOVE = { runMove: true, decision: 'MOVE', suggestedMove: null };

let table;
const round = () => table.world.getSetting('batchMode.round');
let seq = 0;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2, P3] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.pace = () => ({ ...MOVE });
  control.interpret = () => ({ ...FACE_DANGER });
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    narratorSessionSummary: false,
    combatTrackerEnabled: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ash',  name: 'Ash',  ownership: { 'pl-3': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => ROUND_REPLY });
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

async function batchModeOn() {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
}

async function submit(userId, text) {
  const submissionId = `sub-${userId}-${++seq}`;
  await relay(userId, 'batch.submit', { roundId: round().id, text, submissionId });
  return submissionId;
}

async function confirm(userId) {
  const r = round();
  return relay(userId, 'batch.confirm', { roundId: r.id, submissionId: r.entries[userId].submissionId, choices: {} });
}

const pass = (userId) => relay(userId, 'batch.pass', { roundId: round().id });

/** Kira's Strike card from an earlier round: GM-authored, her roll, a "⚔ Attempt to Finish the Fight". */
async function kiraStrikeCard() {
  const card = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: '<div class="sf-move-result">Strike — strong hit <button data-action="sf-take-decisive-action">⚔ Attempt to Finish the Fight</button></div>',
    flags: { [MODULE_ID]: { moveResolution: true, resolutionId: 'res-strike', combatMoveCard: true, actorId: 'pc-kira' } },
  }));
  await table.settle();
  return card;
}

const pressFinishTheFight = (card) => relay('pl-1', 'tda.attempt', { messageId: card.id, actorId: 'pc-kira' });
const claimed = (card) => table.world.message(card.id).flags[MODULE_ID].decisiveActionAttempted;

describe('Batch Mode — a card button pressed beside its roller\'s confirmed action', () => {
  it('control: pressed before Kira acts, the card\'s move becomes her entry', async () => {
    await batchModeOn();
    const card = await kiraStrikeCard();
    await pressFinishTheFight(card);
    await table.drain();
    expect(claimed(card)).toBe(true);
    expect(round().entries['pl-1'].text).toMatch(/decisive action/i);
  }, 30_000);

  it('the offer is not lost when the round resolves before Kira chooses', async () => {
    await batchModeOn();
    const card = await kiraStrikeCard();
    control.dice = [STRONG];
    await submit('pl-1', 'I slip through the vent.');
    await confirm('pl-1');
    await table.drain();
    expect(round().entries['pl-1'].status).toBe('ready');

    await pressFinishTheFight(card);
    await table.drain();
    // Setup is real: the card is claimed and the round offers its move beside Kira's.
    expect(claimed(card)).toBe(true);
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
    expect(round().entries['pl-1'].offer?.text).toMatch(/decisive action/i);

    // Ren and Ash pass: the round is ready, and resolves.
    await pass('pl-2');
    await pass('pl-3');
    await table.drain();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });

    // The card's move is still Kira's to take: offered (or entered) in round 2,
    // or its button live again.
    const next = round().entries['pl-1'];
    const carried = /decisive action/i.test(`${next?.text ?? ''} ${next?.offer?.text ?? ''}`);
    const where = `round 2 Kira entry ${next?.status} text=${JSON.stringify(next?.text ?? null)} offer=${JSON.stringify(next?.offer ?? null)}; card decisiveActionAttempted=${claimed(card)}`;
    expect(carried || claimed(card) !== true, where).toBe(true);
  }, 30_000);
});

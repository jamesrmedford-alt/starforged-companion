/* global silenceConsoleErrors -- tests/setup.js */
/**
 * PROBE — BATCH: CARD-MOVE-ENTRY-DROPPED-BY-PASS (twelfth audit, 2026-11-09)
 *
 * Issue #342 Z05 (BATCH-CARD-MOVE-OFFER-DROPPED) and its decision ("A Batch
 * Mode action is never silently dropped": "an untaken offer or an unrolled
 * card-move entry is held for the next round … Withdraw / Edit / Pass leave
 * an offer standing (only Keep mine drops one)"). The help: "A card button's
 * move … becomes that character's action for the round, waiting for their
 * Confirm … a card's move the round resolves or closes without: one not yet
 * chosen, or one not confirmed [joins the next round]. Its card is spent by
 * the press, so only Keep mine drops it."
 *
 * The fix covers the card's move as an OFFER beside a written action
 * (passEntry / withdrawEntry keep `offer`, src/batch/round.js 342-371). It
 * does not cover the sibling: the card's move as the ENTRY itself — pressed
 * before the player wrote anything (offerForcedMove makes it the entry,
 * round.js 498-526, its message id in `entry.readAs.messageId`). Pass (and
 * Withdraw / Edit) reset `readAs: null` (round.js 348-349, 368-369), so
 * takeCardMoves (round.js 542-553) never sees the card's move: it is not
 * rolled, not held for the next round, and its card stays claimed (the
 * "⚔ Attempt to Finish the Fight" reads taken) — the move is gone. The same
 * press made a moment after the player's own action, then passed, joins the
 * next round.
 *
 * Harness: batchCardMoveHeldForNextRound.test.js's (a GM and three players,
 * the real driver, relays, card handler and pipeline; pacing / interpreter /
 * ability scan / detection mocked, dice scripted). Kira's Strike card is
 * GM-authored and claims `decisiveActionAttempted` through its real relay.
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
async function submit(userId, text) {
  const submissionId = `sub-${userId}-${++seq}`;
  await relay(userId, 'batch.submit', { roundId: round().id, text, submissionId });
  return submissionId;
}
async function confirm(userId, choices = {}) {
  const r = round();
  return relay(userId, 'batch.confirm', { roundId: r.id, submissionId: r.entries[userId].submissionId, choices });
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
const pressFinishTheFight = async (card) => {
  await relay('pl-1', 'tda.attempt', { messageId: card.id, actorId: 'pc-kira' });
  await table.drain();
};
const claimed = (card) => table.world.message(card.id).flags[MODULE_ID].decisiveActionAttempted;
const kiraRolls = () => table.cards(f => f.moveResolution && f.roundUserId === 'pl-1').map(c => c.content ?? '');
const othersPass = async () => { await pass('pl-2'); await pass('pl-3'); await table.drain(); };

describe('CARD-MOVE-ENTRY-DROPPED-BY-PASS — a card\'s move that is the entry, then Pass', () => {
  it('control: pressed AFTER Kira wrote and confirmed her own action, then Pass — the card\'s move joins round 2 (Z05)', async () => {
    const card = await kiraStrikeCard();
    await submit('pl-1', 'I crawl toward the airlock.');
    await table.drain();
    await confirm('pl-1');
    await pressFinishTheFight(card);
    expect(round().entries['pl-1'].offer?.text).toMatch(/decisive action/i);
    await pass('pl-1');
    await othersPass();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(round().entries['pl-1'].text ?? '').toMatch(/decisive action/i);
  }, 60_000);

  it('control: pressed before Kira writes anything, the card\'s move is her entry; the card is claimed', async () => {
    const card = await kiraStrikeCard();
    await pressFinishTheFight(card);
    expect(claimed(card)).toBe(true);
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', readAs: { forced: { moveId: 'take_decisive_action' } } });
  }, 60_000);

  it('the card\'s move is her entry and she passes this round: it must join round 2, not vanish with its card claimed', async () => {
    control.dice = [STRONG];
    const card = await kiraStrikeCard();
    await pressFinishTheFight(card);
    expect(round().entries['pl-1'].text).toMatch(/decisive action/i);
    await pass('pl-1');
    await othersPass();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(kiraRolls()).toEqual([]);                    // not rolled in round 1
    expect(claimed(card)).toBe(true);                   // the card stays spent
    // Correct: the claimed card's move is held for the next round, as the
    // offer in the first control is.
    const next = round().entries['pl-1'];
    expect({ status: next.status, text: next.text ?? null })
      .toEqual({ status: 'read', text: expect.stringMatching(/decisive action/i) });
  }, 60_000);
});

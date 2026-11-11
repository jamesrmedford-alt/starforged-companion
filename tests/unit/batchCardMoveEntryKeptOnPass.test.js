/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchCardMoveEntryKeptOnPass.test.js
 *
 * Issue #345 AA37 CARD-MOVE-ENTRY-DROPPED-BY-PASS (the twelfth audit's
 * BATCH-2).
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
 * Z05 covered the card's move as an OFFER beside a written action (passEntry /
 * withdrawEntry keep `offer`). Not the sibling: the card's move as the ENTRY
 * itself — pressed before the player wrote anything (offerForcedMove makes it
 * the entry, its message id in `entry.readAs.messageId`). Pass, Withdraw and
 * Edit (a withdraw) reset `readAs: null`, so takeCardMoves never saw the
 * card's move: not rolled, not held for the next round, its card still
 * claimed (the "⚔ Attempt to Finish the Fight" read taken) — the move gone.
 *
 * The fix: Pass / Withdraw / Edit keep such a card's move as the offer beside
 * the entry (round.js offerKept) — the window offers "Use the card's move",
 * and a round that resolves or closes without it holds it for the next.
 *
 * Harness: batchCardMoveHeldForNextRound.test.js's (a GM and three players,
 * the real driver, relays, card handler and pipeline; pacing / interpreter /
 * ability scan / detection mocked, dice scripted). Kira's Strike card is
 * GM-authored and claims `decisiveActionAttempted` through its real relay.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ pace: null, interpret: null, dice: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
    decidePacing: vi.fn(async ({ playerText }) => control.pace(playerText)),
  };
});
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => control.interpret(text)),
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
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import {
  ENTRY_STATUS, createRound, participantsFrom, submitEntry, offerForcedMove, withdrawEntry, passEntry, takeCardMoves,
} from '../../src/batch/round.js';

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
const decisive = { status: 'read', text: expect.stringMatching(/decisive action/i) };
const entryNow = (userId) => ({ status: round().entries[userId].status, text: round().entries[userId].text ?? null });

describe("issue #345 AA37 — a card's move that is the entry stays offered when its player passes, withdraws or edits", () => {
  it("control: pressed AFTER Kira wrote and confirmed her own action, then Pass — the card's move joins round 2 (Z05)", async () => {
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

  it("control: pressed before Kira writes anything, the card's move is her entry; the card is claimed", async () => {
    const card = await kiraStrikeCard();
    await pressFinishTheFight(card);
    expect(claimed(card)).toBe(true);
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', readAs: { forced: { moveId: 'take_decisive_action' } } });
  }, 60_000);

  it("the card's move is her entry and she passes this round: it joins round 2, not vanishing with its card claimed", async () => {
    control.dice = [STRONG];
    const card = await kiraStrikeCard();
    await pressFinishTheFight(card);
    expect(round().entries['pl-1'].text).toMatch(/decisive action/i);
    await pass('pl-1');
    // Offered in her window meanwhile: "Use the card's move".
    expect(round().entries['pl-1']).toMatchObject({ status: 'passed', offer: { messageId: expect.any(String), forced: { moveId: 'take_decisive_action' } } });
    await othersPass();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(kiraRolls()).toEqual([]);                    // not rolled in round 1
    expect(claimed(card)).toBe(true);                   // the card stays spent
    expect(entryNow('pl-1')).toEqual(decisive);
  }, 60_000);

  it("Withdraw (and Edit, which relays one) is the same: the card's move she withdrew joins the next round when a GM sends this one", async () => {
    const card = await kiraStrikeCard();
    await pressFinishTheFight(card);
    await relay('pl-1', 'batch.withdraw', { roundId: round().id });
    expect(round().entries['pl-1']).toMatchObject({ status: 'waiting', readAs: null, offer: { forced: { moveId: 'take_decisive_action' } } });
    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.drain();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(claimed(card)).toBe(true);
    expect(entryNow('pl-1')).toEqual(decisive);
  }, 60_000);

  it("withdrawn, she can take it back: Use the card's move makes it her entry again, rolled with the round", async () => {
    control.dice = [STRONG];
    const card = await kiraStrikeCard();
    await pressFinishTheFight(card);
    const posted = round().entries['pl-1'].readAs.messageId;          // the press's forced post
    await relay('pl-1', 'batch.withdraw', { roundId: round().id });
    await relay('pl-1', 'batch.reread', { roundId: round().id, submissionId: null, newSubmissionId: 'use-card', useOffer: true });
    await table.drain();
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', offer: null, readAs: { forced: { moveId: 'take_decisive_action' }, messageId: posted } });
    await confirm('pl-1');
    await othersPass();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(kiraRolls()).toHaveLength(1);
    expect(round().entries['pl-1'].status).toBe('waiting');
  }, 60_000);
});

describe('issue #345 AA37 — the transitions keep the card move (round.js, pure)', () => {
  const NOW = '2026-11-10T10:00:00.000Z';
  const users = [
    { id: 'pl-1', name: 'Pat', isGM: false, active: true, characterId: 'pc-kira' },
    { id: 'pl-2', name: 'Quinn', isGM: false, active: true, characterId: 'pc-ren' },
  ];
  const pcs = [{ id: 'pc-kira', name: 'Kira', ownerIds: ['pl-1'] }, { id: 'pc-ren', name: 'Ren', ownerIds: ['pl-2'] }];
  const open = () => createRound({ id: 'r1', number: 1, sessionId: 's1', now: NOW, participants: participantsFrom({ users, pcs }) });
  const forced = { moveId: 'take_decisive_action' };
  const cardEntry = () => offerForcedMove(open(), { userId: 'pl-1', text: 'Kira takes decisive action.', forced, submissionId: 'f', now: NOW, messageId: 'm-card' }).round;

  it.each([['passes', passEntry], ['withdraws', withdrawEntry]])('a card-move entry whose player %s becomes the offer beside it — held when the round leaves it', (_label, transition) => {
    const r = transition(cardEntry(), { userId: 'pl-1' });
    expect(r.entries['pl-1']).toMatchObject({ readAs: null, offer: { text: 'Kira takes decisive action.', forced, messageId: 'm-card', at: NOW } });
    expect(takeCardMoves(r).held).toEqual([{ userId: 'pl-1', messageId: 'm-card' }]);
  });

  it('control: an offer already beside the entry stays as it was; a written action leaves no offer', () => {
    let r = submitEntry(open(), { userId: 'pl-1', text: 'I crawl.', submissionId: 's', now: NOW });
    r = offerForcedMove(r, { userId: 'pl-1', text: 'Dive.', forced: { moveId: 'face_danger' }, submissionId: 'd', now: NOW, messageId: 'm-offer' }).round;
    expect(passEntry(r, { userId: 'pl-1' }).entries['pl-1'].offer).toMatchObject({ text: 'Dive.', messageId: 'm-offer' });
    const written = submitEntry(open(), { userId: 'pl-2', text: 'I cover the hatch.', submissionId: 'w', now: NOW });
    expect(withdrawEntry(written, { userId: 'pl-2' }).entries['pl-2']).toMatchObject({ status: ENTRY_STATUS.WAITING, offer: null });
    expect(passEntry(written, { userId: 'pl-2' }).entries['pl-2']).toMatchObject({ status: ENTRY_STATUS.PASSED, offer: null });
  });
});

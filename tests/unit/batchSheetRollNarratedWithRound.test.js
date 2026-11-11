/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchSheetRollNarratedWithRound.test.js
 *
 * Issue #345 D1 SHEET-ROLL-NARRATED-OUTSIDE-ROUND (the twelfth audit's
 * BATCH-6) — the maintainer's option A.
 *
 * Batch Mode's contract (issue #340; decisions.md "Batch Mode: opt-in rounds,
 * read in the player's window, narrated once"): every player's action is
 * gathered into the round, and the narrator tells the round as one scene, on
 * one card. The chat pipeline enforced it for the two ways a move reaches the
 * module from chat — a typed line is table talk, a card button's move is the
 * roller's entry. A vow or bond progress roll made on the foundry-ironsworn
 * sheet (Fulfill Your Vow, Forge a Bond) was the exception: its narration hook
 * (src/index.js registerNativeProgressRollHook) never looked at Batch Mode,
 * so the keyed canonical GM narrated it at once, on its own card, in the
 * middle of the round collecting.
 *
 * Now, while the mode is on, a participant's sheet roll is narrated with the
 * round: the canonical GM makes it the roller's entry — ready, carrying the
 * parsed outcome (driver.takeSheetRoll → round.enterSheetRoll), never rolled
 * again — and the round's one narration tells it. Only the narration moves:
 * the payoff hook pays it at once as before (here, a miss's 🔁 Recommit
 * offer). With no round collecting it is held for the next round, as a card's
 * move is; with the mode off before the next round opens, it gets its own
 * narration, as before. A non-participant's sheet roll is narrated at once.
 *
 * Harness: the batch tables' (real driver, relays and pipeline; pacing,
 * interpreter, ability scan and detection mocked, dice scripted) with
 * nativeRollKeyedRunner.test.js's native card (the vendor's `ironsworn-roll`
 * article); the round's pure transitions and view beside it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
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
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import * as R from '../../src/batch/round.js';
import { buildRoundView } from '../../src/batch/roundView.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = 'Kira keeps her word.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 4 and 8, action die 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
const WEAK = [0.35, 0.75, 0.4];

let table;
const round = () => table.world.getSetting('batchMode.round');
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
/** A narration of the sheet roll on its own card, outside a round. */
const ownVowNarrations = () => table.cards(f => f.narratorCard && f.moveId === 'fulfill_your_vow' && !f.roundId);
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);
const heldNotices = () => table.cards(f => f.batchHeldMoveNotice);

function nativeProgressCard({ source, value, dice, actorId = 'pc-kira' }) {
  const roll = { preRollOptions: { progress: { source, value }, actorId }, rawChallengeDiceValues: dice };
  const json = JSON.stringify(roll).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<article class='ironsworn-roll' data-ironswornroll='${json}'><h3>Progress Roll: ${source}</h3></article>`;
}

/** `userId` rolls `actorId`'s vow on the sheet — a miss (1 against 5 and 8): no payoff but the recommit offer. */
async function rollsVowOnTheSheet({ userId = 'pl-1', actorId = 'pc-kira', alias = 'Kira', source = 'Find Chen' } = {}) {
  let id = null;
  await table.client(userId).run(async () => {
    const m = await globalThis.ChatMessage.create({
      content: nativeProgressCard({ source, value: 1, dice: [5, 8], actorId }),
      speaker: { actor: actorId, alias },
      rolls: [{ formula: '{d10,d10}', total: 0 }],
    });
    id = m?.id ?? m?._id ?? null;
  });
  await table.settle();
  await table.drain();
  return id;
}

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle(); await table.drain();
  return res;
}

async function batchModeOn() {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
  expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({
    id: 'pc-kira', name: 'Kira', type: 'character', hasPlayerOwner: true, ownership: { 'pl-1': 3 },
    items: { contents: [
      { id: 'vow-1', type: 'progress', name: 'Find Chen', system: { subtype: 'vow', rank: 'dangerous', current: 4 }, flags: {} },
    ] },
  });
  table.addActor({ id: 'pc-ren', name: 'Ren', type: 'character', hasPlayerOwner: true, ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});

describe('issue #345 D1 — a sheet roll while Batch Mode is on is narrated with the round', () => {
  it('control: with Batch Mode off, the sheet roll is narrated once, on its own card (free-flow)', async () => {
    await rollsVowOnTheSheet();
    expect(ownVowNarrations()).toHaveLength(1);
  }, 60_000);

  it('control: with Batch Mode on, a typed line is table talk — no narration call', async () => {
    await batchModeOn();
    await table.client('pl-1').chat('I swear I will find Chen.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    await table.drain();
    expect(narrations()).toEqual([]);
  }, 60_000);

  it('while the round collects, it is Kira\'s entry, ready with its outcome — not narrated on its own card; its payoff still runs at once', async () => {
    await batchModeOn();
    const cardId = await rollsVowOnTheSheet();
    expect({
      separateNarrations: ownVowNarrations().length,
      narrationCalls:     narrations().length,
      roundPhase:         round().phase,
    }).toEqual({ separateNarrations: 0, narrationCalls: 0, roundPhase: 'collecting' });
    expect(round().entries['pl-1']).toMatchObject({
      status: 'ready', text: 'Resolving: Find Chen', readAs: { messageId: cardId },
      reading: { kind: 'sheet-roll', narrationInput: { kind: 'move', moveId: 'fulfill_your_vow', outcome: 'miss', outcomeLabel: 'Miss' } },
    });
    // The payoff hook is unchanged: the miss's 🔁 Recommit offer posts at once.
    expect(table.cards(f => f.vowRecommitOfferCard)).toHaveLength(1);
  }, 60_000);

  it('the round narrates it once with the others: its move, outcome and progress roll on the round card — never rolled again', async () => {
    await batchModeOn();
    await rollsVowOnTheSheet();
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    expect(narrations()).toHaveLength(1);
    const user = narrations()[0].userText;
    expect(user).toContain('### 1. Kira — Fulfill Your Vow: miss');
    expect(user).toContain('[ROLL: Progress score: 1 vs Challenge: 5, 8]');
    expect(user).toContain('Kira: "Resolving: Find Chen"');
    expect(roundCards()).toHaveLength(1);
    expect(roundCards()[0].flags[MODULE_ID].roundEntries).toEqual([
      expect.objectContaining({ userId: 'pl-1', moveId: 'fulfill_your_vow', outcome: 'miss' }),
    ]);
    expect(ownVowNarrations()).toHaveLength(0);
    expect(table.cards(f => f.moveResolution)).toHaveLength(0);              // the round rolled nothing
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 60_000);

  it('beside an action Kira had written, the sheet roll is her action and the written one is kept for the next round; it can\'t be withdrawn', async () => {
    await batchModeOn();
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I check the hull seals.', submissionId: 'k1' });
    expect(round().entries['pl-1']).toMatchObject({ status: 'read' });
    await rollsVowOnTheSheet();
    expect(round().entries['pl-1']).toMatchObject({
      status: 'ready', reading: { kind: 'sheet-roll' }, setAside: { text: 'I check the hull seals.' },
    });
    await relay('pl-1', 'batch.withdraw', { roundId: round().id });
    expect(round().entries['pl-1']).toMatchObject({ status: 'ready', reading: { kind: 'sheet-roll' } });
    expect(table.cards(f => f.batchRefusedNotice).map(m => m.content).join('\n')).toMatch(/made on your character sheet/);
    expect(ownVowNarrations()).toHaveLength(0);
  }, 60_000);

  it('made while a round is being resolved, it is held for the next round and narrated there', async () => {
    table.actors.get('pc-ren').system.momentum.value = 9;
    await batchModeOn();
    control.dice = [WEAK];
    await relay('pl-1', 'batch.pass', { roundId: round().id });
    await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'r1' });
    await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
    expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });           // Ren decides Burn / Keep

    await rollsVowOnTheSheet();
    expect(ownVowNarrations()).toHaveLength(0);
    expect(heldNotices().map(m => m.content).join('\n')).toMatch(/Kira's roll on the character sheet is narrated with the next round/);

    await relay('pl-2', 'batch.keep', { roundId: round().id });
    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].userText).not.toContain('Fulfill Your Vow');          // round 1 is Ren's alone
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(round().entries['pl-1']).toMatchObject({ status: 'ready', reading: { kind: 'sheet-roll' } });

    await relay('pl-2', 'batch.pass', { roundId: round().id });
    expect(narrations()).toHaveLength(2);
    expect(narrations()[1].userText).toContain('### 1. Kira — Fulfill Your Vow: miss');
    expect(ownVowNarrations()).toHaveLength(0);
  }, 60_000);

  it('held for the next round when Batch Mode is turned off before it opens, it gets its own narration, as before', async () => {
    table.actors.get('pc-ren').system.momentum.value = 9;
    await batchModeOn();
    control.dice = [WEAK];
    await relay('pl-1', 'batch.pass', { roundId: round().id });
    await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'r1' });
    await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
    expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });
    await rollsVowOnTheSheet();
    expect(ownVowNarrations()).toHaveLength(0);

    // The switch pressed while the round resolves: it finishes, then the mode turns off.
    const gm = table.client('gm-1');
    const mod = await gm.import('../../src/ui/roundWindow.js');
    await gm.run(() => mod.toggleBatchMode());
    await table.settle(); await table.drain();
    await relay('pl-2', 'batch.keep', { roundId: round().id });
    expect(table.world.getSetting('batchMode.enabled')).toBe(false);
    expect(ownVowNarrations()).toHaveLength(1);
  }, 60_000);

  it('a round a GM discards hands it to the next round, where it is Kira\'s entry again — never narrated on its own', async () => {
    await batchModeOn();
    await rollsVowOnTheSheet();
    await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'r1' });
    await relay('gm-1', 'batch.discard', { roundId: round().id });
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(round().entries['pl-1']).toMatchObject({ status: 'ready', reading: { kind: 'sheet-roll', narrationInput: { moveId: 'fulfill_your_vow' } } });
    expect(ownVowNarrations()).toHaveLength(0);
    expect(narrations()).toHaveLength(0);
  }, 60_000);

  it('control: a sheet roll of a character no participant plays is narrated at once, as a non-participant\'s card move runs', async () => {
    table.addActor({
      id: 'pc-vex', name: 'Vex', type: 'character', ownership: {},
      items: { contents: [{ id: 'vow-v', type: 'progress', name: 'Find Chen', system: { subtype: 'vow', rank: 'dangerous', current: 4 }, flags: {} }] },
    });
    await batchModeOn();
    await rollsVowOnTheSheet({ userId: 'gm-1', actorId: 'pc-vex', alias: 'Vex' });
    expect(ownVowNarrations()).toHaveLength(1);
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
    expect(Object.keys(round().entries)).not.toContain('pc-vex');
  }, 60_000);
});

describe('issue #345 D1 — a sheet roll the GM canonical now never took', () => {
  beforeAll(async () => {
    await table.teardown();
    table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
  }, 30_000);
  beforeEach(async () => { await table.setClaudeKey('gm-2', 'sk-ant-gus'); });

  it('handed back by a round Gus discards once Gina (whose game took it) has left, it is a sheet roll in the next round — never read and rolled as a card\'s move', async () => {
    await batchModeOn();
    await rollsVowOnTheSheet();                                              // taken on Gina's game
    await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'r1' });
    await table.leave('gm-1');
    await table.settle(); await table.drain();
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
    expect(round().entries['pl-1']).toMatchObject({ status: 'ready', reading: { kind: 'sheet-roll' } });

    await relay('gm-2', 'batch.discard', { roundId: round().id });
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(round().entries['pl-1']).toMatchObject({
      status: 'ready', text: 'Resolving: Find Chen',
      reading: { kind: 'sheet-roll', narrationInput: { moveId: 'fulfill_your_vow', outcome: 'miss' } },
    });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    expect(narrations().at(-1)?.userText ?? '').toContain('### 1. Kira — Fulfill Your Vow: miss');
    expect(table.cards(f => f.moveResolution)).toHaveLength(0);              // nothing read or rolled from the roll card
    expect(ownVowNarrations()).toHaveLength(0);
  }, 60_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// The round's transitions and the window's view (pure)
// ─────────────────────────────────────────────────────────────────────────────

const NOW = '2026-11-11T10:00:00.000Z';
const INPUT = { kind: 'move', moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', outcome: 'strong_hit', outcomeLabel: 'Strong Hit' };
const PARTS = [
  { userId: 'pl-1', userName: 'Pat', actorId: 'pc-kira', actorName: 'Kira' },
  { userId: 'pl-2', userName: 'Rae', actorId: 'pc-ren', actorName: 'Ren' },
];
const freshRound = () => R.createRound({ id: 'r1', number: 1, sessionId: 's1', now: NOW, participants: PARTS });
const sheetRoll = (r, messageId = 'sheet-1') => R.enterSheetRoll(r, {
  userId: 'pl-1', text: 'Resolving: Find Chen', narrationInput: INPUT, submissionId: `sub-${messageId}`, now: NOW, messageId,
});
const READING = { kind: R.READING_KIND.MOVE, moveId: 'face_danger', moveName: 'Face Danger', abilities: [], statOptions: [], targetChoices: null, interpretation: {} };

describe('issue #345 D1 — round.enterSheetRoll', () => {
  it('a waiting entry becomes the sheet roll, ready and last in the confirm order', () => {
    const res = sheetRoll(freshRound());
    expect(res.held).toEqual([]);
    expect(res.round.entries['pl-1']).toMatchObject({
      status: 'ready', text: 'Resolving: Find Chen', readAs: { messageId: 'sheet-1' },
      reading: { kind: 'sheet-roll', narrationInput: INPUT }, choices: null,
    });
    expect(res.round.order).toEqual(['pl-1']);
    expect(R.isSheetRollEntry(res.round.entries['pl-1'])).toBe(true);
    expect(R.readyToResolve(res.round, { connectedUserIds: ['pl-1'] })).toBe(true);
  });

  it('an action already written is set aside; a card move that was the entry is handed back', () => {
    let r = R.submitEntry(freshRound(), { userId: 'pl-1', text: 'I check the seals.', submissionId: 'a', now: NOW });
    expect(sheetRoll(r).round.entries['pl-1'].setAside).toEqual({ text: 'I check the seals.', at: NOW });
    r = R.offerForcedMove(freshRound(), { userId: 'pl-1', text: 'I dive.', forced: { moveId: 'face_danger' }, submissionId: 'f', now: NOW, messageId: 'card-1' }).round;
    const res = sheetRoll(r);
    expect(res.held).toEqual([{ userId: 'pl-1', messageId: 'card-1' }]);
    expect(res.round.entries['pl-1'].setAside ?? null).toBeNull();
  });

  it('beside an owed roll or another sheet roll already the entry, it is handed back itself', () => {
    const owed = R.offerForcedMove(freshRound(), { userId: 'pl-1', text: 'I resist.', forced: { moveId: 'endure_harm', owed: true }, submissionId: 'o', now: NOW, messageId: 'owed-1' }).round;
    const beside = sheetRoll(owed);
    expect(beside).toMatchObject({ held: [{ userId: 'pl-1', messageId: 'sheet-1' }] });
    expect(beside.round).toBe(owed);
    const first = sheetRoll(freshRound()).round;
    const second = sheetRoll(first, 'sheet-2');
    expect(second).toMatchObject({ held: [{ userId: 'pl-1', messageId: 'sheet-2' }] });
    expect(second.round).toBe(first);
  });

  it('is the player\'s action as it stands: submit, withdraw, pass and re-read are refused', () => {
    const r = sheetRoll(freshRound()).round;
    const sub = r.entries['pl-1'].submissionId;
    for (const act of [
      () => R.submitEntry(r, { userId: 'pl-1', text: 'Something else.', submissionId: 'b', now: NOW }),
      () => R.withdrawEntry(r, { userId: 'pl-1' }),
      () => R.passEntry(r, { userId: 'pl-1' }),
      () => R.rereadEntry(r, { userId: 'pl-1', submissionId: sub, newSubmissionId: 'c', now: NOW, useOffer: true }),
    ]) {
      expect(act).toThrow(/made on your character sheet/);
    }
  });

  it('an owed card press beside it waits for the next round; another card press is an offer only Keep mine can answer', () => {
    const r = sheetRoll(freshRound()).round;
    const owed = R.offerForcedMove(r, { userId: 'pl-1', text: 'I resist.', forced: { moveId: 'endure_harm', owed: true }, submissionId: 'o', now: NOW, messageId: 'owed-1' });
    expect(owed).toMatchObject({ round: r, read: false, held: [{ userId: 'pl-1', messageId: 'owed-1' }] });
    const offered = R.offerForcedMove(r, { userId: 'pl-1', text: 'I dive.', forced: { moveId: 'face_danger' }, submissionId: 'f', now: NOW, messageId: 'card-1' }).round;
    expect(offered.entries['pl-1']).toMatchObject({ reading: { kind: 'sheet-roll' }, offer: { messageId: 'card-1' } });
    const view = buildRoundView(offered, { userId: 'pl-1', isGM: false }, { enabled: true, sessionActive: true, gmConnected: true, keyedGm: true, connectedUserIds: ['pl-1', 'pl-2'] });
    expect(view.own.offer).toMatchObject({ canUse: false, canKeep: true });
    const kept = R.confirmEntry(offered, { userId: 'pl-1', submissionId: offered.entries['pl-1'].submissionId, choices: {}, now: NOW });
    expect(kept.entries['pl-1']).toMatchObject({ status: 'ready', reading: { kind: 'sheet-roll' }, offer: null });
  });

  it('a round closed unresolved hands the sheet roll back for the next round; one that resolves acts on it', () => {
    const r = R.submitEntry(sheetRoll(freshRound()).round, { userId: 'pl-2', text: 'I cover.', submissionId: 'r', now: NOW });
    expect(R.takeCardMoves(r).held).toEqual([{ userId: 'pl-1', messageId: 'sheet-1' }]);
    const acting = R.fixActing(R.beginResolution(r, { resolverId: 'gm-1', now: NOW }));
    expect(acting.acting).toEqual(['pl-1']);
    expect(R.takeCardMoves(acting, { acting: acting.acting }).held).toEqual([]);
  });

  it('control: a read move entry is not a sheet roll', () => {
    let r = R.submitEntry(freshRound(), { userId: 'pl-1', text: 'I act.', submissionId: 'a', now: NOW });
    r = R.recordReading(r, { userId: 'pl-1', submissionId: 'a', reading: READING });
    expect(R.isSheetRollEntry(r.entries['pl-1'])).toBe(false);
  });
});

describe('issue #345 D1 — the Round window shows a sheet roll as rolled', () => {
  const ctx = { enabled: true, sessionActive: true, gmConnected: true, keyedGm: true, connectedUserIds: ['gm-1', 'pl-1', 'pl-2'] };
  it('to its player: the move and outcome, no Edit, Withdraw, Pass or Submit', () => {
    const r = sheetRoll(R.submitEntry(freshRound(), { userId: 'pl-1', text: 'I check the seals.', submissionId: 'a', now: NOW })).round;
    const own = buildRoundView(r, { userId: 'pl-1', isGM: false }, ctx).own;
    expect(own).toMatchObject({
      sheetRoll: true, status: 'ready', statusLabel: 'Ready', setAside: 'I check the seals.',
      reading: { kind: 'sheet-roll', moveName: 'Fulfill Your Vow', outcome: 'Strong Hit' },
      canEdit: false, canSubmit: false, canPass: false, canWithdraw: false, canConfirm: false, canReread: false,
    });
  });

  it('to the others: Ready, with the move; to a GM: the reading', () => {
    const r = sheetRoll(freshRound()).round;
    expect(buildRoundView(r, { userId: 'pl-2', isGM: false }, ctx).table).toEqual([
      { userId: 'pl-1', actorName: 'Kira', text: 'Resolving: Find Chen', moveName: 'Fulfill Your Vow' },
    ]);
    const gm = buildRoundView(r, { userId: 'gm-1', isGM: true }, ctx).gm;
    expect(gm.entries).toEqual([expect.objectContaining({ userId: 'pl-1', status: 'ready',
      reading: { kind: 'sheet-roll', moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', outcome: 'Strong Hit' } })]);
  });
});

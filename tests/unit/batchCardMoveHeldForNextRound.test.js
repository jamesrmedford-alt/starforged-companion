/**
 * STARFORGED COMPANION
 * tests/unit/batchCardMoveHeldForNextRound.test.js
 *
 * Batch Mode (issue #340): a card button's move pressed for a player who has
 * already written their action is offered beside it — "the window asks which
 * to keep". The round used to resolve (or close) past an offer its player had
 * not answered: round 1's entry took the offer with it, the next round's was
 * created fresh, and the card — claimed by the press, its button reading
 * taken — lost its move (issue #342 Z05, BATCH-CARD-MOVE-OFFER-DROPPED; the
 * rules and cards auditors' probes). A card's forced move is held, not
 * dropped (issue #337 Y08): an offer not chosen, and a card move that was an
 * entry the round does not roll, join the next round; only Keep mine drops an
 * offer, and on a Ready entry it does so.
 *
 * Harness: batchModeTable.test.js's (a GM and three players on the simulated
 * table, the real driver, relays and resolveMove; the pacing / interpreter /
 * ability-scan leaves mocked, the dice scripted).
 */

/* global silenceConsoleErrors */
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
  silenceConsoleErrors();
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
async function confirm(userId, choices = {}) {
  const r = round();
  return relay(userId, 'batch.confirm', { roundId: r.id, submissionId: r.entries[userId].submissionId, choices });
}
const pass = (userId) => relay(userId, 'batch.pass', { roundId: round().id });

/** A card button's move for Kira, as a paced card's Roll posts it on the canonical GM. */
async function cardMoveForKira(content = 'I dive for the console.') {
  const msg = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content,
    speaker: { actor: 'pc-kira', alias: 'Kira' },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'face_danger', deferWhileBusy: true } },
  }));
  await table.settle();
  return msg;
}

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

const kiraRolls = () => table.cards(f => f.moveResolution && f.roundUserId === 'pl-1').map(c => c.content ?? '');
const heldNotices = (userId) => table.cards(f => f.batchHeldMoveNotice).filter(c => c.whisper?.includes(userId));

describe('a card move offered beside a confirmed action (the cards auditor\'s probe)', () => {
  it('control: pressed before Kira acts, the card\'s move becomes her entry', async () => {
    await batchModeOn();
    const card = await kiraStrikeCard();
    await pressFinishTheFight(card);
    await table.drain();
    expect(claimed(card)).toBe(true);
    expect(round().entries['pl-1'].text).toMatch(/decisive action/i);
  }, 30_000);

  it('the round resolves before Kira chooses: her own action rolls, and the card\'s move is her round-2 entry', async () => {
    await batchModeOn();
    const card = await kiraStrikeCard();
    control.dice = [STRONG];
    await submit('pl-1', 'I slip through the vent.');
    await confirm('pl-1');
    await table.drain();
    expect(round().entries['pl-1'].status).toBe('ready');

    await pressFinishTheFight(card);
    await table.drain();
    expect(claimed(card)).toBe(true);                                     // the press claimed the card
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
    expect(round().entries['pl-1'].offer?.text).toMatch(/decisive action/i);

    await pass('pl-2');
    await pass('pl-3');
    await table.drain();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(kiraRolls()).toHaveLength(1);
    expect(kiraRolls()[0]).toMatch(/Face Danger/);

    const next = round().entries['pl-1'];
    expect(next).toMatchObject({ readAs: { forced: { moveId: 'take_decisive_action' } } });
    expect(next.text).toMatch(/decisive action/i);
    expect(heldNotices('pl-1').map(c => c.content).join()).toMatch(/Kira's move from the card joins the next round/);
  }, 30_000);
});

describe('a card move offered beside a confirmed action (the rules auditor\'s probe)', () => {
  it('control: pressed before Kira writes her own action, the card\'s move is her entry and is rolled', async () => {
    await batchModeOn();
    await cardMoveForKira();
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', text: 'I dive for the console.', reading: { moveId: 'face_danger' } });
    control.dice = [STRONG];
    await confirm('pl-1');
    await pass('pl-2');
    await pass('pl-3');
    await table.drain();
    expect(round()).toMatchObject({ number: 2 });
    expect(kiraRolls()).toHaveLength(1);
  }, 30_000);

  it('pressed after Kira confirmed, then the others pass: the offer is not lost — it is her next round\'s entry', async () => {
    await batchModeOn();
    await submit('pl-1', 'I crawl toward the airlock.');
    await confirm('pl-1');
    await cardMoveForKira();
    expect(round().entries['pl-1']).toMatchObject({ status: 'ready', offer: { text: 'I dive for the console.', forced: { moveId: 'face_danger' } } });

    control.dice = [STRONG];
    await pass('pl-2');
    await pass('pl-3');
    await table.drain();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(kiraRolls()).toHaveLength(1);                                  // round 1: her own action only

    const e2 = round().entries['pl-1'];
    expect(e2).toMatchObject({ status: 'read', text: 'I dive for the console.', reading: { moveId: 'face_danger' } });
    expect(e2.offer).toBeNull();
  }, 30_000);
});

describe('the other ways a round outruns an offer', () => {
  it('Send now: Kira\'s reading not yet confirmed is used as read, and the offer beside it joins the next round', async () => {
    await batchModeOn();
    await submit('pl-1', 'I crawl toward the airlock.');
    await cardMoveForKira();
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', offer: { text: 'I dive for the console.' } });
    control.dice = [STRONG];
    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.drain();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(kiraRolls()).toHaveLength(1);
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', text: 'I dive for the console.' });
  }, 30_000);

  it('a card move that is the entry, left out of the round (its player gone before confirming), is not dropped', async () => {
    await batchModeOn();
    await cardMoveForKira();
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', text: 'I dive for the console.' });
    control.dice = [STRONG, STRONG];
    await table.leave('pl-1');
    await submit('pl-2', 'I cover the hatch.');
    await confirm('pl-2');
    await pass('pl-3');
    await table.drain();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(kiraRolls()).toEqual([]);                                     // not in round 1
    // Held for the next round, which Kira (gone) is not in: it runs as a
    // forced move whose roller is no participant does — free-flow, as Kira's.
    const freeFlow = table.cards(f => f.moveResolution && !f.roundId);
    expect(freeFlow.map(c => c.flags[MODULE_ID].actorId)).toEqual(['pc-kira']);
  }, 30_000);

  it('Discard: the offer and a card move that was an entry join the round that opens next; only a written action is a draft', async () => {
    await batchModeOn();
    await submit('pl-1', 'I crawl toward the airlock.');
    await cardMoveForKira();
    await table.client('gm-1').run(() => globalThis.ChatMessage.create({
      content: 'Ren ducks behind the crates.', speaker: { actor: 'pc-ren', alias: 'Ren' },
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'face_danger', deferWhileBusy: true } },
    }));
    await table.settle();
    await table.drain();
    expect(round().entries['pl-2']).toMatchObject({ status: 'read', text: 'Ren ducks behind the crates.' });

    await relay('gm-1', 'batch.discard', { roundId: round().id });
    await table.drain();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', text: 'I dive for the console.' });
    expect(round().entries['pl-2']).toMatchObject({ status: 'read', text: 'Ren ducks behind the crates.' });
    // Kira's written action is her draft; Ren's card move is not told "keeps it as a draft".
    const told = table.cards(f => f.batchRoundClosedNotice);
    expect(told.map(c => c.whisper)).toEqual([['pl-1']]);
  }, 30_000);

  it('Withdraw (and Edit) leave the offer standing; Keep mine on a Ready entry drops it', async () => {
    await batchModeOn();
    await submit('pl-1', 'I crawl toward the airlock.');
    await cardMoveForKira();
    await relay('pl-1', 'batch.withdraw', { roundId: round().id });
    expect(round().entries['pl-1']).toMatchObject({ status: 'waiting', offer: { text: 'I dive for the console.' } });

    await submit('pl-1', 'I crawl toward the airlock, slower.');
    await table.drain();
    await confirm('pl-1');
    expect(round().entries['pl-1']).toMatchObject({ status: 'ready', offer: null });   // Keep mine = the confirm, on a reading

    await cardMoveForKira('I lunge for the hatch.');
    expect(round().entries['pl-1']).toMatchObject({ status: 'ready', offer: { text: 'I lunge for the hatch.' } });
    // Keep mine on the Ready entry: the window relays the confirm with the choices it was confirmed with.
    const r = round();
    await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: r.entries['pl-1'].choices });
    expect(round().entries['pl-1']).toMatchObject({ status: 'ready', offer: null });
    control.dice = [STRONG];
    await pass('pl-2');
    await pass('pl-3');
    await table.drain();
    expect(round()).toMatchObject({ number: 2 });
    expect(round().entries['pl-1']).toMatchObject({ status: 'waiting', text: null });   // dropped by her choice
  }, 30_000);
});

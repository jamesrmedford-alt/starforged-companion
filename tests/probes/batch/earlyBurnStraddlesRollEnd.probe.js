/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION — bug-audit probe (thirteenth audit, 2026-11-11)
 * tests/probes/batch/earlyBurnStraddlesRollEnd.probe.js
 *
 * BATCH: a Burn Momentum pressed while the round still rolls (round.js
 * decideUpgrade's "early" case — a recorded entry's card is live while later
 * entries roll) is taken by the round only if its GM handler reaches
 * acceptRoundUpgrade before the rolls end. The handler claims the card first
 * (`burn.consumed`), then makes several writes, and only then hands the
 * upgraded outcome to the round. When the last entry's record lands in
 * between:
 *   - upgradeOffers (driver.js) skips the consumed card, so beginUpgrades
 *     makes no offer for it (and, with no other offer, goes to "narrating");
 *   - acceptRoundUpgrade then finds the round narrating ("too late", returns
 *     true: the upgrade gets no narration of its own) — or, with another
 *     entry's offer open (phase "upgrading"), decideUpgrade refuses
 *     "no-upgrade" and the catch logs it.
 * Either way the burn is applied (momentum reset, the card says strong hit)
 * and the round's one narration tells the result as rolled.
 *
 * The probe asserts the correct behaviour (the round narrates the burned
 * outcome), so it fails until the finding is fixed.
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
    // every roll a weak hit; Kira's momentum of 9 burns it to a strong hit
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.35).mockReturnValueOnce(0.75).mockReturnValueOnce(0.4);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { holdWrites, scriptClaude, traceTable } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'Kira slips through.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';

let table;
const round = () => table.world.getSetting('batchMode.round');
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /THIS ROUND/.test(c.userText ?? ''));

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

/** Kira confirms first, then Ren; Ren's result card is held so the round is still rolling. */
async function kiraRecordedRenRolling() {
  const held = holdWrites(table, (w) => w.kind === 'message.create'
    && w.data?.flags?.[MODULE_ID]?.moveResolution === true && w.data?.flags?.[MODULE_ID]?.roundUserId === 'pl-2');
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I vault the barricade.', submissionId: 'r1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
  await held.arrived;
  expect(round()).toMatchObject({ phase: 'rolling' });
  expect(round().entries['pl-1'].status).toBe('recorded');
  return held;
}

describe('BATCH — Kira burns momentum on her card while Ren\'s move is still being rolled', () => {
  it('control: the burn\'s handler finishes before the rolls end — the round narrates the strong hit', async () => {
    const renCard = await kiraRecordedRenRolling();
    const cardId = round().entries['pl-1'].rolled.cardId;
    await relay('pl-1', 'move.burnMomentum', { messageId: cardId });
    await table.settle();
    expect(table.world.message(cardId).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(round().entries['pl-1'].upgrade).toMatchObject({ decided: 'burn' });
    renCard.release();
    await table.drain();
    expect(roundCards()).toHaveLength(1);
    expect(narrations().at(-1).userText).toMatch(/Face Danger[^\n]*: strong hit/);
    expect(roundCards()[0].flags[MODULE_ID].roundEntries.find(e => e.userId === 'pl-1').outcome).toBe('strong_hit');
  }, 30_000);

  it('the burn\'s handler is still running when the rolls end — the round must still narrate the strong hit', async () => {
    traceTable(table);
    const renCard = await kiraRecordedRenRolling();
    const cardId = round().entries['pl-1'].rolled.cardId;
    // The burn claims its card (burn.consumed), then pays: its meter write is
    // held here — a write on its way while Ren's roll finishes.
    const burnPay = holdWrites(table, (w) => w.kind === 'actor.update' && w.id === 'pc-kira' && w.client === 'gm-1');
    await relay('pl-1', 'move.burnMomentum', { messageId: cardId });
    await burnPay.arrived;
    expect(table.world.message(cardId).flags[MODULE_ID].burn.consumed).toBe(true);   // claimed: no second press possible
    expect(round()).toMatchObject({ phase: 'rolling' });

    // Ren's roll finishes: the rolls end while the burn is still being applied.
    renCard.release();
    await table.settle();
    // The burn's write lands and its handler runs to its end.
    burnPay.release();
    await table.drain();

    const told = narrations().at(-1)?.userText ?? '';
    const cardOutcome = roundCards()[0]?.flags?.[MODULE_ID]?.roundEntries?.find(e => e.userId === 'pl-1')?.outcome ?? null;
    // The burn stands on the card and the sheet…
    expect(table.world.message(cardId).flags[MODULE_ID].burn.consumed).toBe(true);
    // …so the round's one narration tells the burned outcome.
    expect({ roundPhase: round()?.phase, roundCards: roundCards().length, cardOutcome, toldStrongHit: /Face Danger[^\n]*: strong hit/.test(told) })
      .toMatchObject({ roundCards: 1, cardOutcome: 'strong_hit', toldStrongHit: true });
  }, 30_000);

  it('the burn lands while another roller still decides (phase "upgrading") — the round must take it, not refuse it', async () => {
    // Ren can burn too, so the round waits on Ren's offer after the rolls.
    table.actors.get('pc-ren').system.momentum.value = 9;
    const renCard = await kiraRecordedRenRolling();
    const cardId = round().entries['pl-1'].rolled.cardId;
    const burnPay = holdWrites(table, (w) => w.kind === 'actor.update' && w.id === 'pc-kira' && w.client === 'gm-1');
    await relay('pl-1', 'move.burnMomentum', { messageId: cardId });
    await burnPay.arrived;
    renCard.release();
    await table.settle();
    expect(round()).toMatchObject({ phase: 'upgrading' });          // waiting on Ren
    burnPay.release();                                               // Kira's burn finishes during the upgrade step
    await table.settle();
    await table.drain();
    expect(table.world.message(cardId).flags[MODULE_ID].burn.consumed).toBe(true);
    // The round knows Kira burned: her entry is decided "burn", with the strong hit to narrate.
    expect({
      decided: round().entries['pl-1']?.upgrade?.decided ?? null,
      outcomeToNarrate: round().entries['pl-1']?.rolled?.narrationInput?.outcome ?? null,
    }).toEqual({ decided: 'burn', outcomeToNarrate: 'strong_hit' });
  }, 30_000);
});

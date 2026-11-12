/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/roundWaitsForUpgradeInFlight.test.js
 *
 * Issue #347 AB13 (ROUND-EARLY-BURN-DROPPED) — a Burn Momentum pressed while
 * the round still rolls (round.js decideUpgrade's "early" case — a recorded
 * entry's card is live while later entries roll) was taken by the round only
 * if its GM handler reached acceptRoundUpgrade before the rolls ended. The
 * handler claims the card first (`burn.consumed`), then makes several writes,
 * and only then hands the upgraded outcome to the round. When the last
 * entry's record landed in between, upgradeOffers skipped the consumed card:
 * the round went on to its narration ("too late") — or, with another roller
 * deciding, refused the late upgrade "no-upgrade" — and told the result as
 * rolled while the card and the sheet said burned. Now a consumed card whose
 * entry is undecided is an upgrade in flight: offered as such (no buttons —
 * "Burning momentum…"), the upgrade step waits for it, its roller's Keep is
 * refused, and a GM's Send now keeps it only after UPGRADE_IN_FLIGHT_GRACE_MS
 * (a handler that died with its page).
 *
 * (The multi-client tests are converted from the thirteenth audit's probe
 * tests/probes/batch/earlyBurnStraddlesRollEnd.probe.js.)
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
    // every roll a weak hit; Kira's momentum of 9 burns it to a strong hit
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.35).mockReturnValueOnce(0.75).mockReturnValueOnce(0.4);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import {
  ROUND_PHASE, UPGRADE_IN_FLIGHT_GRACE_MS, decideUpgrade, keepUndecidedUpgrades, upgradesSettled,
} from '../../src/batch/round.js';
import { buildRoundView } from '../../src/batch/roundView.js';
import { holdWrites, scriptClaude, traceTable } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'Kira slips through.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const NARRATION_MODEL = 'claude-sonnet-5-5';

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

describe('issue #347 AB13 — Kira burns momentum on her card while Ren\'s move is still being rolled', () => {
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
    // The round waits at its upgrade step for Kira's burn, offered as on its way.
    expect(round()).toMatchObject({ phase: 'upgrading' });
    expect(round().entries['pl-1'].upgrade).toMatchObject({ inFlight: 'burn', decided: null, cardId });
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

describe('issue #347 AB13 — an upgrade in flight, as round data', () => {
  const T0 = '2026-11-11T12:00:00.000Z';
  const later = (ms) => new Date(Date.parse(T0) + ms).toISOString();
  const upgrading = () => ({
    id: 'r-1', number: 1, phase: ROUND_PHASE.UPGRADING, acting: ['pl-1', 'pl-2'],
    entries: {
      'pl-1': { userId: 'pl-1', actorName: 'Kira', status: 'recorded',
        rolled: { cardId: 'card-k', moveId: 'face_danger', outcome: 'weak_hit' },
        upgrade: { burn: null, improve: null, cardId: 'card-k', inFlight: 'burn', inFlightSince: T0, decided: null } },
      'pl-2': { userId: 'pl-2', actorName: 'Ren', status: 'recorded',
        rolled: { cardId: 'card-r', moveId: 'face_danger', outcome: 'weak_hit' },
        upgrade: { burn: { momentum: 9, previewOutcome: 'strong_hit' }, improve: null, cardId: 'card-r', decided: null } },
    },
  });

  it('the roller\'s own Keep is refused for an upgrade on its way; the upgrade itself decides the entry', () => {
    expect(() => decideUpgrade(upgrading(), { userId: 'pl-1', decision: 'keep', now: later(1_000) }))
      .toThrow(/being applied/);
    const burned = decideUpgrade(upgrading(), { userId: 'pl-1', decision: 'burn', now: later(1_000),
      narrationInput: { kind: 'move', outcome: 'strong_hit' } });
    expect(burned.entries['pl-1']).toMatchObject({ upgrade: { decided: 'burn' }, rolled: { narrationInput: { outcome: 'strong_hit' } } });
  });

  it('Send now keeps the others and waits for the upgrade on its way — until its grace has passed', () => {
    const soon = keepUndecidedUpgrades(upgrading(), { now: later(5_000) });
    expect(soon.entries['pl-2'].upgrade.decided).toBe('keep');
    expect(soon.entries['pl-1'].upgrade.decided).toBe(null);
    expect(upgradesSettled(soon)).toBe(false);
    const lapsed = keepUndecidedUpgrades(upgrading(), { now: later(UPGRADE_IN_FLIGHT_GRACE_MS + 1) });
    expect(lapsed.entries['pl-1'].upgrade.decided).toBe('keep');
    expect(upgradesSettled(lapsed)).toBe(true);
  });

  it('control: an ordinary undecided offer is kept by Send now at once', () => {
    const r = keepUndecidedUpgrades(upgrading(), { now: later(1) });
    expect(r.entries['pl-2'].upgrade.decided).toBe('keep');
  });

  it('the roller\'s window shows the upgrade on its way, with nothing to choose', () => {
    const view = buildRoundView(upgrading(), { userId: 'pl-1', isGM: false }, { enabled: true, sessionActive: true, gmConnected: true, keyedGm: true });
    expect(view.own.statusLabel).toBe('Burning momentum…');
    expect(view.own.upgrade).toMatchObject({ inFlight: 'Burning momentum…', burn: null, improve: null });
    expect(view.progress.find(p => p.userId === 'pl-1').label).toBe('Burning momentum…');
  });
});

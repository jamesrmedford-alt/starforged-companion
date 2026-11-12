/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/roundUpgradeInFlightWaitedWhileRunning.test.js
 *
 * A Batch Mode upgrade whose handler is still running on the resolving GM's
 * page is waited for past the 60 s grace (issue #347 residual
 * UPGRADE-IN-FLIGHT-GRACE).
 *
 * AB13 made the round wait at its upgrade step for a Burn or Improve whose
 * handler had claimed the card but not reached the round, and let a GM's Send
 * now keep the result once 60 s had passed — the escape for a handler that
 * died with its page. A handler still alive but slower than that (writes
 * each bounded, but several of them) lost its upgrade from the narration:
 * the card said strong hit, the round told the weak hit. Send now now waits
 * for one whose handler is still running here up to five minutes; the 60 s
 * grace is for one running nowhere this page knows of.
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
  ROUND_PHASE, UPGRADE_IN_FLIGHT_GRACE_MS, UPGRADE_IN_FLIGHT_MAX_MS, keepUndecidedUpgrades,
} from '../../src/batch/round.js';
import { holdWrites, scriptClaude } from '../helpers/faults.js';
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

/**
 * A GM's Send now, run as the relay queue runs it once the burn's own relay
 * action — still applying — has had its budget: the queue serialises them,
 * so the press reaches the driver only then.
 */
async function sendNowPastTheQueue() {
  const gm = table.client('gm-1');
  const driver = await gm.import('../../src/batch/driver.js');
  await gm.run(() => driver.requestSendNow());
  await table.settle();
}

/** The in-flight upgrade's wait put `ms` in the past, as if that long had passed. */
async function inFlightFor(ms) {
  const r = round();
  const since = new Date(Date.now() - ms).toISOString();
  await table.client('gm-1').setSetting('batchMode.round', {
    ...r, entries: { ...r.entries, 'pl-1': { ...r.entries['pl-1'], upgrade: { ...r.entries['pl-1'].upgrade, inFlightSince: since } } },
  });
  await table.settle();
}

/** Kira's burn claimed and still applying (its meter write held); Ren's roll done: the round waits at its upgrade step. */
async function burnStillApplyingAtUpgradeStep() {
  const renCard = await kiraRecordedRenRolling();
  const cardId = round().entries['pl-1'].rolled.cardId;
  const burnPay = holdWrites(table, (w) => w.kind === 'actor.update' && w.id === 'pc-kira' && w.client === 'gm-1');
  await relay('pl-1', 'move.burnMomentum', { messageId: cardId });
  await burnPay.arrived;
  renCard.release();
  await table.settle();
  expect(round()).toMatchObject({ phase: 'upgrading' });
  expect(round().entries['pl-1'].upgrade).toMatchObject({ inFlight: 'burn', decided: null, cardId });
  return { burnPay, cardId };
}

describe('issue #347 residual UPGRADE-IN-FLIGHT-GRACE — Send now and an upgrade whose handler still runs', () => {
  it('two minutes on, Send now still waits for the burn still being applied here — the round narrates the strong hit', async () => {
    const { burnPay } = await burnStillApplyingAtUpgradeStep();
    await inFlightFor(2 * 60_000);                          // past the 60 s grace
    await sendNowPastTheQueue();
    expect(round().entries['pl-1'].upgrade.decided, 'not kept while its handler runs here').toBe(null);
    expect(roundCards()).toHaveLength(0);

    burnPay.release();
    await table.drain();
    const entry = roundCards()[0]?.flags?.[MODULE_ID]?.roundEntries?.find(e => e.userId === 'pl-1');
    expect(entry?.outcome).toBe('strong_hit');
    expect(narrations().at(-1).userText).toMatch(/Face Danger[^\n]*: strong hit/);
  }, 30_000);

  it('past five minutes, Send now keeps the result even while the handler still runs', async () => {
    const { burnPay } = await burnStillApplyingAtUpgradeStep();
    await inFlightFor(UPGRADE_IN_FLIGHT_MAX_MS + 1_000);
    await sendNowPastTheQueue();
    await table.settle(); await table.settle();
    // Kept: the round went on and told the result as rolled.
    const entry = roundCards()[0]?.flags?.[MODULE_ID]?.roundEntries?.find(e => e.userId === 'pl-1');
    expect(entry?.outcome).toBe('weak_hit');
    burnPay.release();
    await table.drain();
  }, 30_000);
});

describe('issue #347 residual UPGRADE-IN-FLIGHT-GRACE — as round data', () => {
  const T0 = '2026-11-11T12:00:00.000Z';
  const later = (ms) => new Date(Date.parse(T0) + ms).toISOString();
  const upgrading = () => ({
    id: 'r-1', number: 1, phase: ROUND_PHASE.UPGRADING, acting: ['pl-1'],
    entries: {
      'pl-1': { userId: 'pl-1', actorName: 'Kira', status: 'recorded',
        rolled: { cardId: 'card-k', moveId: 'face_danger', outcome: 'weak_hit' },
        upgrade: { burn: null, improve: null, cardId: 'card-k', inFlight: 'burn', inFlightSince: T0, decided: null } },
    },
  });

  it('a handler running here holds the upgrade past the grace, up to the five-minute cap', () => {
    const past = keepUndecidedUpgrades(upgrading(), { now: later(UPGRADE_IN_FLIGHT_GRACE_MS + 1), runningHere: ['card-k'] });
    expect(past.entries['pl-1'].upgrade.decided).toBe(null);
    const capped = keepUndecidedUpgrades(upgrading(), { now: later(UPGRADE_IN_FLIGHT_MAX_MS + 1), runningHere: ['card-k'] });
    expect(capped.entries['pl-1'].upgrade.decided).toBe('keep');
  });

  it('control: with no handler running here, the 60 s grace keeps it', () => {
    const r = keepUndecidedUpgrades(upgrading(), { now: later(UPGRADE_IN_FLIGHT_GRACE_MS + 1) });
    expect(r.entries['pl-1'].upgrade.decided).toBe('keep');
  });
});

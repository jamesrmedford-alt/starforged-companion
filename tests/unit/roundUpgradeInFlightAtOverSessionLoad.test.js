/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/roundUpgradeInFlightAtOverSessionLoad.test.js
 *
 * Issue #364 ROUND-UPGRADE-STEP-IDLE-NO-TRIGGER — its second half, "read from
 * the code": a Batch Mode round at its upgrade step with an upgrade in flight
 * (a Burn pressed while the round still rolled, its GM handler applying it
 * when the GM's page died) is not kept by a load into an over session that
 * comes less than a minute after the step began
 * (round.js UPGRADE_IN_FLIGHT_GRACE_MS): "the round waits for the next" pass.
 *
 * Reproduced. The wait itself is the design — an upgrade in flight decides
 * its own entry, and a pass keeps one only once its grace has passed (issue
 * #347 AB13) — and the next pass after the grace does keep the rolled result
 * and narrate the round, nothing lost. But no pass was due: the handler died
 * with its page, so it will never decide the entry or run one, and once the
 * session is over nothing else does — the round stayed "being resolved"
 * until something unrelated ran a pass (a GM's Send now, a user joining).
 *
 * Now an over session's round left waiting on an upgrade in flight runs the
 * pass once more when that upgrade's wait lapses (driver.js
 * recheckWhenInFlightLapses). Only that: a round in a session still in play
 * waits for its GM's Send now, as before, and the four idle hours themselves
 * get no timer (the maintainer's decision).
 *
 * On a booted table (tests/helpers/multiClient.js), as
 * tests/unit/roundUpgradeInFlightWaitedWhileRunning.test.js: the burn's meter
 * write is held, so its handler is still applying it when the page goes. The
 * minute is the store's stamp aged and the module's own timer advanced
 * (setTimeout faked; nothing waits on the real clock).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

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
import { UPGRADE_IN_FLIGHT_GRACE_MS } from '../../src/batch/round.js';
import { holdWrites, scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'Kira slips through.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const NARRATION_MODEL = 'claude-sonnet-5-5';
const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /THIS ROUND/.test(c.userText ?? ''));
const kirasTold = () => roundCards()[0]?.flags?.[MODULE_ID]?.roundEntries?.find(e => e.userId === 'pl-1') ?? null;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());
afterEach(() => { vi.useRealTimers(); });

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
    combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: 'sess-1', currentSessionId: 'sess-1', sessionNumber: 1,
      lastSessionTimestamp: ago(HOUR), currentSceneId: 'sc-1', sceneTruths: [] },
    sessionActivity: { sessionId: 'sess-1', at: ago(1000) },
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

/**
 * Kira burns momentum on her card while Ren's move is still being rolled; the
 * burn has claimed its card and is still applying (its meter write held) when
 * Ren's roll ends: the round waits at its upgrade step for the burn in flight.
 */
async function burnStillApplyingAtUpgradeStep() {
  const renCard = holdWrites(table, (w) => w.kind === 'message.create'
    && w.data?.flags?.[MODULE_ID]?.moveResolution === true && w.data?.flags?.[MODULE_ID]?.roundUserId === 'pl-2');
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I vault the barricade.', submissionId: 'r1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
  await renCard.arrived;
  const cardId = round().entries['pl-1'].rolled.cardId;
  const burnPay = holdWrites(table, (w) => w.kind === 'actor.update' && w.id === 'pc-kira' && w.client === 'gm-1');
  await relay('pl-1', 'move.burnMomentum', { messageId: cardId });
  await burnPay.arrived;
  renCard.release();
  await table.settle();
  expect(round(), 'setup: at the upgrade step').toMatchObject({ phase: 'upgrading' });
  expect(round().entries['pl-1'].upgrade, 'setup: Kira\'s burn is in flight').toMatchObject({ inFlight: 'burn', decided: null, cardId });
  return { cardId, roundId: round().id };
}

/** End a Session's own first write: the gate shut, the session marked ended. */
async function endTheSession() {
  await table.client('gm-1').setSetting('campaignState', { ...world(), sessionActive: false, sessionEndedId: 'sess-1' });
  await table.settle();
}

/** The GM's page goes with the burn still applying on it, and loads again: a fresh page, its `ready`. */
async function gmPageDiesAndLoadsAgain() {
  await table.reload('gm-1');
  await table.settle();
}

/** A minute passes on the in-flight wait: its stamp aged in the store — nothing written through a client, no pass run. */
function theGraceHasPassed() {
  const r = round();
  const since = ago(UPGRADE_IN_FLIGHT_GRACE_MS + 1000);
  table.world.setSetting('batchMode.round', {
    ...r, entries: { ...r.entries, 'pl-1': { ...r.entries['pl-1'], upgrade: { ...r.entries['pl-1'].upgrade, inFlightSince: since } } },
  });
}

/** A GM's Send now, on the page that is there now. */
async function sendNow() {
  const gm = table.client('gm-1');
  const driver = await gm.import('../../src/batch/driver.js');
  await gm.run(() => driver.requestSendNow());
  await table.settle();
}

function expectStillWaiting(roundId) {
  expect(round(), 'the round still waits at its upgrade step').toMatchObject({ id: roundId, phase: 'upgrading' });
  expect(round().entries['pl-1'].upgrade).toMatchObject({ inFlight: 'burn', decided: null });
  expect(narrations(), 'nothing narrated').toHaveLength(0);
}

function expectKeptAndNarrated(roundId) {
  expect(round()).toMatchObject({ id: roundId, phase: 'closed', closeReason: 'resolved' });
  expect(round().entries['pl-1'].upgrade).toMatchObject({ decided: 'keep' });
  expect(narrations(), 'narrated once').toHaveLength(1);
  expect(roundCards()).toHaveLength(1);
  expect(kirasTold()?.outcome, 'the result as rolled — the burn never reached the round').toBe('weak_hit');
}

describe('issue #364 ROUND-UPGRADE-STEP-IDLE-NO-TRIGGER — a load into an over session, an upgrade in flight less than a minute old', () => {
  it('the load\'s own pass waits for it: an upgrade in flight is kept only once its grace has passed (the design)', async () => {
    const { roundId } = await burnStillApplyingAtUpgradeStep();
    await endTheSession();
    expectStillWaiting(roundId);                    // its handler still runs on this page

    await gmPageDiesAndLoadsAgain();
    expect(world().currentSessionId, 'the load minted the next session').not.toBe('sess-1');
    expectStillWaiting(roundId);
  }, 60_000);

  it('the next pass after the grace keeps the rolled result and narrates the round — nothing lost', async () => {
    const { roundId } = await burnStillApplyingAtUpgradeStep();
    await endTheSession();
    await gmPageDiesAndLoadsAgain();

    theGraceHasPassed();
    await sendNow();
    await table.settle();
    expectKeptAndNarrated(roundId);
  }, 60_000);

  it('and that pass comes by itself once the grace has passed — the round is not left waiting for an unrelated one', async () => {
    const { roundId } = await burnStillApplyingAtUpgradeStep();
    await endTheSession();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await gmPageDiesAndLoadsAgain();
    expectStillWaiting(roundId);

    theGraceHasPassed();
    await vi.advanceTimersByTimeAsync(UPGRADE_IN_FLIGHT_GRACE_MS + 1000);
    await table.settle();
    expectKeptAndNarrated(roundId);

    // Once: nothing is left scheduled that narrates or writes again.
    await vi.advanceTimersByTimeAsync(10 * UPGRADE_IN_FLIGHT_GRACE_MS);
    await table.settle();
    expect(narrations()).toHaveLength(1);
    expect(roundCards()).toHaveLength(1);
  }, 60_000);

  it('a timer that fires early changes nothing: the pass still keeps only an upgrade past its grace', async () => {
    const { roundId } = await burnStillApplyingAtUpgradeStep();
    await endTheSession();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await gmPageDiesAndLoadsAgain();

    // The clock the timer runs on is past the minute; the stamp is not.
    await vi.advanceTimersByTimeAsync(UPGRADE_IN_FLIGHT_GRACE_MS + 1000);
    await table.settle();
    expectStillWaiting(roundId);
  }, 60_000);
});

describe('issue #364 ROUND-UPGRADE-STEP-IDLE-NO-TRIGGER — control: a session still in play gets no pass of its own', () => {
  it('the round waits for its GM\'s Send now, as before', async () => {
    const { roundId } = await burnStillApplyingAtUpgradeStep();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await gmPageDiesAndLoadsAgain();
    expect(world().currentSessionId, 'the session goes on').toBe('sess-1');
    expectStillWaiting(roundId);

    theGraceHasPassed();
    await vi.advanceTimersByTimeAsync(UPGRADE_IN_FLIGHT_GRACE_MS + 1000);
    await table.settle();
    expectStillWaiting(roundId);

    vi.useRealTimers();
    await sendNow();
    await table.settle();
    expect(narrations(), 'kept and narrated by the GM\'s Send now').toHaveLength(1);
    expect(kirasTold()?.outcome).toBe('weak_hit');
    expect(round(), 'and the session\'s next round is open').toMatchObject({ phase: 'collecting', sessionId: 'sess-1' });
    expect(round().id).not.toBe(roundId);
  }, 60_000);
});

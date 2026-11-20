/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/roundNarratedAfterMintKeepsItsSession.test.js
 *
 * Issue #364 ROUND-CARD-SESSION-ID-AFTER-MINT.
 *
 * A Batch Mode round belongs to the session it opened in (`round.sessionId`).
 * One whose session is over can be narrated on a pass that runs after the
 * world load has minted the next session: the one-shot re-check of an upgrade
 * in flight (driver.js recheckWhenInFlightLapses), or a GM's Send now. That
 * pass narrated it from a working copy of campaignState as stored then — the
 * minted session's — so the round's card, the facts its narration recorded
 * and the story it was told from were the next session's: the card counted
 * as that session's first narration, was told with none of its own session's
 * story, and its facts were dated to a session nobody had begun. The pass
 * that runs during the load itself narrates before the mint is stored and
 * keeps the round's own session (batchRoundUpgradeStepKeptAtLoad.test.js), so
 * the same round was filed under either session by which pass reached it.
 *
 * Now the round is narrated as its own session's whichever pass narrates it
 * (driver.js roundNarrationState): the card's `sessionId` / `sessionNumber`,
 * the truths its narration records, and the recent narration it is told with.
 *
 * On a booted table (tests/helpers/multiClient.js), as
 * tests/unit/roundUpgradeInFlightAtOverSessionLoad.test.js: a Burn still
 * applying when the GM's page goes leaves the round at its upgrade step
 * across the load's mint.
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

const REPLY = 'Kira slips through.\n```json\n{"newTruths":[{"subject":"vent","fact":"The vent grille hangs loose."}],"stateChanges":[]}\n```';
const NARRATION_MODEL = 'claude-sonnet-5-5';
const EARLIER = 'The drones sweep the corridor in threes.';
const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);
const roundCard = () => roundCards()[0]?.flags?.[MODULE_ID] ?? null;
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /THIS ROUND/.test(c.userText ?? ''));
const ventTruth = () => (world().sceneTruths ?? []).find(t => /vent grille/.test(t?.fact ?? '')) ?? null;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());
afterEach(() => { vi.useRealTimers(); });

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
    combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: 'sess-1', currentSessionId: 'sess-1', sessionNumber: 4,
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

/** A narration posted earlier in the round's session (the narrator card's flag family). */
async function earlierNarrationOfTheSession() {
  await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: `<p>${EARLIER}</p>`,
    flags: { [MODULE_ID]: { narratorCard: true, narrationText: EARLIER, sessionId: 'sess-1', sessionNumber: 4, narrationId: 'nar-earlier' } },
  }));
  await table.settle();
}

/**
 * Kira burns momentum on her card while Ren's move is still being rolled; the
 * burn is still applying (its meter write held) when Ren's roll ends: the
 * round waits at its upgrade step for the burn in flight.
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
  expect(round(), 'setup: at the upgrade step, in its own session').toMatchObject({ phase: 'upgrading', sessionId: 'sess-1' });
  expect(round().entries['pl-1'].upgrade, 'setup: Kira\'s burn is in flight').toMatchObject({ inFlight: 'burn', decided: null });
  return round().id;
}

/** End a Session's own first write: the gate shut, the session marked ended. */
async function endTheSession() {
  await table.client('gm-1').setSetting('campaignState', { ...world(), sessionActive: false, sessionEndedId: 'sess-1' });
  await table.settle();
}

/** The GM's page goes with the burn still applying on it, and loads again: the load mints the next session. */
async function gmPageDiesAndLoadsAgain() {
  await table.reload('gm-1');
  await table.settle();
}

/** A minute passes on the in-flight wait: its stamp aged in the store. */
function theGraceHasPassed() {
  const r = round();
  const since = ago(UPGRADE_IN_FLIGHT_GRACE_MS + 1000);
  table.world.setSetting('batchMode.round', {
    ...r, entries: { ...r.entries, 'pl-1': { ...r.entries['pl-1'], upgrade: { ...r.entries['pl-1'].upgrade, inFlightSince: since } } },
  });
}

async function sendNow() {
  const gm = table.client('gm-1');
  const driver = await gm.import('../../src/batch/driver.js');
  await gm.run(() => driver.requestSendNow());
  await table.settle();
}

/** The round is left at its upgrade step by a load that minted the next session. */
async function roundLeftWaitingAcrossTheMint() {
  await earlierNarrationOfTheSession();
  const roundId = await burnStillApplyingAtUpgradeStep();
  await endTheSession();
  await gmPageDiesAndLoadsAgain();
  expect(world().currentSessionId, 'setup: the load minted the next session').not.toBe('sess-1');
  expect(world().sessionNumber, 'setup: … session 5').toBe(5);
  expect(round(), 'setup: the round still waits, its session over').toMatchObject({ id: roundId, phase: 'upgrading', sessionId: 'sess-1' });
  expect(narrations(), 'setup: nothing narrated yet').toHaveLength(0);
  return roundId;
}

function expectNarratedAsItsOwnSessions(roundId) {
  expect(round()).toMatchObject({ id: roundId, phase: 'closed', closeReason: 'resolved' });
  expect(narrations(), 'narrated once').toHaveLength(1);
  expect(roundCards()).toHaveLength(1);
  // Its card is its own session's — not the first narration of a session nobody has begun.
  expect(roundCard(), 'the card carries the round\'s session').toMatchObject({ roundId, sessionId: 'sess-1', sessionNumber: 4 });
  // What its narration recorded is dated to that session.
  expect(ventTruth(), 'the fact its narration recorded').toMatchObject({ sessionId: 'sess-1', sessionNum: 4 });
  // And it was told with its own session's story so far.
  expect(narrations()[0].userText, 'told with the session\'s earlier narration').toContain(EARLIER);
  // The minted session stays as the load left it.
  expect(world().currentSessionId).not.toBe('sess-1');
  expect(world().sessionNumber).toBe(5);
}

describe('issue #364 ROUND-CARD-SESSION-ID-AFTER-MINT — a round of an over session narrated after the load minted the next', () => {
  it('by a GM\'s Send now: its card, its facts and its story so far are its own session\'s', async () => {
    const roundId = await roundLeftWaitingAcrossTheMint();
    theGraceHasPassed();
    await sendNow();
    await table.settle();
    expectNarratedAsItsOwnSessions(roundId);
  }, 60_000);

  it('by the re-check once the upgrade in flight has lapsed: the same', async () => {
    await earlierNarrationOfTheSession();
    const roundId = await burnStillApplyingAtUpgradeStep();
    await endTheSession();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await gmPageDiesAndLoadsAgain();
    expect(world().currentSessionId, 'setup: the load minted the next session').not.toBe('sess-1');
    expect(narrations(), 'setup: nothing narrated yet').toHaveLength(0);

    theGraceHasPassed();
    await vi.advanceTimersByTimeAsync(UPGRADE_IN_FLIGHT_GRACE_MS + 1000);
    await table.settle();
    expectNarratedAsItsOwnSessions(roundId);
  }, 60_000);

  it('with no Claude key left on the table: its "narration unavailable" card is its own session\'s too', async () => {
    const roundId = await roundLeftWaitingAcrossTheMint();
    await table.setClaudeKey('gm-1', '');
    await table.settle();
    theGraceHasPassed();
    await sendNow();
    await table.settle();
    expect(round()).toMatchObject({ id: roundId, phase: 'closed' });
    expect(narrations()).toHaveLength(0);
    expect(roundCards()).toHaveLength(1);
    expect(roundCard()).toMatchObject({ roundId, narrationFallback: true, sessionId: 'sess-1', sessionNumber: 4 });
  }, 60_000);
});

describe('issue #364 ROUND-CARD-SESSION-ID-AFTER-MINT — a round opened before rounds kept their session\'s number', () => {
  /** The stored round as an earlier version opened it: its session's id, no number. */
  function roundWithoutItsSessionNumber() {
    const r = { ...round() };
    delete r.sessionNumber;
    table.world.setSetting('batchMode.round', r);
  }

  it('takes the number its session\'s narrator cards carry', async () => {
    const roundId = await roundLeftWaitingAcrossTheMint();
    roundWithoutItsSessionNumber();
    theGraceHasPassed();
    await sendNow();
    await table.settle();
    expectNarratedAsItsOwnSessions(roundId);
  }, 60_000);

  it('with no narration of its session, takes the number the mint recorded its session under (LAST SESSION) — never the minted session\'s', async () => {
    // Since issue #364 LATE-ROUND-NO-LAST-SESSION-RECORD the mint records a
    // closing session whose round is still to be narrated as LAST SESSION's
    // session, under its number: that names the round's session.
    const roundId = await burnStillApplyingAtUpgradeStep();   // no earlier narration in the session
    await endTheSession();
    await gmPageDiesAndLoadsAgain();
    expect(world().sessionNumber, 'setup: the load minted session 5').toBe(5);
    expect(world().previousSessionSummary, 'setup: the mint recorded the round\'s session').toMatchObject({ sessionId: 'sess-1', sessionNumber: 4 });
    roundWithoutItsSessionNumber();
    theGraceHasPassed();
    await sendNow();
    await table.settle();
    expect(roundCard()).toMatchObject({ roundId, sessionId: 'sess-1', sessionNumber: 4 });
    expect(ventTruth()).toMatchObject({ sessionId: 'sess-1', sessionNum: 4 });
  }, 60_000);

  it('and with nothing to name it, stamps none — never the minted session\'s', async () => {
    const roundId = await burnStillApplyingAtUpgradeStep();   // no earlier narration in the session
    await endTheSession();
    await gmPageDiesAndLoadsAgain();
    expect(world().sessionNumber, 'setup: the load minted session 5').toBe(5);
    // A world whose store names the round's session nowhere: no LAST SESSION
    // record of it and no mark owed for it.
    const cs = { ...world() };
    delete cs.previousSessionSummary;
    delete cs.unsummarisedSession;
    await table.client('gm-1').setSetting('campaignState', cs);
    roundWithoutItsSessionNumber();
    theGraceHasPassed();
    await sendNow();
    await table.settle();
    expect(roundCard()).toMatchObject({ roundId, sessionId: 'sess-1', sessionNumber: null });
    expect(ventTruth()).toMatchObject({ sessionId: 'sess-1', sessionNum: null });
  }, 60_000);
});

describe('issue #364 ROUND-CARD-SESSION-ID-AFTER-MINT — control: a round narrated in its own session', () => {
  it('carries the session in play, as before', async () => {
    await earlierNarrationOfTheSession();
    const roundId = await burnStillApplyingAtUpgradeStep();
    await gmPageDiesAndLoadsAgain();
    expect(world().currentSessionId, 'setup: the session goes on').toBe('sess-1');
    theGraceHasPassed();
    await sendNow();
    await table.settle();
    expect(round().id, 'the session\'s next round is open').not.toBe(roundId);
    expect(narrations()).toHaveLength(1);
    expect(roundCard()).toMatchObject({ roundId, sessionId: 'sess-1', sessionNumber: 4 });
    expect(ventTruth()).toMatchObject({ sessionId: 'sess-1', sessionNum: 4 });
    expect(narrations()[0].userText).toContain(EARLIER);
  }, 60_000);
});

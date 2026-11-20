/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/xcardAnswersLateRoundNarration.test.js
 *
 * Issue #364 XCARD-MISSES-LATE-ROUND-CARD.
 *
 * A Batch Mode round whose session is over can be narrated after the world
 * load has minted the next session (a GM's Send now, or the re-check of an
 * upgrade in flight), and its card is then filed under the round's own —
 * ended — session (ROUND-CARD-SESSION-ID-AFTER-MINT). The X-Card took "the
 * current session's narrations", so a table that played it right after that
 * narration posted had nothing removed — or, with a narration of the minted
 * session already in chat (Begin a Session's), had that older narration
 * removed instead while the one on screen stayed, its facts live.
 *
 * The X-Card answers the narration the table has just been shown: the newest
 * narration in the current session's memory, or one posted since the current
 * session was minted and filed under the session before it
 * (narrator.js narratedLateIntoEarlierSession). So does the guard for a card
 * that posts while the X-Card is active (XCARD-POST-RACE), and the Round
 * window's "newest narration".
 *
 * On a booted table (tests/helpers/multiClient.js), the harness of
 * tests/unit/roundNarratedAfterMintKeepsItsSession.test.js: a Burn still
 * applying when the GM's page goes leaves the round at its upgrade step
 * across End a Session and the load's mint.
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

const ROUND_PROSE = 'Kira slips through.';
const REPLY = `${ROUND_PROSE}\n\`\`\`json\n{"newTruths":[{"subject":"vent","fact":"The vent grille hangs loose."}],"stateChanges":[]}\n\`\`\``;
const EARLIER = 'The drones sweep the corridor in threes.';
const OPENING = 'The Forge hums awake around the crew.';
const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const flagsOf = (m) => m?.flags?.[MODULE_ID] ?? null;
const roundCard = () => flagsOf(table.cards(f => f.narratorCard && f.roundId)[0]);
const cardOf = (narrationId) => flagsOf(table.cards(f => f.narratorCard && f.narrationId === narrationId)[0]);
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

/** A narration card as the narrator posts one (the flag family), with a fact its sidecar recorded. */
async function narrationOf(sessionId, sessionNumber, narrationId, prose) {
  await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: `<p>${prose}</p>`,
    flags: { [MODULE_ID]: { narratorCard: true, narrationText: prose, sessionId, sessionNumber, narrationId } },
  }));
  await table.settle();
}

/** Kira's burn is still applying when Ren's roll ends: the round waits at its upgrade step. */
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
  return round().id;
}

/** A minute passes on the in-flight wait: its stamp aged in the store. */
function theGraceHasPassed() {
  const r = round();
  const since = ago(UPGRADE_IN_FLIGHT_GRACE_MS + 1000);
  table.world.setSetting('batchMode.round', {
    ...r, entries: { ...r.entries, 'pl-1': { ...r.entries['pl-1'], upgrade: { ...r.entries['pl-1'].upgrade, inFlightSince: since } } },
  });
}

/** The round is left at its upgrade step by End a Session and a load that minted the next session. */
async function roundLeftWaitingAcrossTheMint() {
  await narrationOf('sess-1', 4, 'nar-earlier', EARLIER);
  const roundId = await burnStillApplyingAtUpgradeStep();
  await table.client('gm-1').setSetting('campaignState', { ...world(), sessionActive: false, sessionEndedId: 'sess-1' });
  await table.settle();
  await table.reload('gm-1');
  await table.settle();
  expect(world().currentSessionId, 'setup: the load minted the next session').not.toBe('sess-1');
  expect(world().sessionNumber, 'setup: … session 5').toBe(5);
  expect(round(), 'setup: the round still waits, its session over').toMatchObject({ id: roundId, phase: 'upgrading', sessionId: 'sess-1' });
  theGraceHasPassed();
  return roundId;
}

/** The GM's Send now: the old round is narrated, late, into its own session. */
async function sendNow() {
  const gm = table.client('gm-1');
  const driver = await gm.import('../../src/batch/driver.js');
  await gm.run(() => driver.requestSendNow());
  await table.settle();
}

async function lateRoundNarrated() {
  await sendNow();
  expect(roundCard(), 'setup: the late round\'s card is its own session\'s').toMatchObject({ sessionId: 'sess-1', sessionNumber: 4 });
  expect(roundCard().xCarded, 'setup: not removed yet').toBeUndefined();
  expect(ventTruth(), 'setup: its fact is live').toMatchObject({ retracted: false });
}

/** A player plays the X-Card. */
async function playXCard() {
  await table.client('pl-1').chat('!x');
  await table.settle();
  expect(world().xCardActive, 'the scene is paused').toBe(true);
}

function expectLateRoundRemoved() {
  const card = roundCard();
  expect(card.xCarded, 'the late round\'s card is flagged removed').toBe(true);
  expect(world().xCardedNarrationIds, 'its narration is named removed').toContain(card.narrationId);
  expect(ventTruth(), 'the fact it recorded is retracted, as the X-Card\'s').toMatchObject({ retracted: true, retractedBy: 'xcard' });
}

describe('issue #364 XCARD-MISSES-LATE-ROUND-CARD — the X-Card played right after a round narrated late into the session before', () => {
  it('removes that narration when the minted session has none of its own yet', async () => {
    await roundLeftWaitingAcrossTheMint();
    await lateRoundNarrated();

    await playXCard();

    expectLateRoundRemoved();
    // Nothing from before the mint is reached: the ended session's earlier story stands.
    expect(cardOf('nar-earlier').xCarded).toBeUndefined();
  }, 60_000);

  it('removes that narration, not an older one of the minted session (Begin a Session\'s)', async () => {
    await roundLeftWaitingAcrossTheMint();
    await narrationOf(world().currentSessionId, 5, 'nar-opening', OPENING);
    await lateRoundNarrated();

    await playXCard();

    expect(cardOf('nar-opening').xCarded, 'the minted session\'s opening narration stays').toBeUndefined();
    expect(world().xCardedNarrationIds ?? []).not.toContain('nar-opening');
    expectLateRoundRemoved();
  }, 60_000);

  it('a second X-Card then removes nothing more', async () => {
    await roundLeftWaitingAcrossTheMint();
    await narrationOf(world().currentSessionId, 5, 'nar-opening', OPENING);
    await lateRoundNarrated();
    await playXCard();
    expectLateRoundRemoved();

    await playXCard();

    expect(cardOf('nar-opening').xCarded).toBeUndefined();
    expect(cardOf('nar-earlier').xCarded).toBeUndefined();
  }, 60_000);

  it('control: a narration of the minted session posted after it is the one removed', async () => {
    await roundLeftWaitingAcrossTheMint();
    await lateRoundNarrated();
    await table.client('pl-2').chat('/ooc ready when you are');     // someone speaks: a new beat
    await table.settle();
    await narrationOf(world().currentSessionId, 5, 'nar-opening', OPENING);

    await playXCard();

    expect(cardOf('nar-opening').xCarded).toBe(true);
    expect(roundCard().xCarded, 'the late round\'s card, a beat before, stays').toBeUndefined();
    expect(ventTruth()).toMatchObject({ retracted: false });
  }, 60_000);

  it('control: with the round still unnarrated, nothing of the ended session is removed', async () => {
    await roundLeftWaitingAcrossTheMint();

    await playXCard();

    expect(cardOf('nar-earlier').xCarded).toBeUndefined();
    expect(world().xCardedNarrationIds ?? []).toEqual([]);
  }, 60_000);
});

describe('issue #364 XCARD-MISSES-LATE-ROUND-CARD — the late round\'s card posts while the X-Card is active (XCARD-POST-RACE)', () => {
  it('is removed with it', async () => {
    await roundLeftWaitingAcrossTheMint();
    // The round's narration has passed its checks; its card is on its way …
    const cardOnItsWay = holdWrites(table, (w) => w.kind === 'message.create'
      && w.data?.flags?.[MODULE_ID]?.narratorCard === true && !!w.data?.flags?.[MODULE_ID]?.roundId);
    const gm = table.client('gm-1');
    const driver = await gm.import('../../src/batch/driver.js');
    const sending = gm.run(() => driver.requestSendNow());
    await cardOnItsWay.arrived;
    // … when the X-Card lands: nothing on screen to answer yet.
    await playXCard();
    expect(world().xCardedNarrationIds ?? []).toEqual([]);

    cardOnItsWay.release();
    await sending;
    await table.settle();

    expect(roundCard(), 'setup: the card posted, its own session\'s').toMatchObject({ sessionId: 'sess-1' });
    expectLateRoundRemoved();
    expect(world().xCardActive, 'still paused').toBe(true);
  }, 60_000);
});

describe('issue #364 XCARD-MISSES-LATE-ROUND-CARD — the Round window\'s newest narration', () => {
  async function recentOn(userId) {
    const c = table.client(userId);
    const mod = await c.import('../../src/ui/roundWindow.js');
    return c.run(async () => {
      const app = mod.RoundWindowApp.instance ?? new mod.RoundWindowApp();
      return (await app._prepareContext({})).recent;
    });
  }

  it('shows the late round\'s narration while it is the newest posted, and not once the X-Card removed it', async () => {
    await roundLeftWaitingAcrossTheMint();
    await narrationOf(world().currentSessionId, 5, 'nar-opening', OPENING);
    expect(await recentOn('pl-2'), 'control: the minted session\'s narration').toBe(OPENING);

    await lateRoundNarrated();
    expect(await recentOn('pl-2')).toBe(ROUND_PROSE);

    await playXCard();
    expect(await recentOn('pl-2'), 'removed: the window falls back to the narration before it').toBe(OPENING);
  }, 60_000);

  it('control: a narration of the ended session from before the mint is not shown in the minted one', async () => {
    await roundLeftWaitingAcrossTheMint();
    expect(await recentOn('pl-2')).toBe('');
  }, 60_000);
});

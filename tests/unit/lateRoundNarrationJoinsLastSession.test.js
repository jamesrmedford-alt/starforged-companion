/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/lateRoundNarrationJoinsLastSession.test.js
 *
 * Issue #364 LATE-ROUND-NOT-IN-LAST-SESSION.
 *
 * A Batch Mode round whose session is over can be narrated after the world
 * load has minted the next session, and its card is filed under the round's
 * own session (ROUND-CARD-SESSION-ID-AFTER-MINT). The mint fixed LAST SESSION
 * (`previousSessionSummary`) from the narrator cards present then; the late
 * card's post refreshed the current session's rolling summary alone, and the
 * card is in no ring of the minted session — so the next session's narrator
 * was told that round's prose by nothing.
 *
 * Now a narration posted into the session LAST SESSION names marks that
 * session short again and the catch-up summarises its cards from source
 * (narrator.js bringLastSessionUpToDate → catchUpUnsummarisedSession), on the
 * canonical GM: one summary call per late card. What a mint folded onto LAST
 * SESSION from a session nobody began is kept; when the mint carried no
 * summary for the card's session nothing is made up; and an X-Card on the
 * late card takes it out of LAST SESSION again.
 *
 * On a booted table (tests/helpers/multiClient.js), the harness of
 * tests/unit/roundNarratedAfterMintKeepsItsSession.test.js with the rolling
 * session summary on.
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
const FOLD = 'Narrated between sessions, while no session was begun: The crew drilled in the hold.';
const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

/** The rolling summary's call: its reply names the narrations it was made from. */
const isSummaryCall = (call) => /SESSION NARRATION \(oldest first\)/.test(call?.userText ?? '');
const summaryOf = (call) => {
  const told = [['earlier', EARLIER], ['round', ROUND_PROSE], ['opening', OPENING]]
    .filter(([, prose]) => (call.userText ?? '').includes(prose)).map(([name]) => name);
  return `Summary: ${told.join('+')}.`;
};

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const flagsOf = (m) => m?.flags?.[MODULE_ID] ?? null;
const roundCard = () => flagsOf(table.cards(f => f.narratorCard && f.roundId)[0]);
const lastSession = () => world().previousSessionSummary ?? null;
const summaryCalls = () => table.claude.calls.filter(isSummaryCall);
/** Wait (bounded) until `fn()` is truthy: the summary's call and its write run off the card's post. */
const until = async (fn) => {
  for (let i = 0; i < 200 && !fn(); i++) { await table.settle(); await new Promise(r => setTimeout(r, 5)); }
  return fn();
};

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());
afterEach(() => { vi.useRealTimers(); });

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: true, sessionLogAutoWrite: false, autoRecapEnabled: false,
    combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: 'sess-1', currentSessionId: 'sess-1', sessionNumber: 4,
      lastSessionTimestamp: ago(HOUR), currentSceneId: 'sc-1', sceneTruths: [] },
    sessionActivity: { sessionId: 'sess-1', at: ago(1000) },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  table.actors.get('pc-kira').system.momentum.value = 9;
  scriptClaude(table, { fallback: (call) => (isSummaryCall(call) ? summaryOf(call) : REPLY) });
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

/** A narration card as the narrator posts one (the flag family). */
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
}

/**
 * The round is left at its upgrade step by End a Session and a load that
 * minted the next session; the mint kept the ended session's summary — made
 * from the one narration it had — as LAST SESSION.
 */
async function roundLeftWaitingAcrossTheMint() {
  await narrationOf('sess-1', 4, 'nar-earlier', EARLIER);
  await burnStillApplyingAtUpgradeStep();
  await table.client('gm-1').setSetting('campaignState', { ...world(), sessionActive: false, sessionEndedId: 'sess-1' });
  await table.settle();
  await table.reload('gm-1');
  await table.settle();
  await until(() => lastSession()?.sessionId === 'sess-1' && !world().unsummarisedSession);
  expect(world().sessionNumber, 'setup: the load minted session 5').toBe(5);
  expect(lastSession(), 'setup: LAST SESSION as the mint kept it').toMatchObject({ sessionId: 'sess-1', sessionNumber: 4, text: 'Summary: earlier.' });
  expect(world().unsummarisedSession ?? null, 'setup: nothing owed').toBeNull();
  expect(round(), 'setup: the round still waits, its session over').toMatchObject({ phase: 'upgrading', sessionId: 'sess-1' });
  const r = round();
  table.world.setSetting('batchMode.round', {
    ...r, entries: { ...r.entries, 'pl-1': { ...r.entries['pl-1'], upgrade: { ...r.entries['pl-1'].upgrade,
      inFlightSince: ago(UPGRADE_IN_FLIGHT_GRACE_MS + 1000) } } },
  });
}

/** The GM's Send now: the old round is narrated, late, into its own session. */
async function lateRoundNarrated() {
  const gm = table.client('gm-1');
  const driver = await gm.import('../../src/batch/driver.js');
  await gm.run(() => driver.requestSendNow());
  await table.settle();
  expect(roundCard(), 'setup: the late round\'s card is its own session\'s').toMatchObject({ sessionId: 'sess-1', sessionNumber: 4 });
}

async function playXCard() {
  await table.client('pl-1').chat('!x');
  await table.settle();
  expect(world().xCardActive, 'the scene is paused').toBe(true);
}

describe('issue #364 LATE-ROUND-NOT-IN-LAST-SESSION — a round narrated after the next session was minted', () => {
  it('joins LAST SESSION, which the minted session\'s narrator is told', async () => {
    await roundLeftWaitingAcrossTheMint();
    const callsBefore = summaryCalls().length;

    await lateRoundNarrated();
    await until(() => /round/.test(lastSession()?.text ?? ''));

    expect(lastSession()).toMatchObject({ sessionId: 'sess-1', sessionNumber: 4, text: 'Summary: earlier+round.' });
    expect(world().unsummarisedSession ?? null, 'nothing left owed').toBeNull();
    expect(summaryCalls().length - callsBefore, 'one summary call, on the canonical GM').toBe(1);
    // The context the minted session's next narration is built with: LAST SESSION tells the round;
    // its own ring does not hold the card (it is the ended session's story).
    const gm = table.client('gm-1');
    const narrator = await gm.import('../../src/narration/narrator.js');
    const extras = await gm.run(() => narrator.buildNarratorExtras('paced_narrative', world(), { playerNarration: 'I catch my breath.' }));
    expect(extras.previousSessionSummary).toMatchObject({ text: 'Summary: earlier+round.', sessionNumber: 4, isLast: true });
    expect(await gm.run(() => narrator.getRecentNarrationContext(world().currentSessionId, 5))).not.toContain(ROUND_PROSE);
    // The minted session's own summary is not made from it.
    expect(world().sessionSummary?.sessionId === world().currentSessionId ? world().sessionSummary.text : '').not.toMatch(/round/);
  }, 60_000);

  it('keeps what a mint folded onto LAST SESSION from a session nobody began', async () => {
    await roundLeftWaitingAcrossTheMint();
    await table.client('gm-1').setSetting('campaignState', { ...world(),
      previousSessionSummary: { ...lastSession(), text: `Summary: earlier.\n\n${FOLD}` } });
    await table.settle();

    await lateRoundNarrated();
    await until(() => /round/.test(lastSession()?.text ?? ''));

    expect(lastSession()).toMatchObject({ sessionId: 'sess-1', sessionNumber: 4, text: `Summary: earlier+round.\n\n${FOLD}` });
  }, 60_000);

  it('makes up no record when the mint carried no summary for that session: LAST SESSION stays the older session\'s', async () => {
    await roundLeftWaitingAcrossTheMint();
    const older = { sessionId: 'sess-0', sessionNumber: 3, text: 'Summary: older.', updatedAt: ago(2 * HOUR) };
    await table.client('gm-1').setSetting('campaignState', { ...world(), previousSessionSummary: older });
    await table.settle();
    const callsBefore = summaryCalls().length;

    await lateRoundNarrated();
    for (let i = 0; i < 5; i++) { await table.settle(); await new Promise(r => setTimeout(r, 5)); }

    expect(lastSession()).toEqual(older);
    expect(world().unsummarisedSession ?? null).toBeNull();
    expect(summaryCalls().length, 'no summary call').toBe(callsBefore);
  }, 60_000);
});

describe('issue #364 LATE-ROUND-NOT-IN-LAST-SESSION — the X-Card on that narration', () => {
  it('takes it out of LAST SESSION, which is made again from the cards that remain at the next narration', async () => {
    await roundLeftWaitingAcrossTheMint();
    await lateRoundNarrated();
    await until(() => /round/.test(lastSession()?.text ?? ''));
    expect(lastSession().text, 'setup: LAST SESSION tells the late round').toBe('Summary: earlier+round.');

    await playXCard();

    expect(roundCard().xCarded, 'setup: the X-Card removed the late round\'s narration').toBe(true);
    expect(lastSession().text, 'LAST SESSION no longer tells it').not.toMatch(/round/);
    expect(world().unsummarisedSession, 'its session is owed its summary again').toMatchObject({ sessionId: 'sess-1', sessionNumber: 4 });

    // A GM resumes; the minted session's next narration posts.
    await table.client('gm-1').chat('!x clear');
    await table.settle();
    expect(world().xCardActive, 'setup: resumed').toBe(false);
    await narrationOf(world().currentSessionId, 5, 'nar-opening', OPENING);
    await until(() => !world().unsummarisedSession);

    expect(lastSession()).toMatchObject({ sessionId: 'sess-1', sessionNumber: 4, text: 'Summary: earlier.' });
  }, 60_000);

  it('drops the session\'s own part only: a folded-on summary of a session nobody began stays', async () => {
    await roundLeftWaitingAcrossTheMint();
    await table.client('gm-1').setSetting('campaignState', { ...world(),
      previousSessionSummary: { ...lastSession(), text: `Summary: earlier.\n\n${FOLD}` } });
    await table.settle();
    await lateRoundNarrated();
    await until(() => /round/.test(lastSession()?.text ?? ''));

    await playXCard();

    expect(lastSession()).toMatchObject({ sessionId: 'sess-1', sessionNumber: 4, text: FOLD });
  }, 60_000);

  it('control: an X-Card on a narration of the minted session leaves LAST SESSION as it is', async () => {
    await roundLeftWaitingAcrossTheMint();
    await lateRoundNarrated();
    await until(() => /round/.test(lastSession()?.text ?? ''));
    await table.client('pl-2').chat('/ooc ready when you are');     // someone speaks: a new beat
    await table.settle();
    await narrationOf(world().currentSessionId, 5, 'nar-opening', OPENING);

    await playXCard();

    expect(roundCard().xCarded, 'the late round stays').toBeUndefined();
    expect(lastSession()).toMatchObject({ sessionId: 'sess-1', text: 'Summary: earlier+round.' });
    expect(world().unsummarisedSession ?? null).toBeNull();
  }, 60_000);
});

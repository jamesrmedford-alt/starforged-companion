/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/lateRoundOnlyNarrationRecordedAtMint.test.js
 *
 * Issue #364 LATE-ROUND-NO-LAST-SESSION-RECORD (decided: mark the closing
 * session at the mint).
 *
 * A Batch Mode round left waiting across the mint is narrated late, into its
 * own session (ROUND-CARD-SESSION-ID-AFTER-MINT), and LAST SESSION is brought
 * up to date with it when it names that session (LATE-ROUND-NOT-IN-LAST-SESSION).
 * When the round was the session's only narration the mint carried no summary
 * for it: LAST SESSION named an older session, and the round reached the next
 * narrator only through its facts.
 *
 * Now the mint records the closing session as LAST SESSION's session when a
 * round of it is still to be narrated — with no text (nothing is made up) —
 * and marks it owed; the record it stands in front of rides with it
 * (`displaced`) and is still what the narrator is told until the session's
 * own summary is written. When nothing comes — the round closes unnarrated —
 * the older record is LAST SESSION again.
 *
 * On a booted table (tests/helpers/multiClient.js): the harness of
 * tests/unit/lateRoundNarrationJoinsLastSession.test.js.
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
const OPENING = 'The Forge hums awake around the crew.';
const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
/** LAST SESSION before session 4: session 3's, as the mint that began session 4 kept it. */
const OLDER = { sessionId: 'sess-0', sessionNumber: 3, text: 'Summary: older.', updatedAt: ago(30 * HOUR) };

/** The rolling summary's call: its reply names the narrations it was made from. */
const isSummaryCall = (call) => /SESSION NARRATION \(oldest first\)/.test(call?.userText ?? '');
const summaryOf = (call) => {
  const told = [['round', ROUND_PROSE], ['opening', OPENING]]
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
const ticks = async (n = 5) => { for (let i = 0; i < n; i++) { await table.settle(); await new Promise(r => setTimeout(r, 5)); } };

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
      lastSessionTimestamp: ago(HOUR), currentSceneId: 'sc-1', sceneTruths: [], previousSessionSummary: OLDER },
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

/** The LAST SESSION the narrator is told, as the minted session's next narration builds its context. */
async function lastSessionTold() {
  const gm = table.client('gm-1');
  const narrator = await gm.import('../../src/narration/narrator.js');
  const extras = await gm.run(() => narrator.buildNarratorExtras('paced_narrative', world(), { playerNarration: 'I catch my breath.' }));
  return extras.previousSessionSummary ?? null;
}

/**
 * Kira's burn is still applying when Ren's roll ends: the round waits at its
 * upgrade step — nothing of session 4 has been narrated.
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
  expect(table.cards(f => f.narratorCard && f.sessionId === 'sess-1').length, 'setup: nothing of session 4 narrated').toBe(0);
}

/** End a Session, and a load that mints session 5 with the round still waiting. */
async function roundLeftWaitingAcrossTheMint() {
  await burnStillApplyingAtUpgradeStep();
  await table.client('gm-1').setSetting('campaignState', { ...world(), sessionActive: false, sessionEndedId: 'sess-1' });
  await table.settle();
  await table.reload('gm-1');
  await table.settle();
  await until(() => world().sessionNumber === 5);
  await ticks();
  expect(world().sessionNumber, 'setup: the load minted session 5').toBe(5);
  expect(round(), 'setup: the round still waits, its session over').toMatchObject({ phase: 'upgrading', sessionId: 'sess-1' });
}

/** The GM's Send now: the old round is narrated, late, into its own session. */
async function lateRoundNarrated() {
  const r = round();
  table.world.setSetting('batchMode.round', {
    ...r, entries: { ...r.entries, 'pl-1': { ...r.entries['pl-1'], upgrade: { ...r.entries['pl-1'].upgrade,
      inFlightSince: ago(UPGRADE_IN_FLIGHT_GRACE_MS + 1000) } } },
  });
  const gm = table.client('gm-1');
  const driver = await gm.import('../../src/batch/driver.js');
  await gm.run(() => driver.requestSendNow());
  await table.settle();
  expect(roundCard(), 'setup: the late round\'s card is its own session\'s').toMatchObject({ sessionId: 'sess-1', sessionNumber: 4 });
}

describe('issue #364 LATE-ROUND-NO-LAST-SESSION-RECORD — a round left waiting was its session\'s only narration', () => {
  it('the mint records the session as LAST SESSION\'s, with no text, and marks it owed; the older summary is still told', async () => {
    await roundLeftWaitingAcrossTheMint();

    expect(lastSession(), 'LAST SESSION names the session the table last played').toMatchObject({
      sessionId: 'sess-1', sessionNumber: 4, text: '', displaced: OLDER,
    });
    expect(world().unsummarisedSession, 'owed its summary, while its round is still to be narrated')
      .toMatchObject({ sessionId: 'sess-1', sessionNumber: 4 });
    // Nothing is made up, and nothing older is lost: the narrator is still told session 3's summary.
    expect(await lastSessionTold()).toEqual({ text: 'Summary: older.', sessionNumber: 3, isLast: false });
  }, 60_000);

  it('the late narration of the round becomes LAST SESSION, which the minted session\'s narrator is told', async () => {
    await roundLeftWaitingAcrossTheMint();
    const callsBefore = summaryCalls().length;

    await lateRoundNarrated();
    await until(() => /round/.test(lastSession()?.text ?? ''));

    expect(lastSession()).toMatchObject({ sessionId: 'sess-1', sessionNumber: 4, text: 'Summary: round.' });
    expect(world().unsummarisedSession ?? null, 'nothing left owed').toBeNull();
    expect(summaryCalls().length - callsBefore, 'one summary call, on the canonical GM').toBe(1);
    expect(await lastSessionTold()).toEqual({ text: 'Summary: round.', sessionNumber: 4, isLast: true });
  }, 60_000);

  it('when the round closes unnarrated, the older summary is LAST SESSION again at the next narration', async () => {
    await roundLeftWaitingAcrossTheMint();
    expect(lastSession(), 'setup: the mint\'s record').toMatchObject({ sessionId: 'sess-1', text: '' });
    const callsBefore = summaryCalls().length;

    // Nothing comes: the round is closed without its narration.
    table.world.setSetting('batchMode.round', { ...round(), phase: 'closed' });
    await table.settle();
    await narrationOf(world().currentSessionId, 5, 'nar-opening', OPENING);
    await until(() => lastSession()?.sessionId === 'sess-0');

    expect(lastSession(), 'the record it stood in front of is back').toEqual(OLDER);
    expect(world().unsummarisedSession ?? null, 'and nothing is owed').toBeNull();
    expect(summaryCalls().filter(c => !(c.userText ?? '').includes(OPENING)).length - callsBefore,
      'no summary call for a session with nothing to tell').toBe(0);
    expect(await lastSessionTold()).toEqual({ text: 'Summary: older.', sessionNumber: 3, isLast: false });
  }, 60_000);

  it('when the X-Card takes the late narration back, the older summary is LAST SESSION again: nothing of the session is left', async () => {
    await roundLeftWaitingAcrossTheMint();
    await lateRoundNarrated();
    await until(() => /round/.test(lastSession()?.text ?? ''));
    expect(lastSession().text, 'setup: LAST SESSION tells the late round').toBe('Summary: round.');

    await table.client('pl-1').chat('!x');
    await table.settle();
    expect(roundCard().xCarded, 'setup: the X-Card removed the late round\'s narration').toBe(true);
    expect(lastSession()?.text ?? '', 'LAST SESSION no longer tells it').not.toMatch(/round/);
    expect(await lastSessionTold(), 'the older summary is told meanwhile').toEqual({ text: 'Summary: older.', sessionNumber: 3, isLast: false });

    // A GM resumes; the minted session's next narration posts, and the catch-up finds nothing left to tell.
    await table.client('gm-1').chat('!x clear');
    await table.settle();
    await narrationOf(world().currentSessionId, 5, 'nar-opening', OPENING);
    await until(() => lastSession()?.sessionId === 'sess-0');

    expect(lastSession()).toEqual(OLDER);
    expect(world().unsummarisedSession ?? null).toBeNull();
  }, 60_000);
});

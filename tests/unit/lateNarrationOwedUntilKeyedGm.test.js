/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/lateNarrationOwedUntilKeyedGm.test.js
 *
 * Issue #364 LATE-ROUND-KEYLESS-GM — read from the code, pinned here.
 *
 * Bringing LAST SESSION up to date with a narration posted late into the
 * session it names is a summary call (narrator.js bringLastSessionUpToDate →
 * catchUpUnsummarisedSession), and the catch-up runs on the canonical GM once
 * it has a key — the recorded rule for a session owed its LAST SESSION
 * (decisions.md, issue #347 AB15: after each narrator card, at the world load,
 * when its key is set). The relay that lets a keyed player's client make the
 * summary for a keyless GM (SUMMARY-KEYLESS-GM) is for the current session's
 * rolling summary only. A Batch Mode round itself is narrated on the canonical
 * GM's own key: a keyless one posts the "narration unavailable" card, which no
 * narrator memory reads, so a late round with prose always comes from a keyed
 * canonical GM, whose own hook brings LAST SESSION up to date
 * (tests/unit/lateRoundNarrationJoinsLastSession.test.js).
 *
 * What a keyless canonical GM does with a narration that lands in LAST
 * SESSION's session — one made on a player's own key: it marks the session
 * owed and makes no call; the mark survives its own loads and the mint of a
 * session that went idle, and the first load with a key makes LAST SESSION
 * from the session's cards.
 *
 * On a booted table (tests/helpers/multiClient.js).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const EARLIER = 'The drones sweep the corridor in threes.';
const LATE = 'Kira slips through the vent before the drones turn.';
const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

const isSummaryCall = (call) => /SESSION NARRATION \(oldest first\)/.test(call?.userText ?? '');
const summaryOf = (call) => {
  const told = [['earlier', EARLIER], ['late', LATE]]
    .filter(([, prose]) => (call.userText ?? '').includes(prose)).map(([name]) => name);
  return `Summary: ${told.join('+')}.`;
};

let table;
const world = () => table.world.campaignState();
const lastSession = () => world().previousSessionSummary ?? null;
const lateSummaryCalls = () => table.claude.calls.filter(c => isSummaryCall(c) && (c.userText ?? '').includes(LATE));
const until = async (fn) => {
  for (let i = 0; i < 200 && !fn(); i++) { await table.settle(); await new Promise(r => setTimeout(r, 5)); }
  return fn();
};
const ticks = async (n = 5) => { for (let i = 0; i < n; i++) { await table.settle(); await new Promise(r => setTimeout(r, 5)); } };

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: true, sessionLogAutoWrite: false, autoRecapEnabled: false,
    combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: 'sess-1', currentSessionId: 'sess-1', sessionNumber: 4,
      lastSessionTimestamp: ago(2 * HOUR), currentSceneId: null, sceneTruths: [] },
    sessionActivity: { sessionId: 'sess-1', at: ago(1000) },
  } } });
  // The GM holds no Claude key; the player does, and narrates on it.
  await table.setClaudeKey('pl-1', 'sk-ant-kira');
  scriptClaude(table, { fallback: (call) => (isSummaryCall(call) ? summaryOf(call) : 'The hold creaks.') });
  silenceConsoleErrors();
});

/** A narration card as the narrator posts one (the flag family), from `userId`'s client. */
async function narrationOf(userId, sessionId, sessionNumber, narrationId, prose) {
  await table.client(userId).run(() => globalThis.ChatMessage.create({
    content: `<p>${prose}</p>`,
    flags: { [MODULE_ID]: { narratorCard: true, narrationText: prose, sessionId, sessionNumber, narrationId } },
  }));
  await table.settle();
}

/** Session 4 was played (one narration) and the next session minted, LAST SESSION made from it. */
async function session4PlayedAndTheNextMinted() {
  await narrationOf('gm-1', 'sess-1', 4, 'nar-earlier', EARLIER);
  await table.client('gm-1').setSetting('campaignState', { ...world(),
    currentSessionId: 'sess-2', sessionNumber: 5, sessionActive: false, sessionStartedId: 'sess-1', sessionEndedId: null,
    lastSessionTimestamp: ago(1000), sessionSummary: null, unsummarisedSession: null,
    previousSessionSummary: { sessionId: 'sess-1', sessionNumber: 4, text: 'Summary: earlier.', updatedAt: ago(2000) } });
  table.world.setSetting('sessionActivity', { sessionId: 'sess-2', at: ago(1000) });
  await table.settle();
}

describe('issue #364 LATE-ROUND-KEYLESS-GM — a narration posted late into LAST SESSION\'s session, the canonical GM keyless', () => {
  it('is owed, not dropped: the mark survives the keyless GM\'s loads and a mint, and the first keyed load makes LAST SESSION', async () => {
    await session4PlayedAndTheNextMinted();

    // A narration made on the player's key lands in session 4 after the mint.
    await narrationOf('pl-1', 'sess-1', 4, 'nar-late', LATE);
    await until(() => !!world().unsummarisedSession);

    expect(world().unsummarisedSession, 'the session is owed its LAST SESSION again').toMatchObject({ sessionId: 'sess-1', sessionNumber: 4 });
    expect(lastSession(), 'nothing made up meanwhile').toMatchObject({ sessionId: 'sess-1', text: 'Summary: earlier.' });
    expect(lateSummaryCalls().length, 'no summary call on any client: the canonical GM has no key').toBe(0);

    // The keyless GM's next load, after four idle hours: it closes out the session nobody began and mints the next.
    table.world.setSetting('sessionActivity', { sessionId: 'sess-2', at: ago(5 * HOUR) });
    await table.client('gm-1').setSetting('campaignState', { ...world(), lastSessionTimestamp: ago(5 * HOUR) });
    await table.reload('gm-1');
    await until(() => world().currentSessionId !== 'sess-2');
    await ticks();
    expect(world().currentSessionId, 'setup: the load minted the next session').not.toBe('sess-2');
    expect(world().unsummarisedSession, 'still owed').toMatchObject({ sessionId: 'sess-1', sessionNumber: 4 });
    expect(lastSession(), 'LAST SESSION still names it').toMatchObject({ sessionId: 'sess-1', text: 'Summary: earlier.' });
    expect(lateSummaryCalls().length, 'still no call').toBe(0);

    // The GM enters a key, and the next load catches it up from the session's cards.
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    await table.reload('gm-1');
    await until(() => /late/.test(lastSession()?.text ?? ''));

    expect(lastSession()).toMatchObject({ sessionId: 'sess-1', sessionNumber: 4, text: 'Summary: earlier+late.' });
    expect(world().unsummarisedSession ?? null, 'nothing left owed').toBeNull();
    expect(lateSummaryCalls().length, 'one summary call, on the keyed canonical GM').toBe(1);
  }, 60_000);
});

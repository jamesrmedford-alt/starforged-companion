/* global silenceConsoleErrors -- tests/setup.js */
/**
 * SUMMARY-KEYLESS-GM (known-issues; issue #287's follow-up). The session
 * summary is made on the canonical GM after each narrator card (issue #286
 * B7: registerRollingSummaryRefreshHook), from that GM's Claude key. At a
 * table whose GMs hold no key — a player narrates on their own key (issue
 * #286 D2) — it was never made: no STORY SO FAR, and no LAST SESSION. The
 * keyed client whose narrator card it is makes it and relays it to the
 * canonical GM (`narrator.summary` → applyRelayedSessionSummary), which
 * stores it only while its own read of the span the summary was made from
 * hashes the same (issue #382 slice 3: the summary is a view of the session
 * record) — an X-Card, a strike or a changed name since, and it is refused.
 *
 * Harness: a simulated table whose journals keep their pages, so the session
 * record is stored as the module writes it; the session's beats seeded on its
 * page; narratorContextCards 1 → the summary is due at two beats; a narrator
 * card written on the player's client asks for it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { makeJournal } from '../helpers/fullStateFixture.js';
import { JOURNAL_NAMES } from '../../src/world/worldJournal.js';
import { journalsKeepPages, tableSummaryOf, playedBeats, citedSummaryReply } from '../helpers/sessionRecordSeed.js';

const SUMMARY = 'Kira reached the docks and bargained for a berth on the lower ring.';
const isSummaryCall = (call) => /story so far/i.test(call.system ?? '');

let table, claude, restoreJournals;
const pat = () => table.client('pl-1');
const gm = () => table.client('gm-1');

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  restoreJournals = journalsKeepPages(table, makeJournal);
}, 30_000);
afterAll(() => { restoreJournals(); return table?.teardown(); });

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: true, narratorContextCards: 1,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionStartedId: 'sess-1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [], xCardedNarrationIds: [],
    },
  } } });
  (await gm().import('../../src/record/record.js'))._resetRecordForTests();
  for (const c of [gm(), pat()]) (await c.import('../../src/record/summaryView.js'))._resetSummaryViewForTests();
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
  // Session 1's record: two beats played.
  const log = makeJournal(JOURNAL_NAMES.sessionLog);
  table.journal._set(log.id, log);
  const events = playedBeats('sess-1', ['I wave to the dockmaster.', 'I look for a berth.'], { actor: 'pc-pat', number: 1 });
  await log.createEmbeddedDocuments('JournalEntryPage', [{ name: 'Session 1', flags: { [MODULE_ID]: {
    sessionLogPage: { sessionId: 'sess-1', sessionNumber: 1, pageName: 'Session 1', createdAt: new Date(1).toISOString() },
    sessionRecord: { v: 1, sessionId: 'sess-1', createdAt: 1, seq: Math.max(...events.map(e => e.seq)), views: {},
      events: Object.fromEntries(events.map(e => [e.id, e])) },
  } } }]);
  claude = scriptClaude(table, { fallback: (call) => (isSummaryCall(call) ? citedSummaryReply([SUMMARY]) : '{}') });
  silenceConsoleErrors();
});

/** A narrator card of this session, written on `client` (a narration on that client's key). */
async function narratedOn(client) {
  await client.run(() => globalThis.ChatMessage.create({
    content: '<p>Kira finds a berth on the lower ring.</p>',
    flags: { [MODULE_ID]: { narratorCard: true, narrationText: 'Kira finds a berth on the lower ring.', sessionId: 'sess-1', narrationId: 'nar-berth' } },
  }));
  await table.settle();
  await table.drain();
}

describe('SUMMARY-KEYLESS-GM — a table whose GM holds no Claude key gets a session summary', () => {
  it('the player narrating on their key makes it, and the GM stores it', async () => {
    await table.setClaudeKey('pl-1', 'sk-ant-pat');
    await narratedOn(pat());
    expect(table.claude.calls.filter(isSummaryCall).map(c => c.client)).toEqual(['pl-1']);
    expect(tableSummaryOf(table, 'sess-1')).toMatchObject({ text: SUMMARY });   // was: never made
  });

  it('a summary made across an X-Card the GM recorded while it was written is not stored', async () => {
    await table.setClaudeKey('pl-1', 'sk-ant-pat');
    const held = claude.hold(isSummaryCall);
    const posting = narratedOn(pat());
    await held.arrived;
    // The X-Card lands on the GM meanwhile: its removal goes on the record.
    const { recordNarrationsRemoved, recordSettled } = await gm().import('../../src/record/record.js');
    await gm().run(async () => { await recordNarrationsRemoved(['nar-sess-1-2'], { session: 'sess-1' }); await recordSettled(); });
    held.release();
    await posting;
    expect(tableSummaryOf(table, 'sess-1')).toBeNull();
  });

  it('control: a keyed GM makes it itself — the player makes none', async () => {
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    await table.setClaudeKey('pl-1', 'sk-ant-pat');
    await narratedOn(pat());
    expect(table.claude.calls.filter(isSummaryCall).map(c => c.client)).toEqual(['gm-1']);
    expect(tableSummaryOf(table, 'sess-1')?.text).toBe(SUMMARY);
  });

  it('control: nobody holds a key — no summary, no call', async () => {
    await narratedOn(pat());
    expect(table.claude.calls.filter(isSummaryCall)).toEqual([]);
    expect(tableSummaryOf(table, 'sess-1')).toBeNull();
  });
});

describe('SUMMARY-KEYLESS-GM — the GM\'s handler checks what crossed the socket', () => {
  it('refuses a malformed one, one made from a span its own read does not agree with, and one telling no more than the stored summary', async () => {
    const { applyRelayedSessionSummary } = await gm().import('../../src/narration/narrator.js');
    const { summaryState } = await gm().import('../../src/record/summaryView.js');
    const span = await gm().run(() => summaryState('sess-1').source);
    const send = (p) => gm().run(() => applyRelayedSessionSummary(p));
    const good = { sessionId: 'sess-1', text: SUMMARY, cites: [['1', '2']], through: span.through, sourceHash: span.hash };
    expect(await send({ ...good, sessionId: 'sess-0' })).toMatchObject({ stored: false });
    expect(await send({ ...good, text: '' })).toMatchObject({ stored: false, reason: 'malformed' });
    expect(await send({ ...good, sourceHash: 'feedface' })).toMatchObject({ stored: false, reason: 'stale' });
    expect(await send(good)).toEqual({ stored: true });
    expect(await send({ ...good, text: 'An older one.' })).toMatchObject({ stored: false, reason: 'stale' });
    expect(tableSummaryOf(table, 'sess-1')?.text).toBe(SUMMARY);
  });
});

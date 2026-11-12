/* global silenceConsoleErrors -- tests/setup.js */
/**
 * SUMMARY-KEYLESS-GM (known-issues; issue #287's follow-up). The rolling
 * session summary regenerates on the canonical GM after each narrator card
 * (issue #286 B7: registerRollingSummaryRefreshHook), from that GM's Claude
 * key. At a table whose GMs hold no key — a player narrates on their own key
 * (issue #286 D2) — it was never generated: no STORY SO FAR, and no LAST
 * SESSION carried into the next session. The keyed client whose narrator card
 * it is now makes the summary and relays it to the canonical GM
 * (`narrator.summary` → applyRelayedSessionSummary), which stores it — unless
 * a narration it was made from has been X-Carded meanwhile (W06's rule).
 *
 * Harness: cacheMutatedBeforeWrite.test.js's (narrator cards posted with the
 * flag family; narratorContextCards 1 → the summary regenerates every second
 * card), the cards written on the player's client.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const SUMMARY = 'Kira reached the docks and bargained for a berth on the lower ring.';
const isSummaryCall = (call) => /story so far/i.test(call.system ?? '');

let table, claude;
const world = () => table.world.campaignState();
const pat = () => table.client('pl-1');

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: true, narratorContextCards: 1,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [],
      sessionSummary: null, xCardedNarrationIds: [],
    },
  } } });
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
  claude = scriptClaude(table, { fallback: (call) => (isSummaryCall(call) ? SUMMARY : '{}') });
  silenceConsoleErrors();
});

/** Two narrator cards of this session, written on `client` (a narration on that client's key). */
async function twoNarratedBeats(client) {
  for (const [id, text] of [['nar-docks', 'The dockmaster waves Kira through.'], ['nar-berth', 'Kira finds a berth on the lower ring.']]) {
    await client.run(() => globalThis.ChatMessage.create({
      content: `<p>${text}</p>`,
      flags: { [MODULE_ID]: { narratorCard: true, narrationText: text, sessionId: 'sess-1', narrationId: id } },
    }));
    await table.settle();
  }
  await table.drain();
}

describe('SUMMARY-KEYLESS-GM — a table whose GM holds no Claude key gets a rolling summary', () => {
  it('the player narrating on their key makes it, and the GM stores it', async () => {
    await table.setClaudeKey('pl-1', 'sk-ant-pat');
    await twoNarratedBeats(pat());

    expect(table.claude.calls.filter(isSummaryCall).map(c => c.client)).toEqual(['pl-1']);
    expect(world().sessionSummary).toMatchObject({ text: SUMMARY, coveredCount: 2, sessionId: 'sess-1' });   // was: null
  });

  it('a summary made from a narration the X-Card removed while it was written is not stored', async () => {
    await table.setClaudeKey('pl-1', 'sk-ant-pat');
    const held = claude.hold(isSummaryCall);
    const beats = twoNarratedBeats(pat());
    await held.arrived;
    // The X-Card lands on the GM meanwhile: the pause's write names the narration it removes.
    await table.client('gm-1').run(() => globalThis.game.settings.set(MODULE_ID, 'campaignState', {
      ...globalThis.game.settings.get(MODULE_ID, 'campaignState'), xCardedNarrationIds: ['nar-berth'],
    }));
    held.release();
    await beats;
    expect(world().sessionSummary ?? null).toBeNull();
  });

  it('control: a keyed GM makes it itself — the player makes none', async () => {
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    await table.setClaudeKey('pl-1', 'sk-ant-pat');
    await twoNarratedBeats(pat());
    expect(table.claude.calls.filter(isSummaryCall).map(c => c.client)).toEqual(['gm-1']);
    expect(world().sessionSummary?.text).toBe(SUMMARY);
  });

  it('control: nobody holds a key — no summary, no call', async () => {
    await twoNarratedBeats(pat());
    expect(table.claude.calls.filter(isSummaryCall)).toEqual([]);
    expect(world().sessionSummary ?? null).toBeNull();
  });
});

describe('SUMMARY-KEYLESS-GM — the GM\'s handler checks what crossed the socket', () => {
  it('refuses another session\'s, a malformed one, and one covering no more than the stored summary', async () => {
    const gm = table.client('gm-1');
    const { applyRelayedSessionSummary } = await gm.import('../../src/narration/narrator.js');
    await twoNarratedBeats(pat());   // two cards of sess-1 in chat (no key: no summary)
    const send = (p) => gm.run(() => applyRelayedSessionSummary(p));
    expect(await send({ sessionId: 'sess-0', text: SUMMARY, coveredCount: 2, narrationIds: [] })).toMatchObject({ stored: false });
    expect(await send({ sessionId: 'sess-1', text: '', coveredCount: 2, narrationIds: [] })).toMatchObject({ stored: false });
    expect(await send({ sessionId: 'sess-1', text: SUMMARY, coveredCount: 9, narrationIds: [] })).toMatchObject({ stored: false });
    expect(await send({ sessionId: 'sess-1', text: SUMMARY, coveredCount: 2, narrationIds: ['nar-docks'] })).toEqual({ stored: true });
    expect(await send({ sessionId: 'sess-1', text: 'An older one.', coveredCount: 1, narrationIds: [] })).toMatchObject({ stored: false });
    expect(world().sessionSummary?.text).toBe(SUMMARY);
  });
});

/**
 * PROBE SESS-5 (thirteenth audit, area "session / audio / private channel")
 * — a session that is closed out (minted over) on a client with no Claude key
 * never gets its rolling summary finalised: LAST SESSION is lost for good,
 * even though the table's keyed GM is there a moment later.
 *
 * rollSessionIfDue (src/session/lifecycle.js) is the one place a session
 * nobody ended is brought up to date before the next is minted:
 *
 *     await finalizeSessionSummary(campaignState);   // → getRollingSessionSummary: `if (!apiKey) return cachedText;`
 *     …
 *     mintSession(campaignState, now);               // previousSessionSummary := the summary as it stands
 *
 * It runs at the canonical GM's world load — in the `ready` hook, before a GM
 * on a new browser (the key is client-scoped) can type their key, and on
 * whichever GM opens the world first (a keyless co-GM) — and at Begin a
 * Session. With no key the finalise is a silent no-op, the mint goes ahead,
 * and nothing ever looks at the closed session again: its cards are still in
 * chat, the new session's ring is empty, and `previousSessionSummary` keeps
 * whatever the debounce had stored (nothing at all for a session shorter than
 * K cards; otherwise missing its last beats).
 * known-issues SUMMARY-KEYLESS-GM records a table with NO keyed GM; here the
 * table has one, and the loss is permanent after a single keyless mint.
 *
 * Correct behaviour asserted: once the GM's client holds a key, the session
 * that was closed without one is summarised for LAST SESSION by the time the
 * new session has been played and ended.
 *
 *   npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sess/keylessMintLosesLastSession.probe.js
 */

/* global silenceConsoleErrors */
import { describe, it, expect, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const SUMMARY_TEXT = 'Kira crossed the flooded bay and found the medic alive behind the bulkhead.';
const isScribe = (c) => /continuity scribe/.test(c.system ?? '');
const FIVE_HOURS_AGO = new Date(Date.now() - 5 * 3_600_000).toISOString();

let table = null;
const world = () => table.world.campaignState();

afterEach(async () => {
  const t = table;
  table = null;
  await t?.teardown();
});

async function bootTable() {
  table = await simulateTable({
    users: [USERS.GM, USERS.P1],
    world: { settings: {
      narrationEnabled: false, chronicleAutoEntry: false, sessionLogAutoWrite: false,
      campaignState: {
        ...CampaignStateSchema,
        // The session in play: begun, live when the table boots.
        sessionActive: true, currentSessionId: 'sess-7', sessionNumber: 7, sessionStartedId: 'sess-7',
        lastSessionTimestamp: new Date().toISOString(), currentSceneId: null, sceneTruths: [],
        sessionSummary: null, previousSessionSummary: null, clocks: [],
      },
    } },
  });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => (isScribe(call) ? SUMMARY_TEXT : '{}') });
}

/** A narrator card of `sessionId`, as every narration path posts it. */
async function narratorCard(sessionId, n) {
  const text = `Beat ${n}: the water rises another hand's width in the cargo bay.`;
  await table.client('gm-1').run(() => ChatMessage.create({
    content: `<div class="sf-narration-prose">${text}</div>`,
    flags: { [MODULE_ID]: { narratorCard: true, narrationText: text, sessionId, narrationId: `nar-${sessionId}-${n}` } },
  }));
  await table.settle();
}

async function relay(kind, payload) {
  const gm = table.client('gm-1');
  const api = await gm.import('../../src/multiplayer/gmRelay.js');
  await gm.run(() => api.requestGmAction(kind, payload));
  await table.settle(); await table.drain();
}

/**
 * sess-7's three narrations; nobody ends it and it goes idle (its last-seen
 * stamp is put five hours back — the tab was closed, the table came back).
 * Then tonight: Begin, one narration, End.
 */
async function playTonight({ keyAt }) {
  for (const n of [1, 2, 3]) await narratorCard('sess-7', n);          // sess-7's story (3 cards < K: no summary yet)
  expect(world().currentSessionId, 'sess-7 is the session in play (setup)').toBe('sess-7');
  expect(world().sessionSummary ?? null, 'sess-7 has no stored summary (setup)').toBeNull();
  await table.client('gm-1').setSetting('campaignState', { ...world(), lastSessionTimestamp: FIVE_HOURS_AGO });
  await table.settle();
  if (keyAt === 'before-begin') await table.setClaudeKey('gm-1', 'sk-ant-gina');

  await relay('session.begin', { vignetteRolled: false, includeGalley: false });
  expect(world().currentSessionId, 'Begin minted the next session (setup)').not.toBe('sess-7');
  expect(world().sessionActive).toBe(true);

  if (keyAt === 'after-begin') await table.setClaudeKey('gm-1', 'sk-ant-gina');   // the GM types their key in
  await narratorCard(world().currentSessionId, 4);
  await relay('session.end', { questFocus: '', connectionFocus: '' });
}

describe('a session closed out by a mint on a client with no Claude key', () => {
  it('control: with the key present at Begin, the closing session is summarised into LAST SESSION', async () => {
    await bootTable();
    silenceConsoleErrors();
    await playTonight({ keyAt: 'before-begin' });
    expect(world().previousSessionSummary).toMatchObject({ sessionId: 'sess-7', text: SUMMARY_TEXT });
  }, 60_000);

  it('the key arrives after the mint: the closed session is still summarised for LAST SESSION', async () => {
    await bootTable();
    silenceConsoleErrors();
    await playTonight({ keyAt: 'after-begin' });
    expect(
      world().previousSessionSummary?.sessionId ?? null,
      'sess-7 was minted over with no summary and nothing finalises it afterwards — LAST SESSION is empty for good',
    ).toBe('sess-7');
  }, 60_000);
});

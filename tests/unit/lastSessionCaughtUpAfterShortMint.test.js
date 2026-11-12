/**
 * STARFORGED COMPANION
 * tests/unit/lastSessionCaughtUpAfterShortMint.test.js
 *
 * A session the mint closes out before its summary could be made still gets
 * LAST SESSION (issue #347 AB15).
 *
 * rollSessionIfDue brings a session nobody ended up to date before minting the
 * next (finalizeSessionSummary), but the finalise is fail-open: on a client
 * with no Claude key yet — keys are per browser — or when its one call failed,
 * the mint went ahead with whatever the debounce had stored (nothing, for a
 * short session), and nothing looked at the closed session again. The mint now
 * marks it (`unsummarisedSession`), and the canonical GM summarises its cards
 * for LAST SESSION once it can — after a narrator card, at the world load, or
 * when its key is set.
 */
/* global silenceConsoleErrors */
import { describe, it, expect, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, claudeFault } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

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
  return scriptClaude(table, { fallback: (call) => (isScribe(call) ? SUMMARY_TEXT : '{}') });
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

describe('a session closed out by a mint on a client with no Claude key (issue #347 AB15)', () => {
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

  it("the mint's one summary call fails (Anthropic overloaded, once): the closed session is still summarised for LAST SESSION", async () => {
    const claude = await bootTable();
    silenceConsoleErrors();
    claude.when(isScribe, claudeFault.overloaded(), { times: 1 });       // only the mint's own call fails
    await playTonight({ keyAt: 'before-begin' });
    expect(table.claude.calls.filter(isScribe).length, 'later summary calls were answered (setup)').toBeGreaterThanOrEqual(2);
    expect(
      world().previousSessionSummary?.sessionId ?? null,
      'one failed call at the mint and sess-7 is never summarised: nothing retries a closed session',
    ).toBe('sess-7');
    expect(world().previousSessionSummary.text).toBe(SUMMARY_TEXT);
    expect(world().unsummarisedSession ?? null, 'the mark is cleared once caught up').toBeNull();
  }, 60_000);

  it('the mint marks the session it closes out short, and a mint that summarises its session clears the mark', async () => {
    await bootTable();
    silenceConsoleErrors();
    for (const n of [1, 2, 3]) await narratorCard('sess-7', n);
    await table.client('gm-1').setSetting('campaignState', { ...world(), lastSessionTimestamp: FIVE_HOURS_AGO });
    await table.settle();
    await relay('session.begin', { vignetteRolled: false, includeGalley: false });     // keyless: closed out short
    expect(world().unsummarisedSession).toMatchObject({ sessionId: 'sess-7', sessionNumber: 7 });
    const second = world().currentSessionId;

    // That session goes idle too; the next mint has a key and summarises it.
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    await table.settle(); await table.drain();
    await narratorCard(second, 1);
    await table.client('gm-1').setSetting('campaignState', { ...world(), lastSessionTimestamp: FIVE_HOURS_AGO });
    await table.settle();
    await relay('session.begin', { vignetteRolled: false, includeGalley: false });
    expect(world().previousSessionSummary).toMatchObject({ sessionId: second, text: SUMMARY_TEXT });
    expect(world().unsummarisedSession ?? null).toBeNull();
  }, 60_000);
});

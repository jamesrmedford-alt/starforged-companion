/**
 * STARFORGED COMPANION — twelfth bug audit, area: shared state and multiplayer
 * tests/probes/multiplayer/summaryAfterPauseOnChain.probe.js
 *
 * MP-3 SUMMARY-XCARD-CHECK-OFF-CHAIN (SAFETY, narrow race)
 *
 * getRollingSessionSummary (src/narration/narrator.js:2179-2268) decides
 * whether to keep its reply by the X-Card BEFORE it waits its turn on the
 * client's campaignState write chain:
 *   narrator.js:2234  if (xCardPlayCount() !== xCardPlaysAtStart || isXCardActive(null)) return '';
 *   narrator.js:2258-2261  serialiseCampaignStateWrite(() => {
 *       const stored = game.settings.get(MODULE_ID, 'campaignState') ?? campaignState;
 *       return game.settings.set(MODULE_ID, 'campaignState', { ...stored, sessionSummary: record });
 *     }, 'rolling summary');
 * The chained task re-reads the store but never re-checks the X-Card. With a
 * write ahead of it on the chain (campaignStateChain.js:84 waitForWriteAhead),
 * an X-Card played meanwhile jumps the chain (runCampaignStateWriteNow) and
 * lands first; its narrator-memory removal (applyXCardToNarratorMemory,
 * narrator.js:1813-1827) blanks only a STORED summary that covers the beat —
 * the old one does not — and then the record, made from the X-carded
 * narration, is written over the pause's store. The removed beat is back in
 * the rolling summary every later prompt carries. It is the reply-time rule
 * of issue #325 W06 ("its reply is never stored") with the check outside the
 * chained callback (the sweep counts the write as on the chain).
 *
 * Scenario (the GM's campaignState writes are held and released in send
 * order — the round trip the harness does not model, as
 * xcardPauseJumpsWriteChain.test.js does): two narrator cards post on the
 * canonical GM; the rolling summary's Haiku call is out. The GM adds a clock
 * (`!clock new`), whose write is on its way. The summary reply returns and
 * its write waits behind the clock's. A player plays the X-Card. The writes
 * land in order: clock, pause, summary.
 *
 * Control: the same with no write ahead of the summary's — it is stored at
 * once, and the X-Card played after it blanks it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { campaignStateWrite, deferred, scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const SUMMARY_TEXT = 'Earlier this session the medic drowned in the flooded cargo bay while Kira watched.';
let table, claude;
let gates = [];
const world = () => table.world.campaignState();

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 60_000);
afterAll(() => table?.teardown());
afterEach(async () => {
  for (const g of gates) g.resolve(undefined);
  gates = [];
  await table.settle();
});

beforeEach(async () => {
  await table.reset({ world: { settings: {
    // K = round(1.5 × 1) = 2 narrator cards per regeneration.
    narratorContextCards: 1,
    chronicleAutoEntry: false, sessionLogAutoWrite: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-7', sessionNumber: 7, currentSceneId: 'sc-1', sceneTruths: [],
      sceneState: { bySubject: {}, sceneId: 'sc-1' }, lastSessionTimestamp: new Date().toISOString(),
      sessionSummary: null, clocks: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  claude = scriptClaude(table);
});

/** Hold every GM campaignState write from now on; each is released in the order it was sent. */
function holdGmCampaignStateWrites() {
  const held = [];
  table.interceptWrites((w) => {
    if (!campaignStateWrite('gm-1')(w)) return undefined;
    const gate = deferred();
    gates.push(gate);
    held.push({ value: w.value, gate });
    return gate.promise;
  });
  return held;
}

async function releaseInOrder(held) {
  for (let i = 0; i < held.length; i++) {
    held[i].gate.resolve(undefined);
    await table.settle();
  }
  await table.drain();
}

/** The canonical GM posts a narrator card (as the move pipeline does). */
async function narratorCard(n, text) {
  const gm = table.client('gm-1');
  await gm.run(() => ChatMessage.create({
    content: `<div class="sf-narration-prose">${text}</div>`,
    flags: { [MODULE_ID]: { narratorCard: true, narrationText: text, sessionId: 'sess-7', narrationId: `nar-${n}` } },
  }));
  await table.settle();
}

/** Two narrator cards: the second makes the summary due; its Haiku call is held. */
async function twoCardsSummaryOut() {
  const summary = claude.hold(c => c.client === 'gm-1' && /continuity scribe/.test(c.system));
  await narratorCard(1, 'The cargo bay floods. The medic is pulled under.');
  await narratorCard(2, 'The medic does not come up again. Kira watches the water still.');
  const call = await summary.arrived;
  expect(call.userText).toContain('The medic does not come up again');
  return summary;
}

describe('MP-3 SUMMARY-XCARD-CHECK-OFF-CHAIN — the rolling summary\'s X-Card check and its chained write', () => {
  it('control: a summary stored before the X-Card is blanked by it', async () => {
    const summary = await twoCardsSummaryOut();
    summary.release(SUMMARY_TEXT);
    await table.settle(); await table.drain();
    expect(world().sessionSummary?.text).toBe(SUMMARY_TEXT);
    expect(world().sessionSummary?.coveredCount).toBe(2);

    await table.client('pl-1').chat('!x');
    await table.settle(); await table.drain();
    expect(world().xCardActive).toBe(true);
    expect(world().sessionSummary?.text).toBe('');   // the removed beat leaves narrator memory
  }, 60_000);

  it('a summary whose write waited behind another write while the X-Card was played does not bring the removed beat back', async () => {
    const summary = await twoCardsSummaryOut();

    const held = holdGmCampaignStateWrites();
    await table.client('gm-1').chat('!clock new "Rising Water" 4');
    await table.settle();
    expect(held.map(h => (h.value.clocks ?? []).map(c => c.name))).toEqual([['Rising Water']]);   // the clock's write is on its way

    summary.release(SUMMARY_TEXT);   // the reply returns: no X-Card yet — kept, its write queued behind the clock's
    await table.settle();
    expect(held).toHaveLength(1);

    await table.client('pl-1').chat('!x');   // the pause jumps the chain
    await table.settle();
    expect(held.map(h => h.value.xCardActive === true)).toEqual([false, true]);

    await releaseInOrder(held);              // clock, pause, then the summary
    expect(world().xCardActive).toBe(true);
    // The summary made from the X-carded narration must not be stored over the pause.
    expect(world().sessionSummary?.text ?? '').not.toContain('the medic drowned');
  }, 60_000);
});

/**
 * Probe NARR — one rolling-summary write the server never answers wedges the
 * summary refresh for the rest of the page load, and Begin a Session with it.
 *
 * refreshRollingSessionSummary (src/narration/narrator.js) keeps one refresh
 * in flight in the module-level `_summaryRefresh`, cleared in a `finally`.
 * The refresh awaits getRollingSessionSummary, which awaits its own persist
 * (`serialiseCampaignStateWrite(… game.settings.set …)`). The client's write
 * chain bounds how long a write waits for the one AHEAD of it
 * (CAMPAIGN_STATE_WRITE_WAIT_MS, "so one hung write cannot hold every later
 * one" — src/multiplayer/campaignStateChain.js), but nothing bounds the wait
 * of the summary refresh on its OWN write. When that write is never answered
 * (the fault the chain, the GM relay queue and startScene each bound):
 *   - `_summaryRefresh` stays set for good: every later narrator card only
 *     sets `_summaryRefreshAgain` and returns the stuck promise, so STORY SO
 *     FAR is never regenerated again on this GM until a reload;
 *   - finalizeSessionSummary (`if (_summaryRefresh) await _summaryRefresh`)
 *     never returns, so rollSessionIfDue never mints: Begin a Session after an
 *     End a Session in the same page load does nothing, with no card.
 *
 * Driven on the multi-client harness (keyed canonical GM + one player); the
 * rolling summary's Haiku call answered by scripted Claude; the summary's
 * campaignState write held and never released (tests/helpers/faults.js'
 * boundary, as holdWrites does).
 *
 *   npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/narr/summaryRefreshWedgedByHungWrite.probe.js
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { campaignStateWrite, scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const SUMMARY_TEXT = 'Kira crossed the flooded bay and found the medic alive behind the bulkhead.';
const isScribe = (c) => c.client === 'gm-1' && /continuity scribe/.test(c.system ?? '');

let table = null;
const world = () => table.world.campaignState();
const scribeCalls = () => table.claude.calls.filter(isScribe);

afterEach(async () => {
  vi.useRealTimers();
  const t = table;
  table = null;
  await t?.teardown();
});

async function bootTable({ ringDepth = 1 } = {}) {
  table = await simulateTable({
    users: [USERS.GM, USERS.P1],
    world: { settings: {
      // K = round(1.5 × ringDepth): 2 narrator cards per regeneration at depth 1.
      narratorContextCards: ringDepth,
      // Nothing but the summary calls Claude: no vignettes, chronicle or Session Log.
      narrationEnabled: false, chronicleAutoEntry: false, sessionLogAutoWrite: false,
      campaignState: {
        ...CampaignStateSchema,
        sessionActive: true, currentSessionId: 'sess-7', sessionNumber: 7, sessionStartedId: 'sess-7',
        currentSceneId: null, sceneTruths: [], lastSessionTimestamp: new Date().toISOString(),
        sessionSummary: null, clocks: [],
      },
    } },
  });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => (isScribe(call) ? SUMMARY_TEXT : '{}') });
}

/** The canonical GM posts a narrator card (as every narration path does). */
async function narratorCard(n) {
  const text = `Beat ${n}: the water rises another hand's width in the cargo bay.`;
  await table.client('gm-1').run(() => ChatMessage.create({
    content: `<div class="sf-narration-prose">${text}</div>`,
    flags: { [MODULE_ID]: { narratorCard: true, narrationText: text, sessionId: 'sess-7', narrationId: `nar-${n}` } },
  }));
  await table.settle();
}

/** Hold — and never answer — the first GM campaignState write that stores a rolling summary. */
function neverAnswerTheSummaryWrite() {
  const seen = { arrived: false };
  table.interceptWrites((w) => {
    if (seen.arrived || !campaignStateWrite('gm-1')(w)) return undefined;
    if (w.value?.sessionSummary?.text !== SUMMARY_TEXT) return undefined;
    seen.arrived = true;
    return new Promise(() => {});   // the server never answers this one
  });
  return seen;
}

async function relay(kind, payload) {
  const gm = table.client('gm-1');
  const api = await gm.import('../../src/multiplayer/gmRelay.js');
  // Not awaited: the action under test may never settle.
  const done = { settled: false };
  gm.run(() => api.requestGmAction(kind, payload)).then(() => { done.settled = true; }, () => { done.settled = true; });
  return done;
}

async function pass(ms) {
  await vi.advanceTimersByTimeAsync(ms);
  await table.settle();
}

describe('the rolling summary refresh and a write the server never answers', () => {
  it('control: every K cards the summary is regenerated and stored; End then Begin a Session mints the next session', async () => {
    await bootTable();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await narratorCard(1); await narratorCard(2);
    await pass(1_000);
    expect(scribeCalls()).toHaveLength(1);
    expect(world().sessionSummary).toMatchObject({ text: SUMMARY_TEXT, coveredCount: 2, sessionId: 'sess-7' });

    await narratorCard(3); await narratorCard(4);
    await pass(1_000);
    expect(scribeCalls()).toHaveLength(2);
    expect(world().sessionSummary?.coveredCount).toBe(4);

    await relay('session.end', { questFocus: '', connectionFocus: '' });
    await pass(1_000);
    expect(world()).toMatchObject({ sessionActive: false, sessionEndedId: 'sess-7' });

    const begin = await relay('session.begin', { vignetteRolled: false, includeGalley: false });
    await pass(1_000);
    expect(begin.settled).toBe(true);
    expect(world().sessionActive).toBe(true);
    expect(world().currentSessionId).not.toBe('sess-7');
  }, 60_000);

  it('a summary write that is never answered does not stop later cards from refreshing the summary', async () => {
    await bootTable();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const hung = neverAnswerTheSummaryWrite();

    await narratorCard(1); await narratorCard(2);
    await pass(1_000);
    expect(scribeCalls(), 'the summary was due and its call made (setup)').toHaveLength(1);
    expect(hung.arrived, 'its write was sent and is unanswered (setup)').toBe(true);
    expect(world().sessionSummary ?? null, 'nothing stored (setup)').toBeNull();

    // Ten minutes later — sixty times the write chain's own bound for a hung
    // write — the table plays on: four more narrator cards.
    await pass(10 * 60_000);
    for (const n of [3, 4, 5, 6]) await narratorCard(n);
    await pass(10 * 60_000);

    // The store holds no summary and six cards are uncovered (K = 2): a
    // refresh is long overdue. The wedged `_summaryRefresh` makes none.
    expect(world().sessionSummary ?? null, 'still nothing stored (setup)').toBeNull();
    expect(
      scribeCalls().length,
      'no summary call was made for the four later cards — the refresh is wedged behind its own unanswered write',
    ).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it('a summary write that is never answered does not stop Begin a Session from minting the next session', async () => {
    await bootTable();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const hung = neverAnswerTheSummaryWrite();

    await narratorCard(1); await narratorCard(2);
    await pass(1_000);
    expect(hung.arrived, 'the summary write was sent and is unanswered (setup)').toBe(true);

    // Later that evening the table ends the session …
    await pass(10 * 60_000);
    const end = await relay('session.end', { questFocus: '', connectionFocus: '' });
    await pass(60_000);
    expect(world(), 'End a Session landed (setup)').toMatchObject({ sessionActive: false, sessionEndedId: 'sess-7' });
    expect(end.settled, 'End a Session finished — its own summary write is not the hung one (setup)').toBe(true);

    // … and begins the next one without reloading the GM's browser.
    const begin = await relay('session.begin', { vignetteRolled: false, includeGalley: false });
    await pass(30 * 60_000);

    expect(
      { begun: world().sessionActive === true, minted: world().currentSessionId !== 'sess-7', handlerSettled: begin.settled },
      'Begin a Session never finishes: finalizeSessionSummary awaits the wedged refresh',
    ).toEqual({ begun: true, minted: true, handlerSettled: true });
  }, 60_000);

  it("End a Session's own summary write that is never answered does not stop End a Session from finishing", async () => {
    // Ring depth 20 → K = 30: two cards make no refresh of their own, so the
    // only summary call is End a Session's forced one.
    await bootTable({ ringDepth: 20 });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await narratorCard(1); await narratorCard(2);
    await pass(1_000);
    expect(scribeCalls(), 'no refresh below the debounce (setup)').toHaveLength(0);

    const hung = neverAnswerTheSummaryWrite();
    const end = await relay('session.end', { questFocus: '', connectionFocus: '' });
    await pass(30 * 60_000);

    expect(world(), 'the gate write landed (setup)').toMatchObject({ sessionActive: false, sessionEndedId: 'sess-7' });
    expect(scribeCalls(), "End's forced summary call was made (setup)").toHaveLength(1);
    expect(hung.arrived, 'its write was sent and is unanswered (setup)').toBe(true);
    expect(
      end.settled,
      'End a Session never finishes (no Session Log, no closing vignette, no recap refresh; every later End queues behind it)',
    ).toBe(true);
  }, 60_000);
});

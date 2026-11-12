/**
 * STARFORGED COMPANION
 * tests/unit/supersededNarrationLeavesSummary.test.js
 *
 * Issue #345 AA24 SUPERSEDED-NARRATION-KEPT-IN-SUMMARY — the twelfth audit's
 * NARR-5 probe, with the trigger-vignette half of the row added.
 *
 * A Burn Momentum / Improve Result supersedes the move narration it replaces
 * (issue #338 D8): supersedeOriginalNarration flags the card `burnSuperseded`
 * — sessionNarratorCards leaves it out of the ring and the rolling summary's
 * SOURCE — and retracts its ledger entries. The summary TEXT already made from
 * that card was not touched: nothing marked it for a regen (contrast the
 * X-Card's applyXCardToNarratorMemory, which empties a summary that covered
 * the removed card — issue #325 W06). The summary is keyed by a count
 * (`coveredCount`), and the supersede kept the count: one card leaves the
 * source, its re-narration joins it, so `total - covered` is 0 and the
 * debounce served the old text — the outcome the burn replaced — as STORY SO
 * FAR until K = round(1.5 × Context Cards) more cards posted, beside the
 * re-narration's opposite outcome. A rewound clock's trigger vignette
 * (supersedeTriggerVignettes) had the same gap.
 *
 * Fixed: both supersedes drop a summary made from the cards they supersede —
 * the X-Card's covered-index rule, read before the cards are flagged
 * (narrator.js dropSummaryOfSupersededCards): text emptied, a regen due.
 *
 * Scenario: Context Cards 2 (K = 3). Three narrations; the summary regen
 * after the third covers it ("Kira is dragged off to the cells" — a miss).
 * The player burns momentum: the miss's narration is superseded and the
 * strong hit re-narrated ("Kira slips the guards"). The refresh after the
 * re-narration runs; the next narration's STORY SO FAR is checked.
 *
 * Controls: with no burn the summary of the miss stands; a summary made
 * before the superseded card posted stays.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { postNarrationCard, getRollingSessionSummary, buildNarratorExtras } from '../../src/narration/narrator.js';
import { supersedeOriginalNarration } from '../../src/moves/burnMomentum.js';
import { revertPayThePrice } from '../../src/moves/resultUpgrade.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-3';
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
function syncChat() { global.game.messages = { contents: ChatMessage._created.slice() }; }

const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });
const isSummaryCall = (body) => JSON.stringify(body?.system ?? '').includes('continuity scribe');
const SUMMARY_MISS = 'Kira crossed the market, bribed a clerk, and was dragged off to the cells by the guards.';
const SUMMARY_HIT  = 'Kira crossed the market, bribed a clerk, and slipped the guards at the gate.';

async function narrated(n, prose, outcome = 'weak_hit') {
  const card = await postNarrationCard(prose, { moveId: 'face_danger', outcome, _id: `res-${n}` }, stored(),
    { playerText: 'I keep moving.', playerName: 'Kira', narrationId: `nar-${n}` });
  syncChat();
  return card;
}
/** What the GM's refresh hook does after each narrator card (refreshRollingSessionSummary): a copy of the store. */
async function refresh() { await getRollingSessionSummary({ ...stored() }); }

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
    filter: (fn) => [{ id: 'gm-1', isGM: true, active: true }].filter(fn),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.narratorContextCards`, 2);   // K = round(1.5 × 2) = 3
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 3, sessionActive: true, sessionStartedId: SESSION,
    currentSceneId: 'sc-1', sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0,
  });
  apiPost.mockImplementation(async (_url, _headers, body) => {
    if (!isSummaryCall(body)) return reply('The narrator answers.');
    return reply(/dragged off to the cells/.test(JSON.stringify(body?.messages ?? '')) ? SUMMARY_MISS : SUMMARY_HIT);
  });
});

async function playToTheMiss() {
  await narrated(1, 'Kira threads the crowded market.');                 await refresh();
  await narrated(2, 'The clerk pockets the bribe and looks away.');      await refresh();
  await narrated(3, 'The guards seize Kira and she is dragged off to the cells.', 'miss'); await refresh();
  // Setup: the regen after the third card covered it.
  expect(stored().sessionSummary).toMatchObject({ sessionId: SESSION, coveredCount: 3, text: SUMMARY_MISS });
}

describe('issue #345 AA24 — a burned move\'s superseded narration leaves STORY SO FAR', () => {
  it('after the burn\'s re-narration, the next narration\'s STORY SO FAR is not the outcome the burn replaced', async () => {
    await playToTheMiss();

    await supersedeOriginalNarration({ resolutionId: 'res-3' }, { kind: 'burn' });   // the burn's supersede
    syncChat();
    expect(ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.resolutionId === 'res-3').flags[MODULE_ID].burnSuperseded).toBe(true);
    await narrated(4, 'Kira twists free and slips the guards at the gate.', 'strong_hit');   // the upgraded outcome's narration
    await refresh();

    const extras = await buildNarratorExtras('paced_narrative', stored(), { playerNarration: 'I catch my breath.' });
    expect(extras.rollingSummary).not.toMatch(/dragged off to the cells/);   // it was the superseded miss, "story so far"
  });

  it("the upgraded outcome's own re-narration is not told the replaced outcome either", async () => {
    await playToTheMiss();
    await supersedeOriginalNarration({ resolutionId: 'res-3' }, { kind: 'improve' });
    syncChat();
    // Dropped at the supersede, as the X-Card drops a summary that covered what it removed.
    expect(stored().sessionSummary).toMatchObject({ sessionId: SESSION, text: '', coveredCount: 0 });
    const extras = await buildNarratorExtras('move_resolution', stored(), { playerNarration: 'I twist free.' });
    expect(extras.rollingSummary ?? '').not.toMatch(/dragged off to the cells/);
  });

  it('control: a summary made before the burned card posted stays (it does not cover it)', async () => {
    await narrated(1, 'Kira threads the crowded market.');                 await refresh();
    await narrated(2, 'The clerk pockets the bribe and looks away.');      await refresh();
    await narrated(3, 'A third beat, and the summary covers all three.');   await refresh();
    expect(stored().sessionSummary).toMatchObject({ coveredCount: 3 });
    await narrated(4, 'The guards seize Kira and she is dragged off to the cells.', 'miss');
    await supersedeOriginalNarration({ resolutionId: 'res-4' }, { kind: 'burn' });
    syncChat();
    expect(stored().sessionSummary).toMatchObject({ coveredCount: 3 });
    expect(stored().sessionSummary.text).not.toBe('');
  });

  it('control: with no burn, the summary of the miss stands (it happened)', async () => {
    await playToTheMiss();
    await narrated(4, 'Kira paces the cell, counting the bars.');
    await refresh();

    const extras = await buildNarratorExtras('paced_narrative', stored(), { playerNarration: 'I catch my breath.' });
    expect(extras.rollingSummary).toMatch(/dragged off to the cells/);
  });
});

// The other narration an upgrade supersedes: the trigger vignette of a clock
// its reversal rewinds (issue #338 D8, resultUpgrade.js supersedeTriggerVignettes).
describe("issue #345 AA24 — a rewound clock's trigger vignette leaves STORY SO FAR", () => {
  const CLOCKS_ADVANCED = [{ _id: 't1', name: 'Reactor breach', type: 'tension', filled: 4, segments: 4, triggered: true }];

  async function vignette() {
    const card = await ChatMessage.create({
      content: '<div class="sf-clock-card"><strong>⚠ TRIGGERED — </strong><em>The reactor core vents into the lower decks.</em></div>',
      flags: { [MODULE_ID]: {
        clockCard: true, clockVignetteCard: true, narratorCard: true, clockId: 't1',
        narrationText: 'The reactor core vents into the lower decks.', sessionId: SESSION, narrationId: 'nar-trigger',
      } },
    });
    syncChat();
    return card;
  }

  beforeEach(() => {
    game.settings._store.set(KEY, { ...stored(), clocks: [{ _id: 't1', name: 'Reactor breach', type: 'tension', segments: 4, filled: 4, active: true }] });
  });

  it('a summary made from the vignette is dropped when the rewind supersedes it', async () => {
    await narrated(1, 'Kira threads the crowded market.');
    const card = await vignette();
    game.settings._store.set(KEY, { ...stored(), sessionSummary: { sessionId: SESSION, text: 'The reactor vented into the lower decks.', coveredCount: 2, updatedAt: '2026-11-01T00:00:00.000Z' } });

    await revertPayThePrice({ clocksAdvanced: CLOCKS_ADVANCED, sufferMeterDeltas: [] }, null, { kind: 'burn', failures: [] });

    expect(card.flags[MODULE_ID].burnSuperseded).toBe(true);
    expect(stored().sessionSummary).toMatchObject({ sessionId: SESSION, text: '', coveredCount: 0 });
  });

  it('control: a summary that does not cover the vignette stays', async () => {
    await narrated(1, 'Kira threads the crowded market.');
    const card = await vignette();
    game.settings._store.set(KEY, { ...stored(), sessionSummary: { sessionId: SESSION, text: 'Kira crossed the market.', coveredCount: 1, updatedAt: '2026-11-01T00:00:00.000Z' } });

    await revertPayThePrice({ clocksAdvanced: CLOCKS_ADVANCED, sufferMeterDeltas: [] }, null, { kind: 'burn', failures: [] });

    expect(card.flags[MODULE_ID].burnSuperseded).toBe(true);
    expect(stored().sessionSummary).toMatchObject({ text: 'Kira crossed the market.', coveredCount: 1 });
  });
});

// UPGRADE-REGEN-IN-FLIGHT (AA24's residual): a regen whose call is out when a
// Burn Momentum or Improve Result supersedes a card of its source was stored
// after the supersede — the summary of the replaced outcome, covering the
// re-narration's place in the count. The X-Card has a play count for this
// race (AA25); a supersede now marks the cards it has begun on, and the
// regen's reply and its chained write compare its source against them.
describe('UPGRADE-REGEN-IN-FLIGHT — a summary whose call is out when its source is superseded is not stored', () => {
  async function regenHeldWhile(during) {
    let release;
    const held = new Promise((r) => { release = r; });
    apiPost.mockImplementation(async (_url, _headers, body) => {
      if (!isSummaryCall(body)) return reply('The narrator answers.');
      await held;
      return reply(/dragged off to the cells/.test(JSON.stringify(body?.messages ?? '')) ? SUMMARY_MISS : SUMMARY_HIT);
    });
    const pending = getRollingSessionSummary({ ...stored() }, { forceRefresh: true });
    await new Promise(r => setTimeout(r, 0));
    await during();
    release();
    return pending;
  }

  it('the burn supersedes the miss while the regen\'s call is out: the summary of the miss is not stored', async () => {
    await narrated(1, 'Kira threads the crowded market.');
    await narrated(2, 'The clerk pockets the bribe and looks away.');
    await narrated(3, 'The guards seize Kira and she is dragged off to the cells.', 'miss');

    const text = await regenHeldWhile(async () => {
      await supersedeOriginalNarration({ resolutionId: 'res-3' }, { kind: 'burn' });
      syncChat();
    });

    expect(text).toBe('');
    expect(stored().sessionSummary?.text ?? '').not.toMatch(/dragged off to the cells/);
  });

  it('control: with no supersede during the call, the summary is stored', async () => {
    await narrated(1, 'Kira threads the crowded market.');
    await narrated(2, 'The clerk pockets the bribe and looks away.');
    await narrated(3, 'The guards seize Kira and she is dragged off to the cells.', 'miss');

    const text = await regenHeldWhile(async () => {});
    expect(text).toBe(SUMMARY_MISS);
    expect(stored().sessionSummary).toMatchObject({ text: SUMMARY_MISS, coveredCount: 3 });
  });
});

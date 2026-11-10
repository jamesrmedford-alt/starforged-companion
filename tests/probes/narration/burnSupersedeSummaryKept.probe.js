/**
 * PROBE — NARR-5 SUPERSEDED-NARRATION-KEPT-IN-SUMMARY (twelfth audit, narration)
 *
 * A Burn Momentum / Improve Result supersedes the move narration it replaces
 * (issue #338 D8): supersedeOriginalNarration (burnMomentum.js:729-745) flags
 * the card `burnSuperseded` — sessionNarratorCards (narrator.js:1663) leaves
 * it out of the ring and the rolling summary's SOURCE — and retracts its
 * ledger entries. The summary TEXT already made from that card is not
 * touched: nothing marks it for a regen (contrast the X-Card's
 * applyXCardToNarratorMemory, narrator.js:1813-1827, which empties a summary
 * that covered the removed card — issue #325 W06).
 *
 * The summary is keyed by a count (`coveredCount`), and the supersede keeps
 * the count: one card leaves the source, its re-narration joins it, so
 * `total - covered` is 0 and the debounce (narrator.js:2198) serves the old
 * text — the outcome the burn replaced — as STORY SO FAR in every narration
 * until K = round(1.5 × Context Cards) more cards post (30 by default), beside
 * the re-narration's opposite outcome in RECENT SCENE.
 *
 * Scenario: Context Cards 2 (K = 3). Three narrations; the summary regen
 * after the third covers it ("Kira is dragged off to the cells" — a miss).
 * The player burns momentum: the miss's narration is superseded and the
 * strong hit re-narrated ("Kira slips the guards"). The refresh after the
 * re-narration runs; the next narration's STORY SO FAR is checked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../../src/api-proxy.js';
import { postNarrationCard, getRollingSessionSummary, buildNarratorExtras } from '../../../src/narration/narrator.js';
import { supersedeOriginalNarration } from '../../../src/moves/burnMomentum.js';

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

describe('NARR-5 — a burned move\'s superseded narration stays in STORY SO FAR', () => {
  it('after the burn\'s re-narration, the next narration\'s STORY SO FAR is not the outcome the burn replaced', async () => {
    await playToTheMiss();

    await supersedeOriginalNarration({ resolutionId: 'res-3' }, { kind: 'burn' });   // the burn's supersede
    syncChat();
    expect(ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.resolutionId === 'res-3').flags[MODULE_ID].burnSuperseded).toBe(true);
    await narrated(4, 'Kira twists free and slips the guards at the gate.', 'strong_hit');   // the upgraded outcome's narration
    await refresh();

    const extras = await buildNarratorExtras('paced_narrative', stored(), { playerNarration: 'I catch my breath.' });
    expect(extras.rollingSummary).not.toMatch(/dragged off to the cells/);   // got: the superseded miss, "story so far"
  });

  it('control: with no burn, the summary of the miss stands (it happened)', async () => {
    await playToTheMiss();
    await narrated(4, 'Kira paces the cell, counting the bars.');
    await refresh();

    const extras = await buildNarratorExtras('paced_narrative', stored(), { playerNarration: 'I catch my breath.' });
    expect(extras.rollingSummary).toMatch(/dragged off to the cells/);
  });
});

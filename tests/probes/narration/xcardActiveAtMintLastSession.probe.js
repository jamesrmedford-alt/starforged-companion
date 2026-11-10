/**
 * PROBE — NARR-4 XCARD-ACTIVE-AT-MINT-LOSES-LAST-SESSION (twelfth audit, narration)
 *
 * Issue #342 Z41's fix (rollSessionIfDue, lifecycle.js:328-342: the mint
 * finalises an ended session whose summary the X-Card emptied) works only if
 * a GM resumed the X-Card first. Its regression test
 * (tests/unit/xcardAfterEndLastSession.test.js) calls `clearXCard()` — "the
 * GM resumes before the next session" — before the mint, and so does its
 * control for an X-Card played before End a Session.
 *
 * The X-Card is world state that outlives the session and the reload
 * (safety.js suppressScene: "The flag persists in game.settings until a GM
 * resumes narration"). A table that X-Cards the closing beat and calls it a
 * night leaves it active, and the next world load mints before anyone can
 * resume. The finalise then runs getRollingSessionSummary, whose reply is
 * thrown away whenever the X-Card is active at all:
 *   narrator.js:2234  if (xCardPlayCount() !== xCardPlaysAtStart || isXCardActive(null)) { … return ''; }
 * — although the play happened long before this call started and its cards
 * are already flagged xCarded (so the regen's source, sessionNarratorCards,
 * no longer holds the removed beat: W06's in-flight concern doesn't apply).
 * finalizeSessionSummary (narrator.js:2341) sets nothing, mintSession
 * (lifecycle.js:259-292) keeps a summary as LAST SESSION only when it has
 * text, and the session just played is missing from the next session's
 * [4c] LAST SESSION (Z41's symptom) — for that whole session.
 *
 * Scenario (Z41's, without the resume): a session's narrations, End a
 * Session, its closing vignette; a player X-Cards it (the beat runs back to
 * the session's last narration, which the finalised summary covered — the
 * summary is emptied); nobody resumes; the next world load mints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../../src/api-proxy.js';
import { postNarrationCard, applyNarratorSidecar } from '../../../src/narration/narrator.js';
import { suppressScene, clearXCard } from '../../../src/context/safety.js';
import { applyEndSession } from '../../../src/safety/sessionLifecycleDialogs.js';
import { rollSessionIfDue } from '../../../src/session/lifecycle.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-5';
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const flush = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };
async function waitFor(ready, ms = 3000) {
  const until = Date.now() + ms;
  while (!ready() && Date.now() < until) await new Promise(r => setTimeout(r, 5));
  return ready();
}
function syncChat() { global.game.messages = { contents: ChatMessage._created.slice() }; }
async function personSays(content) { await ChatMessage.create({ content, flags: {} }); }
async function narrate(narrationId, prose, sidecar) {
  const raw = `${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``;
  const text = applyNarratorSidecar(raw, stored(), { narrationId });
  await flush(1);
  return postNarrationCard(text, { moveId: 'compel', outcome: 'miss', _id: `res-${narrationId}` },
    stored(), { playerText: 'I press on.', playerName: 'Kira', narrationId });
}
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });
const isSummaryCall = (body) => JSON.stringify(body?.system ?? '').includes('continuity scribe');

const SUMMARY_BOTH  = "Kira reached the docks, then watched the interrogator burn the prisoner's hand with a cutting torch.";
const SUMMARY_DOCKS = 'Kira reached the docks and talked the dockmaster round.';
const VIGNETTE = 'Vex polishes a rifle in the galley, humming.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

beforeEach(() => {
  vi.clearAllMocks();
  global.Hooks.callAll ??= (event, ...args) => global.Hooks.call(event, ...args);
  ChatMessage._reset();
  game.settings._store.clear();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
    filter: (fn) => [{ id: 'gm-1', isGM: true, active: true }].filter(fn),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.sessionLogAutoWrite`, false);
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, false);
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 5, sessionActive: true, sessionStartedId: SESSION,
    lastSessionTimestamp: new Date().toISOString(),
    currentSceneId: 'sc-1', sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, previousSessionSummary: null,
  });
  apiPost.mockImplementation(async (_url, _headers, body) => {
    if (!isSummaryCall(body)) return reply(VIGNETTE);
    const given = JSON.stringify(body?.messages ?? '');
    return reply(/cutting torch/.test(given) ? SUMMARY_BOTH : SUMMARY_DOCKS);
  });
});

async function playThenEndThenXCard() {
  await narrate('nar-docks', 'The dockmaster waves you in.', {
    newTruths: [{ subject: 'the dockmaster', fact: 'Owes the crew a favour' }], stateChanges: [],
  });
  await personSays('I head for the cells.');
  await narrate('nar-torch', 'The interrogator lifts the cutting torch.', {
    newTruths: [{ subject: 'the prisoner', fact: 'His hand was burned with a cutting torch' }], stateChanges: [],
  });
  syncChat();
  await applyEndSession({}, { local: true });
  await waitFor(() => ChatMessage._created.some(m => m.flags?.[MODULE_ID]?.vignetteKind === 'npc_end'));
  await flush();
  syncChat();
  expect(stored().sessionSummary).toMatchObject({ sessionId: SESSION, text: SUMMARY_BOTH, coveredCount: 2 });

  await suppressScene({}, { local: true });            // a player X-Cards the closing vignette
  await flush();
  syncChat();
  // Setup (Z41's): the beat ran back to the covered narration — the summary is emptied, a regen due.
  expect(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.xCarded).map(m => m.flags[MODULE_ID].narrationId))
    .toContain('nar-torch');
  expect(stored().sessionSummary.text).toBe('');
}

async function mintNextSession() {
  const copy = foundry.utils.deepClone(stored());
  expect(await rollSessionIfDue(copy)).toBe(true);
  return copy;
}

describe('NARR-4 — an X-Card still active at the next mint', () => {
  it('nobody resumed before the next world load: LAST SESSION is still the ended session\'s summary', async () => {
    await playThenEndThenXCard();
    expect(stored().xCardActive).toBe(true);           // the table called it a night; no one pressed Resume

    const next = await mintNextSession();

    expect(next.previousSessionSummary?.sessionId ?? null, 'LAST SESSION is the ended session').toBe(SESSION);
    expect(next.previousSessionSummary?.text ?? '').toBe(SUMMARY_DOCKS);   // without the removed beat
  });

  it('control (Z41\'s own case): the GM resumed before the next world load — LAST SESSION is kept', async () => {
    await playThenEndThenXCard();
    await clearXCard();

    const next = await mintNextSession();

    expect(next.previousSessionSummary).toMatchObject({ sessionId: SESSION, text: SUMMARY_DOCKS });
  });
});

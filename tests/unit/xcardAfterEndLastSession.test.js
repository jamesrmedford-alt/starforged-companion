/**
 * Issue #342 Z41 XCARD-AFTER-END-LOSES-LAST-SESSION (the eleventh audit's
 * CONT-2).
 *
 * End a Session finalises the rolling summary, then posts the closing NPC
 * vignette a few seconds later. A player plays the X-Card on that vignette:
 * the beat it removes runs back through End's cards to the session's last
 * narration (no one spoke in between, within two minutes —
 * xCardedNarrationCards), which the finalised summary covered, so
 * applyXCardToNarratorMemory empties the summary ("the next regen reads the
 * remaining cards"). No regen came: no narrator card posts in the ended
 * session, and the next Begin a Session's mint (rollSessionIfDue) finalised
 * the summary only for a session nobody ended — End "refreshes its own". The
 * mint keeps the closing session's summary as LAST SESSION only when it has
 * text (mintSession), so the whole session was gone from LAST SESSION [4c].
 * Now the mint brings every closing session's summary up to date (a no-op
 * when it covers every card).
 *
 * Issue #345 AA57 (the last describe): the same, with the X-Card still paused
 * at the mint — and End a Session pressed while it is.
 *
 * Real producers: the narrator's sidecar apply and card, the rolling summary,
 * the real End a Session handler (its finalise and its vignette), the real
 * X-Card (suppressScene) and the real mint (rollSessionIfDue). Claude is
 * answered at apiPost.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { postNarrationCard, applyNarratorSidecar } from '../../src/narration/narrator.js';
import { suppressScene, clearXCard } from '../../src/context/safety.js';
import { applyEndSession } from '../../src/safety/sessionLifecycleDialogs.js';
import { rollSessionIfDue } from '../../src/session/lifecycle.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-5';
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const flush = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };
/** Wait (real timers, bounded) until `ready()` holds. */
async function waitFor(ready, ms = 3000) {
  const until = Date.now() + ms;
  while (!ready() && Date.now() < until) await new Promise(r => setTimeout(r, 5));
  return ready();
}

function syncChat() {
  global.game.messages = { contents: ChatMessage._created.slice() };
}

async function personSays(content) {
  await ChatMessage.create({ content, flags: {} });
}

async function narrate(narrationId, prose, sidecar) {
  const raw = `${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``;
  const text = applyNarratorSidecar(raw, stored(), { narrationId });
  await flush(1);
  return postNarrationCard(text, { moveId: 'compel', outcome: 'miss', _id: `res-${narrationId}` },
    stored(), { playerText: 'I press on.', playerName: 'Kira', narrationId });
}

const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });
const isSummaryCall = (body) => JSON.stringify(body?.system ?? '').includes('continuity scribe');

const SUMMARY_BOTH = "Kira reached the docks, then watched the interrogator burn the prisoner's hand with a cutting torch.";
const SUMMARY_DOCKS = 'Kira reached the docks and talked the dockmaster round.';
const VIGNETTE = 'Vex polishes a rifle in the galley, humming.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

beforeEach(() => {
  vi.clearAllMocks();
  // End a Session announces the gate change (Hooks.callAll); the single-client stub has only call().
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
  // The summary calls get the summary of what they were given; the vignette its prose.
  apiPost.mockImplementation(async (_url, _headers, body) => {
    if (!isSummaryCall(body)) return reply(VIGNETTE);
    const given = JSON.stringify(body?.messages ?? '');
    return reply(/cutting torch/.test(given) ? SUMMARY_BOTH : SUMMARY_DOCKS);
  });
});

/** A session: the docks, someone speaks, the torch — then End a Session and its vignette. */
async function playThenEnd() {
  await narrate('nar-docks', 'The dockmaster waves you in.', {
    newTruths: [{ subject: 'the dockmaster', fact: 'Owes the crew a favour' }], stateChanges: [],
  });
  await personSays('I head for the cells.');
  await narrate('nar-torch', 'The interrogator lifts the cutting torch.', {
    newTruths: [{ subject: 'the prisoner', fact: 'His hand was burned with a cutting torch' }], stateChanges: [],
  });
  syncChat();

  await applyEndSession({}, { local: true });
  // The closing vignette (End's setTimeout 0) narrates and posts.
  await waitFor(() => ChatMessage._created.some(m => m.flags?.[MODULE_ID]?.vignetteKind === 'npc_end'));
  await flush();
  syncChat();
  expect(stored().sessionEndedId).toBe(SESSION);
  expect(stored().sessionSummary).toMatchObject({ sessionId: SESSION, text: SUMMARY_BOTH, coveredCount: 2 });
  expect(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.vignetteKind === 'npc_end')).toHaveLength(1);
}

/** Begin a Session's mint (the world load's too), on a copy as its caller holds one. */
async function mintNextSession() {
  const copy = foundry.utils.deepClone(stored());
  expect(await rollSessionIfDue(copy)).toBe(true);
  return copy;
}

describe('Z41 — the X-Card played after End a Session', () => {
  it("the next session's LAST SESSION is the ended session's summary, without the removed beat", async () => {
    await playThenEnd();

    await suppressScene({}, { local: true });        // a player X-cards the closing vignette
    await flush();
    const removed = ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.xCarded).map(m => m.flags[MODULE_ID].narrationId ?? 'vignette');
    expect(removed).toContain('nar-torch');           // the beat ran back to the session's last narration
    expect(stored().sessionSummary.text).toBe('');    // …which the summary covered: emptied, a regen due

    await clearXCard();                               // the GM resumes before the next session
    const next = await mintNextSession();

    expect.soft(next.previousSessionSummary?.text ?? '', 'LAST SESSION text').not.toBe('');
    expect.soft(next.previousSessionSummary?.text ?? '', 'LAST SESSION text').not.toMatch(/cutting torch/);
    expect(next.previousSessionSummary?.sessionId ?? null, 'LAST SESSION is the ended session').toBe(SESSION);
  });

  it('control: with no X-Card, the mint keeps the ended session as LAST SESSION — and asks Claude for no second summary', async () => {
    await playThenEnd();
    const summaryCalls = () => apiPost.mock.calls.filter(([, , body]) => isSummaryCall(body)).length;
    const before = summaryCalls();
    const next = await mintNextSession();
    expect(next.previousSessionSummary).toMatchObject({ sessionId: SESSION, sessionNumber: 5, text: SUMMARY_BOTH });
    expect(summaryCalls()).toBe(before);   // End's finalise already covered every card
  });

  it('control: an X-Card played before End a Session leaves its finalise to summarise the rest', async () => {
    await narrate('nar-docks', 'The dockmaster waves you in.', {
      newTruths: [{ subject: 'the dockmaster', fact: 'Owes the crew a favour' }], stateChanges: [],
    });
    await personSays('I head for the cells.');
    await narrate('nar-torch', 'The interrogator lifts the cutting torch.', {
      newTruths: [{ subject: 'the prisoner', fact: 'His hand was burned with a cutting torch' }], stateChanges: [],
    });
    syncChat();
    await suppressScene({}, { local: true });
    await flush();
    syncChat();
    await clearXCard();
    await applyEndSession({}, { local: true });
    await flush(20);
    const next = await mintNextSession();
    expect(next.previousSessionSummary).toMatchObject({ sessionId: SESSION, text: SUMMARY_DOCKS });
  });
});

// Issue #345 AA57 XCARD-ACTIVE-AT-MINT-LOSES-LAST-SESSION (the twelfth audit's
// NARR-4): Z41's fix worked only once a GM had resumed. The summary's reply
// was thrown away whenever the X-Card was active at all — though the play came
// long before the call and its cards were already out of the summary's source
// — so a table that X-Cards the closing beat and calls it a night (the pause
// stands until a GM resumes; the next world load mints before anyone can) lost
// the session from LAST SESSION; so did End a Session's own refresh, pressed
// while paused. Now only a play during the call, or a source that still holds
// a removed narration, discards it.
describe('issue #345 AA57 — the X-Card still paused at the next mint', () => {
  it("nobody resumed before the next world load: LAST SESSION is still the ended session's summary, without the removed beat", async () => {
    await playThenEnd();
    await suppressScene({}, { local: true });        // a player X-cards the closing vignette
    await flush();
    syncChat();
    expect(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.xCarded).map(m => m.flags[MODULE_ID].narrationId))
      .toContain('nar-torch');                        // the beat ran back to the covered narration
    expect(stored().sessionSummary.text).toBe('');    // …the summary emptied, a regen due
    expect(stored().xCardActive).toBe(true);          // the table called it a night; no one pressed Resume

    const next = await mintNextSession();

    expect(next.previousSessionSummary?.sessionId ?? null, 'LAST SESSION is the ended session').toBe(SESSION);
    expect(next.previousSessionSummary?.text ?? '').toBe(SUMMARY_DOCKS);
  });

  it("End a Session pressed while paused: End's own summary is kept, without the removed beat", async () => {
    await narrate('nar-docks', 'The dockmaster waves you in.', {
      newTruths: [{ subject: 'the dockmaster', fact: 'Owes the crew a favour' }], stateChanges: [],
    });
    await personSays('I head for the cells.');
    await narrate('nar-torch', 'The interrogator lifts the cutting torch.', {
      newTruths: [{ subject: 'the prisoner', fact: 'His hand was burned with a cutting torch' }], stateChanges: [],
    });
    syncChat();
    await suppressScene({}, { local: true });        // the X-Card on the torch — nobody resumes
    await flush();
    syncChat();
    expect(stored().xCardActive).toBe(true);

    await applyEndSession({}, { local: true });
    await flush(20);
    expect(stored().sessionSummary).toMatchObject({ sessionId: SESSION, text: SUMMARY_DOCKS, coveredCount: 1 });

    const next = await mintNextSession();
    expect(next.previousSessionSummary).toMatchObject({ sessionId: SESSION, text: SUMMARY_DOCKS });
  });
});

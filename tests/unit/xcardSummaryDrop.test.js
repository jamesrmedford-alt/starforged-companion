// tests/unit/xcardSummaryDrop.test.js
//
// The rolling session summary never brings back a beat the X-Card removed
// (issue #325 W06; issue #321 U07 — "the summary reset if it covered it").
//
// - A move in flight across the X-Card: applyXCardToNarratorMemory emptied
//   the summary as `{ ...summary, text: '', coveredCount: 0 }`, keeping the
//   old `updatedAt`; persistResolution's merge keeps "whichever record has
//   the newer updatedAt" — a tie, so the working copy's summary, text and
//   all, was written back, and its restored coverage held the regen off for
//   another K cards. The emptied summary is now stamped now (`updatedAt`,
//   `xCardedAt`).
// - A regen in flight: getRollingSessionSummary read the session's cards
//   (the removed one among them) before its Haiku call and stored the reply
//   after the X-Card with no check. A reply that returns after an X-Card
//   play is now discarded.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import {
  postNarrationCard,
  applyNarratorSidecar,
  getRollingSessionSummary,
  registerRollingSummaryRefreshHook,
} from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { persistResolution } from '../../src/moves/persistResolution.js';
import { serialiseCampaignStateWrite } from '../../src/multiplayer/campaignStateChain.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-2';
const stored = () => game.settings.get(MODULE_ID, 'campaignState');

function syncChat() {
  global.game.messages = { contents: ChatMessage._created.slice() };
}

async function personSays(content) {
  await ChatMessage.create({ content, flags: {} });
}

async function narrate(narrationId, prose, sidecar) {
  const raw = `${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``;
  const text = applyNarratorSidecar(raw, stored(), { narrationId });
  await new Promise(r => setTimeout(r, 0));
  return postNarrationCard(text, { moveId: 'compel', outcome: 'miss', _id: `res-${narrationId}` },
    stored(), { playerText: 'I press on.', playerName: 'Kira', narrationId });
}

const TORCH = {
  newTruths:    [{ subject: 'the prisoner', fact: 'His hand was burned with a cutting torch' }],
  stateChanges: [],
  sceneFrame:   { location: 'the interrogation cell', present: ['the prisoner'], situation: 'The torch hovers' },
};
const DOCKS = { newTruths: [{ subject: 'the dockmaster', fact: 'Owes the crew a favour' }], stateChanges: [] };

const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 2, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, sessionLogs: { [SESSION]: [] },
  });
});

describe("the X-Card's summary drop survives a move resolved across it", () => {
  it("persistResolution does not write back the summary the X-Card emptied", async () => {
    await narrate('nar-torch', 'The interrogator lifts the cutting torch.', TORCH);
    syncChat();
    // The real producer: a regen after the torch card — it covers it.
    apiPost.mockResolvedValueOnce(reply("Kira watched the interrogator burn the prisoner's hand with a cutting torch."));
    await getRollingSessionSummary(stored(), { forceRefresh: true });
    expect(stored().sessionSummary).toMatchObject({ coveredCount: 1 });
    expect(stored().sessionSummary.text).toContain('cutting torch');

    const workingCopy = JSON.parse(JSON.stringify(stored()));   // a move pipeline's snapshot, in flight

    await suppressScene({}, { local: true });
    expect(stored().sessionSummary.text).toBe('');                // control: the X-Card dropped it

    await persistResolution({
      _id: 'res-2', moveId: 'face_danger', outcome: 'strong_hit',
      consequences: { momentumChange: 0, healthChange: 0, spiritChange: 0, supplyChange: 0 },
    }, workingCopy);

    expect(stored().sessionSummary.text).not.toContain('cutting torch');
  });
});

describe('a summary regen in flight when the X-Card is played', () => {
  it('does not store a summary of the narration the X-Card removed', async () => {
    game.settings._store.set(`${MODULE_ID}.narratorContextCards`, 1);   // K = round(1.5 × 1) = 2
    registerRollingSummaryRefreshHook();

    await narrate('nar-docks', 'The dockmaster waves you in.', DOCKS);
    await personSays('I head for the cells.');
    const torchCard = await narrate('nar-torch', 'The interrogator lifts the cutting torch.', TORCH);
    syncChat();

    let release;
    apiPost.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    Hooks.call('createChatMessage', torchCard);                      // the card posts → the regen's Haiku call is out
    await new Promise(r => setTimeout(r, 0));
    expect(apiPost).toHaveBeenCalledTimes(1);

    await suppressScene({}, { local: true });                         // the X-Card, while the call is out
    expect(ChatMessage._created.find(m => m.flags[MODULE_ID]?.narrationId === 'nar-torch').flags[MODULE_ID].xCarded).toBe(true);

    release(reply("Kira reached the docks, then watched the prisoner's hand burned with a cutting torch."));
    for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));

    expect(stored().sessionSummary?.text ?? '').not.toContain('cutting torch');
  });
});

describe('control: a regen with no X-Card played meanwhile is stored', () => {
  it('stores the summary', async () => {
    await narrate('nar-docks', 'The dockmaster waves you in.', DOCKS);
    syncChat();
    apiPost.mockResolvedValueOnce(reply('Kira reached the docks.'));
    await getRollingSessionSummary(stored(), { forceRefresh: true });
    expect(stored().sessionSummary).toMatchObject({ text: 'Kira reached the docks.', coveredCount: 1 });
  });
});

// Issue #345 AA25: the reply-time check ran before the summary's write waited
// its turn on the GM's write chain, and the chained write never checked again
// — an X-Card played meanwhile jumps the chain, lands first, and the summary
// made from the narration it removed was written over the pause.
describe('issue #345 AA25 — a regen whose write waits on the chain while the X-Card is played', () => {
  const ticks = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

  it("is stored nowhere: not over the pause, not on the caller's copy", async () => {
    await narrate('nar-torch', 'The interrogator lifts the cutting torch.', TORCH);
    syncChat();
    let releaseAhead;
    const ahead = serialiseCampaignStateWrite(() => new Promise((r) => { releaseAhead = r; }), 'a write ahead');
    apiPost.mockResolvedValueOnce(reply("Kira watched the interrogator burn the prisoner's hand with a cutting torch."));

    const copy = { ...stored() };
    const pending = getRollingSessionSummary(copy, { forceRefresh: true });
    await ticks();                                                      // the reply is in; its write waits behind the one ahead
    expect(apiPost).toHaveBeenCalledTimes(1);

    expect(await suppressScene({}, { local: true })).toBe(true);        // the pause jumps the chain
    releaseAhead();
    await ahead;

    expect(await pending).toBe('');
    expect(stored().xCardActive).toBe(true);
    expect(stored().sessionSummary?.text ?? '').not.toContain('cutting torch');
    expect(copy.sessionSummary?.text ?? '').not.toContain('cutting torch');
  });

  it('control: with no X-Card played while it waits, the write lands once the one ahead has', async () => {
    await narrate('nar-docks', 'The dockmaster waves you in.', DOCKS);
    syncChat();
    let releaseAhead;
    const ahead = serialiseCampaignStateWrite(() => new Promise((r) => { releaseAhead = r; }), 'a write ahead');
    apiPost.mockResolvedValueOnce(reply('Kira reached the docks.'));

    const copy = { ...stored() };
    const pending = getRollingSessionSummary(copy, { forceRefresh: true });
    await ticks();
    releaseAhead();
    await ahead;

    expect(await pending).toBe('Kira reached the docks.');
    expect(stored().sessionSummary).toMatchObject({ text: 'Kira reached the docks.', coveredCount: 1 });
    expect(copy.sessionSummary?.text).toBe('Kira reached the docks.');
  });
});

// Issue #345 AA57: the reply was also discarded whenever the X-Card was still
// active — though the play came before the call and its cards were already
// out of the source — so the next session's mint, or End a Session pressed
// while paused, stored no summary of the session just played. What still
// discards it: a play during the call (above), or a source that holds a
// narration the pause removed (its write names it before the card is flagged).
describe('issue #345 AA57 — a regen made while an earlier X-Card is still paused', () => {
  it('is stored: the narration it removed is out of the source', async () => {
    await narrate('nar-docks', 'The dockmaster waves you in.', DOCKS);
    await personSays('I head for the cells.');
    await narrate('nar-torch', 'The interrogator lifts the cutting torch.', TORCH);
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);   // the X-Card on the torch; nobody resumes
    expect(stored().xCardActive).toBe(true);
    apiPost.mockResolvedValueOnce(reply('Kira reached the docks.'));

    expect(await getRollingSessionSummary(stored(), { forceRefresh: true })).toBe('Kira reached the docks.');
    expect(stored().sessionSummary).toMatchObject({ text: 'Kira reached the docks.', coveredCount: 1 });
    expect(JSON.stringify(apiPost.mock.calls.at(-1)?.[2] ?? '')).not.toContain('cutting torch');
  });

  it("control: is discarded while its source still holds a narration the pause removed (the pause's write lands before the card is flagged)", async () => {
    await narrate('nar-docks', 'The dockmaster waves you in.', DOCKS);
    await narrate('nar-torch', 'The interrogator lifts the cutting torch.', TORCH);
    syncChat();
    // The pause's write has landed — it names the torch's narration — and its card is not flagged yet.
    game.settings._store.set(KEY, { ...stored(), xCardActive: true, xCardPlays: 1, xCardedNarrationIds: ['nar-torch'] });
    apiPost.mockResolvedValueOnce(reply("Kira watched the interrogator burn the prisoner's hand with a cutting torch."));

    expect(await getRollingSessionSummary(stored(), { forceRefresh: true })).toBe('');
    expect(stored().sessionSummary?.text ?? '').not.toContain('cutting torch');
  });
});

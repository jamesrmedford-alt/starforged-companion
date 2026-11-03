// tests/probes/narration/xcardSummaryResurrected.probe.js
//
// PROBE (eighth audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// Two ways the rolling session summary brings back a beat the X-Card removed
// (issue #321 U07 — "the summary reset if it covered it"):
//
// NR XCARD-SUMMARY-MERGE-REVERT — What the user does: the rolling summary was
// last regenerated after the torch narration (it covers it). A move is in
// flight (the pipeline holds its working copy); a player plays the X-Card on
// the torch beat. What happens: applyXCardToNarratorMemory
// (src/narration/narrator.js) empties the summary as `{ ...summary, text: '',
// coveredCount: 0 }` — keeping the old `updatedAt`. The move's
// persistResolution merges its working copy onto the store
// (mergeWithLatestState, src/moves/persistResolution.js), and its
// sessionSummary rule is "whichever record has the newer updatedAt" — a tie,
// so the working copy's summary, text and all, is written back. STORY SO FAR
// carries the removed beat again, and since coveredCount is restored, the
// debounce does not regenerate it for another K cards.
//
// NR XCARD-SUMMARY-INFLIGHT — What the user does: the torch narration posts
// and, being the K-th card, triggers the summary regen on the GM
// (registerRollingSummaryRefreshHook); a player plays the X-Card on it while
// the Haiku call is out. What happens: getRollingSessionSummary read the
// session's cards (the torch card among them) before its call and, when the
// reply returns, writes `stored.sessionSummary = record` with no X-Card check
// — the summary of the removed beat lands after the X-Card dropped it.
//
// What should happen, both: once the X-Card is played on a narration, no
// summary that covers it is stored.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../../src/api-proxy.js';
import {
  postNarrationCard,
  applyNarratorSidecar,
  getRollingSessionSummary,
  registerRollingSummaryRefreshHook,
} from '../../../src/narration/narrator.js';
import { suppressScene } from '../../../src/context/safety.js';
import { persistResolution } from '../../../src/moves/persistResolution.js';

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

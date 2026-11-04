/**
 * PROBE — NARRATION-04 RECAP-CACHE-CACHED-MUTATE and NARRATION-05 SPOTLIGHT-PERSIST-CACHED
 *
 * rules/foundry-api.md: `game.settings.get` returns an object setting's cached
 * value by reference — set nothing on it before a write that can fail. Two
 * persists in src/narration/narrator.js still do exactly what the known
 * SUMMARY-PERSIST-CACHED bullet describes for the rolling summary:
 *
 *   NARRATION-04 — getCampaignRecap (narrator.js:1467-1475): after the recap's
 *   Claude call it reads the cached campaignState, sets `campaignRecapCache`
 *   on it and writes it. A refused write leaves the GM's cache holding a recap
 *   cache the world lacks: the next session-opening narration on this client
 *   serves it (sessionStartRecap reads the cache first, narrator.js:514-519),
 *   every other client regenerates or has none, and the `!recap campaign` /
 *   ↻ Refresh that follows on this client finds the cache "current" and makes
 *   no call.
 *
 *   NARRATION-05 — maybeAdvanceSpotlight (narrator.js:3831-3836): sets
 *   `spotlight` on the cached campaignState and fires the write without
 *   awaiting it. A refused write leaves the GM's pointer one step ahead of
 *   the world's, so this client's rotation and the world's disagree about who
 *   is next (every narration reads its caller's copy, which on the GM is this
 *   cache). It is also gated on plain `game.user.isGM`, not isCanonicalGM.
 *
 * Correct behaviour (asserted): after a refused write this client's cached
 * value is what it was before the write (equal to the world).
 *
 * Controls: a write that lands sets both.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/narration/narratorPersistsCachedStore.probe.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});
vi.mock('../../../src/character/chronicle.js', async () => {
  const actual = await vi.importActual('../../../src/character/chronicle.js');
  return {
    ...actual,
    getChronicleEntries: vi.fn(async () => [
      { id: 'e1', timestamp: '2026-01-01T00:00:00Z', sessionNumber: 1, text: 'Set out from Bleakhold with stolen charts.' },
    ]),
  };
});

import { apiPost } from '../../../src/api-proxy.js';
import { buildNarratorExtras, getCampaignRecap, campaignRecapCacheKey } from '../../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });
const RELEVANCE = { resolvedClass: 'interaction', entityIds: [], entityTypes: [], matchedNames: [], needsClarification: false, referenceType: 'none' };

let setSpy = null;

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.user = { id: 'gm-1', isGM: true };
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.actors._set('a-actor', makeTestActor({ id: 'a-actor', name: 'Kira' }));
  game.actors._set('b-actor', makeTestActor({ id: 'b-actor', name: 'Orin' }));
});
afterEach(() => { setSpy?.mockRestore(); setSpy = null; });

/** Refuse every campaignState write (a server error, a dropped socket). */
function refuseCampaignStateWrites() {
  const realSet = game.settings.set;
  setSpy = vi.spyOn(game.settings, 'set').mockImplementation(async (mod, key, val) => {
    if (key === 'campaignState') throw new Error('Setting [campaignState] could not be saved: the server refused the write');
    return realSet.call(game.settings, mod, key, val);
  });
}

describe('PROBE NARRATION-04 RECAP-CACHE-CACHED-MUTATE', () => {
  it("a refused cache write leaves no recap cache on the GM's cached campaignState", async () => {
    const cs = { currentSessionId: 'sess-2', sessionNumber: 2, characterIds: [] };
    game.settings._store.set(KEY, cs);
    apiPost.mockResolvedValue(reply('The crew fled Bleakhold with the charts.'));
    refuseCampaignStateWrites();
    expectConsoleError(/getCampaignRecap failed/);

    await getCampaignRecap(cs, { forceRefresh: true });

    expect(apiPost).toHaveBeenCalledTimes(1);                     // the recap was generated
    // Expected: no cache (the world took no write). Today: the cache carries the recap.
    expect(game.settings.get(MODULE_ID, 'campaignState').campaignRecapCache).toBeUndefined();
  });

  it('control: a write that lands caches the recap', async () => {
    const cs = { currentSessionId: 'sess-2', sessionNumber: 2, characterIds: [] };
    game.settings._store.set(KEY, cs);
    apiPost.mockResolvedValue(reply('The crew fled Bleakhold with the charts.'));

    const text = await getCampaignRecap(cs, { forceRefresh: true });

    expect(text).toBe('The crew fled Bleakhold with the charts.');
    expect(game.settings.get(MODULE_ID, 'campaignState').campaignRecapCache?.text).toBe(text);
  });
});

describe('PROBE NARRATION-05 SPOTLIGHT-PERSIST-CACHED', () => {
  // A current recap cache, so the session's first narration makes no recap call here.
  const stateWithScene = async () => {
    const cs = {
      currentSessionId: 'sess-2', sessionNumber: 2, currentSceneId: 'sc-1',
      sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
      spotlight: { lastActorId: null, sceneId: 'sc-1' },
    };
    cs.campaignRecapCache = { text: 'Last time: the charts.', generatedAt: new Date().toISOString(), ...(await campaignRecapCacheKey(cs)) };
    return cs;
  };

  it("a refused pointer write leaves the GM's cached spotlight pointer as it was", async () => {
    game.settings._store.set(KEY, await stateWithScene());
    refuseCampaignStateWrites();
    // The move pipeline narrates from its own working copy; the pointer persist writes the cache.
    const workingCopy = JSON.parse(JSON.stringify(game.settings.get(MODULE_ID, 'campaignState')));

    const extras = await buildNarratorExtras('move_resolution', workingCopy, {
      character: { name: 'Orin', actorId: 'b-actor' }, relevance: RELEVANCE,
    });
    await new Promise(r => setTimeout(r, 0));                     // the fire-and-forget persist settles

    expect(extras.spotlightBlock).toContain('## SPOTLIGHT');     // the nudge was built for a 2-PC scene
    // Expected: as before the refused write. Today: lastActorId 'a-actor' on the GM only.
    expect(game.settings.get(MODULE_ID, 'campaignState').spotlight).toEqual({ lastActorId: null, sceneId: 'sc-1' });
  });

  it('control: a write that lands advances the stored pointer', async () => {
    game.settings._store.set(KEY, await stateWithScene());
    const workingCopy = JSON.parse(JSON.stringify(game.settings.get(MODULE_ID, 'campaignState')));

    await buildNarratorExtras('move_resolution', workingCopy, {
      character: { name: 'Orin', actorId: 'b-actor' }, relevance: RELEVANCE,
    });
    await new Promise(r => setTimeout(r, 0));

    expect(game.settings.get(MODULE_ID, 'campaignState').spotlight).toEqual({ lastActorId: 'a-actor', sceneId: 'sc-1' });
  });
});

/**
 * STARFORGED COMPANION
 * tests/unit/narratorPersistsCopy.test.js
 *
 * rules/foundry-api.md: `game.settings.get` returns an object setting's cached
 * value by reference — set nothing on it before a write that can fail.
 *
 *   Issue #331 X25 (RECAP-CACHE-CACHED-MUTATE) — getCampaignRecap set
 *   `campaignRecapCache` on the cached campaignState and wrote it: a refused
 *   write left the GM's cache holding a recap the world lacked, served as
 *   current on this client alone.
 *   Issue #331 X26 (SPOTLIGHT-PERSIST-CACHED) — maybeAdvanceSpotlight set the
 *   advanced pointer on the cached campaignState and fired its write: a
 *   refused write left this GM's rotation a step ahead of the world's.
 *
 * Both write a copy of the latest store now, from the canonical GM.
 */

/* global expectConsoleError, makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});
vi.mock('../../src/character/chronicle.js', async () => {
  const actual = await vi.importActual('../../src/character/chronicle.js');
  return {
    ...actual,
    getChronicleEntries: vi.fn(async () => [
      { id: 'e1', timestamp: '2026-01-01T00:00:00Z', sessionNumber: 1, text: 'Set out from Bleakhold with stolen charts.' },
    ]),
  };
});

import { apiPost } from '../../src/api-proxy.js';
import { buildNarratorExtras, getCampaignRecap, campaignRecapCacheKey } from '../../src/narration/narrator.js';

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
  // The canonical GM writes (isCanonicalGM): one active GM, this one.
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
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

describe('X25 — the campaign recap cache is written on a copy', () => {
  it("a refused cache write leaves no recap cache on the GM's cached campaignState", async () => {
    const cs = { currentSessionId: 'sess-2', sessionNumber: 2, characterIds: [] };
    game.settings._store.set(KEY, cs);
    apiPost.mockResolvedValue(reply('The crew fled Bleakhold with the charts.'));
    refuseCampaignStateWrites();
    expectConsoleError(/getCampaignRecap failed/);

    await getCampaignRecap(cs, { forceRefresh: true });

    expect(apiPost).toHaveBeenCalledTimes(1);                     // the recap was generated
    // No cache: the world took no write. (It used to carry the recap.)
    expect(game.settings.get(MODULE_ID, 'campaignState').campaignRecapCache).toBeUndefined();
  });

  it('a GM that is not the canonical one generates the recap but leaves the cache to the canonical GM', async () => {
    global.game.users = [{ id: 'gm-0', isGM: true, active: true }, { id: 'gm-1', isGM: true, active: true }];
    const cs = { currentSessionId: 'sess-2', sessionNumber: 2, characterIds: [] };
    game.settings._store.set(KEY, cs);
    apiPost.mockResolvedValue(reply('The crew fled Bleakhold with the charts.'));
    const set = vi.spyOn(game.settings, 'set');

    await getCampaignRecap(cs, { forceRefresh: true });

    expect(set).not.toHaveBeenCalledWith(MODULE_ID, 'campaignState', expect.anything());
    set.mockRestore();
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

describe('X26 — the spotlight pointer is written on a copy', () => {
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
    // As before the refused write (it used to say 'a-actor' on this GM only).
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

/**
 * STARFORGED COMPANION
 * tests/unit/narratorFallback.test.js
 *
 * Regression coverage for the v1.3.4 Quench failure where the fallback
 * narrator card was missing the sessionId flag — the live test
 * `narrator card has sessionId flag` saw `undefined` and failed.
 *
 * The fix gave postFallbackCard the same flag shape as the success-path
 * narrator cards (sessionId, sessionNumber, narrationText, moveId,
 * outcome, matchedEntityIds, timestamp).
 *
 * That shape includes `narratorCard: true`, which the session recap (its
 * move count) and the live Quench pipeline test rely on — but
 * rules/narrator-memory.md invariant 1 says a fallback card is not narrator
 * memory. Its `narrationFallback` flag keeps it out of the recent-narration
 * ring, the rolling summary and the session's first-narration check
 * (sessionNarratorCards — issue #321 U35: the "narration unavailable" line
 * reached RECENT SCENE, and a failed first narration cancelled the session's
 * campaign recap).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import {
  narrateResolution,
  getRecentNarrationContext,
  buildNarratorExtras,
  campaignRecapCacheKey,
} from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
  // narrationEnabled defaults true; we only need an empty store.
});

describe('narrateResolution fallback card', () => {
  it('posts a fallback card when no Claude API key is configured', async () => {
    // No claudeApiKey set → falls through to postFallbackCard.
    const resolution = {
      _id:          'res-fb-1',
      moveId:       'gather_information',
      moveName:     'Gather Information',
      outcome:      'weak_hit',
      outcomeLabel: 'Weak Hit',
    };
    const campaignState = {
      currentSessionId: 'session-abc',
      sessionNumber:    7,
    };

    await narrateResolution(resolution, campaignState);

    const last = ChatMessage._created.at(-1);
    expect(last).toBeDefined();
    const flags = last?.flags?.[MODULE_ID];
    expect(flags?.narratorCard).toBe(true);
    expect(flags?.narrationFallback).toBe(true);
  });

  it('fallback card carries sessionId — regression for v1.3.4 Quench failure', async () => {
    const resolution = {
      _id:    'res-fb-2',
      moveId: 'face_danger',
      moveName: 'Face Danger',
      outcome: 'miss',
      outcomeLabel: 'Miss',
    };
    const campaignState = {
      currentSessionId: 'session-xyz',
      sessionNumber:    3,
    };

    await narrateResolution(resolution, campaignState);
    const flags = ChatMessage._created.at(-1)?.flags?.[MODULE_ID];

    // The Quench `narrator card has sessionId flag` assertion expects a
    // string here. Pre-fix it was undefined.
    expect(flags?.sessionId).toBe('session-xyz');
    expect(flags?.sessionNumber).toBe(3);
    expect(flags?.moveId).toBe('face_danger');
    expect(flags?.outcome).toBe('miss');
    expect(flags?.resolutionId).toBe('res-fb-2');
    expect(Array.isArray(flags?.matchedEntityIds)).toBe(true);
    expect(typeof flags?.timestamp).toBe('string');
  });

  it('fallback card sessionId is null (not undefined) when campaignState is empty', async () => {
    const resolution = { _id: 'r3', moveId: 'compel', moveName: 'Compel', outcome: 'weak_hit', outcomeLabel: 'Weak Hit' };
    await narrateResolution(resolution, {});

    const flags = ChatMessage._created.at(-1)?.flags?.[MODULE_ID];
    // Recap reader uses string equality on sessionId; null is unambiguous
    // and matches the success-path narratorCard shape. Undefined would
    // not.
    expect(flags?.sessionId).toBeNull();
  });
});

describe('a fallback card is not narrator memory (issue #321 U35)', () => {
  const SESSION = 'sess-5';
  const resolution = {
    _id: 'res-1', moveId: 'face_danger', moveName: 'Face Danger',
    outcome: 'strong_hit', outcomeLabel: 'Strong Hit', playerNarration: 'I vault the gap.',
  };

  beforeEach(() => {
    game.actors._reset();
    global.game.messages = { contents: [] };
  });

  /** The first move of the session fails to narrate (no key here; an overload or timeout in play). */
  async function failFirstNarration(campaignState) {
    await narrateResolution(resolution, campaignState);
    const fallback = ChatMessage._created.at(-1);
    expect(fallback.flags[MODULE_ID].narrationFallback).toBe(true);
    global.game.messages = { contents: ChatMessage._created.slice() };
    return fallback;
  }

  it('the "narration unavailable" line never reaches the recent-narration ring', async () => {
    await failFirstNarration({ currentSessionId: SESSION, sessionNumber: 5 });
    const ring = getRecentNarrationContext(SESSION, 20);
    expect(ring).not.toContain('narration unavailable');
  });

  it('a failed first narration does not cost the session its campaign recap', async () => {
    const campaignState = { currentSessionId: SESSION, sessionNumber: 5 };
    // A recap made from the chronicle as it stands (no PCs → empty chronicle).
    campaignState.campaignRecapCache = { text: 'Previously: the beacon at Bleakhold went dark.', ...(await campaignRecapCacheKey(campaignState)) };

    // Sanity: with no narrator card yet, the session's first narration gets the recap.
    const before = await buildNarratorExtras('paced_narrative', campaignState, { playerNarration: 'x' });
    expect(before.campaignRecap).toContain('beacon at Bleakhold');

    await failFirstNarration(campaignState);

    // The next real narration is still the session's first narration.
    const after = await buildNarratorExtras('paced_narrative', campaignState, { playerNarration: 'x' });
    expect(after.campaignRecap).toContain('beacon at Bleakhold');
  });
});

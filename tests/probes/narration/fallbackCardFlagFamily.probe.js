// tests/probes/narration/fallbackCardFlagFamily.probe.test.js
//
// PROBE (audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// FALLBACK-IN-RING: rules/narrator-memory.md invariant 1 — "Every chat card
// whose prose is fiction the narrator should remember MUST carry
// narratorCard / narrationText / sessionId. Error/fallback cards must NOT."
// postFallbackCard (src/narration/narrator.js) stamps the full family with
// narrationText "<Move>: <Outcome> — narration unavailable.", and
// sessionNarratorCards has no narrationFallback exclude. So:
//   - the failure line is fed to later narrations as RECENT SCENE prose (and
//     to the rolling summary's source);
//   - sessionStartRecap treats the failed attempt as "the session's first
//     narration happened" and never gives the session its campaign recap.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import {
  narrateResolution,
  getRecentNarrationContext,
  buildNarratorExtras,
  campaignRecapCacheKey,
} from '../../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';
const SESSION = 'sess-5';

const resolution = {
  _id: 'res-1', moveId: 'face_danger', moveName: 'Face Danger',
  outcome: 'strong_hit', outcomeLabel: 'Strong Hit', playerNarration: 'I vault the gap.',
};

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();      // no claudeApiKey → narrateResolution posts its fallback card
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

describe('a fallback card is not narrator memory', () => {
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

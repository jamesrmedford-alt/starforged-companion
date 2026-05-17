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
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { narrateResolution } from '../../src/narration/narrator.js';

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

    await narrateResolution(resolution, {}, campaignState);

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

    await narrateResolution(resolution, {}, campaignState);
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
    await narrateResolution(resolution, {}, {});

    const flags = ChatMessage._created.at(-1)?.flags?.[MODULE_ID];
    // Recap reader uses string equality on sessionId; null is unambiguous
    // and matches the success-path narratorCard shape. Undefined would
    // not.
    expect(flags?.sessionId).toBeNull();
  });
});

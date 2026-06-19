/**
 * STARFORGED COMPANION
 * tests/unit/narrateClockAdvancement.test.js
 *
 * Unit coverage for narrateClockAdvancement — the 2-3 sentence narrative
 * vignette generated when a clock segment fills.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { narrateClockAdvancement } from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
});

describe('narrateClockAdvancement', () => {
  it('returns null when no API key is configured', async () => {
    // No claudeApiKey in settings → getApiKey() returns null
    const result = await narrateClockAdvancement({
      clock: { name: 'Syndicate Hunt', type: 'campaign', filled: 3, segments: 6, triggered: false },
      campaignState: {},
    });
    expect(result).toBeNull();
  });

  it('returns null when narration is disabled', async () => {
    game.settings._store.set('starforged-companion.claudeApiKey', 'sk-test');
    game.settings._store.set('starforged-companion.narrationEnabled', false);
    const result = await narrateClockAdvancement({
      clock: { name: 'Syndicate Hunt', type: 'campaign', filled: 3, segments: 6, triggered: false },
      campaignState: {},
    });
    expect(result).toBeNull();
  });

  it('returns null when the X-Card is active', async () => {
    game.settings._store.set('starforged-companion.claudeApiKey', 'sk-test');
    const result = await narrateClockAdvancement({
      clock: { name: 'Syndicate Hunt', type: 'campaign', filled: 3, segments: 6, triggered: false },
      campaignState: { xCardActive: true },
    });
    expect(result).toBeNull();
  });
});

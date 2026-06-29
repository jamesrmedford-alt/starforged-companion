/**
 * STARFORGED COMPANION
 * tests/unit/narrateVowSwearing.test.js
 *
 * Unit coverage for the vow-swearing scene: the pure Iron-truth user-message
 * builder and the guard rails on narrateVowSwearing (mirrors
 * narrateClockAdvancement.test.js).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { narrateVowSwearing, buildVowSwearingUserMessage } from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
});

describe('buildVowSwearingUserMessage', () => {
  it('grounds the scene in the Iron truth when present', () => {
    const msg = buildVowSwearingUserMessage(
      { name: 'Rescue the hostages', rank: 'dangerous' },
      { title: 'Oath-blades', description: 'Vows are sworn on a drawn blade; forsaken blades are abandoned.' },
    );
    expect(msg).toContain('Rescue the hostages');
    expect(msg).toContain('(dangerous)');
    expect(msg).toContain('Oath-blades');
    expect(msg).toContain('drawn blade');
  });

  it('falls back to a generic iron oath when no truth is established', () => {
    const msg = buildVowSwearingUserMessage({ name: 'Find the beacon' }, null);
    expect(msg).toContain('Find the beacon');
    expect(msg).toMatch(/sworn upon iron/i);
  });

  it('handles a missing vow name', () => {
    expect(buildVowSwearingUserMessage(null, null)).toMatch(/swearing a vow/i);
  });
});

describe('narrateVowSwearing — guards (no API call)', () => {
  const vow = { name: 'Rescue the hostages', rank: 'dangerous' };

  it('returns null when no API key is configured', async () => {
    expect(await narrateVowSwearing({ vow, campaignState: {} })).toBeNull();
  });

  it('returns null when narration is globally disabled', async () => {
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-test');
    game.settings._store.set(`${MODULE_ID}.narrationEnabled`, false);
    expect(await narrateVowSwearing({ vow, campaignState: {} })).toBeNull();
  });

  it('returns null when the vow-swearing toggle is off', async () => {
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-test');
    game.settings._store.set(`${MODULE_ID}.vowSwearingNarration`, false);
    expect(await narrateVowSwearing({ vow, campaignState: {} })).toBeNull();
  });

  it('returns null when the X-Card is active', async () => {
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-test');
    expect(await narrateVowSwearing({ vow, campaignState: { xCardActive: true } })).toBeNull();
  });
});

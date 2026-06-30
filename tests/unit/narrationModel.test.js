/**
 * STARFORGED COMPANION
 * tests/unit/narrationModel.test.js
 *
 * narrationDisablesThinking — narration is short prose, so thinking-by-default
 * models (Sonnet 5, Opus 4.7/4.8) run with thinking disabled to stay fast and
 * to stop adaptive thinking from eating the max_tokens cap and truncating the
 * prose + memory sidecar. The older offered models already default to
 * thinking-off, so their request is left untouched.
 */

import { describe, it, expect } from 'vitest';
import { narrationDisablesThinking } from '../../src/narration/narrator.js';

describe('narrationDisablesThinking', () => {
  it('disables thinking for Sonnet 5 and Opus 4.7/4.8 (adaptive-by-default)', () => {
    expect(narrationDisablesThinking('claude-sonnet-5')).toBe(true);
    expect(narrationDisablesThinking('claude-opus-4-7')).toBe(true);
    expect(narrationDisablesThinking('claude-opus-4-8')).toBe(true);
  });

  it('leaves the older offered models untouched (already thinking-off)', () => {
    expect(narrationDisablesThinking('claude-sonnet-4-5-20250929')).toBe(false);
    expect(narrationDisablesThinking('claude-haiku-4-5-20251001')).toBe(false);
  });

  it('is safe on empty / nullish input', () => {
    expect(narrationDisablesThinking('')).toBe(false);
    expect(narrationDisablesThinking(undefined)).toBe(false);
    expect(narrationDisablesThinking(null)).toBe(false);
  });
});

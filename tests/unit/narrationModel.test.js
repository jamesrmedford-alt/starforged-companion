/**
 * STARFORGED COMPANION
 * tests/unit/narrationModel.test.js
 *
 * narrationDisablesThinking / thinkingOffFor — every call is short prose or a
 * short structured reply, so thinking-by-default models run with extended
 * thinking off, in the form each accepts: "disabled" for Sonnet 5, Opus
 * 4.7/4.8 and Haiku 5.5, "between_tools" for Sonnet 5.5 (which 400s on
 * "disabled"). The older models already default to thinking-off, so their
 * request is left untouched.
 */

import { describe, it, expect } from 'vitest';
import { narrationDisablesThinking, thinkingOffFor } from '../../src/narration/thinking.js';

describe('narrationDisablesThinking', () => {
  it('turns thinking off for the thinking-by-default models', () => {
    expect(narrationDisablesThinking('claude-sonnet-5')).toBe(true);
    expect(narrationDisablesThinking('claude-opus-4-7')).toBe(true);
    expect(narrationDisablesThinking('claude-opus-4-8')).toBe(true);
    expect(narrationDisablesThinking('claude-haiku-5-5')).toBe(true);
    expect(narrationDisablesThinking('claude-sonnet-5-5')).toBe(true);
  });

  it('leaves the older offered models untouched (already thinking-off)', () => {
    expect(narrationDisablesThinking('claude-sonnet-4-5-20250929')).toBe(false);
    expect(narrationDisablesThinking('claude-haiku-4-5-20251001')).toBe(false);
  });

  // Issue #286 F7: a prefix match sent "disabled" to Sonnet 5.5, a 400.
  it('matches exact ids only — never a model that cannot turn thinking off', () => {
    expect(narrationDisablesThinking('claude-opus-4-8-20260101')).toBe(true);
    expect(narrationDisablesThinking('claude-opus-5-5')).toBe(false);
    expect(narrationDisablesThinking('claude-fable-5-1')).toBe(false);
    expect(narrationDisablesThinking('claude-sonnet-5-5-1')).toBe(false);
  });

  it('is safe on empty / nullish input', () => {
    expect(narrationDisablesThinking('')).toBe(false);
    expect(narrationDisablesThinking(undefined)).toBe(false);
    expect(narrationDisablesThinking(null)).toBe(false);
  });
});

describe('thinkingOffFor — the form each model accepts', () => {
  it('Sonnet 5.5 is sent "between_tools", never "disabled"', () => {
    expect(thinkingOffFor('claude-sonnet-5-5')).toEqual({ thinking: { type: 'between_tools' } });
  });

  it('Haiku 5.5, Sonnet 5 and Opus 4.7/4.8 are sent "disabled"', () => {
    for (const m of ['claude-haiku-5-5', 'claude-sonnet-5', 'claude-opus-4-7', 'claude-opus-4-8']) {
      expect(thinkingOffFor(m)).toEqual({ thinking: { type: 'disabled' } });
    }
  });

  it('the older models get nothing', () => {
    expect(thinkingOffFor('claude-sonnet-4-5-20250929')).toEqual({});
    expect(thinkingOffFor('claude-haiku-4-5-20251001')).toEqual({});
    expect(thinkingOffFor('claude-opus-5-5')).toEqual({});
  });
});

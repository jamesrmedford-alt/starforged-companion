/**
 * STARFORGED COMPANION
 * tests/unit/narratorPrompt.test.js
 *
 * Unit tests for src/narration/narratorPrompt.js — pure string builders.
 * No API calls, no async needed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildNarratorSystemPrompt,
  buildNarratorUserMessage,
  resolveNarrationPerspective,
} from '../../src/narration/narratorPrompt.js';


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeCampaignState(overrides = {}) {
  return {
    safety:        { lines: [], veils: [], privateLines: [] },
    worldTruths:   {},
    connectionIds: [],
    ...overrides,
  };
}

function makeNarratorSettings(overrides = {}) {
  return {
    narrationTone:         'wry',
    narrationPerspective:  'auto',
    narrationLength:       3,
    narrationInstructions: '',
    ...overrides,
  };
}

function makeResolution(overrides = {}) {
  return {
    moveName:           'Face Danger',
    outcomeLabel:       'Strong Hit',
    outcome:            'strong_hit',
    loremasterContext:  'Move: Face Danger\nOutcome: Strong Hit',
    ...overrides,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// game.users mock — for resolveNarrationPerspective
// ─────────────────────────────────────────────────────────────────────────────

let mockUsers = [];
const originalUsers = global.game.users;

beforeEach(() => {
  mockUsers = [];
  global.game.users = {
    filter: (fn) => mockUsers.filter(fn),
  };
});


// ─────────────────────────────────────────────────────────────────────────────
// buildNarratorSystemPrompt()
// ─────────────────────────────────────────────────────────────────────────────

describe('buildNarratorSystemPrompt()', () => {
  it('returns a non-empty string', () => {
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState(),
      makeNarratorSettings(),
      null,
    );
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('includes NARRATOR ROLE section', () => {
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState(),
      makeNarratorSettings(),
      null,
    );
    expect(prompt).toContain('NARRATOR ROLE');
  });

  it('includes SAFETY CONFIGURATION when campaignState.safety.lines is set', () => {
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState({
        safety: { lines: ['No real-world atrocities'], veils: [], privateLines: [] },
      }),
      makeNarratorSettings(),
      null,
    );
    expect(prompt).toContain('SAFETY CONFIGURATION');
    expect(prompt).toContain('No real-world atrocities');
  });

  it('includes WORLD TRUTHS when campaignState.worldTruths has entries', () => {
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState({
        worldTruths: {
          cataclysm: { title: 'The Sundering shattered the old worlds' },
        },
      }),
      makeNarratorSettings(),
      null,
    );
    expect(prompt).toContain('WORLD TRUTHS');
    expect(prompt).toContain('Sundering shattered');
  });

  it('custom instructions appear in output when provided', () => {
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState(),
      makeNarratorSettings({
        narrationInstructions: 'Avoid purple prose. Stay terse.',
      }),
      null,
    );
    expect(prompt).toContain('Avoid purple prose');
  });

  it('does not call fetch (pure string building — no async needed)', () => {
    // Simply confirm the function returns synchronously and is not a Promise.
    const result = buildNarratorSystemPrompt(
      makeCampaignState(),
      makeNarratorSettings(),
      null,
    );
    expect(typeof result).toBe('string');
    expect(result instanceof Promise).toBe(false);
  });

  it('includes CAMPAIGN RECAP block when recap text is provided', () => {
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState(),
      makeNarratorSettings(),
      null,
      'Last session, the crew docked at the Forge.',
    );
    expect(prompt).toContain('CAMPAIGN RECAP');
    expect(prompt).toContain('Last session');
  });

  it('includes ACTIVE CONNECTIONS when connectionIds is non-empty', () => {
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState({ connectionIds: ['c1', 'c2'] }),
      makeNarratorSettings(),
      null,
    );
    expect(prompt).toContain('ACTIVE CONNECTIONS');
  });

  it('includes CHARACTER block with name and meters when character is provided', () => {
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState(),
      makeNarratorSettings(),
      {
        name:        'Kira',
        description: 'A grizzled scavenger.',
        narratorNotes: 'Wary of strangers.',
        meters: { health: 4, spirit: 5, supply: 3, momentum: 2 },
      },
    );
    expect(prompt).toContain('CHARACTER');
    expect(prompt).toContain('Kira');
    expect(prompt).toContain('grizzled scavenger');
    expect(prompt).toContain('Wary of strangers');
    expect(prompt).toContain('Health 4/5');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// resolveNarrationPerspective()
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveNarrationPerspective()', () => {
  it('returns "second_person" for "auto" with 1 active non-GM user', () => {
    mockUsers = [{ active: true, isGM: false }];
    expect(resolveNarrationPerspective('auto')).toBe('second_person');
  });

  it('returns "third_person" for "auto" with 2+ active non-GM users', () => {
    mockUsers = [
      { active: true, isGM: false },
      { active: true, isGM: false },
      { active: true, isGM: true }, // GM ignored
    ];
    expect(resolveNarrationPerspective('auto')).toBe('third_person');
  });

  it('returns "second_person" when explicitly set, regardless of user count', () => {
    mockUsers = [
      { active: true, isGM: false },
      { active: true, isGM: false },
    ];
    expect(resolveNarrationPerspective('second_person')).toBe('second_person');
  });

  it('returns "third_person" when explicitly set, regardless of user count', () => {
    mockUsers = [{ active: true, isGM: false }];
    expect(resolveNarrationPerspective('third_person')).toBe('third_person');
  });

  it('defaults to "second_person" when game.users is unavailable', () => {
    global.game.users = undefined;
    expect(resolveNarrationPerspective('auto')).toBe('second_person');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// buildNarratorUserMessage()
// ─────────────────────────────────────────────────────────────────────────────

describe('buildNarratorUserMessage()', () => {
  it('includes move name in output', () => {
    const msg = buildNarratorUserMessage(
      makeResolution({ loremasterContext: 'Move: Secure an Advantage\nOutcome: Strong Hit' }),
      'I duck behind the crate.',
      3,
    );
    expect(msg).toContain('Secure an Advantage');
  });

  it('includes outcome label in output', () => {
    const msg = buildNarratorUserMessage(
      makeResolution({ loremasterContext: 'Move: Face Danger\nOutcome: Weak Hit' }),
      'I push through.',
      3,
    );
    expect(msg).toContain('Weak Hit');
  });

  it('includes player narration text when provided', () => {
    const msg = buildNarratorUserMessage(
      makeResolution(),
      'I draw my blade and step forward.',
      3,
    );
    expect(msg).toContain('I draw my blade');
  });

  it('returns non-empty string for strong_hit outcome', () => {
    const msg = buildNarratorUserMessage(
      makeResolution({
        outcome:           'strong_hit',
        outcomeLabel:      'Strong Hit',
        loremasterContext: 'Move: Face Danger\nOutcome: Strong Hit',
      }),
      'I leap.',
      3,
    );
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('returns non-empty string for weak_hit outcome', () => {
    const msg = buildNarratorUserMessage(
      makeResolution({
        outcome:           'weak_hit',
        outcomeLabel:      'Weak Hit',
        loremasterContext: 'Move: Face Danger\nOutcome: Weak Hit',
      }),
      'I leap.',
      3,
    );
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('returns non-empty string for miss outcome', () => {
    const msg = buildNarratorUserMessage(
      makeResolution({
        outcome:           'miss',
        outcomeLabel:      'Miss',
        loremasterContext: 'Move: Face Danger\nOutcome: Miss',
      }),
      'I leap.',
      3,
    );
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });
});

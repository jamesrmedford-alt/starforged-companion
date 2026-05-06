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
  formatEntityCard,
  formatOracleSeedsBlock,
  NARRATOR_PERMISSIONS,
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
  it('returns "second_person" for "auto" with 1 active user (even if GM)', () => {
    mockUsers = [{ active: true, isGM: true }];
    expect(resolveNarrationPerspective('auto')).toBe('second_person');
  });

  it('returns "third_person" for "auto" with 2+ active users (GM counts)', () => {
    mockUsers = [
      { active: true, isGM: false },
      { active: true, isGM: true },
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


// ─────────────────────────────────────────────────────────────────────────────
// NARRATOR_PERMISSIONS
// ─────────────────────────────────────────────────────────────────────────────

describe('NARRATOR_PERMISSIONS', () => {
  it('discovery block contains "You MAY introduce"', () => {
    expect(NARRATOR_PERMISSIONS.discovery).toContain('You MAY introduce');
  });

  it('interaction block contains "do not contradict"', () => {
    expect(NARRATOR_PERMISSIONS.interaction.toLowerCase()).toContain('do not contradict');
  });

  it('embellishment block forbids new named entities', () => {
    expect(NARRATOR_PERMISSIONS.embellishment.toLowerCase()).toContain('no new named entity');
  });

  it('permissions appear after safety, before world truths in the system prompt', () => {
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState({
        safety: { lines: ['No real-world atrocities'], veils: [], privateLines: [] },
        worldTruths: { cataclysm: { title: 'The Sundering' } },
      }),
      makeNarratorSettings(),
      null,
      '',
      { narratorClass: 'interaction' },
    );
    const safetyIdx      = prompt.indexOf('SAFETY CONFIGURATION');
    const permissionsIdx = prompt.indexOf('NARRATOR PERMISSIONS');
    const truthsIdx      = prompt.indexOf('WORLD TRUTHS');
    expect(safetyIdx).toBeGreaterThan(-1);
    expect(permissionsIdx).toBeGreaterThan(safetyIdx);
    expect(truthsIdx).toBeGreaterThan(permissionsIdx);
  });

  it('omits the permissions block when no narratorClass is supplied', () => {
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState(),
      makeNarratorSettings(),
      null,
    );
    expect(prompt).not.toContain('NARRATOR PERMISSIONS');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// formatEntityCard
// ─────────────────────────────────────────────────────────────────────────────

describe('formatEntityCard', () => {
  function makeConnection(overrides = {}) {
    return {
      _id:  'conn-1',
      name: 'Sable',
      role: 'AI navigator',
      relationshipType: 'Neutral-wary',
      motivation: 'Unknown',
      description: 'Lean, calculating.',
      canonicalLocked: false,
      generativeTier: [],
      ...overrides,
    };
  }

  it('includes entity name and type label', () => {
    const card = formatEntityCard(makeConnection(), 'connection');
    expect(card).toContain('SABLE');
    expect(card).toContain('Connection');
  });

  it('includes canonical fields', () => {
    const card = formatEntityCard(makeConnection(), 'connection');
    expect(card).toContain('Role: AI navigator');
    expect(card).toContain('Disposition: Neutral-wary');
    expect(card).toContain('Description: Lean, calculating.');
  });

  it('includes generative tier entries (up to 5)', () => {
    const card = formatEntityCard(makeConnection({
      generativeTier: [
        { sessionNum: 1, detail: 'Detail one' },
        { sessionNum: 2, detail: 'Detail two' },
        { sessionNum: 3, detail: 'Detail three' },
        { sessionNum: 4, detail: 'Detail four' },
        { sessionNum: 5, detail: 'Detail five' },
        { sessionNum: 6, detail: 'Detail six' },
        { sessionNum: 7, detail: 'Detail seven' },
      ],
    }), 'connection');
    expect(card).toContain('NARRATOR-ADDED');
    // Five most-recent unpinned entries — sessions 7,6,5,4,3
    expect(card).toContain('Detail seven');
    expect(card).toContain('Detail three');
    // Sessions 1 and 2 should be dropped
    expect(card).not.toContain('Detail one');
    expect(card).not.toContain('Detail two');
  });

  it('orders pinned entries before unpinned (and pinned survives the cap)', () => {
    const card = formatEntityCard(makeConnection({
      generativeTier: [
        { sessionNum: 1, detail: 'Old pinned',   pinned: true  },
        { sessionNum: 5, detail: 'Recent A',     pinned: false },
        { sessionNum: 6, detail: 'Recent B',     pinned: false },
        { sessionNum: 7, detail: 'Recent C',     pinned: false },
        { sessionNum: 8, detail: 'Recent D',     pinned: false },
        { sessionNum: 9, detail: 'Recent E',     pinned: false },
        { sessionNum: 10, detail: 'Recent F',    pinned: false },
      ],
    }), 'connection');
    // Pinned entry survives despite being oldest
    expect(card).toContain('Old pinned');
    expect(card).toContain('📌');
    // Pinned appears before the most recent unpinned
    const pinnedIdx = card.indexOf('Old pinned');
    const recentIdx = card.indexOf('Recent F');
    expect(pinnedIdx).toBeGreaterThan(-1);
    expect(recentIdx).toBeGreaterThan(pinnedIdx);
  });

  it('canonicalLocked: true → "do not contradict" label', () => {
    const card = formatEntityCard(makeConnection({ canonicalLocked: true }), 'connection');
    expect(card.toLowerCase()).toContain('do not contradict');
  });

  it('canonicalLocked: false → "established — prefer consistency" label', () => {
    const card = formatEntityCard(makeConnection({ canonicalLocked: false }), 'connection');
    expect(card.toLowerCase()).toContain('established');
    expect(card.toLowerCase()).toContain('prefer consistency');
  });

  it('omits the generative tier section when the array is empty', () => {
    const card = formatEntityCard(makeConnection({ generativeTier: [] }), 'connection');
    expect(card).not.toContain('NARRATOR-ADDED');
  });

  it('omits promoted entries from the visible generative tier', () => {
    const card = formatEntityCard(makeConnection({
      generativeTier: [
        { sessionNum: 1, detail: 'Now canonical', promoted: true, promotedAt: '2025-01-01' },
        { sessionNum: 2, detail: 'Still soft' },
      ],
    }), 'connection');
    expect(card).not.toContain('Now canonical');
    expect(card).toContain('Still soft');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// formatOracleSeedsBlock
// ─────────────────────────────────────────────────────────────────────────────

describe('formatOracleSeedsBlock', () => {
  it('returns empty string when seeds are null', () => {
    expect(formatOracleSeedsBlock(null)).toBe('');
    expect(formatOracleSeedsBlock(undefined)).toBe('');
  });

  it('returns empty string when both results and names are empty', () => {
    expect(formatOracleSeedsBlock({ results: [], names: [] })).toBe('');
  });

  it('renders results and a name suggestion', () => {
    const block = formatOracleSeedsBlock({
      results: ['Character role: Captain', 'Character goal: Protect a secret'],
      names:   ['Kael'],
      context: 'make_a_connection',
    });
    expect(block).toContain('ORACLE SEEDS');
    expect(block).toContain('Character role: Captain');
    expect(block).toContain('Name suggestion: Kael');
  });

  it('uses the plural form when multiple names are suggested', () => {
    const block = formatOracleSeedsBlock({
      results: [],
      names:   ['Kael', 'Astra'],
    });
    expect(block).toContain('Name suggestions: Kael, Astra');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// buildNarratorSystemPrompt — extras integration
// ─────────────────────────────────────────────────────────────────────────────

describe('buildNarratorSystemPrompt extras', () => {
  it('injects entity cards under the ENTITIES IN SCENE header', () => {
    const card = formatEntityCard({
      name: 'Sable', role: 'AI navigator', generativeTier: [], canonicalLocked: false,
    }, 'connection');
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState(), makeNarratorSettings(), null, '',
      { narratorClass: 'interaction', entityCards: [card] },
    );
    expect(prompt).toContain('ENTITIES IN SCENE');
    expect(prompt).toContain('Sable'.toUpperCase());
  });

  it('injects oracle seeds block before world truths', () => {
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState({
        worldTruths: { cataclysm: { title: 'The Sundering' } },
      }),
      makeNarratorSettings(), null, '',
      {
        narratorClass: 'discovery',
        oracleSeeds:   { results: ['Character role: Captain'], names: [] },
      },
    );
    const seedsIdx  = prompt.indexOf('ORACLE SEEDS');
    const truthsIdx = prompt.indexOf('WORLD TRUTHS');
    expect(seedsIdx).toBeGreaterThan(-1);
    expect(truthsIdx).toBeGreaterThan(seedsIdx);
  });

  it('injects current location card under CURRENT LOCATION header', () => {
    const card = formatEntityCard({
      name: 'Bleakhold', location: 'Planetside', generativeTier: [], canonicalLocked: false,
    }, 'settlement');
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState(), makeNarratorSettings(), null, '',
      { narratorClass: 'interaction', currentLocationCard: card },
    );
    expect(prompt).toContain('CURRENT LOCATION');
    expect(prompt).toContain('BLEAKHOLD');
  });
});

/**
 * STARFORGED COMPANION
 * tests/unit/narratorPrompt.test.js
 *
 * Unit tests for src/narration/narratorPrompt.js — pure string builders.
 * No API calls, no async needed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  appendSidecarInstruction,
  buildNarratorSystemPrompt,
  buildPartyBlock,
  buildNarratorUserMessage,
  buildPacedNarrativeUserMessage,
  buildSceneUserMessage,
  resolveNarrationPerspective,
  formatEntityCard,
  formatOracleSeedsBlock,
  formatRecentOraclesBlock,
  formatActiveThreatsBlock,
  formatFactionLandscapeBlock,
  formatEstablishedLoreBlock,
  sanitizePlayerText,
  stripHtml,
  NARRATOR_PERMISSIONS,
  buildShipPositionLine,
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
    narrationLevity:       'default',
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

  // PLAYTEST-1712 S — the inciting incident must be injected as durable canon
  // into every narrator call so it can't age out of the ring or be cleared at
  // scene end.
  it('includes the CAMPAIGN PREMISE block when campaignState.incitingIncident is set', () => {
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState({
        incitingIncident: {
          prose:  'Councilor Vex was murdered three cycles ago aboard Paradox Station.',
          vow:    { statement: 'Expose who killed Vex', rank: 'dangerous' },
          clock:  { label: 'The cover-up deepens', segments: 6 },
          immediateCrisis: { label: 'Lyssa flees the station', segments: 4 },
          target: { name: 'Administrator Lyssa Chen', description: 'station authority' },
        },
      }),
      makeNarratorSettings(),
      null,
    );
    expect(prompt).toContain('CAMPAIGN PREMISE');
    expect(prompt).toContain('three cycles ago');                 // the fact that drifted
    expect(prompt).toContain('Administrator Lyssa Chen');
    expect(prompt).toContain('Expose who killed Vex');
    expect(prompt).toContain('The cover-up deepens');
    expect(prompt).toContain('Lyssa flees the station');   // #248 immediate crisis in premise
  });

  it('omits the CAMPAIGN PREMISE block when no inciting incident is recorded', () => {
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState(),               // incitingIncident undefined
      makeNarratorSettings(),
      null,
    );
    expect(prompt).not.toContain('CAMPAIGN PREMISE');
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

  // ── Levity axis (issue #236) — composes on top of Tone; default is a no-op ──
  describe('levity axis', () => {
    it('default levity emits no LEVITY section (no-op)', () => {
      const prompt = buildNarratorSystemPrompt(
        makeCampaignState(), makeNarratorSettings({ narrationLevity: 'default' }), null,
      );
      expect(prompt).not.toContain('### LEVITY');
    });

    it('omitting levity entirely is byte-identical to default (true no-op)', () => {
      const withDefault = buildNarratorSystemPrompt(
        makeCampaignState(), makeNarratorSettings({ narrationLevity: 'default' }), null,
      );
      const withoutField = buildNarratorSystemPrompt(
        makeCampaignState(), makeNarratorSettings(), null,
      );
      expect(withoutField).toBe(withDefault);
    });

    it('light levity injects the LEVITY section with its guidance', () => {
      const prompt = buildNarratorSystemPrompt(
        makeCampaignState(), makeNarratorSettings({ narrationLevity: 'light' }), null,
      );
      expect(prompt).toContain('### LEVITY');
      expect(prompt).toContain('Permit ordinary life');
    });

    it('playful levity injects affectionate guidance', () => {
      const prompt = buildNarratorSystemPrompt(
        makeCampaignState(), makeNarratorSettings({ narrationLevity: 'playful' }), null,
      );
      expect(prompt).toContain('### LEVITY');
      expect(prompt).toContain('affectionate detail');
    });

    it('composes with a non-wry tone — noir voice survives AND levity is layered', () => {
      const prompt = buildNarratorSystemPrompt(
        makeCampaignState(),
        makeNarratorSettings({ narrationTone: 'noir', narrationLevity: 'light' }),
        null,
      );
      expect(prompt).toContain('Noir — world-weary');       // tone preserved
      expect(prompt).toContain('Permit ordinary life');      // levity layered on
    });

    it('unknown levity value is a no-op', () => {
      const prompt = buildNarratorSystemPrompt(
        makeCampaignState(), makeNarratorSettings({ narrationLevity: 'not_real' }), null,
      );
      expect(prompt).not.toContain('### LEVITY');
    });

    it('skips the LEVITY section in meta modes (campaign_recap)', () => {
      const prompt = buildNarratorSystemPrompt(
        makeCampaignState(), makeNarratorSettings({ narrationLevity: 'light' }), null, '',
        { mode: 'campaign_recap' },
      );
      expect(prompt).not.toContain('### LEVITY');
    });
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

  it('surfaces paths, vows, connections, impacts and notes in the CHARACTER block', () => {
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState(),
      makeNarratorSettings(),
      {
        name:     'Mae Winter',
        callsign: 'Maelstrom',
        pronouns: 'she/her',
        biography: 'Grew up on the Kobayashi III.',
        notes:    'Distrusts the Hegemony.',
        stats:   { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 },
        meters:  { health: 5, spirit: 5, supply: 5, momentum: 2 },
        debilities: { wounded: true, shaken: false },
        assets: [
          { name: 'Ace',        abilities: ['When you Face Danger by guiding your vehicle, add +1.'] },
          { name: 'Blademaster', abilities: ['When you Clash or Strike in close quarters, add +1.'] },
        ],
        vows: [
          { name: 'Avenge my sister', rank: 'extreme', isBackground: true },
          { name: 'Find the relay',   rank: 'dangerous', isBackground: false, completed: false },
        ],
        connections: [
          { name: 'Dr Chen', rank: 'dangerous' },
        ],
      },
    );
    expect(prompt).toContain('Maelstrom');
    expect(prompt).toContain('she/her');
    expect(prompt).toContain('Grew up on the Kobayashi III');
    expect(prompt).toContain('Distrusts the Hegemony');
    expect(prompt).toContain('Edge 3');
    expect(prompt).toContain('wounded');               // marked impact
    expect(prompt).toContain('Ace');                   // path
    expect(prompt).toContain('Blademaster');
    expect(prompt).toContain('Background vow: Avenge my sister');
    expect(prompt).toContain('Find the relay');
    expect(prompt).toContain('Dr Chen');               // connection
  });

  // Narrator suggestion-loop remediation §A1 — role description must match
  // the call-site mode so the paced-narrative path does not inherit the
  // "narrate the mechanical consequences of move outcomes" framing.
  describe('mode parameter (suggestion-loop remediation §A1)', () => {
    it('defaults to move_resolution role description when mode is omitted', () => {
      const prompt = buildNarratorSystemPrompt(
        makeCampaignState(), makeNarratorSettings(), null,
      );
      expect(prompt).toContain('mechanical consequences of move outcomes');
    });

    it('move_resolution mode mentions mechanical consequences', () => {
      const prompt = buildNarratorSystemPrompt(
        makeCampaignState(), makeNarratorSettings(), null, '',
        { mode: 'move_resolution' },
      );
      expect(prompt).toContain('mechanical consequences of move outcomes');
    });

    it('paced_narrative mode does not mention move outcomes', () => {
      const prompt = buildNarratorSystemPrompt(
        makeCampaignState(), makeNarratorSettings(), null, '',
        { mode: 'paced_narrative' },
      );
      expect(prompt).not.toContain('mechanical consequences of move outcomes');
      expect(prompt).toContain('continue the fiction');
      expect(prompt).toContain('No move was rolled');
    });

    it('scene_interrogation mode frames the narrator as a camera', () => {
      const prompt = buildNarratorSystemPrompt(
        makeCampaignState(), makeNarratorSettings(), null, '',
        { mode: 'scene_interrogation' },
      );
      expect(prompt).not.toContain('mechanical consequences of move outcomes');
      expect(prompt).toContain('camera');
      expect(prompt).toContain("player's question");
    });

    it('falls back to move_resolution for an unknown mode value', () => {
      const prompt = buildNarratorSystemPrompt(
        makeCampaignState(), makeNarratorSettings(), null, '',
        { mode: 'not_a_real_mode' },
      );
      expect(prompt).toContain('mechanical consequences of move outcomes');
    });
  });

  // Narrator suggestion-loop remediation §A2 — anti-suggestion clause must
  // appear in every mode. Fixes the H6 finding (model generalizing the
  // closing-italic-hint pattern into inline bracketed suggestions).
  describe('anti-suggestion clause (suggestion-loop remediation §A2)', () => {
    it.each(['move_resolution', 'paced_narrative', 'scene_interrogation'])(
      '%s mode includes DEPICT, DO NOT OFFER section',
      (mode) => {
        const prompt = buildNarratorSystemPrompt(
          makeCampaignState(), makeNarratorSettings(), null, '', { mode },
        );
        expect(prompt).toContain('DEPICT, DO NOT OFFER');
        expect(prompt).toContain('Depict, do not offer');
        expect(prompt).toContain('Do not propose actions to the player');
      },
    );

    it('forbids parenthetical and italicized asides in the prose body', () => {
      const prompt = buildNarratorSystemPrompt(
        makeCampaignState(), makeNarratorSettings(), null, '',
        { mode: 'paced_narrative' },
      );
      expect(prompt).toContain('parenthetical');
      expect(prompt).toContain('italicized asides');
    });

    it('appears in the default-mode (omitted extras) call too', () => {
      const prompt = buildNarratorSystemPrompt(
        makeCampaignState(), makeNarratorSettings(), null,
      );
      expect(prompt).toContain('DEPICT, DO NOT OFFER');
    });
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// buildPacedNarrativeUserMessage — italic carve-out
// (Narrator suggestion-loop remediation §A2)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildPacedNarrativeUserMessage()', () => {
  it('omits the SUGGESTED MOVE block when no move is suggested', () => {
    const msg = buildPacedNarrativeUserMessage(
      'I lean against the bulkhead and watch.', '', 3, null,
    );
    expect(msg).not.toContain('SUGGESTED MOVE');
    expect(msg).toContain('Continue the fiction');
  });

  it('includes the suggested move block when a move is suggested', () => {
    const msg = buildPacedNarrativeUserMessage(
      'I press her on what she heard.', '', 3, 'Gather Information',
    );
    expect(msg).toContain('SUGGESTED MOVE');
    expect(msg).toContain('Gather Information');
  });

  it('reinforces the "italic only at the close" carve-out when a move is suggested', () => {
    const msg = buildPacedNarrativeUserMessage(
      'I press her on what she heard.', '', 3, 'Gather Information',
    );
    expect(msg).toContain('ONE permitted exception');
    expect(msg).toContain('"depict, do not offer"');
    expect(msg).toContain('at the very end of the narration');
    expect(msg).toMatch(/inside the[\s\n]+body of the prose/);
  });

  it('does not mention the italic carve-out when no move is suggested', () => {
    const msg = buildPacedNarrativeUserMessage(
      'I look out the viewport.', '', 3, null,
    );
    expect(msg).not.toContain('ONE permitted exception');
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

  it('interaction block instructs the narrator to honour established facts', () => {
    expect(NARRATOR_PERMISSIONS.interaction.toLowerCase()).toContain('established');
  });

  it('every permission block bans referencing module mechanics in prose', () => {
    for (const key of ['discovery', 'interaction', 'embellishment']) {
      expect(NARRATOR_PERMISSIONS[key].toLowerCase()).toContain('speak only as the fiction');
    }
  });

  it('discovery block no longer leaks "captured for the campaign record"', () => {
    expect(NARRATOR_PERMISSIONS.discovery.toLowerCase())
      .not.toContain('captured for the campaign record');
  });

  it('embellishment block forbids new named entities', () => {
    expect(NARRATOR_PERMISSIONS.embellishment.toLowerCase()).toContain('no new named entity');
  });

  it('discovery block discourages naming minor/one-off characters', () => {
    const d = NARRATOR_PERMISSIONS.discovery.toLowerCase();
    expect(d).toContain('name sparingly');
    expect(d).toContain('generic and unnamed');
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

  it('surfaces pronouns so the narrator uses them consistently (v1.7.11 finding E)', () => {
    const card = formatEntityCard(makeConnection({ pronouns: 'she/her' }), 'connection');
    expect(card).toMatch(/Pronouns: she\/her/);
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

  it('canonicalLocked: true → "established facts (fixed)" label', () => {
    const card = formatEntityCard(makeConnection({ canonicalLocked: true }), 'connection');
    expect(card.toLowerCase()).toContain('established facts');
    expect(card.toLowerCase()).toContain('fixed');
  });

  it('canonicalLocked: false → "established facts — prefer consistency" label', () => {
    const card = formatEntityCard(makeConnection({ canonicalLocked: false }), 'connection');
    expect(card.toLowerCase()).toContain('established facts');
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

  it('injects active sector anchor under ACTIVE SECTOR header', () => {
    const block =
      'Active sector: Bleakhold Reach\n' +
      'Region: Terminus\n' +
      'Trouble: Exodus relic\n' +
      'Established settlements in this sector: Bleakhold, Sable Crossing.\n' +
      'When the scene is set in a settlement, reuse one of the established ' +
      'names above. Do not invent a new settlement name for the same place.';
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState(), makeNarratorSettings(), null, '',
      { activeSectorBlock: block },
    );
    expect(prompt).toContain('## ACTIVE SECTOR');
    expect(prompt).toContain('Bleakhold Reach');
    expect(prompt).toContain('Established settlements in this sector: Bleakhold, Sable Crossing.');
    expect(prompt).toContain('Do not invent a new settlement name');
  });

  it('omits the active sector header when the block is empty', () => {
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState(), makeNarratorSettings(), null, '',
      { activeSectorBlock: '' },
    );
    expect(prompt).not.toContain('## ACTIVE SECTOR');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// sanitizePlayerText / stripHtml — HTML leak fix
// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizePlayerText()', () => {
  it('returns empty string for non-string input', () => {
    expect(sanitizePlayerText(null)).toBe('');
    expect(sanitizePlayerText(undefined)).toBe('');
    expect(sanitizePlayerText(42)).toBe('');
  });

  it('strips paragraph tags Foundry adds to chat content', () => {
    expect(sanitizePlayerText('<p>I peer at the screen.</p>'))
      .toBe('I peer at the screen.');
  });

  it('strips nested and attributed tags', () => {
    expect(sanitizePlayerText(
      '<div class="message-content"><span>She speaks slowly.</span></div>',
    )).toBe('She speaks slowly.');
  });

  it('decodes core HTML entities', () => {
    expect(sanitizePlayerText('Chen &amp; I look at the data.'))
      .toBe('Chen & I look at the data.');
    expect(sanitizePlayerText('She said &quot;run&quot; &mdash; we ran.'))
      .toContain('"run"');
    expect(sanitizePlayerText('Tab&nbsp;over&nbsp;here'))
      .toBe('Tab over here');
  });

  it('collapses whitespace to a single space', () => {
    expect(sanitizePlayerText('I   look\n\nlong  at   the   panel.'))
      .toBe('I look long at the panel.');
  });

  it('handles a realistic enriched chat message', () => {
    const input = '<p>Chen&apos;s expression shifts. &quot;What did you find?&quot;</p>';
    // &apos; is decoded too via the &#0?39; rule when written as &#39; — keep
    // the more common &apos; literal to make the assertion explicit.
    const out = sanitizePlayerText(input);
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).toContain('What did you find?');
  });
});

describe('stripHtml()', () => {
  it('preserves paragraph breaks for multi-paragraph context', () => {
    const input = '<p>First paragraph.</p>\n\n<p>Second paragraph.</p>';
    const out = stripHtml(input);
    expect(out).toContain('First paragraph.');
    expect(out).toContain('Second paragraph.');
    expect(out.split(/\n\n/).length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty string for non-string input', () => {
    expect(stripHtml(null)).toBe('');
  });
});

describe('user-message builders strip HTML at the intake', () => {
  it('buildPacedNarrativeUserMessage does not leak tags from playerText', () => {
    const msg = buildPacedNarrativeUserMessage(
      '<p>I lean toward the artifact.</p>',
      '',
      3,
      null,
    );
    expect(msg).toContain('I lean toward the artifact.');
    expect(msg).not.toContain('<p>');
    expect(msg).not.toContain('</p>');
  });

  it('buildSceneUserMessage does not leak tags from a scene question', () => {
    const msg = buildSceneUserMessage(
      '<p>What does the room smell like?</p>',
      '',
      2,
    );
    expect(msg).toContain('What does the room smell like?');
    expect(msg).not.toContain('<p>');
  });

  it('buildNarratorUserMessage does not leak tags from playerNarration', () => {
    const msg = buildNarratorUserMessage(
      { loremasterContext: 'Strong hit.' },
      '<div>She tries to keep her hands steady.</div>',
      2,
    );
    expect(msg).toContain('She tries to keep her hands steady.');
    expect(msg).not.toContain('<div>');
  });

  it('regression — narrator no longer sees the word "HTML" if user content has tags', () => {
    // Reproduces the v1.2.3 bug: Foundry chat content carries <p>...</p>;
    // the prompt formerly included the tags verbatim and the narrator
    // wrote prose like "Chen's expression shifts when you speak the HTML
    // aloud". With sanitization the tags are gone and the model has
    // nothing markup-shaped to riff on.
    const msg = buildPacedNarrativeUserMessage(
      '<p>I open my mouth to ask but nothing comes out.</p>',
      '',
      3,
    );
    expect(msg.toLowerCase()).not.toContain('<p');
    expect(msg.toLowerCase()).not.toContain('html');
  });
});

describe('buildShipPositionLine()', () => {
  const MID = 'starforged-companion';

  beforeEach(() => { game.actors._reset?.(); });

  it('emits a COMMAND VEHICLE identity line even when position is empty', () => {
    const ship = makeTestActor({
      id: 'cv', type: 'starship', name: 'Kobayashi III',
      flags: { [MID]: { ship: {
        _id: 's1', name: 'Kobayashi III', isCommandVehicle: true,
        type: 'Ironhome — Habitat', firstLook: 'Immobile', mission: 'Provide shelter',
        integrity: 5, integrityMax: 5, position: {},
      } } },
    });
    game.actors._set('cv', ship);
    const line = buildShipPositionLine({ shipIds: ['cv'] });
    expect(line).toContain('COMMAND VEHICLE: Kobayashi III');
    expect(line).toContain('Ironhome — Habitat');
    expect(line).toContain('mission: Provide shelter');
    expect(line).toContain('integrity 5/5');
  });

  it('falls back to the sole tracked starship when none is flagged', () => {
    const ship = makeTestActor({
      id: 'lone', type: 'starship', name: 'Drifter',
      flags: { [MID]: { ship: { _id: 's2', name: 'Drifter', isCommandVehicle: false, position: {} } } },
    });
    game.actors._set('lone', ship);
    const line = buildShipPositionLine({ shipIds: ['lone'] });
    expect(line).toContain('COMMAND VEHICLE: Drifter');
  });

  it('returns "" with no tracked starship, and stays ambiguous with two unflagged ships', () => {
    expect(buildShipPositionLine({ shipIds: [] })).toBe('');
    expect(buildShipPositionLine(null)).toBe('');

    const a = makeTestActor({ id: 'a', type: 'starship', name: 'A',
      flags: { [MID]: { ship: { _id: 'sa', isCommandVehicle: false, position: {} } } } });
    const b = makeTestActor({ id: 'b', type: 'starship', name: 'B',
      flags: { [MID]: { ship: { _id: 'sb', isCommandVehicle: false, position: {} } } } });
    game.actors._set('a', a);
    game.actors._set('b', b);
    expect(buildShipPositionLine({ shipIds: ['a', 'b'] })).toBe('');
  });

  it('appends a SHIP POSITION line when the position record is populated', () => {
    const ship = makeTestActor({
      id: 'cv2', type: 'starship', name: 'Pioneer',
      flags: { [MID]: { ship: {
        _id: 's3', name: 'Pioneer', isCommandVehicle: true,
        position: { freeText: 'adrift in the Bleakhold expanse' },
      } } },
    });
    game.actors._set('cv2', ship);
    const line = buildShipPositionLine({ shipIds: ['cv2'] });
    expect(line).toContain('COMMAND VEHICLE: Pioneer');
    expect(line).toContain('SHIP POSITION:');
    expect(line).toContain('adrift in the Bleakhold expanse');
  });

  it('emits the not-yet-established guard when a command vehicle exists with no position (finding #5)', () => {
    // With no position signal the narrator confidently improvised one from
    // the campaign premise; the guard line tells it not to.
    const ship = makeTestActor({
      id: 'cv3', type: 'starship', name: 'Kobayashi 8',
      flags: { [MID]: { ship: { _id: 's4', name: 'Kobayashi 8', isCommandVehicle: true, position: {} } } },
    });
    game.actors._set('cv3', ship);
    const line = buildShipPositionLine({ shipIds: ['cv3'] });
    expect(line).toContain('SHIP POSITION: not yet established');
    expect(line).toMatch(/do NOT assert or invent/);
    expect(line).toContain('!at');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// appendSidecarInstruction — narrator-memory A2/A4 contract
// ─────────────────────────────────────────────────────────────────────────────

describe('appendSidecarInstruction (narrator-memory contract)', () => {
  it('contains the required NPC location/condition emission rule', () => {
    const out = appendSidecarInstruction();
    expect(out).toMatch(/REQUIRED: when your prose establishes or changes WHERE a named/);
    expect(out).toMatch(/"attribute": "location"/);
    expect(out).toMatch(/"condition"/);
  });

  it('contains the required intent/stakes emission rule', () => {
    const out = appendSidecarInstruction();
    expect(out).toMatch(/REQUIRED: when your prose establishes WHY a character is somewhere/);
    expect(out).toMatch(/deadline/);
  });

  it('includes the sceneFrame key and rule by default', () => {
    const out = appendSidecarInstruction();
    expect(out).toContain('"sceneFrame"');
    expect(out).toMatch(/Include it on EVERY response/);
  });

  it('omits the sceneFrame key and rule when disabled', () => {
    const out = appendSidecarInstruction({ sceneFrameEnabled: false });
    expect(out).not.toContain('"sceneFrame"');
    expect(out).not.toMatch(/Include it on EVERY response/);
  });

  it('adds the premise-capture addendum in inciting_incident mode only', () => {
    const inciting = appendSidecarInstruction({ mode: 'inciting_incident' });
    expect(inciting).toMatch(/OPENING SCENE/);
    // #248 Theme A: the sidecar no longer presumes a deadline always exists.
    expect(inciting).toMatch(/genuinely time-gated/);
    expect(inciting).toMatch(/many openings have no deadline/i);

    const paced = appendSidecarInstruction({ mode: 'paced_narrative' });
    expect(paced).not.toMatch(/OPENING SCENE/);
    expect(appendSidecarInstruction()).not.toMatch(/OPENING SCENE/);
  });

  it('requires the starting ship position in inciting_incident mode (finding #5)', () => {
    // Campaigns that open in medias res never trigger the on-movement
    // emission rule, so the opening scene must establish the anchor itself.
    const inciting = appendSidecarInstruction({ mode: 'inciting_incident' });
    expect(inciting).toMatch(/REQUIRED: the player's STARTING position/);
    expect(inciting).toContain('"subject": "ship", "attribute": "position"');

    expect(appendSidecarInstruction()).not.toMatch(/STARTING position/);
  });

  it('requires identity anchor for characters and factions not in entity cards (Finding O)', () => {
    // Characters and factions named in prose who have no entity card accumulate
    // contradictory details without a newTruth anchor.
    const out = appendSidecarInstruction();
    expect(out).toMatch(/REQUIRED: the first time your prose introduces or names a character or/);
    expect(out).toMatch(/faction who does NOT appear in the ENTITIES IN SCENE cards/);
    expect(out).toMatch(/anchoring their identity/);
    // Character example
    expect(out).toContain('"subject": "Kael Dros"');
    // Faction example
    expect(out).toContain('"subject": "Khatri Syndicate"');
    expect(out).toMatch(/pursuing the PC for an outstanding debt/);
  });

  it('discourages naming minor characters, paired with the anchor rule (away from named minor)', () => {
    const out = appendSidecarInstruction();
    expect(out).toMatch(/Name sparingly/);
    expect(out).toMatch(/generic and unnamed/);
    // The nudge precedes the anchor REQUIRED rule it is paired with.
    expect(out.indexOf('Name sparingly'))
      .toBeLessThan(out.indexOf('the first time your prose introduces or names'));
  });

  it('threads mode + sceneFrameEnabled through buildNarratorSystemPrompt', () => {
    const cs = { sceneTruths: [], sceneState: { bySubject: {}, sceneId: null } };
    const withFrame = buildNarratorSystemPrompt(cs, {}, null, '', { mode: 'inciting_incident' });
    expect(withFrame).toContain('"sceneFrame"');
    expect(withFrame).toMatch(/OPENING SCENE/);

    const noFrame = buildNarratorSystemPrompt(
      cs, { factContinuitySceneFrame: false }, null, '', { mode: 'paced_narrative' },
    );
    expect(noFrame).not.toContain('"sceneFrame"');
  });
});

describe('inciting_incident role description — structured proposal block (Cluster B)', () => {
  it('specifies the vow, clock, and target line formats with their conditions', () => {
    const cs = { sceneTruths: [], sceneState: { bySubject: {}, sceneId: null } };
    const prompt = buildNarratorSystemPrompt(cs, {}, null, '', { mode: 'inciting_incident' });
    expect(prompt).toMatch(/Suggested vow: <a short first-person vow statement> \(<rank>\)/);
    expect(prompt).toMatch(/Suggested clock: <a short clock label> \(<segments> segments\)/);
    expect(prompt).toMatch(/Immediate crisis: <a short danger label> \(<segments> segments\)/);
    expect(prompt).toMatch(/Vow target: <Name> \(<pronouns/);
    // #248 Theme A: the vow clock is re-anchored on the vow's own deadline
    // (rare + coupled), not the opening scene's drama.
    expect(prompt).toMatch(/DEADLINE ON THE VOW ITSELF/);
    expect(prompt).toMatch(/RARE/);
    expect(prompt).toMatch(/4, 6, 8,\s*10, 12/);
  });

  it('describes the immediate-crisis line as a separate proximal danger (#248 Theme A)', () => {
    const cs = { sceneTruths: [], sceneState: { bySubject: {}, sceneId: null } };
    const prompt = buildNarratorSystemPrompt(cs, {}, null, '', { mode: 'inciting_incident' });
    expect(prompt).toMatch(/NOT the long vow's deadline/);
    expect(prompt).toMatch(/4, 6, 8, 10 \(fewer = more urgent\)/);
  });

  it('binds an established target NPC to its recorded role/goal/pronouns (PLAYTEST-1717 C)', () => {
    const cs = { sceneTruths: [], sceneState: { bySubject: {}, sceneId: null } };
    const prompt = buildNarratorSystemPrompt(cs, {}, null, '', { mode: 'inciting_incident' });
    expect(prompt).toMatch(/consistent with their recorded/i);
    expect(prompt).toMatch(/never reassigning or contradicting/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Multiplayer speaker disambiguation — speaker lines + party roster
// ─────────────────────────────────────────────────────────────────────────────

describe('speaker labels in user messages (multiplayer prep)', () => {
  it('buildPacedNarrativeUserMessage names the speaker and adds the attribution rule', () => {
    const msg = buildPacedNarrativeUserMessage('I hail him', '', 3, null, 'Venri Quint');
    expect(msg).toContain('## PLAYER NARRATION — spoken by Venri Quint');
    expect(msg).toContain('Venri Quint: "I hail him"');
    expect(msg).toMatch(/speaking and acting this turn is Venri Quint/);
  });

  it('buildSceneUserMessage names the asker', () => {
    const msg = buildSceneUserMessage('where am I?', '', 3, 'Kira Chen');
    expect(msg).toContain('## PLAYER QUESTION — asked by Kira Chen');
    expect(msg).toContain('Kira Chen: "where am I?"');
  });

  it('buildNarratorUserMessage names the mover', () => {
    const msg = buildNarratorUserMessage(
      { loremasterContext: 'Face Danger: weak hit' }, 'I dive for cover', 3, 'Venri Quint',
    );
    expect(msg).toContain('## PLAYER NARRATION — spoken by Venri Quint');
    expect(msg).toMatch(/The character who made this move is Venri Quint/);
  });

  it('all three builders render the unlabeled form when no speaker is known', () => {
    expect(buildPacedNarrativeUserMessage('x', '', 3, null)).toContain('## PLAYER NARRATION\n\n"x"');
    expect(buildSceneUserMessage('x', '', 3)).toContain('## PLAYER QUESTION\n\n"x"');
    expect(buildNarratorUserMessage({}, 'x', 3)).toContain('## PLAYER NARRATION\n\n"x"');
  });
});

describe('buildPartyBlock', () => {
  it('renders the roster with the speaking PC marked, for two or more PCs', () => {
    const block = buildPartyBlock({ names: ['Venri Quint', 'Kira Chen'], speaking: 'Kira Chen' });
    expect(block).toContain('## PARTY');
    expect(block).toContain('Venri Quint, Kira Chen (speaking this turn)');
    expect(block).toMatch(/never merge the player\ncharacters/);
  });

  it('returns empty for solo play and for empty/garbage input', () => {
    expect(buildPartyBlock({ names: ['Venri Quint'], speaking: 'Venri Quint' })).toBe('');
    expect(buildPartyBlock(null)).toBe('');
    expect(buildPartyBlock({ names: [] })).toBe('');
  });

  it('threads through buildNarratorSystemPrompt extras', () => {
    const cs = { sceneTruths: [], sceneState: { bySubject: {}, sceneId: null } };
    const prompt = buildNarratorSystemPrompt(cs, {}, null, '', {
      mode: 'paced_narrative',
      party: { names: ['A-One', 'B-Two'], speaking: 'A-One' },
    });
    expect(prompt).toContain('## PARTY');
    expect(prompt).toContain('A-One (speaking this turn), B-Two');

    const solo = buildNarratorSystemPrompt(cs, {}, null, '', { mode: 'paced_narrative', party: null });
    expect(solo).not.toContain('## PARTY');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Uniform permission class per mode (narrator-context unification, option B)
// Every prose mode carries a creative-latitude block: move's is dynamic, the
// rest fall back to a per-mode default. Meta modes (recap) carry none.
// ─────────────────────────────────────────────────────────────────────────────

describe('uniform permission class per mode', () => {
  const promptFor = (mode, extra = {}) =>
    buildNarratorSystemPrompt(makeCampaignState(), makeNarratorSettings(), null, '', { mode, ...extra });

  it('paced_narrative defaults to the INTERACTION block', () => {
    expect(promptFor('paced_narrative')).toContain('INTERACTION MODE');
  });

  it.each(['scene_interrogation', 'oracle_followup', 'session_vignette'])(
    '%s defaults to the EMBELLISHMENT block',
    (mode) => {
      expect(promptFor(mode)).toContain('EMBELLISHMENT MODE');
    },
  );

  it('inciting_incident defaults to the DISCOVERY block', () => {
    expect(promptFor('inciting_incident')).toContain('DISCOVERY MODE');
  });

  it('an explicit narratorClass overrides the mode default', () => {
    const prompt = promptFor('scene_interrogation', { narratorClass: 'discovery' });
    expect(prompt).toContain('DISCOVERY MODE');
    expect(prompt).not.toContain('EMBELLISHMENT MODE');
  });

  it('move_resolution with no narratorClass still omits the block (dynamic, supplied per call)', () => {
    expect(promptFor('move_resolution')).not.toContain('NARRATOR PERMISSIONS');
  });

  it('permission-block openers no longer assume a move happened', () => {
    for (const key of ['discovery', 'interaction', 'embellishment']) {
      expect(NARRATOR_PERMISSIONS[key]).not.toContain('This move');
    }
  });

  it('the discovery block requires reuse before inventing (throwaway-character rule)', () => {
    const d = NARRATOR_PERMISSIONS.discovery;
    expect(d).toContain('Reuse before you invent');
    expect(d.toLowerCase()).toContain('only when none of the established cast can');
    expect(d.toLowerCase()).toContain('scope any genuinely new entity to the active sector');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// campaign_recap — meta mode (no sidecar, no audio markup, recap role, no block)
// ─────────────────────────────────────────────────────────────────────────────

describe('campaign_recap meta mode', () => {
  const recap = (extra = {}) =>
    buildNarratorSystemPrompt(makeCampaignState(), makeNarratorSettings(), null, '', { mode: 'campaign_recap', ...extra });

  it('uses the between-sessions recap role description', () => {
    const prompt = recap();
    expect(prompt).toContain('between-sessions recap');
    expect(prompt).not.toContain('mechanical consequences of move outcomes');
  });

  it('omits the mandatory-sidecar instruction (its output is consumed verbatim)', () => {
    expect(recap()).not.toContain('MANDATORY SIDECAR');
    // Control: a normal prose mode still carries it.
    const paced = buildNarratorSystemPrompt(makeCampaignState(), makeNarratorSettings(), null, '', { mode: 'paced_narrative' });
    expect(paced).toContain('MANDATORY SIDECAR');
  });

  it('omits the NPC audio-markup instruction even when audio is enabled', () => {
    expect(recap({ audioMarkupEnabled: true })).not.toContain('NPC DIALOGUE MARKUP');
  });

  it('carries no creative-latitude permission block', () => {
    expect(recap()).not.toContain('NARRATOR PERMISSIONS');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Narrator-context audit 2026-07 — prompt-side fixes
// ─────────────────────────────────────────────────────────────────────────────

describe('STORY SO FAR caveat (summary is not a fact store)', () => {
  it('prefixes the rolling summary with the ledger-wins caveat', () => {
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState(),
      makeNarratorSettings(),
      null,
      '',
      { mode: 'paced_narrative', rollingSummary: 'The crew reached the graveyard.' },
    );
    expect(prompt).toMatch(/## STORY SO FAR \(THIS SESSION\)/);
    expect(prompt).toMatch(/Narrative texture only/);
    expect(prompt.indexOf('Narrative texture only'))
      .toBeLessThan(prompt.indexOf('The crew reached the graveyard.'));
  });
});

describe('formatRecentOraclesBlock ([3b])', () => {
  it('returns empty for no entries', () => {
    expect(formatRecentOraclesBlock([])).toBe('');
    expect(formatRecentOraclesBlock(null)).toBe('');
    expect(formatRecentOraclesBlock([{ name: '', answer: '' }])).toBe('');
  });

  it('renders one line per result plus the do-not-contradict guard', () => {
    const block = formatRecentOraclesBlock([
      { name: 'Ask the Oracle (likely)', question: 'Is the dock guarded?', answer: 'YES (MATCH — extreme/twist)' },
      { name: 'Pay the Price', question: '', answer: 'Your gear is damaged' },
    ]);
    expect(block).toMatch(/## RECENT ORACLE RESULTS/);
    expect(block).toMatch(/Ask the Oracle \(likely\): "Is the dock guarded\?" → YES \(MATCH — extreme\/twist\)/);
    expect(block).toMatch(/Pay the Price: → Your gear is damaged/);
    expect(block).toMatch(/must not contradict/);
  });

  it('is injected for live modes and skipped for meta modes', () => {
    const extras = {
      recentOracles: [{ name: 'Ask the Oracle (50/50)', question: '', answer: 'NO' }],
    };
    const live = buildNarratorSystemPrompt(
      makeCampaignState(), makeNarratorSettings(), null, '',
      { ...extras, mode: 'paced_narrative' },
    );
    expect(live).toMatch(/RECENT ORACLE RESULTS/);

    const meta = buildNarratorSystemPrompt(
      makeCampaignState(), makeNarratorSettings(), null, '',
      { ...extras, mode: 'campaign_recap' },
    );
    expect(meta).not.toMatch(/RECENT ORACLE RESULTS/);
  });
});

describe('appendSidecarInstruction — dedup + retraction rules (2026-07)', () => {
  it('tells the model not to re-emit established or CORRECTED truths', () => {
    const text = appendSidecarInstruction();
    expect(text).toMatch(/Do not re-emit a newTruth/);
    expect(text).toMatch(/Never re-assert a fact listed under CORRECTED/);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Character-detail drift fixes (2026-07)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildPartyBlock — member pronouns (CHAR-PARTY-NAMES-ONLY)', () => {
  it('renders pronouns and callsigns per member plus the binding rule', () => {
    const out = buildPartyBlock({
      members: [
        { name: 'Kira Vex', pronouns: 'she/her', callsign: 'Ghost' },
        { name: 'Dane Okoye', pronouns: 'he/him', callsign: '' },
      ],
      speaking: 'Kira Vex',
    });
    expect(out).toMatch(/Kira Vex \("Ghost", she\/her\) \(speaking this turn\)/);
    expect(out).toMatch(/Dane Okoye \(he\/him\)/);
    expect(out).toMatch(/recorded pronouns — use them/);
    expect(out).toMatch(/never infer gender from a name/);
  });

  it('keeps working with the legacy names-only shape (no binding line)', () => {
    const out = buildPartyBlock({ names: ['Kira', 'Dane'], speaking: 'Dane' });
    expect(out).toMatch(/Kira, Dane \(speaking this turn\)/);
    expect(out).not.toMatch(/recorded pronouns/);
  });

  it('omits the binding line when no member has pronouns', () => {
    const out = buildPartyBlock({
      members: [
        { name: 'Kira', pronouns: '', callsign: '' },
        { name: 'Dane', pronouns: '', callsign: '' },
      ],
    });
    expect(out).toMatch(/Kira, Dane/);
    expect(out).not.toMatch(/recorded pronouns/);
  });
});

describe('perspective pronoun rules (CHAR-PERSPECTIVE-NO-PRONOUN-RULE)', () => {
  it('third person makes recorded pronouns binding and forbids name-guessing', () => {
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState(),
      makeNarratorSettings({ narrationPerspective: 'third_person' }),
      null, '', { mode: 'paced_narrative' },
    );
    expect(prompt).toMatch(/recorded pronouns \(CHARACTER, PARTY, and ENTITIES IN\s*SCENE sections\) exactly as given/);
    expect(prompt).toMatch(/do not infer gender from their name/);
  });

  it('second person covers NPC dialogue about the player character', () => {
    const prompt = buildNarratorSystemPrompt(
      makeCampaignState(),
      makeNarratorSettings({ narrationPerspective: 'second_person' }),
      null, '', { mode: 'paced_narrative' },
    );
    expect(prompt).toMatch(/speak ABOUT the player character, use\s*the recorded pronouns/);
  });
});

describe('sidecar identity anchor includes pronouns (CHAR-SIDECAR-NO-PRONOUN-ANCHOR)', () => {
  it('requires the pronouns the prose used in the first-introduction anchor', () => {
    const out = appendSidecarInstruction();
    expect(out).toMatch(/the pronouns your prose used for them/);
    expect(out).toMatch(/dockmaster at Bleakhold\s*\n?\s*.*Station \(he\/him\)/);
    expect(out).toMatch(/regendered/);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// World Journal blocks (FACTION-PACKET-DEAD fix, 2026-07)
// ─────────────────────────────────────────────────────────────────────────────

describe('World Journal narrator blocks ([4d]-[4f])', () => {
  it('formatActiveThreatsBlock renders severity lines and the guard sentence', () => {
    const block = formatActiveThreatsBlock([
      { name: 'Reaver flotilla', severity: 'immediate', summary: 'Closing on the station' },
      { name: 'Hull rot', severity: 'looming' },
    ]);
    expect(block).toMatch(/## ACTIVE THREATS/);
    expect(block).toMatch(/- Reaver flotilla \(immediate\): Closing on the station/);
    expect(block).toMatch(/- Hull rot \(looming\)/);
    expect(block).toMatch(/do not resolve or dismiss/);
    expect(formatActiveThreatsBlock([])).toBe('');
  });

  it('formatFactionLandscapeBlock renders stance + detail and the consistency guard', () => {
    const block = formatFactionLandscapeBlock([
      { name: 'Iron Syndicate', stance: 'warring', detail: 'Guild: Mercenaries' },
      { name: 'Nameless', stance: '', detail: '' },
    ]);
    expect(block).toMatch(/## FACTION LANDSCAPE/);
    expect(block).toMatch(/- Iron Syndicate — stance: warring · Guild: Mercenaries/);
    expect(block).toMatch(/- Nameless$/m);
    expect(block).toMatch(/stances are established/);
    expect(formatFactionLandscapeBlock([])).toBe('');
  });

  it('formatEstablishedLoreBlock clips long text', () => {
    const block = formatEstablishedLoreBlock([
      { title: 'The Forge', text: 'x'.repeat(200) },
    ]);
    expect(block).toMatch(/## ESTABLISHED LORE \(recent\)/);
    expect(block).toMatch(/…/);
    expect(block.length).toBeLessThan(260);
    expect(formatEstablishedLoreBlock([])).toBe('');
  });

  it('renders for live modes and skips for meta modes', () => {
    const extras = {
      mode: 'paced_narrative',
      activeThreats:    [{ name: 'Reavers', severity: 'active', summary: '' }],
      factionLandscape: [{ name: 'Iron Syndicate', stance: 'warring', detail: '' }],
      confirmedLore:    [{ title: 'The Forge', text: 'burns' }],
    };
    const live = buildNarratorSystemPrompt(makeCampaignState(), makeNarratorSettings(), null, '', extras);
    expect(live).toMatch(/ACTIVE THREATS/);
    expect(live).toMatch(/FACTION LANDSCAPE/);
    expect(live).toMatch(/ESTABLISHED LORE/);

    const meta = buildNarratorSystemPrompt(makeCampaignState(), makeNarratorSettings(), null, '', { ...extras, mode: 'campaign_recap' });
    expect(meta).not.toMatch(/ACTIVE THREATS/);
    expect(meta).not.toMatch(/FACTION LANDSCAPE/);
  });
});

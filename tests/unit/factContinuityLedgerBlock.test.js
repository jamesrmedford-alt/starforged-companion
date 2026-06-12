/**
 * STARFORGED COMPANION
 * tests/unit/factContinuityLedgerBlock.test.js
 *
 * Unit tests for buildLedgerBlock (Section 6.5) and the master-toggle gating
 * threaded through buildNarratorSystemPrompt. fact-continuity scope §6, §12.
 */

import { describe, it, expect } from 'vitest';

import {
  buildLedgerBlock,
  buildNarratorSystemPrompt,
} from '../../src/narration/narratorPrompt.js';
import { applySidecar } from '../../src/factContinuity/ledgers.js';


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeCampaignState(overrides = {}) {
  return {
    safety:            { lines: [], veils: [], privateLines: [] },
    worldTruths:       {},
    connectionIds:     [],
    currentSessionId:  'ssn-test',
    currentSceneId:    'sc-test',
    dismissedEntities: [],
    sceneTruths:       [],
    sceneState:        { bySubject: {}, sceneId: null },
    ...overrides,
  };
}

function seed(cs, { truths = [], stateChanges = [] } = {}) {
  applySidecar({ newTruths: truths, stateChanges }, { campaignState: cs });
  return cs;
}


// ─────────────────────────────────────────────────────────────────────────────
// buildLedgerBlock — basic rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('buildLedgerBlock — basic rendering', () => {
  it('returns empty when both ledgers are empty', () => {
    const out = buildLedgerBlock(makeCampaignState());
    expect(out.combined).toBe('');
    expect(out.truths).toBe('');
    expect(out.state).toBe('');
  });

  it('renders scene-kind truths with the standard header (always in scope)', () => {
    const cs = seed(makeCampaignState(), {
      truths: [{ subject: 'scene', fact: 'The wind has died' }],
    });
    const out = buildLedgerBlock(cs);
    expect(out.header).toMatch(/ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE/);
    expect(out.truths).toMatch(/TRUTHS:\n {2}scene — The wind has died/);
    expect(out.state).toBe('');
    expect(out.combined).toMatch(/scene — The wind has died/);
  });

  it('renders scene-kind state under CURRENT STATE', () => {
    const cs = seed(makeCampaignState(), {
      stateChanges: [
        { subject: 'scene', attribute: 'lighting', value: 'dim'    },
        { subject: 'scene', attribute: 'weather',  value: 'still'  },
      ],
    });
    const out = buildLedgerBlock(cs);
    expect(out.state).toMatch(/CURRENT STATE \(right now in this scene\):/);
    expect(out.state).toMatch(/scene — lighting: dim/);
    expect(out.state).toMatch(/scene — weather: still/);
  });

  it('renders both subsections when both ledgers have content', () => {
    const cs = seed(makeCampaignState(), {
      truths:       [{ subject: 'scene', fact: 'Comms are jammed' }],
      stateChanges: [{ subject: 'scene', attribute: 'lighting', value: 'red' }],
    });
    const out = buildLedgerBlock(cs);
    expect(out.combined).toMatch(/TRUTHS:/);
    expect(out.combined).toMatch(/CURRENT STATE/);
    // Truths come before state.
    expect(out.combined.indexOf('TRUTHS:'))
      .toBeLessThan(out.combined.indexOf('CURRENT STATE (right now in this scene):'));
  });

  it('omits retracted truths', () => {
    const cs = seed(makeCampaignState(), {
      truths: [{ subject: 'scene', fact: 'The wind has died' }],
    });
    cs.sceneTruths[0].retracted = true;
    const out = buildLedgerBlock(cs);
    expect(out.combined).toBe('');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// buildLedgerBlock — filtering
// ─────────────────────────────────────────────────────────────────────────────

describe('buildLedgerBlock — filtering', () => {
  it('includes entity truths only for matched entity IDs', () => {
    const entities = [
      { entityId: 'JE.x7', entityType: 'connection', name: 'Vance' },
      { entityId: 'JE.y9', entityType: 'connection', name: 'Tora'  },
    ];
    const cs = makeCampaignState();
    applySidecar(
      { newTruths: [
          { subject: 'Vance', fact: 'Walks with a limp' },
          { subject: 'Tora',  fact: 'Carries a bowie knife' },
        ],
        stateChanges: [],
      },
      { campaignState: cs, entities },
    );
    const out = buildLedgerBlock(cs, {
      matchedEntityIds: ['JE.x7'],
      entityNamesById:  { 'JE.x7': 'Vance' },
    });
    expect(out.combined).toMatch(/Vance — Walks with a limp/);
    expect(out.combined).not.toMatch(/Tora/);
  });

  it('includes text-subject truths only when the subject string appears in playerNarration', () => {
    const cs = seed(makeCampaignState(), {
      truths: [
        { subject: 'Covenant officer', fact: 'Speaks with a Bleakhold accent' },
        { subject: 'Bartender',        fact: 'Watches the door' },
      ],
    });
    const out = buildLedgerBlock(cs, {
      playerNarration: 'The Covenant officer slides me a drink.',
    });
    expect(out.combined).toMatch(/Covenant officer — Speaks with a Bleakhold accent/);
    expect(out.combined).not.toMatch(/Bartender/);
  });

  it('always includes scene-kind subjects regardless of matchedEntityIds / playerNarration', () => {
    const cs = seed(makeCampaignState(), {
      truths: [{ subject: 'scene', fact: 'The wind has died' }],
    });
    const out = buildLedgerBlock(cs, { matchedEntityIds: [], playerNarration: '' });
    expect(out.combined).toMatch(/scene — The wind has died/);
  });

  it('treats currentLocationId as an implicit matched entity', () => {
    const entities = [
      { entityId: 'JE.loc1', entityType: 'settlement', name: 'Bleakhold' },
    ];
    const cs = makeCampaignState();
    applySidecar(
      { newTruths: [{ subject: 'Bleakhold', fact: 'Run by the Covenant' }], stateChanges: [] },
      { campaignState: cs, entities },
    );
    const out = buildLedgerBlock(cs, {
      currentLocationId: 'JE.loc1',
      entityNamesById:   { 'JE.loc1': 'Bleakhold' },
    });
    expect(out.combined).toMatch(/Bleakhold — Run by the Covenant/);
  });

  it('renders entity labels from entityNamesById, falling back to entity ID', () => {
    const entities = [{ entityId: 'JE.x7', entityType: 'connection', name: 'Vance' }];
    const cs = makeCampaignState();
    applySidecar(
      { newTruths: [{ subject: 'Vance', fact: 'a' }], stateChanges: [] },
      { campaignState: cs, entities },
    );
    const withName = buildLedgerBlock(cs, {
      matchedEntityIds: ['JE.x7'],
      entityNamesById:  { 'JE.x7': 'Vance Eustacia' },
    });
    expect(withName.combined).toMatch(/Vance Eustacia — a/);

    const withoutName = buildLedgerBlock(cs, {
      matchedEntityIds: ['JE.x7'],
    });
    expect(withoutName.combined).toMatch(/JE\.x7 — a/);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// buildLedgerBlock — token cap
// ─────────────────────────────────────────────────────────────────────────────

describe('buildLedgerBlock — maxTokens', () => {
  it('drops the state block when total tokens exceed the cap; truths remain', () => {
    const cs = makeCampaignState();
    // Push enough state to blow past 50 tokens (well below normal usage).
    const stateChanges = [];
    for (let i = 0; i < 30; i++) {
      stateChanges.push({ subject: 'scene', attribute: `attr${i}`, value: `value-with-some-length-${i}` });
    }
    applySidecar(
      { newTruths: [{ subject: 'scene', fact: 'It is raining' }], stateChanges },
      { campaignState: cs },
    );
    const out = buildLedgerBlock(cs, { maxTokens: 50 });
    expect(out.truths).toMatch(/scene — It is raining/);
    expect(out.state).toBe('');
    expect(out.tokenEstimates.state).toBe(0);
  });

  it('keeps both blocks when total tokens fit under the cap', () => {
    const cs = seed(makeCampaignState(), {
      truths:       [{ subject: 'scene', fact: 'Short' }],
      stateChanges: [{ subject: 'scene', attribute: 'a', value: 'b' }],
    });
    const out = buildLedgerBlock(cs, { maxTokens: 1000 });
    expect(out.truths).not.toBe('');
    expect(out.state).not.toBe('');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Gating — master toggle from buildNarratorSystemPrompt
// ─────────────────────────────────────────────────────────────────────────────

describe('fact-continuity gating in buildNarratorSystemPrompt', () => {
  function settings(overrides = {}) {
    return {
      narrationTone:         'wry',
      narrationPerspective:  'second_person',
      narrationLength:       3,
      narrationInstructions: '',
      ...overrides,
    };
  }

  it('emits the sidecar instruction and ledger block by default', () => {
    const cs = seed(makeCampaignState(), {
      truths: [{ subject: 'scene', fact: 'The wind has died' }],
    });
    const prompt = buildNarratorSystemPrompt(cs, settings(), null, '', {});
    expect(prompt).toMatch(/RESPONSE FORMAT — MANDATORY SIDECAR/);
    expect(prompt).toMatch(/ACTIVE SCENE — BINDING TRUTHS/);
  });

  it('omits sidecar instruction and ledger block when factContinuityEnabled is false', () => {
    const cs = seed(makeCampaignState(), {
      truths: [{ subject: 'scene', fact: 'The wind has died' }],
    });
    const prompt = buildNarratorSystemPrompt(
      cs, settings({ factContinuityEnabled: false }), null, '', {},
    );
    expect(prompt).not.toMatch(/RESPONSE FORMAT — MANDATORY SIDECAR/);
    expect(prompt).not.toMatch(/ACTIVE SCENE — BINDING TRUTHS/);
  });

  it('omits the ledger block when factContinuityLedgerInContext is false but keeps sidecar', () => {
    const cs = seed(makeCampaignState(), {
      truths: [{ subject: 'scene', fact: 'The wind has died' }],
    });
    const prompt = buildNarratorSystemPrompt(
      cs, settings({ factContinuityEnabled: true, factContinuityLedgerInContext: false }),
      null, '', {},
    );
    expect(prompt).toMatch(/RESPONSE FORMAT — MANDATORY SIDECAR/);
    expect(prompt).not.toMatch(/ACTIVE SCENE — BINDING TRUTHS/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scene frame rendering + scoping (narrator-memory A4)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildLedgerBlock — scene frame', () => {
  function frameState(overrides = {}) {
    return makeCampaignState({
      sceneFrame: {
        location:  "Lyra's graveyard",
        present:   ['Venri Quint', 'Vance'],
        situation: 'Hailing Vance across the debris field',
        sceneId:   'sc-test',
        updatedAt: 1,
      },
      ...overrides,
    });
  }

  it('renders the SCENE FRAME segment from campaignState.sceneFrame', () => {
    const out = buildLedgerBlock(frameState(), {});
    expect(out.frame).toContain('SCENE FRAME');
    expect(out.frame).toContain("Where:   Lyra's graveyard");
    expect(out.frame).toContain('Present: Venri Quint, Vance');
    expect(out.frame).toContain('Now:     Hailing Vance across the debris field');
    expect(out.combined).toContain('SCENE FRAME');
    expect(out.combined).toContain('## ACTIVE SCENE');
  });

  it('keeps a present subject\'s text-keyed entries in scope without a player mention', () => {
    const cs = frameState();
    seed(cs, {
      truths:       [{ subject: 'Vance', fact: 'Life support failing' }],
      stateChanges: [{ subject: 'Vance', attribute: 'location', value: 'aboard his shuttle' }],
    });
    // Player message does NOT name Vance — the frame keeps him in scope.
    const out = buildLedgerBlock(cs, { playerNarration: 'What does that even mean?' });
    expect(out.truths).toContain('Life support failing');
    expect(out.state).toContain('aboard his shuttle');
  });

  it('drops out-of-scope subjects when the frame is absent and nothing mentions them', () => {
    const cs = makeCampaignState();
    seed(cs, { truths: [{ subject: 'Vance', fact: 'Life support failing' }] });
    const out = buildLedgerBlock(cs, { playerNarration: 'What does that even mean?' });
    expect(out.truths).not.toContain('Life support failing');
  });

  it('omits the frame when sceneFrameEnabled is false (scoping reverts too)', () => {
    const cs = frameState();
    seed(cs, { truths: [{ subject: 'Vance', fact: 'Life support failing' }] });
    const out = buildLedgerBlock(cs, {
      playerNarration:   'What does that even mean?',
      sceneFrameEnabled: false,
    });
    expect(out.frame).toBe('');
    expect(out.combined).not.toContain('SCENE FRAME');
    expect(out.truths).not.toContain('Life support failing');
  });

  it('never drops the frame under budget pressure (state drops first)', () => {
    const cs = frameState();
    seed(cs, {
      truths:       [{ subject: 'scene', fact: 'The storm front is closing' }],
      stateChanges: [{ subject: 'scene', attribute: 'lighting', value: 'flickering red emergency strips' }],
    });
    const out = buildLedgerBlock(cs, { maxTokens: 1 });
    expect(out.frame).toContain('SCENE FRAME');
    expect(out.state).toBe('');
  });

  it('renders the frame even when both ledgers are empty', () => {
    const out = buildLedgerBlock(frameState(), {});
    expect(out.combined).toContain('SCENE FRAME');
  });
});

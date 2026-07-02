/**
 * STARFORGED COMPANION
 * tests/unit/factContinuity.test.js
 *
 * Unit tests for fact-continuity Phase A: sidecar parser + in-memory ledgers.
 * Pure JS — no Foundry globals required beyond the tests/setup.js stubs.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { extractSidecar } from '../../src/factContinuity/sidecarParser.js';
import {
  applySidecar,
  applySceneFrame,
  resolveSubject,
  promoteTextSubject,
  subjectKey,
  findEquivalentTruth,
} from '../../src/factContinuity/ledgers.js';


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeCampaignState(overrides = {}) {
  return {
    currentSessionId:  'ssn-test',
    currentSceneId:    'sc-test001',
    dismissedEntities: [],
    sceneTruths:       [],
    sceneState:        { bySubject: {}, sceneId: null },
    ...overrides,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// sidecarParser
// ─────────────────────────────────────────────────────────────────────────────

describe('extractSidecar', () => {
  it('returns rawText and null sidecar when no fenced block is present', () => {
    const text = 'A short narration with no sidecar at all.';
    const out  = extractSidecar(text);
    expect(out.prose).toBe(text);
    expect(out.sidecar).toBeNull();
    expect(out.parseError).toBeNull();
  });

  it('parses a fenced JSON block and strips it from the prose', () => {
    const text = [
      'The wind dies. Vance shifts in his seat.',
      '',
      '```json',
      '{',
      '  "newTruths": [{ "subject": "Vance", "fact": "Walks with a limp" }],',
      '  "stateChanges": [{ "subject": "scene", "attribute": "wind", "value": "still" }]',
      '}',
      '```',
    ].join('\n');

    const { prose, sidecar, parseError } = extractSidecar(text);
    expect(parseError).toBeNull();
    expect(prose).not.toMatch(/```/);
    expect(prose).toMatch(/Vance shifts in his seat\.$/);
    expect(sidecar.newTruths).toHaveLength(1);
    expect(sidecar.newTruths[0].fact).toBe('Walks with a limp');
    expect(sidecar.stateChanges[0]).toEqual({
      subject: 'scene', attribute: 'wind', value: 'still',
    });
  });

  it('takes the last fence when the model emits multiple and strips all of them', () => {
    const text = [
      'Prose chunk one.',
      '```json',
      '{ "newTruths": [{ "subject": "A", "fact": "old" }], "stateChanges": [] }',
      '```',
      'Prose chunk two.',
      '```json',
      '{ "newTruths": [{ "subject": "B", "fact": "new" }], "stateChanges": [] }',
      '```',
    ].join('\n');

    const { prose, sidecar, parseError } = extractSidecar(text);
    expect(parseError).toBeNull();
    expect(prose).not.toMatch(/```/);
    expect(sidecar.newTruths[0].fact).toBe('new');
  });

  it('returns parseError and a null sidecar when the JSON body is malformed', () => {
    const text = [
      'Some prose.',
      '```json',
      '{ "newTruths": [ "this is not a valid sidecar object',
      '```',
    ].join('\n');

    const { prose, sidecar, parseError } = extractSidecar(text);
    expect(sidecar).toBeNull();
    expect(parseError).toBeInstanceOf(Error);
    expect(prose).not.toMatch(/```/);
  });

  it('strips an unterminated ```json opening (truncated by maxTokens) and surfaces parseError', () => {
    // Reproduces the v1.3.0 Forge bug: maxTokens cut the response mid-JSON
    // so the closing ``` never arrived. Without this fallback, the regex
    // failed to match and the partial JSON bled into the chat card as
    // visible prose.
    const text = [
      'The bridge hatch slides open to reveal Vray.',
      '',
      '```json',
      '{ "newTruths": [{ "subject": "Vray", "fact": "Compact build" }],',
      '  "stateChanges": [{ "subject": "scene", "attribute": "location", "value": "',
    ].join('\n');

    const { prose, sidecar, parseError } = extractSidecar(text);
    expect(prose).toBe('The bridge hatch slides open to reveal Vray.');
    expect(prose).not.toMatch(/```/);
    expect(prose).not.toMatch(/newTruths/);
    expect(sidecar).toBeNull();
    expect(parseError).toBeInstanceOf(Error);
    expect(parseError.message).toMatch(/truncated/i);
  });

  it('returns empty arrays when sidecar omits one of the keys', () => {
    const text = [
      'Prose.',
      '```json',
      '{ "newTruths": [{ "subject": "X", "fact": "y" }] }',
      '```',
    ].join('\n');

    const { sidecar } = extractSidecar(text);
    expect(sidecar.newTruths).toHaveLength(1);
    expect(sidecar.stateChanges).toEqual([]);
  });

  it('tolerates an empty input', () => {
    expect(extractSidecar('').prose).toBe('');
    expect(extractSidecar(null).prose).toBe('');
    expect(extractSidecar(undefined).sidecar).toBeNull();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// applySidecar
// ─────────────────────────────────────────────────────────────────────────────

describe('applySidecar', () => {
  let campaignState;

  beforeEach(() => {
    campaignState = makeCampaignState();
  });

  it('pushes newTruths into sceneTruths with default flags', () => {
    applySidecar(
      { newTruths: [{ subject: 'Vance', fact: 'Walks with a limp' }], stateChanges: [] },
      { campaignState, moveId: 'compel' },
    );
    expect(campaignState.sceneTruths).toHaveLength(1);
    const t = campaignState.sceneTruths[0];
    expect(t.fact).toBe('Walks with a limp');
    expect(t.subject).toEqual({ kind: 'text', text: 'Vance' });
    expect(t.sessionId).toBe('ssn-test');
    expect(t.sceneId).toBe('sc-test001');
    expect(t.moveId).toBe('compel');
    expect(t.asserter).toBe('narrator');
    expect(t.source).toBe('narrator_sidecar');
    expect(t.retracted).toBe(false);
    expect(t.migratedTo).toBeNull();
    expect(typeof t.id).toBe('string');
    expect(t.id.startsWith('tr-')).toBe(true);
  });

  it('updates sceneState supersede-on-attribute', () => {
    applySidecar(
      { newTruths: [], stateChanges: [
        { subject: 'scene', attribute: 'lighting', value: 'dim' },
      ] },
      { campaignState },
    );
    applySidecar(
      { newTruths: [], stateChanges: [
        { subject: 'scene', attribute: 'lighting', value: 'stable' },
        { subject: 'scene', attribute: 'wind',     value: 'still'  },
      ] },
      { campaignState },
    );
    const scene = campaignState.sceneState.bySubject.scene;
    expect(scene).toHaveLength(2);
    const lighting = scene.find(e => e.attribute === 'lighting');
    const wind     = scene.find(e => e.attribute === 'wind');
    expect(lighting.value).toBe('stable');
    expect(wind.value).toBe('still');
  });

  it('initialises missing ledger arrays/objects on the campaignState', () => {
    const state = { currentSessionId: 'ssn', currentSceneId: 'sc' };
    applySidecar(
      { newTruths: [{ subject: 'A', fact: 'b' }], stateChanges: [
        { subject: 'A', attribute: 'mood', value: 'tense' },
      ] },
      { campaignState: state },
    );
    expect(Array.isArray(state.sceneTruths)).toBe(true);
    expect(state.sceneTruths).toHaveLength(1);
    expect(state.sceneState.bySubject.a).toHaveLength(1);
  });

  it('is a no-op when both arrays are empty', () => {
    const before = JSON.stringify(campaignState);
    applySidecar({ newTruths: [], stateChanges: [] }, { campaignState });
    expect(campaignState.sceneTruths).toHaveLength(0);
    expect(campaignState.sceneState.bySubject).toEqual({});
    // sceneId is touched (synced) — that is acceptable; nothing else changes.
    const after = JSON.parse(JSON.stringify(campaignState));
    expect(after.sceneTruths).toEqual(JSON.parse(before).sceneTruths);
  });

  it('skips entries missing subject or fact / attribute', () => {
    applySidecar(
      { newTruths: [
          { subject: '', fact: 'no subject' },
          { subject: 'Vance', fact: '' },
          { subject: 'Vance', fact: '   ' },
        ],
        stateChanges: [
          { subject: '',      attribute: 'mood', value: 'x' },
          { subject: 'scene', attribute: '',     value: 'x' },
        ],
      },
      { campaignState },
    );
    expect(campaignState.sceneTruths).toHaveLength(0);
    expect(campaignState.sceneState.bySubject).toEqual({});
  });

  it('resolves "scene" subjects to scene-kind with the active sceneId', () => {
    applySidecar(
      { newTruths: [{ subject: 'scene', fact: 'It is raining' }], stateChanges: [] },
      { campaignState },
    );
    expect(campaignState.sceneTruths[0].subject).toEqual({
      kind: 'scene', sceneId: 'sc-test001',
    });
  });

  it('resolves entity subjects when entities are provided', () => {
    const entities = [
      { entityId: 'JournalEntry.x7', entityType: 'connection', name: 'Vance' },
    ];
    applySidecar(
      { newTruths: [{ subject: 'Vance', fact: 'Carries a sidearm' }], stateChanges: [] },
      { campaignState, entities },
    );
    expect(campaignState.sceneTruths[0].subject).toEqual({
      kind: 'entity', entityId: 'JournalEntry.x7', entityType: 'connection',
    });
  });

  it('returns IDs and update keys for the caller', () => {
    const { truthIds, stateUpdates } = applySidecar(
      { newTruths: [{ subject: 'Vance', fact: 'a' }],
        stateChanges: [{ subject: 'scene', attribute: 'mood', value: 'tense' }] },
      { campaignState },
    );
    expect(truthIds).toHaveLength(1);
    expect(stateUpdates).toEqual([{ key: 'scene', attribute: 'mood' }]);
  });

  it('is safe on null / non-object sidecar', () => {
    expect(() => applySidecar(null,      { campaignState })).not.toThrow();
    expect(() => applySidecar('garbage', { campaignState })).not.toThrow();
    expect(campaignState.sceneTruths).toHaveLength(0);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// resolveSubject
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveSubject', () => {
  it('resolves "scene" and "scene.<attr>" to scene-kind', () => {
    const cs = makeCampaignState();
    expect(resolveSubject('scene', cs)).toEqual({ kind: 'scene', sceneId: 'sc-test001' });
    expect(resolveSubject('scene.lighting', cs))
      .toEqual({ kind: 'scene', sceneId: 'sc-test001' });
  });

  it('resolves a known entity name to entity-kind', () => {
    const cs = makeCampaignState();
    const entities = [
      { entityId: 'JournalEntry.x7', entityType: 'connection', name: 'Vance Eustacia' },
    ];
    expect(resolveSubject('Vance Eustacia', cs, entities)).toEqual({
      kind: 'entity', entityId: 'JournalEntry.x7', entityType: 'connection',
    });
    // First-word match too.
    expect(resolveSubject('Vance', cs, entities).kind).toBe('entity');
  });

  it('falls back to text-kind when no entity matches', () => {
    const cs = makeCampaignState();
    expect(resolveSubject('Covenant officer', cs))
      .toEqual({ kind: 'text', text: 'Covenant officer' });
  });

  it('returns text-kind with empty text for empty input', () => {
    expect(resolveSubject('', makeCampaignState())).toEqual({ kind: 'text', text: '' });
    expect(resolveSubject(null, makeCampaignState())).toEqual({ kind: 'text', text: '' });
  });

  it('respects dismissedEntities — names there do not resolve to entities', () => {
    const cs = makeCampaignState({ dismissedEntities: ['Vance'] });
    const entities = [
      { entityId: 'JournalEntry.x7', entityType: 'connection', name: 'Vance' },
    ];
    expect(resolveSubject('Vance', cs, entities)).toEqual({ kind: 'text', text: 'Vance' });
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// subjectKey
// ─────────────────────────────────────────────────────────────────────────────

describe('subjectKey', () => {
  it('returns entityId for entity subjects', () => {
    expect(subjectKey({ kind: 'entity', entityId: 'JE.42', entityType: 'connection' }))
      .toBe('JE.42');
  });

  it('returns "scene" for scene subjects', () => {
    expect(subjectKey({ kind: 'scene', sceneId: 'sc-1' })).toBe('scene');
  });

  it('lowercases and trims text subjects', () => {
    expect(subjectKey({ kind: 'text', text: '  Cargo Bay  ' })).toBe('cargo bay');
  });

  it('returns empty string for malformed input', () => {
    expect(subjectKey(null)).toBe('');
    expect(subjectKey({})).toBe('');
    expect(subjectKey({ kind: 'unknown' })).toBe('');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// promoteTextSubject
// ─────────────────────────────────────────────────────────────────────────────

describe('promoteTextSubject', () => {
  it('rewrites every matching text-subject truth entry to an entity subject', () => {
    const cs = makeCampaignState();
    applySidecar(
      { newTruths: [
          { subject: 'Covenant officer', fact: 'Speaks with a Bleakhold accent' },
          { subject: 'Covenant officer', fact: 'Carries a rusted blade' },
          { subject: 'scene', fact: 'The wind has died' },
        ],
        stateChanges: [{ subject: 'Covenant officer', attribute: 'posture', value: 'leaning' }],
      },
      { campaignState: cs },
    );

    const rewritten = promoteTextSubject(
      'Covenant officer',
      { entityId: 'JournalEntry.cov1', entityType: 'connection' },
      cs,
    );
    expect(rewritten).toBe(2);

    const rewrittenEntries = cs.sceneTruths.filter(
      e => e.subject.kind === 'entity' && e.subject.entityId === 'JournalEntry.cov1',
    );
    expect(rewrittenEntries).toHaveLength(2);

    // Scene-kind entry untouched.
    const sceneEntries = cs.sceneTruths.filter(e => e.subject.kind === 'scene');
    expect(sceneEntries).toHaveLength(1);

    // State entries migrated to the new entity key.
    expect(cs.sceneState.bySubject['JournalEntry.cov1'])
      .toEqual([{ attribute: 'posture', value: 'leaning', updatedAt: expect.any(Number) }]);
    expect(cs.sceneState.bySubject['covenant officer']).toBeUndefined();
  });

  it('returns 0 and is a no-op when no entries match', () => {
    const cs = makeCampaignState();
    applySidecar(
      { newTruths: [{ subject: 'Vance', fact: 'Tall' }], stateChanges: [] },
      { campaignState: cs },
    );
    const rewritten = promoteTextSubject(
      'Nobody',
      { entityId: 'JournalEntry.nope', entityType: 'connection' },
      cs,
    );
    expect(rewritten).toBe(0);
    expect(cs.sceneTruths[0].subject).toEqual({ kind: 'text', text: 'Vance' });
  });

  it('merges state entries by attribute, preferring the newer (text) value', () => {
    const cs = makeCampaignState();
    cs.sceneState.bySubject['JournalEntry.v1'] = [
      { attribute: 'posture', value: 'standing', updatedAt: 1 },
    ];
    cs.sceneState.bySubject.vance = [
      { attribute: 'posture', value: 'sitting',  updatedAt: 2 },
      { attribute: 'mood',    value: 'guarded',  updatedAt: 2 },
    ];
    promoteTextSubject('Vance', { entityId: 'JournalEntry.v1', entityType: 'connection' }, cs);
    const merged = cs.sceneState.bySubject['JournalEntry.v1'];
    const posture = merged.find(e => e.attribute === 'posture');
    const mood    = merged.find(e => e.attribute === 'mood');
    expect(posture.value).toBe('sitting');
    expect(mood.value).toBe('guarded');
    expect(cs.sceneState.bySubject.vance).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scene frame (narrator-memory A4)
// ─────────────────────────────────────────────────────────────────────────────

describe('extractSidecar — sceneFrame', () => {
  it('normalises a valid sceneFrame (trimmed strings, filtered present list)', () => {
    const text = [
      'Prose first.',
      '```json',
      JSON.stringify({
        newTruths:    [],
        stateChanges: [],
        sceneFrame: {
          location:  '  Lyra\'s graveyard ',
          present:   ['Venri Quint', '  Vance ', '', 42],
          situation: ' Hailing Vance across the debris field ',
        },
      }),
      '```',
    ].join('\n');
    const { sidecar } = extractSidecar(text);
    expect(sidecar.sceneFrame).toEqual({
      location:  "Lyra's graveyard",
      present:   ['Venri Quint', 'Vance'],
      situation: 'Hailing Vance across the debris field',
    });
  });

  it('returns null sceneFrame when absent', () => {
    const text = 'Prose.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
    const { sidecar } = extractSidecar(text);
    expect(sidecar.sceneFrame).toBeNull();
  });

  it.each([
    ['array',        ['not', 'an', 'object']],
    ['string',       'cargo bay'],
    ['empty object', {}],
    ['all-blank',    { location: ' ', present: [], situation: '' }],
  ])('returns null sceneFrame for unusable shape: %s', (_label, frame) => {
    const text = `Prose.\n\`\`\`json\n${JSON.stringify({ newTruths: [], stateChanges: [], sceneFrame: frame })}\n\`\`\``;
    const { sidecar } = extractSidecar(text);
    expect(sidecar.sceneFrame).toBeNull();
  });
});

describe('applySceneFrame', () => {
  it('applies a snapshot with sceneId and updatedAt stamped', () => {
    const cs = makeCampaignState();
    const ok = applySceneFrame(
      { location: 'Lyra graveyard', present: ['Vance'], situation: 'Approach run' },
      cs,
    );
    expect(ok).toBe(true);
    expect(cs.sceneFrame.location).toBe('Lyra graveyard');
    expect(cs.sceneFrame.present).toEqual(['Vance']);
    expect(cs.sceneFrame.situation).toBe('Approach run');
    expect(cs.sceneFrame.sceneId).toBe('sc-test001');
    expect(typeof cs.sceneFrame.updatedAt).toBe('number');
  });

  it('is a full replacement — a later frame supersedes the earlier one', () => {
    const cs = makeCampaignState();
    applySceneFrame({ location: 'Sepulcher docks', present: ['Amelia Gray'], situation: 'Refuel' }, cs);
    applySceneFrame({ location: 'Lyra graveyard',  present: ['Vance'],       situation: 'Hail'   }, cs);
    expect(cs.sceneFrame.location).toBe('Lyra graveyard');
    expect(cs.sceneFrame.present).toEqual(['Vance']);
  });

  it('rejects garbage / empty frames and leaves state untouched', () => {
    const cs = makeCampaignState();
    expect(applySceneFrame(null, cs)).toBe(false);
    expect(applySceneFrame('Lyra', cs)).toBe(false);
    expect(applySceneFrame({ location: '', present: [], situation: '' }, cs)).toBe(false);
    expect(cs.sceneFrame).toBeUndefined();
  });

  it('returns false without a campaignState', () => {
    expect(applySceneFrame({ location: 'X' }, null)).toBe(false);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// applySidecar — truth dedup (NARR-TRUTH-DUP, narrator-context audit 2026-07)
// ─────────────────────────────────────────────────────────────────────────────

describe('applySidecar — truth dedup', () => {
  it('skips a newTruth whose subject + fact already exist', () => {
    const cs = makeCampaignState();
    const first = applySidecar(
      { newTruths: [{ subject: 'Vance', fact: 'Walks with a limp' }] },
      { campaignState: cs },
    );
    expect(first.truthIds).toHaveLength(1);

    const second = applySidecar(
      { newTruths: [{ subject: 'Vance', fact: 'Walks with a limp' }] },
      { campaignState: cs },
    );
    expect(second.truthIds).toHaveLength(0);
    expect(cs.sceneTruths).toHaveLength(1);
  });

  it('normalises case, whitespace, and trailing punctuation before comparing', () => {
    const cs = makeCampaignState();
    applySidecar(
      { newTruths: [{ subject: 'Vance', fact: 'Walks with a limp' }] },
      { campaignState: cs },
    );
    const dup = applySidecar(
      { newTruths: [{ subject: 'vance', fact: '  walks  with a LIMP. ' }] },
      { campaignState: cs },
    );
    expect(dup.truthIds).toHaveLength(0);
    expect(cs.sceneTruths).toHaveLength(1);
  });

  it('keeps the same fact under a different subject', () => {
    const cs = makeCampaignState();
    applySidecar(
      { newTruths: [{ subject: 'Vance', fact: 'Wanted by the syndicate' }] },
      { campaignState: cs },
    );
    const other = applySidecar(
      { newTruths: [{ subject: 'Kael', fact: 'Wanted by the syndicate' }] },
      { campaignState: cs },
    );
    expect(other.truthIds).toHaveLength(1);
    expect(cs.sceneTruths).toHaveLength(2);
  });

  it('blocks re-assertion of a RETRACTED fact — the correction stands', () => {
    const cs = makeCampaignState();
    applySidecar(
      { newTruths: [{ subject: 'Vance', fact: 'Betrayed the crew' }] },
      { campaignState: cs },
    );
    cs.sceneTruths[0].retracted = true;

    const reassert = applySidecar(
      { newTruths: [{ subject: 'Vance', fact: 'Betrayed the crew' }] },
      { campaignState: cs },
    );
    expect(reassert.truthIds).toHaveLength(0);
    expect(cs.sceneTruths).toHaveLength(1);
    expect(cs.sceneTruths[0].retracted).toBe(true);
  });
});


describe('findEquivalentTruth', () => {
  it('matches on subjectKey + normalised fact and returns the entry', () => {
    const cs = makeCampaignState();
    applySidecar(
      { newTruths: [{ subject: 'scene', fact: 'Comms are jammed' }] },
      { campaignState: cs },
    );
    const hit = findEquivalentTruth(
      cs.sceneTruths, { kind: 'scene', sceneId: cs.currentSceneId }, 'comms are jammed.',
    );
    expect(hit).toBe(cs.sceneTruths[0]);
    expect(findEquivalentTruth(cs.sceneTruths, { kind: 'text', text: 'other' }, 'Comms are jammed'))
      .toBeNull();
    expect(findEquivalentTruth([], { kind: 'scene' }, 'x')).toBeNull();
  });
});

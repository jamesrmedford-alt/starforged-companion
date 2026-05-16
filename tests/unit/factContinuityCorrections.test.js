/**
 * STARFORGED COMPANION
 * tests/unit/factContinuityCorrections.test.js
 *
 * Unit tests for the Phase D correction mutators in ledgers.js:
 *   - strikeTruth / replaceTruth / setTruth
 *   - strikeStateValue / setStateValue
 *   - canCorrectTruth (GM vs. player permission asymmetry)
 *
 * The DialogV2 dialog itself is exercised by Quench integration (Phase D
 * item 28); unit coverage focuses on pure mutators.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  applySidecar,
  setTruth,
  strikeTruth,
  replaceTruth,
  strikeStateValue,
  setStateValue,
  canCorrectTruth,
  subjectKey,
} from '../../src/factContinuity/ledgers.js';


function makeCampaignState(overrides = {}) {
  return {
    currentSessionId:  'ssn-test',
    currentSceneId:    'sc-test',
    dismissedEntities: [],
    sceneTruths:       [],
    sceneState:        { bySubject: {}, sceneId: null },
    ...overrides,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// canCorrectTruth — permission asymmetry (scope §10.1)
// ─────────────────────────────────────────────────────────────────────────────

describe('canCorrectTruth', () => {
  it('the GM may correct any truth', () => {
    expect(canCorrectTruth({ asserter: 'gm' },       { isGM: true })).toBe(true);
    expect(canCorrectTruth({ asserter: 'narrator' }, { isGM: true })).toBe(true);
    expect(canCorrectTruth({ asserter: 'player' },   { isGM: true })).toBe(true);
  });

  it('a player may correct narrator/player truths but NOT GM truths', () => {
    expect(canCorrectTruth({ asserter: 'narrator' }, { isGM: false })).toBe(true);
    expect(canCorrectTruth({ asserter: 'player' },   { isGM: false })).toBe(true);
    expect(canCorrectTruth({ asserter: 'gm' },       { isGM: false })).toBe(false);
  });

  it('returns false for a null truth', () => {
    expect(canCorrectTruth(null, { isGM: true })).toBe(false);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// strikeTruth
// ─────────────────────────────────────────────────────────────────────────────

describe('strikeTruth', () => {
  let cs;
  beforeEach(() => {
    cs = makeCampaignState();
    applySidecar(
      { newTruths: [
          { subject: 'scene', fact: 'a' },
          { subject: 'scene', fact: 'b' },
        ],
        stateChanges: [],
      },
      { campaignState: cs },
    );
  });

  it('strikes the matched truth by full ID and records audit fields', () => {
    const id = cs.sceneTruths[0].id;
    const out = strikeTruth(id, cs, { isGM: true, actor: 'gm' });
    expect(out).not.toBeNull();
    expect(cs.sceneTruths[0].retracted).toBe(true);
    expect(cs.sceneTruths[0].retractedBy).toBe('gm');
    expect(typeof cs.sceneTruths[0].retractedAt).toBe('number');
    expect(cs.sceneTruths[1].retracted).toBe(false);
  });

  it('strikes by 4+ char prefix when unique', () => {
    const id     = cs.sceneTruths[0].id;
    const prefix = id.slice(0, 6);
    const out = strikeTruth(prefix, cs, { isGM: true, actor: 'gm' });
    expect(out).not.toBeNull();
    expect(cs.sceneTruths[0].retracted).toBe(true);
  });

  it('returns null for an unknown id', () => {
    const out = strikeTruth('tr-never', cs, { isGM: true });
    expect(out).toBeNull();
  });

  it('rejects a player attempt to strike a GM-asserted truth', () => {
    cs.sceneTruths[0].asserter = 'gm';
    const out = strikeTruth(cs.sceneTruths[0].id, cs, { isGM: false, actor: 'player' });
    expect(out).toBeNull();
    expect(cs.sceneTruths[0].retracted).toBe(false);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// replaceTruth
// ─────────────────────────────────────────────────────────────────────────────

describe('replaceTruth', () => {
  let cs;
  beforeEach(() => {
    cs = makeCampaignState();
    applySidecar(
      { newTruths: [{ subject: 'scene', fact: 'old fact' }], stateChanges: [] },
      { campaignState: cs },
    );
  });

  it('strikes the original and appends a new entry with correctedTo set', () => {
    const id = cs.sceneTruths[0].id;
    const out = replaceTruth(id, { fact: 'new fact' }, cs, { isGM: true, actor: 'gm' });
    expect(out).not.toBeNull();
    expect(cs.sceneTruths).toHaveLength(2);
    expect(cs.sceneTruths[0].retracted).toBe(true);
    expect(cs.sceneTruths[0].correctedTo).toBe(out.replacement.id);
    expect(cs.sceneTruths[1].fact).toBe('new fact');
    expect(cs.sceneTruths[1].source).toBe('manual_truth_cmd');
  });

  it('returns null when the replacement fact is empty', () => {
    const id = cs.sceneTruths[0].id;
    expect(replaceTruth(id, { fact: '   ' }, cs, { isGM: true })).toBeNull();
    expect(cs.sceneTruths[0].retracted).toBe(false);
  });

  it('rejects a player attempt to replace a GM-asserted truth', () => {
    cs.sceneTruths[0].asserter = 'gm';
    const out = replaceTruth(cs.sceneTruths[0].id, { fact: 'new' }, cs, { isGM: false, actor: 'player' });
    expect(out).toBeNull();
    expect(cs.sceneTruths[0].retracted).toBe(false);
    expect(cs.sceneTruths).toHaveLength(1);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// setTruth — manual assertion path
// ─────────────────────────────────────────────────────────────────────────────

describe('setTruth', () => {
  it('appends a new truth with manual_truth_cmd source and the given asserter', () => {
    const cs = makeCampaignState();
    const subject = { kind: 'text', text: 'Vance' };
    const entry = setTruth(subject, 'Carries a sidearm', cs, { isGM: true, actor: 'gm' });
    expect(entry).not.toBeNull();
    expect(entry.subject).toEqual(subject);
    expect(entry.fact).toBe('Carries a sidearm');
    expect(entry.asserter).toBe('gm');
    expect(entry.source).toBe('manual_truth_cmd');
    expect(cs.sceneTruths).toHaveLength(1);
  });

  it('returns null when fact is blank', () => {
    const cs = makeCampaignState();
    expect(setTruth({ kind: 'scene' }, '', cs, {})).toBeNull();
    expect(setTruth({ kind: 'scene' }, '   ', cs, {})).toBeNull();
    expect(cs.sceneTruths).toHaveLength(0);
  });

  it('inherits sceneId / sessionId from campaignState when not provided', () => {
    const cs = makeCampaignState({ currentSessionId: 'ssn-x', currentSceneId: 'sc-y' });
    const entry = setTruth({ kind: 'scene' }, 'fact', cs, { actor: 'player' });
    expect(entry.sessionId).toBe('ssn-x');
    expect(entry.sceneId).toBe('sc-y');
    expect(entry.asserter).toBe('player');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// strikeStateValue / setStateValue
// ─────────────────────────────────────────────────────────────────────────────

describe('state mutators', () => {
  let cs;
  beforeEach(() => {
    cs = makeCampaignState();
    applySidecar(
      { newTruths: [],
        stateChanges: [
          { subject: 'scene', attribute: 'lighting', value: 'dim' },
          { subject: 'scene', attribute: 'wind',     value: 'still' },
        ],
      },
      { campaignState: cs },
    );
  });

  it('strikeStateValue removes one attribute and leaves the rest intact', () => {
    const ok = strikeStateValue('scene', 'lighting', cs);
    expect(ok).toBe(true);
    const scene = cs.sceneState.bySubject.scene;
    expect(scene.find(e => e.attribute === 'lighting')).toBeUndefined();
    expect(scene.find(e => e.attribute === 'wind').value).toBe('still');
  });

  it('strikeStateValue removes the empty list once the last attribute is gone', () => {
    strikeStateValue('scene', 'lighting', cs);
    const ok = strikeStateValue('scene', 'wind', cs);
    expect(ok).toBe(true);
    expect(cs.sceneState.bySubject.scene).toBeUndefined();
  });

  it('strikeStateValue returns false on no match', () => {
    expect(strikeStateValue('scene', 'nonsense', cs)).toBe(false);
    expect(strikeStateValue('nobody',  'lighting', cs)).toBe(false);
  });

  it('setStateValue supersedes an existing attribute', () => {
    setStateValue('scene', 'lighting', 'stable', cs);
    const lighting = cs.sceneState.bySubject.scene.find(e => e.attribute === 'lighting');
    expect(lighting.value).toBe('stable');
  });

  it('setStateValue appends when the attribute is new', () => {
    setStateValue('scene', 'weather', 'fog', cs);
    expect(cs.sceneState.bySubject.scene.find(e => e.attribute === 'weather').value).toBe('fog');
  });

  it('setStateValue rejects empty inputs', () => {
    expect(setStateValue('scene', '',         'x',  cs)).toBeNull();
    expect(setStateValue('scene', 'attr',     '',   cs)).toBeNull();
    expect(setStateValue('scene', 'attr',     null, cs)).toBeNull();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// subjectKey — sanity-check the input to state mutators
// ─────────────────────────────────────────────────────────────────────────────

describe('subjectKey + state mutators integration', () => {
  it('lookup via subjectKey of a text subject finds and updates the state entry', () => {
    const cs = makeCampaignState();
    applySidecar(
      { newTruths: [],
        stateChanges: [{ subject: 'Cargo Bay', attribute: 'door', value: 'closed' }],
      },
      { campaignState: cs },
    );
    const key = subjectKey({ kind: 'text', text: 'Cargo Bay' });
    expect(key).toBe('cargo bay');
    setStateValue(key, 'door', 'open', cs);
    expect(cs.sceneState.bySubject[key].find(e => e.attribute === 'door').value).toBe('open');
  });
});

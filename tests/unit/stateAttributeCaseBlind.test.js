// tests/unit/stateAttributeCaseBlind.test.js
// A state attribute supersedes the stored one whatever its case (issue #326
// W61). applySidecar, setStateValue and strikeStateValue compared the
// attribute strings exactly: "Location" was appended beside "location", so
// CURRENT STATE showed two contradictory lines for one fact, and
// `!state strike` removed one. Attributes now compare case-blind, as
// subjects already did.

import { describe, it, expect } from 'vitest';
import { applySidecar, setStateValue, strikeStateValue } from '../../src/factContinuity/ledgers.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';

const scene = () => ({
  currentSessionId: 'sess-1', currentSceneId: 'sc-1',
  sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' },
});
const turn = (cs, attribute, value) =>
  applySidecar({ newTruths: [], stateChanges: [{ subject: 'the dockmaster', attribute, value }] }, { campaignState: cs });

describe('a state change supersedes the same attribute whatever its case (issue #326 W61)', () => {
  it('control: the same spelling supersedes', () => {
    const cs = scene();
    turn(cs, 'location', 'the cargo bay');
    turn(cs, 'location', 'the customs office');
    expect(cs.sceneState.bySubject['the dockmaster']).toHaveLength(1);
  });

  it('"Location" supersedes "location" — CURRENT STATE holds one location for the dockmaster', () => {
    const cs = scene();
    turn(cs, 'location', 'the cargo bay');
    turn(cs, 'Location', 'the customs office');

    const lines = buildLedgerBlock(cs, {}).state.split('\n').filter(l => /the dockmaster — location/i.test(l));
    // There were two lines — "location: the cargo bay" and "Location: the customs office".
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/the customs office/);
  });
  it('`!state set` and `!state strike` find the attribute whatever its case', () => {
    const cs = scene();
    turn(cs, 'location', 'the cargo bay');
    setStateValue('the dockmaster', 'LOCATION', 'the brig', cs);
    expect(cs.sceneState.bySubject['the dockmaster']).toEqual([expect.objectContaining({ value: 'the brig' })]);
    expect(strikeStateValue('the dockmaster', 'Location', cs)).toBe(true);
    expect(cs.sceneState.bySubject['the dockmaster']).toBeUndefined();
  });

  it('control: different attributes stay apart', () => {
    const cs = scene();
    turn(cs, 'location', 'the cargo bay');
    turn(cs, 'mood', 'wary');
    expect(cs.sceneState.bySubject['the dockmaster']).toHaveLength(2);
  });
});

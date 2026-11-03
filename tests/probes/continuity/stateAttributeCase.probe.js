/**
 * PROBE — FC-11 STATE-ATTRIBUTE-CASE
 * (src/factContinuity/ledgers.js applySidecar state loop; strikeStateValue /
 *  setStateValue)
 *
 * What the user does: plays on; the narrator records an NPC's whereabouts as
 * the instruction REQUIRES, but spells the attribute differently from one
 * turn to the next — "location" in one sidecar, "Location" in the next (the
 * model is not held to a case; subjects are already matched case-blind:
 * subjectKey lowercases a text subject, WHEREABOUTS_ATTRIBUTES is compared
 * lowercased at scene end).
 *
 * What happens: a state change supersedes the stored value only when its
 * attribute is the exact same string (`list.findIndex(e => e.attribute ===
 * attribute)`), so "Location" is appended beside "location" and CURRENT STATE
 * shows two contradictory lines for one fact:
 *   the dockmaster — location: the cargo bay
 *   the dockmaster — Location: the customs office
 * The older line is never superseded for the rest of the scene, and `!state
 * strike "the dockmaster" location` removes only one of them.
 *
 * What should happen: "These supersede prior state for the same subject +
 * attribute" (appendSidecarInstruction) — one attribute, whatever its case.
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect } from 'vitest';
import { applySidecar } from '../../../src/factContinuity/ledgers.js';
import { buildLedgerBlock } from '../../../src/narration/narratorPrompt.js';

const scene = () => ({
  currentSessionId: 'sess-1', currentSceneId: 'sc-1',
  sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' },
});
const turn = (cs, attribute, value) =>
  applySidecar({ newTruths: [], stateChanges: [{ subject: 'the dockmaster', attribute, value }] }, { campaignState: cs });

describe('a state change supersedes the same attribute whatever its case', () => {
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
    // Today: two lines — "location: the cargo bay" and "Location: the customs office".
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/the customs office/);
  });
});

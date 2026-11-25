/**
 * STARFORGED COMPANION
 * tests/unit/frameNamesWrittenNew.test.js
 *
 * Overhaul 2, slice 4 (§6.1, §10.1) — the scene as one read
 * (narratorPrompt.js sceneForReading), rendered for the narrator (the ACTIVE
 * SCENE block's THE SCENE) and for the reader (formatSceneForReading, the
 * pacing classifier's scene until overhaul 1's reader exists), with the
 * names the table changed written new in the frame's words as they are read
 * (nameChanges.js writeNewNames — the record's rule). The fourth live run's
 * a50 copied "Who sent the Ashen Wake's pilot" a step after the cutter was
 * renamed the Cinder Wren; the frame still said so at a60. The stored frame
 * is not rewritten: nothing in a store is (decisions.md, "A correction of a
 * name").
 */

import { describe, it, expect } from 'vitest';
import { buildLedgerBlock, sceneForReading, formatSceneForReading } from '../../src/narration/narratorPrompt.js';
import { withNameChange } from '../../src/factContinuity/nameChanges.js';
import { buildClassifierContext } from '../../src/pacing/classifier.js';

const A50 = {
  location:  'Bleakhold Station docking ring, in open space off the lock',
  present:   ['Mira', 'Ashen Wake pilot'],
  situation: 'The Ashen Wake is disabled and drifting at point-blank range, her pilot has offered to name who sent her',
  question:  'Who sent the Ashen Wake\'s pilot, and will Mira hear it?',
  sceneId:   'sc-3',
};
const renamed = () => withNameChange([], { from: 'Ashen Wake', to: 'Cinder Wren', kind: 'renamed' });
const state = (over = {}) => ({ currentSessionId: 's-3', currentSceneId: 'sc-3', sceneFrame: { ...A50 }, sceneTruths: [],
  sceneState: { bySubject: {}, sceneId: 'sc-3' }, nameChanges: renamed(), ...over });

describe('overhaul 2 §6.1 — the frame\'s words, with the table\'s new names', () => {
  it('a50: THE SCENE writes the Cinder Wren where the frame still says the Ashen Wake', () => {
    const cs = state();
    const { scene } = buildLedgerBlock(cs);
    expect(scene).toContain('  Present:  Mira, Cinder Wren pilot');
    expect(scene).toContain('  Now:      The Cinder Wren is disabled and drifting at point-blank range');
    expect(scene).toContain('  Turns on: Who sent the Cinder Wren\'s pilot, and will Mira hear it? — from the player\'s line');
    expect(scene).not.toContain('Ashen Wake');
    // The stored frame is the narration's words, as written.
    expect(cs.sceneFrame.question).toBe('Who sent the Ashen Wake\'s pilot, and will Mira hear it?');
  });

  it('the changes the narrator is handed (the store\'s, in its extras) are the ones written', () => {
    const cs = state({ nameChanges: [] });
    expect(buildLedgerBlock(cs).scene).toContain('Ashen Wake pilot');
    expect(buildLedgerBlock(cs, { nameChanges: renamed() }).scene).toContain('  Present:  Mira, Cinder Wren pilot');
  });

  it('the reader is told the same read, by the same renderer', () => {
    const read = sceneForReading(state());
    expect(read).toMatchObject({
      where: 'Bleakhold Station docking ring, in open space off the lock',
      present: ['Mira', 'Cinder Wren pilot'],
      question: 'Who sent the Cinder Wren\'s pilot, and will Mira hear it?',
      letGo: [],
    });
    const text = formatSceneForReading(read);
    expect(text).toContain('present: Mira, Cinder Wren pilot');
    expect(text).toContain('turns on: Who sent the Cinder Wren\'s pilot, and will Mira hear it?');
    expect(text).not.toContain('Ashen Wake');

    const { userMessage } = buildClassifierContext({
      playerText: 'I hail the pilot.', campaignState: state(), character: null,
      recentMoveDensity: { count: 0, window: 5 }, pacingConfig: { dials: {} },
    });
    expect(userMessage).toContain(text);
  });

  it('what play let go is the reader\'s too; a frame off reads none', () => {
    const cs = state({ sceneFrame: { ...A50, letGo: [{ text: 'Who else knew Mira was coming?', stems: ['knew', 'mira', 'com'] }] } });
    expect(sceneForReading(cs).letGo).toEqual(['Who else knew Mira was coming?']);
    expect(formatSceneForReading(sceneForReading(cs))).toContain('play let go: "Who else knew Mira was coming?"');
    expect(sceneForReading(cs, { sceneFrameEnabled: false })).toMatchObject({ where: '', present: [], now: '', question: '', letGo: [] });
  });

  it('nothing to say is said as nothing', () => {
    expect(formatSceneForReading(sceneForReading({}))).toBe('');
    expect(formatSceneForReading(null)).toBe('');
  });
});

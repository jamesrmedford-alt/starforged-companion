/**
 * PROBE — RETRACTION-DEDUP-BY-FACT (src/factContinuity/retractions.js)
 *
 * sessionRetractedFacts (the CORRECTED block + the rolling summary's leave-out
 * list) and rememberSessionRetractions (the session list kept past the scene)
 * deduplicate struck facts by FACT TEXT alone. Sidecar facts are subject-less
 * phrases, so two different characters' struck facts ("Vance — Is dead",
 * "Kira — Is dead") collapse into one line: the second strike never renders in
 * CORRECTED, and after scene end nothing at all defends it (the write-layer
 * guard lives on the scene's sceneTruths, which endScene clears).
 *
 * Asserts the CORRECT behaviour (both strikes kept); fails today.
 */

import { describe, it, expect } from 'vitest';
import { sessionRetractedFacts, rememberSessionRetractions } from '../../../src/factContinuity/retractions.js';

const struck = (id, text, fact) => ({
  id, subject: { kind: 'text', text }, fact, sessionId: 'sess-1', sceneId: 'sc-1',
  retracted: true, retractedBy: 'gm', retractedAt: 5, correctedTo: null, migratedTo: null,
});

function state() {
  return {
    currentSessionId: 'sess-1', currentSceneId: 'sc-1',
    sceneTruths: [struck('tr-1', 'Vance', 'Is dead'), struck('tr-2', 'Kira', 'Is dead')],
    sceneState: { bySubject: {}, sceneId: 'sc-1' },
  };
}

describe('session retractions for two subjects that share a struck phrase', () => {
  it('CORRECTED names both strikes during the scene', () => {
    const labels = sessionRetractedFacts(state()).map(f => `${f.label} — ${f.fact}`);
    expect(labels).toEqual(['Vance — Is dead', 'Kira — Is dead']);
  });

  it('both strikes outlive the scene', () => {
    const cs = state();
    rememberSessionRetractions(cs);
    cs.sceneTruths = [];                                  // endScene clears the ledger next
    const labels = sessionRetractedFacts(cs).map(f => `${f.label} — ${f.fact}`);
    expect(labels).toEqual(['Vance — Is dead', 'Kira — Is dead']);
  });
});

/**
 * PROBE — RETRACT-LORE-OVERREACH (src/factContinuity/retractions.js)
 *
 * propagateRetraction takes "this session's lore that states the struck fact"
 * out of canon via retractSessionLore with a matcher that ignores the struck
 * truth's SUBJECT and accepts plain substring containment (factsOverlap: "one
 * contains the other"). Sidecar facts are short subject-less phrases ("Is
 * dead", "Is armed", "Is lying to the crew"), so striking one subject's fact
 * retracts unrelated same-session canon about someone else: an earlier scene's
 * archived truth with the same phrase, or detection lore whose text contains it.
 *
 * Asserts the CORRECT behaviour (only the struck subject's lore is touched);
 * fails today.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { propagateRetraction } from '../../../src/factContinuity/retractions.js';
import { archiveSceneTruth, recordLoreDiscovery, getConfirmedLore } from '../../../src/world/worldJournal.js';
import { installJournalMock } from '../../helpers/fullStateFixture.js';

let installed;
beforeEach(() => { installed = installJournalMock(); });
afterEach(() => { installed.restore(); });

describe('a strike reaching the World Journal', () => {
  it('leaves other subjects\' lore that merely shares the phrase in canon', async () => {
    const cs = { currentSessionId: 'sess-1', sessionNumber: 4, currentSceneId: 'sc-2' };

    // Scene 1 (same session) ended: the dockmaster's death was archived as lore.
    await archiveSceneTruth({
      subject: { kind: 'text', text: 'the dockmaster' }, fact: 'Is dead',
      sessionId: 'sess-1', sessionNum: 4, sceneId: 'sc-1', moveId: null,
    }, cs);
    // Detection lore from this session.
    await recordLoreDiscovery("Mira's husband", {
      text: "Mira's husband is dead, lost when the Ascent's reactor failed",
      confirmed: true, narratorAsserted: true, sessionId: 'sess-1',
    }, cs);
    expect(getConfirmedLore(cs)).toHaveLength(2);

    // Scene 2: the narrator wrongly killed Vance; the GM strikes it.
    await propagateRetraction({
      id: 'tr-vance001', subject: { kind: 'text', text: 'Vance' }, fact: 'Is dead',
      sessionId: 'sess-1', sceneId: 'sc-2', retracted: true,
    }, cs);

    const titles = getConfirmedLore(cs).map(e => e.title);
    expect.soft(titles, "the dockmaster's archived death").toContain('the dockmaster: Is dead');
    expect.soft(titles, "Mira's husband").toContain("Mira's husband");
  });
});

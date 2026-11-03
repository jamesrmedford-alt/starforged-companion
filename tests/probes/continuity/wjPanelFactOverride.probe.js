/**
 * PROBE — FC-09 WJ-PANEL-FACT-OVERRIDE
 * (src/world/worldJournalPanel.js readContradictions / #onOverrideContradiction;
 *  src/world/worldJournal.js postContradictionNotification)
 *
 * What the user does: the consistency check catches the narrator walking back
 * a binding truth ("Vance — walks with a limp"; the prose has him sprint). A
 * ◈ Narrative Review card is whispered to the GM with a "Retract the
 * offending fact" button. The GM opens the World Journal panel, sees the
 * catch under "Contradictions" and clicks Override — "Mark the new narration
 * as correct (promotes lore)".
 *
 * What happens: the panel lists every `worldJournalContradiction` card,
 * including the fact-continuity review cards (they carry the flag so the
 * narrator-memory readers skip them), and gives them the LORE actions.
 * Override runs promoteLoreToConfirmed(<the subject's name>) — there is no
 * lore page called "Vance", so it only logs "no lore titled" — and then
 * deletes the review card. The binding truth is untouched: the next
 * narration is still told "Vance — walks with a limp", the GM's Retract
 * button is gone with the card, and the check's per-scene dedup will not post
 * the catch again. (Review opens the Lore journal, where the catch is not.)
 *
 * What should happen: Override on a fact-continuity catch either applies the
 * ruling to the ledger (the contradicted truth is struck) or the panel does
 * not offer the lore actions for it and leaves its card — and its Retract
 * button — in place.
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyStateTransition } from '../../../src/world/worldJournal.js';
import { WorldJournalPanelApp } from '../../../src/world/worldJournalPanel.js';
import { buildLedgerBlock } from '../../../src/narration/narratorPrompt.js';
import { installJournalMock } from '../../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');

let journals;
beforeEach(() => {
  journals = installJournalMock();
  ChatMessage._reset();
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-3', sessionNumber: 3, currentSceneId: 'sc-1',
    sceneTruths: [{
      id: 'tr-limp0001', subject: { kind: 'text', text: 'Vance' }, fact: 'walks with a limp',
      sessionId: 'sess-3', sessionNum: 3, sceneId: 'sc-1', moveId: null, source: 'narrator_sidecar',
      asserter: 'narrator', createdAt: 1, retracted: false, retractedBy: null, retractedAt: null,
      correctedTo: null, migratedTo: null,
    }],
    sceneState: { bySubject: {}, sceneId: 'sc-1' },
  });
});
afterEach(() => {
  journals.restore();
  delete global.game.messages;
});

async function postCatch() {
  await applyStateTransition({
    entryType: 'factContinuity', change: 'contradicted', kind: 'truth',
    name: 'Vance', newValue: 'Vance sprints across the hangar', summary: 'walks with a limp',
    truthId: null, matchedEntityIds: [],
  }, stored());
  const card = ChatMessage._created.at(-1);
  const live = () => ChatMessage._created.filter(m => !m._deleted);
  global.game.messages = { get contents() { return live(); }, get: (id) => live().find(m => m.id === id) ?? null };
  return card;
}

describe('the World Journal panel and a fact-continuity catch', () => {
  it('control: the catch is posted with the Retract button and listed in the panel', async () => {
    const card = await postCatch();
    expect(card.content).toMatch(/openCorrectionDialog/);
    const ctx = await new WorldJournalPanelApp()._prepareContext({});
    expect(ctx.contradictions.map(c => c.name)).toContain('Vance');
  });

  it('Override either strikes the contradicted truth or leaves the catch (and its Retract button) in place', async () => {
    const card = await postCatch();
    await WorldJournalPanelApp.DEFAULT_OPTIONS.actions.overrideContradiction.call(
      { render: async () => {} }, {}, { dataset: { messageId: card.id } },
    );

    const stillBinding = /Vance — walks with a limp/.test(buildLedgerBlock(stored(), {}).truths);
    const cardKept     = !card._deleted;
    // Today: stillBinding true, cardKept false — the ruling changed nothing and the remedy is gone.
    expect(!stillBinding || cardKept).toBe(true);
  });
});

/**
 * STARFORGED COMPANION
 * tests/unit/wjPanelFactCatch.test.js
 *
 * Issue #325 W34: the World Journal panel listed every
 * `worldJournalContradiction` card — the ◈ Narrative Review cards from the
 * fact-continuity check included — with the lore actions. Override ran
 * promoteLoreToConfirmed(<subject>) (there is no lore page by that name) and
 * deleted the card: the binding truth was untouched, the GM's "Retract the
 * offending fact" button was gone, and the check's per-scene dedup never
 * posted the catch again. A fact-continuity catch now gets its own remedy in
 * the panel (Correct…, the card's correction dialog) and Dismiss; Override
 * refuses it and leaves the card.
 *
 * Converted from the audit probe continuity/wjPanelFactOverride.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StubElement } from '../helpers/cardDom.js';

vi.mock('../../src/factContinuity/correctionDialog.js', async (importOriginal) => ({
  ...(await importOriginal()),
  openCorrectionDialog: vi.fn(async () => {}),
}));
vi.mock('../../src/world/worldJournal.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, promoteLoreToConfirmed: vi.fn(async () => null) };
});

import { applyStateTransition, promoteLoreToConfirmed } from '../../src/world/worldJournal.js';
import { openCorrectionDialog } from '../../src/factContinuity/correctionDialog.js';
import { WorldJournalPanelApp } from '../../src/world/worldJournalPanel.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const actions = WorldJournalPanelApp.DEFAULT_OPTIONS.actions;

let journals;
let warn;
beforeEach(() => {
  journals = installJournalMock();
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  ChatMessage._reset();
  vi.mocked(openCorrectionDialog).mockClear();
  vi.mocked(promoteLoreToConfirmed).mockClear();
  warn = vi.spyOn(ui.notifications, 'warn');
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
  warn.mockRestore();
  delete globalThis.document;
  delete global.game.messages;
});

function exposeMessages() {
  const live = () => ChatMessage._created.filter(m => !m._deleted);
  global.game.messages = { get contents() { return live(); }, get: (id) => live().find(m => m.id === id) ?? null };
}

async function postCatch() {
  await applyStateTransition({
    entryType: 'factContinuity', change: 'contradicted', kind: 'truth',
    name: 'Vance', newValue: 'Vance sprints across the hangar', summary: 'walks with a limp',
    truthId: null, matchedEntityIds: [],
  }, stored());
  const card = ChatMessage._created.at(-1);
  exposeMessages();
  return card;
}

async function postLoreContradiction() {
  const card = await ChatMessage.create({
    content: '<div class="sf-wj-contradiction"><p><strong>The Iron Choir</strong> — disbanded a century ago</p></div>',
    flags: { [MODULE_ID]: { worldJournalContradiction: true } },
  });
  exposeMessages();
  return card;
}

async function renderPanel() {
  const app = new WorldJournalPanelApp();
  return app._renderHTML(await app._prepareContext({}), {});
}

const rowActions = (root, name) => {
  const row = root.querySelectorAll('.sf-wj-contradiction-entry')
    .find(r => r.querySelector('.sf-wj-entry-title').textContent === name);
  return row.querySelectorAll('button').map(b => b.dataset.action);
};

describe('the World Journal panel and a fact-continuity catch', () => {
  it('control: the catch is posted with the Retract button and listed in the panel', async () => {
    const card = await postCatch();
    expect(card.content).toMatch(/openCorrectionDialog/);
    const ctx = await new WorldJournalPanelApp()._prepareContext({});
    expect(ctx.contradictions.map(c => c.name)).toContain('Vance');
  });

  it('the catch gets Correct… and Dismiss, never the lore actions; a lore contradiction keeps them', async () => {
    await postCatch();
    await postLoreContradiction();
    const root = await renderPanel();
    expect(rowActions(root, 'Vance')).toEqual(['correctContradiction', 'dismissContradiction']);
    expect(rowActions(root, 'The Iron Choir'))
      .toEqual(['reviewContradiction', 'overrideContradiction', 'dismissContradiction']);
  });

  it('Override refuses the catch: the card and its Retract button stay, and nothing is promoted', async () => {
    const card = await postCatch();
    await actions.overrideContradiction.call({ render: async () => {} }, {}, { dataset: { messageId: card.id } });

    expect(card._deleted ?? false).toBe(false);
    expect(promoteLoreToConfirmed).not.toHaveBeenCalled();
    expect(/Vance — walks with a limp/.test(buildLedgerBlock(stored(), {}).truths)).toBe(true);
    expect(warn.mock.calls.at(-1)?.[0]).toMatch(/fact-continuity catch/);
  });

  it('Correct… opens the card\'s correction dialog and keeps the card', async () => {
    const card = await postCatch();
    await actions.correctContradiction.call({ render: async () => {} }, {}, { dataset: { messageId: card.id } });

    expect(openCorrectionDialog).toHaveBeenCalledWith(card);
    expect(card._deleted ?? false).toBe(false);
  });

  it('control: Override on a lore contradiction still promotes the lore and clears the card', async () => {
    const card = await postLoreContradiction();
    await actions.overrideContradiction.call({ render: async () => {} }, {}, { dataset: { messageId: card.id } });

    expect(promoteLoreToConfirmed).toHaveBeenCalledWith('The Iron Choir', expect.anything());
    expect(card._deleted).toBe(true);
  });
});

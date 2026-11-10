/**
 * UI-4 WJ-PANEL-NEVER-REFRESHES (twelfth audit, ui area).
 *
 * The World Journal panel (src/world/worldJournalPanel.js) lists the lore
 * awaiting the GM's review, the contradiction cards, and the active threats'
 * severities. It registers no hook at all, so nothing re-renders it when the
 * capture writes a narrator-asserted lore entry, a contradiction card is
 * posted, or a threat's severity changes — and pressing the toolbar's World
 * Journal button again while it is open only brings it to the front
 * (openWorldJournalPanel, :434-437: `if (_wjPanelInstance?.rendered) {
 * bringToTop(); return; }`). Every sibling panel was given a refresh — Clocks
 * (issue #322 V12), the Entities panel (F12, X56), the Chronicle (R11), the
 * Progress Tracks panel, the toolbar (W86) — and each one's opener renders
 * again. A GM who keeps the panel open sees "No entries awaiting review"
 * while the review queue fills.
 *
 * Scenario: the GM opens the World Journal panel; a narration's capture then
 * records a narrator-asserted lore entry (the Lore journal page is created —
 * the hook Foundry fires is fired here) and posts a lore contradiction card;
 * the GM presses the toolbar's World Journal button again.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StubElement } from '../../helpers/cardDom.js';
import { installJournalMock } from '../../helpers/fullStateFixture.js';
import { WorldJournalPanelApp, openWorldJournalPanel } from '../../../src/world/worldJournalPanel.js';
import { recordLoreDiscovery, JOURNAL_NAMES } from '../../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

let journals;
let shown;          // the open panel instance
let savedRender;
let savedBringToTop;

beforeEach(() => {
  journals = installJournalMock();
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  ChatMessage._reset();
  const live = () => ChatMessage._created.filter(m => !m._deleted);
  global.game.messages = { get contents() { return live(); }, get: (id) => live().find(m => m.id === id) ?? null };
  game.settings._store.set(KEY, { currentSessionId: 'sess-4', sessionNumber: 4 });
  game.user.isGM = true;

  // ApplicationV2's render: prepare → render → replace the window's content.
  savedRender = WorldJournalPanelApp.prototype.render;
  savedBringToTop = WorldJournalPanelApp.prototype.bringToTop;
  WorldJournalPanelApp.prototype.render = async function renderLikeFoundry() {
    const ctx = await this._prepareContext({});
    const result = await this._renderHTML(ctx, {});
    if (!this.element) this.element = new StubElement('div');
    this._replaceHTML(result, this.element, {});
    this.rendered = true;
    shown = this;
    return this;
  };
  WorldJournalPanelApp.prototype.bringToTop = function () {};
});

afterEach(() => {
  WorldJournalPanelApp.prototype.render = savedRender;
  WorldJournalPanelApp.prototype.bringToTop = savedBringToTop;
  if (shown) shown.rendered = false;   // the next test's opener makes a fresh panel
  shown = null;
  journals.restore();
  delete globalThis.document;
  delete global.game.messages;
  game.settings._store.delete(KEY);
});

const tick = () => new Promise(r => setTimeout(r, 0));

/** The capture writes a narrator-asserted lore entry and a lore contradiction card. */
async function captureWritesReviewItems() {
  await recordLoreDiscovery('The Iron Choir', {
    text: 'A cult of shipwrights who sing to failing reactors.',
    narratorAsserted: true, confirmed: false,
  }, game.settings.get(MODULE_ID, 'campaignState'));
  const loreJournal = game.journal.getName(JOURNAL_NAMES.lore);
  const page = loreJournal.pages.contents.find(p => p.name === 'The Iron Choir');
  // What Foundry fires on every client for those writes.
  Hooks.call('createJournalEntryPage', page, {}, game.user.id);
  Hooks.call('updateJournalEntryPage', page, { flags: { [MODULE_ID]: {} } }, {}, game.user.id);
  const card = await ChatMessage.create({
    content: '<div class="sf-wj-contradiction"><p><strong>Bleakhold</strong> — said to be abandoned</p></div>',
    flags: { [MODULE_ID]: { worldJournalContradiction: true } },
    whisper: [game.user.id],
  });
  Hooks.call('createChatMessage', card, {}, game.user.id);
  await tick();
}

describe('UI-4: the open World Journal panel shows what the capture adds', () => {
  it('control: opened after the capture, the panel lists the pending lore and the contradiction', async () => {
    await captureWritesReviewItems();
    openWorldJournalPanel();
    await tick();
    const text = shown.element.textContent;
    expect(text).toContain('The Iron Choir');
    expect(text).toContain('Bleakhold');
  });

  it('open before the capture, then the toolbar button pressed again: it should list them', async () => {
    openWorldJournalPanel();
    await tick();
    // Setup sound: the empty review queue is what it shows first.
    expect(shown.element.textContent).toContain('No entries awaiting review.');

    await captureWritesReviewItems();
    openWorldJournalPanel();            // the toolbar's World Journal button, again
    await tick();

    const text = shown.element.textContent;
    expect({ pendingLore: text.includes('The Iron Choir'), contradiction: text.includes('Bleakhold') })
      .toEqual({ pendingLore: true, contradiction: true });
  });
});

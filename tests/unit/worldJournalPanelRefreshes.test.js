/**
 * STARFORGED COMPANION
 * tests/unit/worldJournalPanelRefreshes.test.js
 *
 * Issue #345 AA66 (WJ-PANEL-NEVER-REFRESHES, the audit's UI-4 probe). The
 * World Journal panel (src/world/worldJournalPanel.js) lists the contradiction
 * cards and the active threats' severities. It registered no hook, so nothing
 * re-rendered it when a narration's capture posted a contradiction card or
 * changed a threat's severity — and pressing the toolbar's World Journal
 * button again while it was open only brought it to the front. Every sibling
 * panel re-renders on another client's write: Clocks (issue #322 V12), the
 * Entities panel (F12, X56), the Chronicle (R11), the Progress Tracks panel.
 *
 * Now an open panel re-renders when a Lore or Threats entry page is created,
 * changed or deleted, or a contradiction card is posted, changed or deleted,
 * on any client; and the opener re-renders an open panel.
 *
 * Probe adaptation: the probe's "pending lore" input — a narrator-asserted,
 * unconfirmed lore entry — has no producer (decisions.md "World lore
 * auto-confirms": every narrator lore write is confirmed), so the review items
 * here are the ones the capture does make: a lore contradiction card and a
 * threat escalation, both through applyStateTransition.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StubElement } from '../helpers/cardDom.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { WorldJournalPanelApp, openWorldJournalPanel } from '../../src/world/worldJournalPanel.js';
import { recordThreat, applyStateTransition, JOURNAL_NAMES } from '../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

let journals;
let shown;          // the open panel instance
let renders;
let savedRender;
let savedBringToTop;

beforeEach(async () => {
  journals = installJournalMock();
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  ChatMessage._reset();
  const live = () => ChatMessage._created.filter(m => !m._deleted);
  global.game.messages = { get contents() { return live(); }, get: (id) => live().find(m => m.id === id) ?? null };
  game.settings._store.set(KEY, { currentSessionId: 'sess-4', sessionNumber: 4 });
  game.user.isGM = true;
  renders = 0;

  // ApplicationV2's render: prepare → render → replace the window's content.
  savedRender = WorldJournalPanelApp.prototype.render;
  savedBringToTop = WorldJournalPanelApp.prototype.bringToTop;
  WorldJournalPanelApp.prototype.render = async function renderLikeFoundry() {
    renders += 1;
    const ctx = await this._prepareContext({});
    const result = await this._renderHTML(ctx, {});
    if (!this.element) this.element = new StubElement('div');
    this._replaceHTML(result, this.element, {});
    this.rendered = true;
    shown = this;
    return this;
  };
  WorldJournalPanelApp.prototype.bringToTop = function () {};

  // A threat the table already faces.
  await recordThreat('The Ravager Fleet', { severity: 'looming', summary: 'Raiders massing at the Rift.' }, game.settings.get(MODULE_ID, 'campaignState'));
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
const threatPage = (name) => game.journal.getName(JOURNAL_NAMES.threats).pages.contents.find(p => p.name === name);
const severityShown = () => shown.element.querySelector('.sf-wj-threat-row .sf-wj-badge')?.textContent.trim() ?? null;

/** A narration's capture flags a lore contradiction: the GM-whispered card, and the hook Foundry fires for it. */
async function captureFlagsContradiction() {
  await applyStateTransition({ entryType: 'lore', change: 'contradicted', name: 'Bleakhold', summary: 'said to be abandoned' },
    game.settings.get(MODULE_ID, 'campaignState'));
  const card = ChatMessage._created.filter(m => !m._deleted).at(-1);
  expect(card?.flags?.[MODULE_ID]?.worldJournalContradiction, 'the contradiction card was posted (setup)').toBe(true);
  Hooks.call('createChatMessage', card, {}, game.user.id);
  await tick();
  return card;
}

/** A narration's capture escalates the threat: its page is rewritten, and Foundry fires the page hook. */
async function captureEscalatesThreat() {
  await applyStateTransition({ entryType: 'threat', change: 'escalated', name: 'The Ravager Fleet', newValue: 'immediate' },
    game.settings.get(MODULE_ID, 'campaignState'));
  const page = threatPage('The Ravager Fleet');
  expect(page.flags[MODULE_ID].threatEntry.severity, 'the severity changed (setup)').toBe('immediate');
  Hooks.call('updateJournalEntryPage', page, { flags: { [MODULE_ID]: { threatEntry: page.flags[MODULE_ID].threatEntry } } }, {}, game.user.id);
  await tick();
}

describe('issue #345 AA66 — the open World Journal panel shows what the capture adds', () => {
  it('control: opened after the capture, the panel lists the contradiction and the threat\'s new severity', async () => {
    await captureFlagsContradiction();
    await captureEscalatesThreat();
    openWorldJournalPanel();
    await tick();
    expect(shown.element.textContent).toContain('Bleakhold');
    expect(severityShown()).toBe('IMMEDIATE');
  });

  it('open before the capture: a contradiction card posted on any client appears on it', async () => {
    openWorldJournalPanel();
    await tick();
    expect(shown.element.textContent, 'setup: nothing to review yet').not.toContain('Bleakhold');

    await captureFlagsContradiction();
    expect(shown.element.textContent).toContain('Bleakhold');
  });

  it('open before the capture: a threat\'s severity change appears on it', async () => {
    openWorldJournalPanel();
    await tick();
    expect(severityShown(), 'setup').toBe('LOOMING');

    await captureEscalatesThreat();
    expect(severityShown()).toBe('IMMEDIATE');
  });

  it('a new threat recorded meanwhile appears on it', async () => {
    openWorldJournalPanel();
    await tick();
    await recordThreat('The Hollow Choir', { severity: 'active', summary: 'Something sings in the dark.' }, game.settings.get(MODULE_ID, 'campaignState'));
    Hooks.call('createJournalEntryPage', threatPage('The Hollow Choir'), {}, game.user.id);
    await tick();
    expect(shown.element.textContent).toContain('The Hollow Choir');
  });

  it('a contradiction card dismissed elsewhere — another GM, or deleted from the chat log — leaves it', async () => {
    const card = await captureFlagsContradiction();
    openWorldJournalPanel();
    await tick();
    expect(shown.element.textContent, 'setup').toContain('Bleakhold');

    await card.delete();
    Hooks.call('deleteChatMessage', card, {}, game.user.id);
    await tick();
    expect(shown.element.textContent).not.toContain('Bleakhold');
  });

  it('the toolbar button pressed again while it is open shows what changed', async () => {
    openWorldJournalPanel();
    await tick();
    // Changes no hook reached (written before this client heard of them).
    await applyStateTransition({ entryType: 'lore', change: 'contradicted', name: 'Bleakhold', summary: 'said to be abandoned' },
      game.settings.get(MODULE_ID, 'campaignState'));
    await applyStateTransition({ entryType: 'threat', change: 'escalated', name: 'The Ravager Fleet', newValue: 'immediate' },
      game.settings.get(MODULE_ID, 'campaignState'));
    expect(shown.element.textContent, 'setup: no hook fired').not.toContain('Bleakhold');

    openWorldJournalPanel();            // the toolbar's World Journal button, again
    await tick();
    expect({ contradiction: shown.element.textContent.includes('Bleakhold'), severity: severityShown() })
      .toEqual({ contradiction: true, severity: 'IMMEDIATE' });
  });

  it('control: an unrelated chat message or journal page leaves the open panel alone', async () => {
    openWorldJournalPanel();
    await tick();
    const before = renders;
    const plain = await ChatMessage.create({ content: '<p>Hello</p>', flags: {} });
    Hooks.call('createChatMessage', plain, {}, game.user.id);
    Hooks.call('updateJournalEntryPage', { name: 'Chronicle', flags: { [MODULE_ID]: { chronicle: [] } } }, { flags: { [MODULE_ID]: { chronicle: [] } } }, {}, game.user.id);
    await tick();
    expect(renders).toBe(before);
  });
});

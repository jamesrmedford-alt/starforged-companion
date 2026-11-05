/**
 * Issue #337 Y45 PANEL-RERENDER-WIPES-INPUT — a hook-driven re-render keeps
 * what the user is typing.
 *
 * (a) The GM types a new track's name in the Progress Tracks panel while a
 * player's Strike marks the fight: the tracks flag write fires
 * updateJournalEntry on every client, the hook re-renders the panel, and
 * `_replaceHTML` emptied the content node — the half-typed label and the
 * chosen type / rank were gone. (b) The Clocks panel: a name typed while a
 * Pay the Price, `!clock` or another GM advanced a clock the panel shows
 * (issue #322 V12's fingerprint spared only an unrelated write). (c) The
 * Chronicle panel: an entry being edited in place when the automatic entry
 * after a narration re-renders it was removed before its blur save (a
 * browser fires no `blur` on an element it removes). The panels now replace
 * their content through `replaceKeepingInput` (src/ui/keepTypedInput.js),
 * which carries the add form's values, an in-progress inline edit, and focus.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { StubElement, StubEvent, setListenerResultSink } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const CS = `${MODULE_ID}.campaignState`;
const TRACKS_JOURNAL = 'Starforged Progress Tracks';

let progress, clocks, chronicle, chroniclePanel;

beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  progress       = await import('../../src/ui/progressTracks.js');
  clocks         = await import('../../src/clocks/clocks.js');
  chronicle      = await import('../../src/character/chronicle.js');
  chroniclePanel = await import('../../src/character/chroniclePanel.js');
  progress.registerProgressTrackHooks();
  clocks.registerClocksPanelHooks();
  chroniclePanel.registerChroniclePanelHooks();
});

/** What ApplicationV2.render does: prepare → render → replace the window's content. */
async function renderLikeFoundry(app) {
  const ctx = await app._prepareContext({});
  const result = await app._renderHTML(ctx, {});
  if (!app.element) app.element = new StubElement('div');
  app._replaceHTML(result, app.element, {});
  app.rendered = true;
}

const tick = () => new Promise(r => setTimeout(r, 0));

let savedJournal, savedDocument, journal, tracks;

beforeEach(() => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
  tracks = [{ id: 't-1', label: 'Ravager', type: 'combat', rank: 'dangerous', ticks: 4, completed: false }];
  journal = {
    id: 'pt', name: TRACKS_JOURNAL,
    getFlag: (m, k) => (m === MODULE_ID && k === 'tracks' ? tracks : undefined),
    setFlag: async (m, k, v) => { tracks = JSON.parse(JSON.stringify(v)); },
  };
  savedJournal = game.journal;
  game.journal = { ...savedJournal, find: (fn) => (fn(journal) ? journal : null) };
  game.settings._store.set(CS, { currentSessionId: 's-1', clocks: [
    { _id: 'c1', name: 'Pursuit', type: 'tension', segments: 4, filled: 1, active: true, advanceOdds: 'likely' },
  ] });
});

afterEach(() => {
  game.journal = savedJournal;
  game.settings._store.delete(CS);
  globalThis.document = savedDocument;
});

/** Advance the panel's clock elsewhere: the campaignState write every client hears. */
function advanceClockElsewhere(filled) {
  game.settings._store.set(CS, { ...game.settings._store.get(CS), clocks: [
    { _id: 'c1', name: 'Pursuit', type: 'tension', segments: 4, filled, active: true, advanceOdds: 'likely' },
  ] });
  clocks.onClocksSettingChanged({ key: CS });
}

describe('the Progress Tracks panel keeps a track being added (issue #337 Y45 a)', () => {
  it("a track name, type and rank being chosen survive another client's mark on a fight", async () => {
    const app = progress.ProgressTrackApp.open();
    app.render = () => renderLikeFoundry(app);
    await renderLikeFoundry(app);
    app.element.querySelector('[name="newLabel"]').value = 'The Ravager Nest';
    app.element.querySelector('[name="newType"]').value = 'expedition';
    app.element.querySelector('[name="newRank"]').value = 'formidable';

    // A player's Strike marks the fight: the tracks flag changes, every client hears updateJournalEntry.
    tracks = [{ ...tracks[0], ticks: 12 }];
    await Hooks.call('updateJournalEntry', journal, { flags: { [MODULE_ID]: { tracks } } }, {}, 'gm-1');
    await tick();

    expect(app.element.textContent).toContain('12 / 40 ticks');                          // control: it re-rendered
    expect(app.element.querySelector('[name="newLabel"]').value).toBe('The Ravager Nest');
    expect(app.element.querySelector('[name="newType"]').value).toBe('expedition');
    expect(app.element.querySelector('[name="newRank"]').value).toBe('formidable');
  });
});

describe('the Clocks panel keeps a clock being added (issue #337 Y45 b)', () => {
  it('a clock name and its settings survive a tension clock advanced elsewhere', async () => {
    const app = clocks.openClocksPanel();
    app.render = () => renderLikeFoundry(app);
    await renderLikeFoundry(app);
    app.element.querySelector('[name="newClockName"]').value = 'Reactor leak';
    app.element.querySelector('[name="newClockSegments"]').value = '6';
    app.element.querySelector('[name="newClockType"]').value = 'campaign';
    app.element.querySelector('[name="newClockOdds"]').value = 'unlikely';

    advanceClockElsewhere(2);
    await tick();

    expect(app.element.textContent).toContain('2/4');                                       // control: it re-rendered
    expect(app.element.querySelector('[name="newClockName"]').value).toBe('Reactor leak');
    expect(app.element.querySelector('[name="newClockSegments"]').value).toBe('6');
    expect(app.element.querySelector('[name="newClockType"]').value).toBe('campaign');
    expect(app.element.querySelector('[name="newClockOdds"]').value).toBe('unlikely');
  });

  it('the name field being typed in gets its focus back', async () => {
    const app = clocks.openClocksPanel();
    app.render = () => renderLikeFoundry(app);
    await renderLikeFoundry(app);
    const typing = app.element.querySelector('[name="newClockName"]');
    typing.value = 'Reactor';
    globalThis.document.activeElement = typing;
    const focused = [];
    vi.spyOn(StubElement.prototype, 'focus').mockImplementation(function () { focused.push(this); });

    advanceClockElsewhere(3);
    await tick();

    const fresh = app.element.querySelector('[name="newClockName"]');
    expect(fresh).not.toBe(typing);                                                         // a new element
    expect(fresh.value).toBe('Reactor');
    expect(focused).toEqual([fresh]);
  });

  it('Add clears the name although the write\'s own re-render carried it', async () => {
    const app = clocks.openClocksPanel();
    app.render = () => renderLikeFoundry(app);
    await renderLikeFoundry(app);
    app.element.querySelector('[name="newClockName"]').value = 'Reactor leak';
    // Foundry fires updateSetting as the write lands — before the Add handler resumes.
    const set = game.settings.set.bind(game.settings);
    vi.spyOn(game.settings, 'set').mockImplementation(async (mod, key, value) => {
      const out = await set(mod, key, value);
      if (key === 'campaignState') clocks.onClocksSettingChanged({ key: CS });
      return out;
    });

    const add = app.element.querySelector('[data-action="addClock"]');
    await app.constructor.DEFAULT_OPTIONS.actions.addClock.call(app, new StubEvent('click'), add);
    await tick();

    expect(app.element.textContent).toContain('Reactor leak');                              // the new clock's row
    expect(app.element.querySelector('[name="newClockName"]').value).toBe('');
  });

  it('control: with nothing to re-render for, the typed name stays', async () => {
    const app = clocks.openClocksPanel();
    app.render = () => renderLikeFoundry(app);
    await renderLikeFoundry(app);
    app.element.querySelector('[name="newClockName"]').value = 'Reactor leak';
    game.settings._store.set(CS, { ...game.settings._store.get(CS), sessionNumber: 3 });   // an unrelated field
    clocks.onClocksSettingChanged({ key: CS });
    await tick();
    expect(app.element.querySelector('[name="newClockName"]').value).toBe('Reactor leak');
  });
});

describe('the Chronicle panel keeps an entry being edited in place (issue #337 Y45 c)', () => {
  let journals, saved, pending, panel;

  beforeEach(() => {
    journals = [];
    pending = [];
    saved = { create: JournalEntry.create, user: game.user, users: game.users };
    game.journal = {
      get contents() { return [...journals]; },
      get: (id) => journals.find(j => j.id === id) ?? null,
      getName: (n) => journals.find(j => j.name === n) ?? null,
      [Symbol.iterator]: () => journals[Symbol.iterator](),
    };
    JournalEntry.create = async (data) => {
      const entryJournal = {
        id: `j-${journals.length + 1}`, name: data.name, flags: data.flags ?? {},
        pages: { contents: [] },
        setFlag: async (mod, key, val) => { (entryJournal.flags[mod] ??= {})[key] = val; },
        update: async (changes) => Object.assign(entryJournal, changes),
        createEmbeddedDocuments: async (_type, docs) => docs.map(d => {
          const page = {
            ...d, flags: d.flags ?? {}, parent: entryJournal,
            setFlag: async (mod, key, val) => { (page.flags[mod] ??= {})[key] = val; },
          };
          entryJournal.pages.contents.push(page);
          return page;
        }),
      };
      journals.push(entryJournal);
      return entryJournal;
    };
    game.user = { id: 'gm-1', isGM: true, active: true };
    game.users = Object.assign([game.user], { get: (id) => (id === 'gm-1' ? game.user : null) });   // the canonical GM
    game.actors._reset();
    game.actors._set('pc-1', makeTestActor({ id: 'pc-1', name: 'Kira' }));
    setListenerResultSink(p => pending.push(p));
    panel = null;
    vi.spyOn(chroniclePanel.ChroniclePanelApp.prototype, 'render').mockImplementation(function () {
      panel = this;
      return renderLikeFoundry(this);
    });
  });

  afterEach(() => {
    if (panel) panel.rendered = false;   // the next test opens a fresh panel
    JournalEntry.create = saved.create;
    game.user = saved.user;
    game.users = saved.users;
    setListenerResultSink(null);
  });

  const textEl = (entryId) => panel.element.querySelector(`[data-entry-id="${entryId}"] .sf-chronicle-text`);
  const page = () => journals[0].pages.contents[0];

  /** The automatic entry after a narration: written, then the page hook every client hears. */
  async function automaticEntryArrives() {
    await chronicle.addChronicleEntry('pc-1', { type: 'moment', text: 'New automatic beat.', automated: true });
    await Hooks.call('updateJournalEntryPage', page(), { flags: { [MODULE_ID]: { chronicle: page().flags[MODULE_ID].chronicle } } });
    await tick();
  }

  async function openOn(text) {
    await chronicle.addChronicleEntry('pc-1', { type: 'annotation', text });
    chroniclePanel.openChroniclePanel('pc-1');
    await vi.waitFor(() => expect(panel?.rendered).toBe(true));
    const [entry] = await chronicle.getChronicleEntries('pc-1');
    return entry;
  }

  it('the text being typed survives the re-render, keeps focus, and is saved on blur', async () => {
    const entry = await openOn('Original.');
    const editing = textEl(entry.id);
    editing.textContent = 'Original — the hand was burned.';
    globalThis.document.activeElement = editing;
    const focused = [];
    vi.spyOn(StubElement.prototype, 'focus').mockImplementation(function () { focused.push(this); });

    await automaticEntryArrives();

    expect(panel.element.textContent).toContain('New automatic beat.');                    // control: it re-rendered
    const fresh = textEl(entry.id);
    expect(fresh).not.toBe(editing);
    expect(fresh.textContent).toBe('Original — the hand was burned.');
    expect(focused).toEqual([fresh]);

    fresh.dispatchEvent(new StubEvent('blur'));
    await Promise.all(pending);
    expect((await chronicle.getChronicleEntries('pc-1')).map(e => e.text))
      .toEqual(['Original — the hand was burned.', 'New automatic beat.']);
  });

  it('control: an entry only clicked into shows the newer stored text, and its blur saves nothing', async () => {
    const entry = await openOn('Original.');
    globalThis.document.activeElement = textEl(entry.id);
    // Another client corrects the entry meanwhile.
    await chronicle.updateChronicleEntry('pc-1', entry.id, 'Corrected by the GM.');

    await automaticEntryArrives();

    const fresh = textEl(entry.id);
    expect(fresh.textContent).toBe('Corrected by the GM.');
    fresh.dispatchEvent(new StubEvent('blur'));
    await Promise.all(pending);
    expect((await chronicle.getChronicleEntries('pc-1')).map(e => e.text))
      .toEqual(['Corrected by the GM.', 'New automatic beat.']);
  });
});

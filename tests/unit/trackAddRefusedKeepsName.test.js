/**
 * STARFORGED COMPANION
 * tests/unit/trackAddRefusedKeepsName.test.js
 *
 * Known issue TRACK-ADD-REFUSED-LOSES-NAME (found while fixing issue #338) —
 * the Progress Tracks panel cleared the typed track name before it asked the
 * canonical GM for the add, so an add that was not made lost the name: the
 * user typed it again to retry. An add is not made when the world refuses the
 * GM's journal write, or when no GM is connected to take a player's. The form
 * now comes back as it was submitted — name, type and rank — once the add is
 * known not to have been made; unless the user has started another entry
 * meanwhile. The name is still cleared at the press, so a second press while
 * the first is in flight adds nothing twice; an add that lands, or a
 * player's add relayed to a connected GM (no answer comes back), leaves it
 * cleared.
 *
 * The panel renders and re-renders as ApplicationV2 does (prepare → render →
 * replace the content), so the form's re-render after the refusal
 * (replaceKeepingInput, issue #337 Y45) is part of what is checked.
 */

/* global expectConsoleError, asPlayer */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { StubElement, StubEvent } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const CS = `${MODULE_ID}.campaignState`;
const TRACKS_JOURNAL = 'Starforged Progress Tracks';

let progress;

beforeAll(async () => {
  progress = await import('../../src/ui/progressTracks.js');
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

let savedJournal, savedDocument, journal, tracks, refuseWrite, pendingWrite;

beforeEach(() => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
  tracks = [];
  refuseWrite = false;
  pendingWrite = null;
  journal = {
    id: 'pt', name: TRACKS_JOURNAL,
    getFlag: (m, k) => (m === MODULE_ID && k === 'tracks' ? tracks : undefined),
    async setFlag(m, k, v) {
      if (pendingWrite) await pendingWrite.promise;
      if (refuseWrite) throw new Error('refused by the test');
      tracks = JSON.parse(JSON.stringify(v));
    },
  };
  savedJournal = game.journal;
  game.journal = { ...savedJournal, find: (fn) => (fn(journal) ? journal : null) };
  game.settings._store.set(CS, { currentSessionId: 's-1', clocks: [] });
});

afterEach(() => {
  game.journal = savedJournal;
  game.settings._store.delete(CS);
  globalThis.document = savedDocument;
});

/** The open panel, rendered, with the add form filled in. */
async function panelWith({ label, type, rank }) {
  const app = progress.ProgressTrackApp.open();
  app.render = () => renderLikeFoundry(app);
  await renderLikeFoundry(app);
  field(app, 'newLabel').value = label;
  field(app, 'newType').value  = type;
  field(app, 'newRank').value  = rank;
  return app;
}

const field = (app, name) => app.element.querySelector(`[name="${name}"]`);
const form  = (app) => ({ label: field(app, 'newLabel').value, type: field(app, 'newType').value, rank: field(app, 'newRank').value });

/** Press Add; resolves once the add and the panel's re-render have run. */
async function pressAdd(app) {
  const add = app.element.querySelector('[data-action="addTrack"]');
  await app.constructor.DEFAULT_OPTIONS.actions.addTrack.call(app, new StubEvent('click'), add);
  await tick();
}

describe('a refused Progress Tracks add keeps what was typed (TRACK-ADD-REFUSED-LOSES-NAME)', () => {
  it("the GM's own add the world refuses: the name, type and rank are back after the re-render", async () => {
    expectConsoleError(/progress track "add" failed/);
    const error = vi.spyOn(ui.notifications, 'error');
    const app = await panelWith({ label: 'Escape the flooding chamber', type: 'expedition', rank: 'formidable' });
    refuseWrite = true;

    await pressAdd(app);

    expect(error).toHaveBeenCalledWith(expect.stringMatching(/could not be saved/));   // control: it was refused
    expect(tracks).toEqual([]);
    expect(form(app)).toEqual({ label: 'Escape the flooding chamber', type: 'expedition', rank: 'formidable' });
  });

  it("a player's add with no GM connected: told so, and the name is back to add again", async () => {
    const restoreUser = asPlayer();
    game.users._set([{ id: 'test-user-player', isGM: false, active: true }]);
    const warn = vi.spyOn(ui.notifications, 'warn');
    try {
      const app = await panelWith({ label: 'The Ravager Nest', type: 'combat', rank: 'dangerous' });

      await pressAdd(app);

      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/no GM is connected/));
      expect(form(app)).toEqual({ label: 'The Ravager Nest', type: 'combat', rank: 'dangerous' });
    } finally {
      game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
      restoreUser();
    }
  });

  it('control: a name typed while the refused add was in flight is not overwritten', async () => {
    expectConsoleError(/progress track "add" failed/);
    const app = await panelWith({ label: 'First track', type: 'expedition', rank: 'formidable' });
    let release;
    pendingWrite = { promise: new Promise(r => { release = r; }) };
    refuseWrite = true;

    const add = app.element.querySelector('[data-action="addTrack"]');
    const work = app.constructor.DEFAULT_OPTIONS.actions.addTrack.call(app, new StubEvent('click'), add);
    await tick();
    expect(field(app, 'newLabel').value).toBe('');                 // cleared at the press
    field(app, 'newLabel').value = 'Second track';                  // the user starts another
    field(app, 'newType').value  = 'combat';
    release();
    await work;
    await tick();

    expect(form(app)).toMatchObject({ label: 'Second track', type: 'combat' });
  });

  it('control: an add that lands clears the name and keeps the type and rank (issue #337 Y45)', async () => {
    const app = await panelWith({ label: 'Chart the Rift', type: 'expedition', rank: 'extreme' });

    await pressAdd(app);

    expect(tracks).toEqual([expect.objectContaining({ label: 'Chart the Rift', type: 'expedition', rank: 'extreme' })]);
    expect(form(app)).toEqual({ label: '', type: 'expedition', rank: 'extreme' });
  });

  it("control: a player's add relayed to a connected GM clears the name — it was sent", async () => {
    const restoreUser = asPlayer();
    game.users._set([
      { id: 'test-user-gm', isGM: true, active: true },
      { id: 'test-user-player', isGM: false, active: true },
    ]);
    game.socket._reset();
    try {
      const app = await panelWith({ label: 'Hold the line', type: 'combat', rank: 'troublesome' });

      await pressAdd(app);

      expect(game.socket._emitted).toEqual([expect.objectContaining({
        payload: expect.objectContaining({ payload: { op: 'add', label: 'Hold the line', type: 'combat', rank: 'troublesome' } }),
      })]);
      expect(field(app, 'newLabel').value).toBe('');
    } finally {
      game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
      restoreUser();
      game.socket._reset();
    }
  });
});

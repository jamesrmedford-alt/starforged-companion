/**
 * STARFORGED COMPANION
 * tests/unit/trackRowVowChoiceKept.test.js
 *
 * Issue #362 AC63 TRACK-ROW-VOW-CHOICE-WIPED (an incomplete fix of issue #337
 * Y45 for the issue #353 R3 control). The Progress Tracks panel re-renders on
 * every client whenever the tracks journal changes (a crewmate's Strike
 * marking the fight, a move's progress mark, a position toggle) or a clock it
 * shows advances. Y45 made the re-render keep what the user is entering — but
 * only the add form's fields (`replaceKeepingInput(…, { fields: '.add-track-
 * fields [name]' })`). R3 added the vow select on each open expedition's /
 * scene challenge's row, read by its 🔗 button: a re-render between choosing
 * the vow and pressing 🔗 put the select back to the stored link ("— no vow —"
 * for an unlinked track), and the press sent `linkVow` with an empty vowId —
 * nothing linked, nobody told. The row's choice now survives a re-render, by
 * its track, as the add form's fields do; a 🔗 pressed with nothing chosen on
 * a track that serves no vow says so and sends nothing.
 *
 * The real ProgressTrackApp render (prepare → _renderHTML → _replaceHTML), its
 * updateJournalEntry hook and its linkTrackVow action, on the DOM stub the
 * panel tests use — from the audit's probe
 * (tests/probes/uisec/trackRowVowChoiceWiped.probe.js).
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { StubElement } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const CS = `${MODULE_ID}.campaignState`;
const TRACKS_JOURNAL = 'Starforged Progress Tracks';
const ROW_SELECT = 'select[name="trackVow"][data-track-id="exp-1"]';

let progress;

beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  progress = await import('../../src/ui/progressTracks.js');
  progress.registerProgressTrackHooks();
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

const vowItem = (id, name) => ({
  id, type: 'progress', name, system: { subtype: 'vow', rank: 'dangerous', current: 0, completed: false },
  flags: { [MODULE_ID]: { vowId: id } },
});

let savedJournal, savedDocument, journal, tracks;

beforeEach(() => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
  tracks = [
    { id: 'exp-1', label: 'Toward the gap', type: 'expedition', rank: 'dangerous', ticks: 4, completed: false, createdAt: 1 },
    { id: 'fight-1', label: 'Corsairs', type: 'combat', rank: 'dangerous', ticks: 4, completed: false, createdAt: 2 },
  ];
  journal = {
    id: 'pt', name: TRACKS_JOURNAL,
    getFlag: (m, k) => (m === MODULE_ID && k === 'tracks' ? tracks : undefined),
    setFlag: async (m, k, v) => { tracks = JSON.parse(JSON.stringify(v)); },
  };
  savedJournal = game.journal;
  game.journal = { ...savedJournal, find: (fn) => (fn(journal) ? journal : null) };
  game.settings._store.set(CS, { currentSessionId: 's-1', sessionActive: true, clocks: [] });
  game.actors._reset?.();
  const kira = global.makeTestActor({ id: 'pc-kira', type: 'character', name: 'Kira', items: { contents: [
    vowItem('v-hollow', 'Avenge the Iron Hollow'),
    vowItem('v-beacon', 'Find the lost beacon'),
  ] } });
  game.actors._set(kira.id, kira);
});

afterEach(() => {
  game.journal = savedJournal;
  game.settings._store.delete(CS);
  game.actors._reset?.();
  globalThis.document = savedDocument;
});

/** A player's Strike marks the fight: the tracks flag changes and every client hears updateJournalEntry. */
async function crewmateMarksTheFight() {
  tracks = tracks.map(t => (t.id === 'fight-1' ? { ...t, ticks: 12 } : t));
  await Hooks.call('updateJournalEntry', journal, { flags: { [MODULE_ID]: { tracks } } }, {}, 'gm-1');
  await tick();
}

async function openPanel() {
  const app = progress.ProgressTrackApp.open();
  app.render = () => renderLikeFoundry(app);
  await renderLikeFoundry(app);
  return app;
}

describe('UISEC-05: a vow chosen on a track\'s row survives a re-render someone else caused', () => {
  it('control: the row offers the open vows, and the add form keeps its fields across the re-render (Y45 holds)', async () => {
    const app = await openPanel();
    const select = app.element.querySelector(ROW_SELECT);
    expect(select).toBeTruthy();
    expect(select.querySelectorAll('option').map(o => o.value)).toEqual(['', 'v-hollow', 'v-beacon']);
    app.element.querySelector('[name="newLabel"]').value = 'The Ravager Nest';
    app.element.querySelector('[name="newVow"]').value = 'v-beacon';

    await crewmateMarksTheFight();

    expect(app.element.textContent).toContain('12 / 40 ticks');                       // it re-rendered
    expect(app.element.querySelector('[name="newLabel"]').value).toBe('The Ravager Nest');
    expect(app.element.querySelector('[name="newVow"]').value).toBe('v-beacon');
  });

  it('control: with no re-render in between, 🔗 links the vow chosen on the row', async () => {
    const app = await openPanel();
    app.element.querySelector(ROW_SELECT).value = 'v-beacon';
    await progress.ProgressTrackApp.DEFAULT_OPTIONS.actions.linkTrackVow.call(app, {}, { dataset: { trackId: 'exp-1' } });
    expect(tracks.find(t => t.id === 'exp-1')).toMatchObject({ linkedVowId: 'v-beacon', linkedVowName: 'Find the lost beacon' });
  });

  it('the vow chosen on the expedition\'s row is still chosen after a crewmate\'s mark re-renders the panel', async () => {
    const app = await openPanel();
    app.element.querySelector(ROW_SELECT).value = 'v-beacon';

    await crewmateMarksTheFight();

    expect(app.element.textContent).toContain('12 / 40 ticks');                       // it re-rendered
    // Not '' — "— no vow —", the stored (absent) link (AC63).
    expect(app.element.querySelector(ROW_SELECT).value).toBe('v-beacon');
  });

  it('…and the 🔗 pressed after it links that vow', async () => {
    const app = await openPanel();
    app.element.querySelector(ROW_SELECT).value = 'v-beacon';
    await crewmateMarksTheFight();

    await progress.ProgressTrackApp.DEFAULT_OPTIONS.actions.linkTrackVow.call(app, {}, { dataset: { trackId: 'exp-1' } });

    // Not left unlinked (linkedVowId null), with no notice (AC63).
    expect(tracks.find(t => t.id === 'exp-1')?.linkedVowId).toBe('v-beacon');
  });
});

describe('issue #362 AC63 — a 🔗 pressed with nothing chosen says so', () => {
  const link = (app, trackId = 'exp-1') =>
    progress.ProgressTrackApp.DEFAULT_OPTIONS.actions.linkTrackVow.call(app, {}, { dataset: { trackId } });

  it('"— no vow —" on a track that serves none: the presser is told, and no edit is sent', async () => {
    const app = await openPanel();
    const info = vi.spyOn(ui.notifications, 'info');
    const setFlag = vi.spyOn(journal, 'setFlag');
    await link(app);
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/choose the vow this track serves.*nothing was linked/i));
    expect(setFlag).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it('control: "— no vow —" on a linked track is the unlink', async () => {
    tracks = tracks.map(t => (t.id === 'exp-1' ? { ...t, linkedVowId: 'v-hollow', linkedVowName: 'Avenge the Iron Hollow' } : t));
    const app = await openPanel();
    expect(app.element.querySelector(ROW_SELECT).value, 'setup: the row shows the link').toBe('v-hollow');
    app.element.querySelector(ROW_SELECT).value = '';
    await link(app);
    expect(tracks.find(t => t.id === 'exp-1')).toMatchObject({ linkedVowId: null, linkedVowName: null });
  });

  it('control: a row whose choice was not changed shows the link another client stored, not its old one', async () => {
    const app = await openPanel();
    // Another client links the beacon vow: the panel re-renders with it.
    tracks = tracks.map(t => (t.id === 'exp-1' ? { ...t, linkedVowId: 'v-beacon', linkedVowName: 'Find the lost beacon' } : t));
    await Hooks.call('updateJournalEntry', journal, { flags: { [MODULE_ID]: { tracks } } }, {}, 'gm-1');
    await tick();
    expect(app.element.querySelector(ROW_SELECT).value).toBe('v-beacon');
  });
});

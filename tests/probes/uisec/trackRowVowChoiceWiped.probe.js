// tests/probes/uisec/trackRowVowChoiceWiped.probe.js
//
// UISEC-05 · TRACK-ROW-VOW-CHOICE-WIPED (INCOMPLETE-FIX of issue #337 Y45 for the #353 R3 control)
//
// Scenario: the Progress Tracks panel re-renders on every client whenever the
// tracks journal changes (another player's Strike marking the fight, a move's
// progress mark, a position toggle) or a clock it shows advances. Issue #337
// Y45 made that re-render keep what the user is entering — but only the add
// form's fields (`replaceKeepingInput(…, { fields: '.add-track-fields [name]' })`).
// Issue #353 R3 added a second control the user fills before pressing: the
// vow select on each open expedition's / scene challenge's row, read by its
// 🔗 button. A re-render between choosing the vow and pressing 🔗 puts the
// select back to the stored link ("— no vow —" for an unlinked track), and
// the press then sends that: `linkVow` with an empty vowId — nothing is
// linked, nobody is told (an unlink of an unlinked track is "applied").
//
// Correct: the vow chosen on a row survives a re-render someone else caused,
// as the add form's fields do; the 🔗 press links the vow the user chose.
// Today: the choice is reset to "— no vow —" and the press links nothing.
//
// Production path: the real ProgressTrackApp render (prepare → _renderHTML →
// _replaceHTML), its updateJournalEntry hook and its linkTrackVow action, on
// the DOM stub the panel tests use (tests/unit/panelRerenderKeepsInput.test.js).

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { StubElement } from '../../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const CS = `${MODULE_ID}.campaignState`;
const TRACKS_JOURNAL = 'Starforged Progress Tracks';
const ROW_SELECT = 'select[name="trackVow"][data-track-id="exp-1"]';

let progress;

beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  progress = await import('../../../src/ui/progressTracks.js');
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
    // Today: '' — "— no vow —", the stored (absent) link.
    expect(app.element.querySelector(ROW_SELECT).value).toBe('v-beacon');
  });

  it('…and the 🔗 pressed after it links that vow', async () => {
    const app = await openPanel();
    app.element.querySelector(ROW_SELECT).value = 'v-beacon';
    await crewmateMarksTheFight();

    await progress.ProgressTrackApp.DEFAULT_OPTIONS.actions.linkTrackVow.call(app, {}, { dataset: { trackId: 'exp-1' } });

    // Today: the track stays unlinked (linkedVowId null), with no notice.
    expect(tracks.find(t => t.id === 'exp-1')?.linkedVowId).toBe('v-beacon');
  });
});

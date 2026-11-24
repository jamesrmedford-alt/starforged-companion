/**
 * STARFORGED COMPANION
 * tests/unit/sessionRecordPlayKinds.test.js — what play changes, on the record (issue #382, slice 2)
 *
 * The kinds the campaign recap's turning points and the Session Log read,
 * each at the one place it already happens:
 *   - a track begun, marked, moved, ended — the progress tracks' one save,
 *     diffed (trackDiff.js);
 *   - a vow sworn, marked, closed, tied to a connection — the sheet watch on a
 *     PC's vow Items, however they changed;
 *   - a connection made, developed, bonded, lost — entities/connection.js;
 *   - a clock advanced — the clocks' one save, diffed; a hidden plan's never;
 *   - a scene begun and ended, its frame — sceneLifecycle.js and the ledger
 *     differ; an @scene question — the card hook;
 *   - a card's choice — the relay's dispatch (`GM_ACTIONS` `record`);
 *   - an arrival — once the current place is saved.
 * And the read: what play did joins its move's beat, a shared vow's copies
 * count once, a beat that changed something for good is `lasting`.
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/moves/milestonePicker.js', async (importOriginal) => ({
  ...(await importOriginal()),
  applyMilestonePick: vi.fn(async (payload) => (payload.refuse ? { applied: false } : { applied: true })),
}));

import { trackEvents } from '../../src/record/trackDiff.js';
import { ledgerEvents } from '../../src/record/ledgerDiff.js';
import { registerSheetWatch } from '../../src/record/sheetWatch.js';
import { registerRecordCardHook } from '../../src/record/cards.js';
import { recordPlaceArrival } from '../../src/record/tableSnapshot.js';
import { recordSettled, _resetRecordForTests } from '../../src/record/record.js';
import { readRecord } from '../../src/record/read.js';
import { narratorMemoryCard } from '../../src/narration/narrator.js';
import { runGmAction } from '../../src/multiplayer/gmRelay.js';
import { applyClockAdvances } from '../../src/clocks/clocks.js';
import { markRelationshipProgress, forgeBond, loseConnection } from '../../src/entities/connection.js';
import { startScene, endScene } from '../../src/factContinuity/sceneLifecycle.js';
import { JOURNAL_NAMES } from '../../src/world/worldJournal.js';
import { installJournalMock, addConnectionEntity } from '../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-5';

let journals;
const stored = () => Object.values(journals.journals.get(JOURNAL_NAMES.sessionLog)?.pages.contents
  .find(p => p.flags?.[MODULE_ID]?.sessionLogPage?.sessionId === SESSION)?.flags?.[MODULE_ID]?.sessionRecord?.events ?? {})
  .sort((a, b) => a.seq - b.seq);
const kinds = () => stored().map(e => e.k);

beforeEach(() => {
  journals = installJournalMock();
  _resetRecordForTests();
  game.user = { isGM: true, id: 'test-user-gm' };
  game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  game.settings._store.set(KEY, { currentSessionId: SESSION, sessionNumber: 5, currentSceneId: 'sc-1', sceneTruths: [], clocks: [] });
  registerSheetWatch();
  registerRecordCardHook({ inMemory: narratorMemoryCard });
});
afterEach(() => {
  journals.restore();
  game.settings._store.delete(KEY);
  game.actors._reset?.();
});

describe('tracks — the one save, diffed by track id', () => {
  const fight = (over = {}) => ({ id: 'tr-f', type: 'combat', label: 'Hold the breach', rank: 'dangerous', ticks: 0, completed: false, ...over });

  it('a track begun, marked, a character\'s position moved, ended — and one gone unfinished', () => {
    expect(trackEvents([], [fight()]).map(e => [e.kind, e.payload.d.label])).toEqual([['track.begun', 'Hold the breach']]);
    expect(trackEvents([fight()], [fight({ ticks: 8, positions: { 'pc-1': 'in_control' } })]).map(e => [e.kind, e.payload.d.to])).toEqual([
      ['progress.marked', 8], ['position.changed', 'in_control'],
    ]);
    expect(trackEvents([fight({ ticks: 40 })], [fight({ ticks: 40, completed: true })]).map(e => [e.kind, e.payload.d.completed])).toEqual([['track.ended', true]]);
    expect(trackEvents([fight()], []).map(e => [e.kind, e.payload.d.completed])).toEqual([['track.ended', false]]);
  });

  it('a vow\'s and a connection\'s journal twins are left out — each is recorded where it lives', () => {
    expect(trackEvents([], [{ id: 'v1', type: 'vow', label: 'Find the ark', ticks: 0 }, { id: 'c1', type: 'connection', label: 'Tamsin', ticks: 0 }])).toEqual([]);
  });
});

describe('vows — the sheet watch on a PC\'s vow Items', () => {
  /** An Item update as Foundry v13 runs it: preUpdate on the writer, the change, update everywhere. */
  async function itemEdit(item, change, options = {}) {
    Hooks.call('preUpdateItem', item, change, options, 'pl-1');
    const set = (obj, path, value) => { const parts = path.split('.'); let cur = obj; for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}); cur[parts.at(-1)] = value; };
    for (const [path, value] of Object.entries(flat(change))) set(item, path, value);
    Hooks.call('updateItem', item, change, options, 'pl-1');
    await recordSettled();
  }
  const flat = (o, pre = '') => Object.entries(o).reduce((acc, [k, v]) => (v && typeof v === 'object' && !Array.isArray(v)
    ? { ...acc, ...flat(v, `${pre}${k}.`) } : { ...acc, [`${pre}${k}`]: v }), {});

  function vowOn(actor, id, vowId) {
    const item = { id, type: 'progress', name: 'Find the lost ark', parent: actor,
      system: { subtype: 'vow', rank: 2, current: 0, completed: false }, flags: { [MODULE_ID]: { vowId, sharedVow: true } } };
    return item;
  }

  it('sworn, marked, fulfilled — a shared vow\'s two copies count once in the read', async () => {
    const kira = makeTestActor({ id: 'pc-kira', name: 'Kira' });
    const ren = makeTestActor({ id: 'pc-ren', name: 'Ren' });
    const a = vowOn(kira, 'it-a', 'vow-ark');
    const b = vowOn(ren, 'it-b', 'vow-ark');
    Hooks.call('createItem', a, {}, 'test-user-gm');
    Hooks.call('createItem', b, {}, 'test-user-gm');
    await recordSettled();
    await itemEdit(a, { system: { current: 8 } });
    await itemEdit(b, { system: { current: 8 } });
    await itemEdit(a, { system: { completed: true } });
    expect(kinds()).toEqual(['vow.sworn', 'vow.sworn', 'progress.marked', 'progress.marked', 'vow.closed']);
    expect(stored().find(e => e.k === 'vow.closed')).toMatchObject({ ref: { vow: 'vow-ark' }, d: { name: 'Find the lost ark', how: 'fulfilled' } });

    const did = readRecord({ session: SESSION }).sessions[0].beats.flatMap(b => b.did.map(d => d.kind));
    expect(did).toEqual(['vow.sworn', 'progress.marked', 'vow.closed']);
    expect(readRecord({ session: SESSION }).sessions[0].beats.map(b => b.lasting).filter(Boolean)).toEqual(['a vow sworn', 'a vow fulfilled']);
  });

  it('forsaken: the flag the forsake stamps after the completion closes it as forsaken', async () => {
    const kira = makeTestActor({ id: 'pc-kira', name: 'Kira' });
    const a = vowOn(kira, 'it-a', 'vow-x');
    await itemEdit(a, { system: { completed: true } });
    await itemEdit(a, { flags: { [MODULE_ID]: { forsaken: true } } });
    expect(stored().filter(e => e.k === 'vow.closed').map(e => e.d.how)).toEqual(['fulfilled', 'forsaken']);
  });
});

describe('connections, clocks, scenes, arrivals', () => {
  it('a connection developed, bonded and lost — once the record took each', async () => {
    const { journalId } = addConnectionEntity(journals.journals, { name: 'Tamsin', rank: 'dangerous' });
    game.settings._store.set(KEY, { ...game.settings.get(MODULE_ID, 'campaignState'), connectionIds: [journalId] });
    await markRelationshipProgress(journalId, 1);
    await forgeBond(journalId);
    await loseConnection(journalId, 'betrayed the crew');
    await new Promise(r => setTimeout(r, 0));
    await recordSettled();
    expect(stored().map(e => [e.k, e.ref.conn, e.d.name])).toEqual([
      ['connection.developed', journalId, 'Tamsin'], ['connection.bonded', journalId, 'Tamsin'], ['connection.lost', journalId, 'Tamsin'],
    ]);
    expect(stored()[0].d.ticks).toEqual({ from: 0, to: 8 });
  });

  it('a clock advanced at its save; a hidden plan\'s clock never', async () => {
    game.settings._store.set(KEY, { ...game.settings.get(MODULE_ID, 'campaignState'), clocks: [
      { _id: 'ck-1', name: 'The patrol closes in', segments: 4, filled: 1 },
      { _id: 'ck-p', name: 'Vex', segments: 6, filled: 0, planId: 'plan-1' },
    ] });
    await applyClockAdvances([{ _id: 'ck-1', filled: 2 }, { _id: 'ck-p', filled: 3 }]);
    await recordSettled();
    expect(stored().map(e => [e.k, e.ref.clock, e.d.from, e.d.to])).toEqual([['clock.advanced', 'ck-1', 1, 2]]);
  });

  it('a scene begun and ended', async () => {
    game.settings._store.set(KEY, { ...game.settings.get(MODULE_ID, 'campaignState'), currentSceneId: null });
    const cs = { ...game.settings.get(MODULE_ID, 'campaignState') };
    const id = await startScene(cs, { reason: 'test' });
    await endScene({ ...game.settings.get(MODULE_ID, 'campaignState') }, { reason: 'scene_command' });
    await recordSettled();
    expect(stored().map(e => [e.k, e.d.sceneId])).toEqual([['scene.started', id], ['scene.ended', id]]);
  });

  it('an arrival names the place as the record has it', async () => {
    game.actors._set?.('loc-1', makeTestActor({ id: 'loc-1', name: 'Bleakhold Station', type: 'location' }));
    await recordPlaceArrival({ ...game.settings.get(MODULE_ID, 'campaignState'), currentLocationId: 'loc-1', currentLocationType: 'settlement' }, { res: 'res-1' });
    await recordSettled();
    expect(stored()).toEqual([expect.objectContaining({ k: 'place.arrived', ref: { place: 'loc-1', res: 'res-1' }, d: expect.objectContaining({ how: 'move' }) })]);
  });
});

describe('the frame, a question, a choice', () => {
  it('a changed scene frame is `frame`, stamped with the narration that wrote it', () => {
    const before = { currentSceneId: 'sc-1', sceneTruths: [], sceneFrame: { location: 'The docks', present: [], situation: 'Waiting' } };
    const after = { ...before, sceneFrame: { location: 'The docks', present: ['Tamsin'], situation: 'Haggling', question: 'Will she sell?', narrationId: 'nar-9' } };
    expect(ledgerEvents(before, after)).toEqual([{ kind: 'frame', payload: expect.objectContaining({
      ref: { nar: 'nar-9' }, d: { location: 'The docks', present: ['Tamsin'], situation: 'Haggling', question: 'Will she sell?', questionAnswered: false },
    }) }]);
    expect(ledgerEvents(after, after)).toEqual([]);
  });

  it('an @scene question is a beat of its own, its answer with it — not something that happened', async () => {
    Hooks.call('createChatMessage', { id: 'card-q', author: { id: 'test-user-gm' }, whisper: [], flags: { [MODULE_ID]: {
      narratorCard: true, sessionId: SESSION, narrationId: 'nar-q', narrationText: 'The hatch is sealed.', sceneResponse: true, sceneQuestion: 'Is the hatch sealed?',
    } } });
    await recordSettled();
    expect(kinds()).toEqual(['question', 'narration']);
    const [beat] = readRecord({ session: SESSION }).sessions[0].beats;
    expect(beat).toMatchObject({ kind: 'question', line: { text: 'Is the hatch sealed?' }, told: { text: 'The hatch is sealed.', mode: 'scene_answer' }, lasting: null });
  });

  it('a card press a GM_ACTIONS row marks `record` is a choice — the press\'s own pick, by the requester — and a refused press is none', async () => {
    await runGmAction('milestone.pick', { messageId: 'card-m', pick: 'vow-ark' }, { requesterId: 'pl-1' });
    await runGmAction('milestone.pick', { messageId: 'card-m', pick: 'vow-other', refuse: true }, { requesterId: 'pl-1' });
    await new Promise(r => setTimeout(r, 0));
    await recordSettled();
    expect(stored().map(e => [e.k, e.who.user, e.ref.card, e.d])).toEqual([['choice', 'pl-1', 'card-m', { action: 'milestone.pick', picked: 'vow-ark' }]]);
  });
});

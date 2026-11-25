/**
 * STARFORGED COMPANION
 * tests/unit/stateEventsSayWhatMadeThem.test.js
 *
 * Overhaul 4, D12: every move-only state event on the session record names
 * what made it — `by`: `{ move, res }` for a move, `"setup"`, or `"hand"` for
 * the table's own (the sheet's edit, the Progress Tracks panel, `!sever`).
 * `connection.made` carried it since slice 3; here the rest — a vow's
 * `progress.marked` and `vow.closed` (record/sheetWatch.js, from the cause a
 * module writer passes), a track's `track.begun` / `progress.marked` /
 * `track.ended` (record/trackDiff.js, from the save's `by`), and
 * `connection.developed` / `.bonded` / `.lost` (entities/connection.js). A
 * view says the hand as the hand (record/phrasing.js), never as a deed.
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerSheetWatch, recordCause } from '../../src/record/sheetWatch.js';
import { recordSettled, _resetRecordForTests } from '../../src/record/record.js';
import { recordTrackChanges } from '../../src/record/trackDiff.js';
import { didText } from '../../src/record/phrasing.js';
import { JOURNAL_NAMES } from '../../src/world/worldJournal.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';

let journals;
const logPage = () => journals.journals.get(JOURNAL_NAMES.sessionLog)?.pages.contents
  .find(p => p.flags?.[MODULE_ID]?.sessionLogPage?.sessionId === SESSION) ?? null;
const stored = () => Object.values(logPage()?.flags?.[MODULE_ID]?.sessionRecord?.events ?? {});
const madeBy = (...kinds) => stored().filter(e => kinds.includes(e.k)).map(e => [e.k, e.d.by ?? null]);

beforeEach(() => {
  journals = installJournalMock();
  _resetRecordForTests();
  game.user = { isGM: true, id: 'test-user-gm' };
  game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  game.settings._store.set(KEY, { currentSessionId: SESSION, sessionNumber: 7, currentSceneId: 'sc-1', sceneTruths: [] });
  registerSheetWatch();
});
afterEach(() => {
  journals.restore();
  game.settings._store.delete(KEY);
});

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {});
  cur[parts.at(-1)] = value;
}

/** An Item update as Foundry v13 runs it: preUpdate on the writing client, the change applied, update everywhere. */
async function itemEdit(item, change, options = {}, userId = 'pl-1') {
  const expanded = {};
  for (const [path, value] of Object.entries(change)) setPath(expanded, path, value);
  Hooks.call('preUpdateItem', item, expanded, options, userId);
  for (const [path, value] of Object.entries(change)) setPath(item, path, value);
  Hooks.call('updateItem', item, expanded, options, userId);
  await recordSettled();
}

function kiraWithVow() {
  const pc = makeTestActor({ id: 'pc-kira', name: 'Kira', hasPlayerOwner: true });
  const vow = { id: 'v-chen', name: 'Find Chen', type: 'progress', parent: pc,
    system: { subtype: 'vow', rank: 'dangerous', current: 8, completed: false }, flags: { [MODULE_ID]: { vowId: 'v-chen' } } };
  return { pc, vow };
}

describe('a vow\'s progress and its close name what made them', () => {
  it('a move\'s: the move and its resolution, as the writer\'s cause says', async () => {
    const { vow } = kiraWithVow();
    await itemEdit(vow, { 'system.current': 16 }, recordCause({ kind: 'move', move: 'reach_a_milestone', res: 'res-1' }), 'test-user-gm');
    await itemEdit(vow, { 'system.completed': true }, recordCause({ kind: 'move', move: 'fulfill_your_vow', res: 'res-2' }), 'test-user-gm');
    expect(madeBy('progress.marked', 'vow.closed')).toEqual([
      ['progress.marked', { move: 'reach_a_milestone', res: 'res-1' }],
      ['vow.closed', { move: 'fulfill_your_vow', res: 'res-2' }],
    ]);
  });

  it('the sheet\'s own edit: the hand (D7)', async () => {
    const { vow } = kiraWithVow();
    await itemEdit(vow, { 'system.current': 12 });
    await itemEdit(vow, { 'system.completed': true });
    expect(madeBy('progress.marked', 'vow.closed')).toEqual([['progress.marked', 'hand'], ['vow.closed', 'hand']]);
  });
});

describe('a track\'s save names what made it', () => {
  const fight = (over = {}) => ({ id: 't-1', type: 'combat', label: 'The raiders', rank: 'dangerous', ticks: 0, completed: false, ...over });

  it('a move\'s begun, marked and ended carry it; a position change does not', async () => {
    const by = { move: 'enter_the_fray', res: null };
    recordTrackChanges([], [fight()], { by });
    recordTrackChanges([fight()], [fight({ ticks: 8 })], { by: { move: 'strike', res: 'res-3' } });
    recordTrackChanges([fight({ ticks: 8 })], [fight({ ticks: 8, combatState: 'in_control' })], { by: { move: 'strike', res: 'res-3' } });
    recordTrackChanges([fight({ ticks: 8 })], [fight({ ticks: 40, completed: true })], { by: 'hand' });
    await recordSettled();
    expect(madeBy('track.begun', 'progress.marked', 'track.ended')).toEqual([
      ['track.begun', { move: 'enter_the_fray', res: null }],
      ['progress.marked', { move: 'strike', res: 'res-3' }],
      ['progress.marked', 'hand'],
      ['track.ended', 'hand'],
    ]);
    expect(stored().filter(e => e.k === 'position.changed').every(e => e.d.by === undefined)).toBe(true);
  });

  it('a save that names nothing says nothing of it', async () => {
    recordTrackChanges([], [fight()]);
    await recordSettled();
    expect(madeBy('track.begun')).toEqual([['track.begun', null]]);
  });
});

describe('a view says the hand as the hand, never as a deed', () => {
  it('"(set by hand)" after what it did; a move\'s is said as it was', () => {
    expect(didText({ kind: 'progress.marked', label: 'Find Chen', from: 8, to: 12, by: 'hand' })).toMatch(/^progress on .*Find Chen.* \(set by hand\)$/);
    expect(didText({ kind: 'track.begun', type: 'combat', label: 'The raiders', by: 'hand' })).toMatch(/\(set by hand\)$/);
    expect(didText({ kind: 'progress.marked', label: 'Find Chen', from: 8, to: 12, by: { move: 'reach_a_milestone', res: null } })).not.toMatch(/by hand/);
  });
});

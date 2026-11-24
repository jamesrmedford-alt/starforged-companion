/**
 * STARFORGED COMPANION
 * tests/unit/sessionRecordObservers.test.js — the record's observed sites (issue #382, slice 1)
 *
 * Three kinds are observed where one place sees every writer, so a new write
 * path cannot forget them (rules/reachability.md §5):
 *   - `sheet.changed` — the sheet watch: every client stamps a sheet's values
 *     before its own edit into the update's options; the canonical GM, on the
 *     update, records each value that moved, with what caused it — the cause a
 *     module writer passed, a mirror's sibling write, a module write that
 *     passed none, or a hand on the sheet (decision D9);
 *   - `truth.set` / `truth.struck` — the ledger differ, by truth id, over the
 *     stored ledger and the ledger a save wrote;
 *   - `narration` — the card hook, mapping narrator memory's cards.
 * And the Session Log page itself: a page from before the record is never
 * rendered over; with `sessionLogAutoWrite` off the body is the title alone.
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerSheetWatch, recordCause } from '../../src/record/sheetWatch.js';
import { ledgerEvents } from '../../src/record/ledgerDiff.js';
import { registerRecordCardHook } from '../../src/record/cards.js';
import { renderSessionLogBody, renderSessionLog } from '../../src/record/sessionLogView.js';
import { recordSettled, _resetRecordForTests } from '../../src/record/record.js';
import { isRecordWrite } from '../../src/record/events.js';
import { readRecord } from '../../src/record/read.js';
import { applyMeterChanges } from '../../src/character/actorBridge.js';
import { narratorMemoryCard } from '../../src/narration/narrator.js';
import { JOURNAL_NAMES, getOrCreateSessionLogPage } from '../../src/world/worldJournal.js';
import { installJournalMock, makePage } from '../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-4';

let journals;
const logPage = () => journals.journals.get(JOURNAL_NAMES.sessionLog)?.pages.contents
  .find(p => p.flags?.[MODULE_ID]?.sessionLogPage?.sessionId === SESSION) ?? null;
const stored = () => Object.values(logPage()?.flags?.[MODULE_ID]?.sessionRecord?.events ?? {});

beforeEach(() => {
  journals = installJournalMock();
  _resetRecordForTests();
  game.user = { isGM: true, id: 'test-user-gm' };
  game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  game.settings._store.set(KEY, { currentSessionId: SESSION, sessionNumber: 4, currentSceneId: 'sc-1', sceneTruths: [] });
  registerSheetWatch();
});
afterEach(() => {
  journals.restore();
  game.settings._store.delete(KEY);
});

/**
 * An Actor update as Foundry v13 runs it: the change expanded, preUpdate on the
 * writing client, the change applied, update on every client with the same options.
 */
async function sheetEdit(actor, change, options = {}, userId = 'pl-1') {
  const expanded = {};
  for (const [path, value] of Object.entries(change)) setPath(expanded, path, value);
  Hooks.call('preUpdateActor', actor, expanded, options, userId);
  for (const [path, value] of Object.entries(change)) setPath(actor, path, value);
  Hooks.call('updateActor', actor, expanded, options, userId);
  await recordSettled();
}
function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {});
  cur[parts.at(-1)] = value;
}

describe('sheet.changed — every change to a PC\'s sheet, with what caused it', () => {
  it('a player\'s own edit of their sheet is recorded as the sheet\'s (decision D9)', async () => {
    const pc = makeTestActor({ id: 'pc-kira', name: 'Kira' });
    await sheetEdit(pc, { 'system.health.value': 3 });
    expect(stored().filter(e => e.k === 'sheet.changed').map(e => [e.who.user, e.d.actorId, e.d.what, e.d.from, e.d.to, e.d.cause.kind]))
      .toEqual([['pl-1', 'pc-kira', 'health', 5, 3, 'sheet']]);
  });

  it('a module writer\'s cause rides the write: the move and its resolution', async () => {
    const pc = makeTestActor({ id: 'pc-kira', name: 'Kira' });
    const options = recordCause({ kind: 'move', res: 'res-1' });
    await sheetEdit(pc, { 'system.momentum.value': 5 }, options, 'test-user-gm');
    const [e] = stored().filter(x => x.k === 'sheet.changed');
    expect(e).toMatchObject({ ref: { res: 'res-1' }, d: { what: 'momentum', from: 2, to: 5, cause: { kind: 'move', res: 'res-1' } } });
  });

  it('the bridge\'s applyMeterChanges passes its options to the update', async () => {
    const pc = makeTestActor({ id: 'pc-kira', name: 'Kira' });
    const update = pc.update;
    const seen = [];
    pc.update = async (changes, options) => { seen.push(options); return update.call(pc, changes, options); };
    await applyMeterChanges(pc, { momentum: 1 }, recordCause({ kind: 'choice', res: 'res-9', card: 'card-3' }));
    expect(seen).toEqual([{ [MODULE_ID]: { recordCause: { kind: 'choice', res: 'res-9', card: 'card-3' } } }]);
  });

  it('a mirror\'s sibling write is recorded as the mirror\'s; a write that changes no sheet value, and an NPC card, record nothing', async () => {
    const pc = makeTestActor({ id: 'pc-kira', name: 'Kira' });
    await sheetEdit(pc, { 'system.supply.value': 2 }, { [MODULE_ID]: { sharedSupplyMirror: true } }, 'test-user-gm');
    expect(stored().filter(e => e.k === 'sheet.changed').map(e => e.d.cause.kind)).toEqual(['mirror']);

    await sheetEdit(pc, { 'name': 'Kira Vale' });
    const npc = makeTestActor({ id: 'npc-1', name: 'Tamsin', flags: { [MODULE_ID]: { entityType: 'connection' } } });
    await sheetEdit(npc, { 'system.health.value': 1 });
    expect(stored().filter(e => e.k === 'sheet.changed')).toHaveLength(1);
  });

  it('an impact marked is one change', async () => {
    const pc = makeTestActor({ id: 'pc-kira', name: 'Kira' });
    await sheetEdit(pc, { 'system.debility.wounded': true });
    expect(stored().filter(e => e.k === 'sheet.changed').map(e => [e.d.what, e.d.from, e.d.to])).toEqual([['impact:wounded', false, true]]);
  });
});

describe('truth.set / truth.struck — a ledger save, by truth id', () => {
  const truth = (id, fact, extra = {}) => ({
    id, subject: { kind: 'text', text: 'the cutter' }, fact, asserter: 'narrator', narrationId: 'nar-1',
    retracted: false, retractedBy: null, correctedTo: null, sceneLocation: null, ...extra,
  });
  const cs = (truths, scene = 'sc-1') => ({ currentSessionId: SESSION, currentSceneId: scene, sceneTruths: truths });

  it('a truth id the store did not hold is set — the narration that filed it, whose it is', () => {
    const out = ledgerEvents(cs([]), cs([truth('tr-1', 'is named the Ashen Wake')]));
    expect(out).toEqual([{ kind: 'truth.set', payload: expect.objectContaining({
      session: SESSION, scene: 'sc-1', ref: { truth: 'tr-1', nar: 'nar-1', entity: null },
      d: expect.objectContaining({ fact: 'is named the Ashen Wake', by: 'narrator' }),
    }) }]);
  });

  it('a table\'s strike and Replace are struck, the replacement set naming what it replaces; the X-Card\'s and an upgrade\'s are not', () => {
    const before = cs([truth('tr-1', 'is named the Ashen Wake'), truth('tr-2', 'is armed')]);
    const after = cs([
      truth('tr-1', 'is named the Ashen Wake', { retracted: true, retractedBy: 'gm', correctedTo: 'tr-3' }),
      truth('tr-2', 'is armed', { retracted: true, retractedBy: 'xcard' }),
      truth('tr-3', 'is named the Cinder Wren', { asserter: 'gm', narrationId: null }),
    ]);
    const out = ledgerEvents(before, after);
    expect(out.map(e => [e.kind, e.payload.ref.truth, e.payload.d])).toEqual([
      ['truth.struck', 'tr-1', { by: 'gm', replacedBy: 'tr-3' }],
      ['truth.set', 'tr-3', expect.objectContaining({ fact: 'is named the Cinder Wren', by: 'gm', replaces: 'tr-1' })],
    ]);
  });

  it('a truth that leaves the ledger unretracted — a scene\'s end migrating it — is not struck; a truth set in the save that opens a scene is set', () => {
    expect(ledgerEvents(cs([truth('tr-1', 'is armed')]), cs([], null))).toEqual([]);
    expect(ledgerEvents(cs([], null), cs([truth('tr-5', 'is docked')], 'sc-2')).map(e => e.kind)).toEqual(['truth.set']);
  });
});

describe('narration — narrator memory\'s cards, as they post', () => {
  beforeEach(() => registerRecordCardHook({ inMemory: narratorMemoryCard }));
  const card = (flags, extra = {}) => ({ id: `card-${Math.random().toString(36).slice(2, 7)}`, author: { id: 'test-user-gm' }, whisper: [],
    flags: { [MODULE_ID]: { narratorCard: true, sessionId: SESSION, narrationId: 'nar-p', narrationText: 'The hatch ticks.', ...flags } }, ...extra });

  it('records a paced card with its speaker, and leaves out a fallback, a whisper and a card with no prose', async () => {
    Hooks.call('createChatMessage', card({ pacedNarrative: true, actorId: 'pc-kira' }));
    Hooks.call('createChatMessage', card({ narrationFallback: true, narrationId: 'nar-f' }));
    Hooks.call('createChatMessage', card({ narrationId: 'nar-w' }, { whisper: ['gm-1'] }));
    Hooks.call('createChatMessage', card({ narrationId: 'nar-e', narrationText: '   ' }));
    await recordSettled();
    expect(stored().filter(e => e.k === 'narration').map(e => [e.ref.nar, e.d.mode, e.d.actorId, e.text]))
      .toEqual([['nar-p', 'paced', 'pc-kira', 'The hatch ticks.']]);
  });

  it('a move card names its resolution; a re-narration the resolution it upgraded; a closing vignette is a cutaway', async () => {
    Hooks.call('createChatMessage', card({ narrationId: 'nar-m', resolutionId: 'res-1' }));
    Hooks.call('createChatMessage', card({ narrationId: 'nar-u', resolutionId: 'res-1', upgradeOf: 'res-1' }));
    Hooks.call('createChatMessage', card({ narrationId: 'nar-v', sessionVignetteCard: true, vignetteKind: 'npc_end' }));
    await recordSettled();
    const events = stored().filter(e => e.k === 'narration');
    expect(events.map(e => [e.ref.nar, e.ref.res ?? null, e.d.mode, e.d.upgradeOf ?? null])).toEqual([
      ['nar-m', 'res-1', 'move', null], ['nar-u', 'res-1', 'move', 'res-1'], ['nar-v', null, 'vignette_close', null],
    ]);
    expect(readRecord({ session: SESSION }).sessions[0].beats.map(b => b.kind)).toEqual(['play', 'cutaway']);
  });
});

describe('the Session Log page', () => {
  it('with sessionLogAutoWrite off the body is the title alone — the record is still written', () => {
    const session = { name: 'Session 4', beats: [], open: { established: [] }, corrections: [] };
    expect(renderSessionLogBody(session, { enabled: false })).toBe('<h2>Session 4</h2>');
  });

  it('a page from before the record is never rendered over', async () => {
    const journal = await (async () => {
      await getOrCreateSessionLogPage({ currentSessionId: 'sess-other', sessionNumber: 1 });
      return journals.journals.get(JOURNAL_NAMES.sessionLog);
    })();
    const legacy = makePage({ name: 'Session 2 — 2026-01-01', flags: { [MODULE_ID]: { sessionLogPage: { sessionId: 'sess-old', summary: { narrative: 'They crossed the Reach.' } } } } });
    legacy.text = { format: 1, content: '<h2>Old</h2><h3>Scene log</h3>' };
    journal.pages.contents.push(legacy);
    expect(await renderSessionLog('sess-old')).toBe(false);
    expect(legacy.text.content).toBe('<h2>Old</h2><h3>Scene log</h3>');
  });

  it('the record\'s own writes are marked, for the page listeners that have nothing to do with them', () => {
    expect(isRecordWrite({ [MODULE_ID]: { recordWrite: true } })).toBe(true);
    expect(isRecordWrite({})).toBe(false);
    expect(isRecordWrite(undefined)).toBe(false);
  });
});

describe('a session\'s page body is the record\'s view of it', () => {
  it('is rendered again only when the read it was made from changed', async () => {
    await getOrCreateSessionLogPage({ currentSessionId: SESSION, sessionNumber: 4 });
    const pc = makeTestActor({ id: 'pc-kira', name: 'Kira' });
    game.actors?._set?.('pc-kira', pc);
    await sheetEdit(pc, { 'system.health.value': 4 });
    expect(await renderSessionLog(SESSION)).toBe(true);
    expect(logPage().text.content).toMatch(/Health 5 → 4/);
    expect(await renderSessionLog(SESSION)).toBe(false);                   // nothing moved
    await sheetEdit(pc, { 'system.health.value': 3 });
    expect(await renderSessionLog(SESSION)).toBe(true);
    expect(logPage().text.content).toMatch(/Health 4 → 3/);
  });
});

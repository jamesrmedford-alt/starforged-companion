/* global makeTestActor, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/chronicleKeepsLastingMoves.test.js
 *
 * known-issues CHRONICLE-ENTRIES-MISS-THE-BEAT (issue #374 A5; the memory
 * charter's third live run, 2026-11-23).
 *
 * The Chronicle keeps an automatic entry only when the scribe rates it at or
 * above the floor ("notable"). In three live runs the scribe rated every
 * resolved move "scene" — five of five, both arrivals at a settlement among
 * them. The third run's first session was three Face Danger rolls, one of
 * which cost health, and an arrival at Bleakhold Station: four entries
 * written, none kept, so the campaign recap — written from the Chronicle
 * alone — was not written at all.
 *
 * Now a resolved move whose result changes something lasting is kept
 * whatever its rating: a track brought to its end, a vow sworn or forsaken,
 * an arrival, a connection made, a brush with the end, and a miss that paid
 * its price. The rating still decides every other beat.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const scribeRequests = [];
let scribeRates = 'scene';
vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const system = JSON.stringify(body?.system ?? '');
    if (system.includes('chronicle scribe')) {
      scribeRequests.push({ message: body.messages[0].content });
      return { content: [{ type: 'text', text: JSON.stringify({ type: 'discovery', salience: scribeRates, text: 'Mira Kestrel reached Bleakhold Station.' }) }] };
    }
    if (String(body?.model ?? '').includes('haiku')) {
      return { content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
    }
    const text = 'Bleakhold Station swells in the viewport.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
  }),
}));
vi.mock('../../src/character/chronicle.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requestChronicleEdit: vi.fn(async () => ({ ok: true, relayed: false, result: { applied: true } })),
}));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { requestChronicleEdit } from '../../src/character/chronicle.js';
import { writeChronicleEntry } from '../../src/character/chronicleWriter.js';
import { lastingChangeOf } from '../../src/character/chronicleKeeps.js';
import { scribeArgsFor, registerChronicleScribe } from '../../src/record/chronicleView.js';
import { readRecord } from '../../src/record/read.js';
import { recordEvent, recordSettled, _resetRecordForTests } from '../../src/record/record.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { recordedEvent, recordSourceOf, seedSessionRecord } from '../helpers/sessionRecordSeed.js';

const MODULE_ID = 'starforged-companion';
const STATE = { currentSessionId: 'sess-1', sessionNumber: 1, characterIds: [] };
const kept = () => requestChronicleEdit.mock.calls.map(c => c[1]?.entry?.text);

beforeEach(() => {
  scribeRequests.length = 0;
  scribeRates = 'scene';
  requestChronicleEdit.mockClear();
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, true);
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
  game.user.isGM = true;
  game.actors._reset();
  game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
});

afterEach(() => { game.actors._reset(); });

describe('issue #374 A5 — which resolved moves change something lasting', () => {
  it.each([
    ['set_a_course',         'strong_hit', 'an arrival'],
    ['set_a_course',         'weak_hit',   'an arrival'],
    ['make_a_connection',    'weak_hit',   'a connection made'],
    ['swear_an_iron_vow',    'miss',       'a vow sworn'],
    ['forsake_your_vow',     null,         'a vow forsaken'],
    ['fulfill_your_vow',     'weak_hit',   'a vow brought to its end'],
    ['forge_a_bond',         'miss',       'a bond put to the test'],
    ['take_decisive_action', 'strong_hit', 'a fight decided'],
    ['finish_an_expedition', 'weak_hit',   'an expedition finished'],
    ['face_death',           'strong_hit', 'a brush with death'],
    ['face_danger',          'miss',       'a miss, and its price paid'],
    ['gather_information',   'miss',       'a miss, and its price paid'],
  ])('%s on %s → %s', (moveId, outcome, change) => {
    expect(lastingChangeOf({ moveId, outcome })).toBe(change);
  });

  it.each([
    ['face_danger',        'strong_hit'],
    ['face_danger',        'weak_hit'],      // its cost is a choice still to be made
    ['compel',             'strong_hit'],
    ['gather_information', 'weak_hit'],
    ['enter_the_fray',     'miss'],          // a bad spot, not a price
    ['not_a_move',         'miss'],
    ['',                   'miss'],
  ])('%s on %s: the rating decides', (moveId, outcome) => {
    expect(lastingChangeOf({ moveId, outcome })).toBeNull();
  });

  it('a Batch Mode round is kept when any of its rolled entries is (its beats, read from the session record)', () => {
    /** A round's entries — a line each, rolled or not — told once; what the scribe is told lasted. */
    const lastingOfRound = (id, entries) => {
      const events = [];
      entries.forEach(([actor, moveId, outcome], i) => {
        events.push(recordedEvent(id, 'line', { who: { actor }, ref: { round: id }, d: { via: 'round' }, text: `I act (${i + 1}).` }));
        if (moveId) events.push(recordedEvent(id, 'move.resolved', { who: { actor }, ref: { res: `${id}-r${i}`, round: id }, d: { moveId, moveName: moveId, outcome } }));
      });
      events.push(recordedEvent(id, 'narration', { ref: { nar: `nar-${id}`, round: id }, d: { mode: 'round' }, text: 'The round is told.' }));
      return scribeArgsFor(events.at(-1), readRecord({ session: id }, recordSourceOf(id, events))).lasting;
    };
    expect(lastingOfRound('rd-1', [['pc-mira', null], ['pc-ren', 'face_danger', 'weak_hit']])).toBeNull();
    expect(lastingOfRound('rd-2', [['pc-mira', 'compel', 'strong_hit'], ['pc-ren', 'set_a_course', 'strong_hit']])).toBe('an arrival');
  });
});

describe('issue #374 A5 — the Chronicle keeps them whatever the scribe rates them', () => {
  const write = (extra) => writeChronicleEntry({ narrationText: 'Bleakhold Station swells in the viewport.', campaignState: STATE, kind: 'move', actorId: 'pc-mira', ...extra });

  it('an arrival rated "scene" is kept; the scribe is told it is on record', async () => {
    const entry = await write({ moveId: 'set_a_course', outcome: 'strong_hit', lasting: 'an arrival' });
    expect(entry, 'the entry was written').toMatchObject({ text: 'Mira Kestrel reached Bleakhold Station.', moveId: 'set_a_course' });
    expect(kept()).toEqual(['Mira Kestrel reached Bleakhold Station.']);
    expect(scribeRequests[0].message).toContain('Kept on record: this result changed something lasting (an arrival).');
  });

  it('rated "trivial", it is still kept', async () => {
    scribeRates = 'trivial';
    expect(await write({ moveId: 'set_a_course', outcome: 'strong_hit', lasting: 'an arrival' })).toBeTruthy();
    expect(kept()).toHaveLength(1);
  });

  it('control: a strong hit that changed nothing lasting, rated "scene", is still dropped — and the scribe is told nothing more', async () => {
    expect(await write({ moveId: 'face_danger', outcome: 'strong_hit', lasting: null })).toBeNull();
    expect(kept()).toEqual([]);
    expect(scribeRequests[0].message).not.toContain('Kept on record');
  });

  it('control: the same beat rated "notable" is kept by its rating, as before', async () => {
    scribeRates = 'notable';
    expect(await write({ moveId: 'face_danger', outcome: 'strong_hit' })).toBeTruthy();
  });

  it('control: an X-carded narration is not written, lasting or not', async () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, { ...CampaignStateSchema, xCardedNarrationIds: ['nar-x'] });
    expect(await write({ moveId: 'set_a_course', outcome: 'strong_hit', lasting: 'an arrival', narrationId: 'nar-x' })).toBeNull();
    expect(kept()).toEqual([]);
  });
});

describe('issue #374 A5 — the record names the lasting change (the scribe\'s one trigger, issue #382 slice 4)', () => {
  const scribeRan = (n = 1) => vi.waitFor(() => expect(scribeRequests.length).toBeGreaterThanOrEqual(n), { timeout: 6000, interval: 100 });
  let journals;

  beforeEach(() => {
    journals = installJournalMock();
    _resetRecordForTests();
    global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
      get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
    });
    global.game.user = global.game.users[0];
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [],
    });
    registerChronicleScribe();
    silenceConsoleErrors();
  });
  afterEach(() => journals.restore());

  /** A rolled move's line and roll, on the record. */
  const rolled = (res, moveId, outcome) => [
    recordedEvent('sess-1', 'line', { who: { actor: 'pc-mira' }, ref: { line: `m-${res}` }, d: { via: 'typed' }, text: 'I act.' }),
    recordedEvent('sess-1', 'move.resolved', { who: { actor: 'pc-mira' }, ref: { res }, d: { moveId, moveName: moveId, outcome } }),
  ];
  /** Its narration, recorded as its card posts (record/cards.js). */
  const narrated = (res) => recordEvent('narration', {
    session: 'sess-1', who: { actor: 'pc-mira' }, ref: { nar: `nar-${res}`, res }, d: { mode: 'move', actorId: 'pc-mira' },
    text: 'Bleakhold Station swells in the viewport.',
  });

  it('a session of rolls rated "scene": the arrival and the paid miss are kept, the clean hit is not', async () => {
    await seedSessionRecord('sess-1', [
      ...rolled('res-1', 'face_danger', 'strong_hit'), ...rolled('res-2', 'face_danger', 'miss'), ...rolled('res-3', 'set_a_course', 'strong_hit'),
    ], { number: 1 });
    for (const res of ['res-1', 'res-2', 'res-3']) narrated(res);
    await recordSettled();
    await scribeRan(3);
    await vi.waitFor(() => expect(requestChronicleEdit.mock.calls.length).toBe(2), { timeout: 3000, interval: 50 });
    expect(requestChronicleEdit.mock.calls.map(c => c[1].entry.moveId).sort()).toEqual(['face_danger', 'set_a_course']);
    const told = scribeRequests.map(r => /Kept on record: [^\n]*\(([^)]*)\)/.exec(r.message)?.[1] ?? null);
    expect(told.filter(Boolean).sort()).toEqual(['a miss, and its price paid', 'an arrival']);
  }, 30_000);

  it('a round with an arrival in it is kept', async () => {
    await seedSessionRecord('sess-1', [
      recordedEvent('sess-1', 'line', { who: { actor: 'pc-mira' }, ref: { round: 'round-1' }, d: { via: 'round' }, text: 'I set a course for Bleakhold.' }),
      recordedEvent('sess-1', 'move.resolved', { who: { actor: 'pc-mira' }, ref: { res: 'round-1-res', round: 'round-1' },
        d: { moveId: 'set_a_course', moveName: 'Set a Course', outcome: 'strong_hit' } }),
    ], { number: 1 });
    recordEvent('narration', { session: 'sess-1', ref: { nar: 'nar-round-1', round: 'round-1' }, d: { mode: 'round' }, text: 'Bleakhold Station swells in the viewport.' });
    await recordSettled();
    await scribeRan(1);
    await vi.waitFor(() => expect(requestChronicleEdit.mock.calls.length).toBe(1), { timeout: 3000, interval: 50 });
    expect(scribeRequests[0].message).toContain('(an arrival)');
    expect(scribeRequests[0].message).toContain('Character: Mira Kestrel');
  }, 30_000);
});

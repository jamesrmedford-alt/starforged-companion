/**
 * STARFORGED COMPANION
 * tests/unit/peopleElsewhere.test.js
 *
 * Issue #393, overhaul 8 slices 2–3 (D5–D7) — where the people are, and the
 * narrator and the reader held to it (CHARACTERS-MOVED-BY-THE-NARRATION, the
 * sixth live long haul): a64's line "I find Tamsin at her ledger stall" was
 * narrated "The walk to the Hollow Spire docks takes the better part of the
 * morning" — another settlement, with Mira and her record at Bleakhold.
 *
 *   - D5: a person is where the session record last had them with the
 *     characters — the recorded place of the latest scene whose frame had
 *     them present — unless their own LAST KNOWN location outranks it. Their
 *     card says where they were last seen; the scene block says who and what
 *     the line names elsewhere.
 *   - D6: the narration is told NOT SO [whereabouts] — the other place is
 *     reached only by a journey's move, the person is not here — a judge
 *     line, tripped by the other place's or person's name. A journey's own
 *     move is told none.
 *   - D7: the reader is told the same, and its rule reads a line that seeks
 *     someone or something elsewhere as that journey.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { lastSeenWith, whereaboutsOf, elsewhereOf, elsewhereWords, nameSaidIn } from '../../src/factContinuity/whereabouts.js';
import { readRecord } from '../../src/record/read.js';
import { recordedEvent, recordSourceOf, seedSessionRecord } from '../helpers/sessionRecordSeed.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { obligationsFor, formatObligationsBlock } from '../../src/moves/contracts/obligations.js';
import { trippedLines } from '../../src/moves/contracts/checks.js';
import { narratePacedInput } from '../../src/narration/narrator.js';
import { readLineSituation, buildReaderSituationBlock } from '../../src/moves/readerSituation.js';
import { buildReaderSystemPrompt } from '../../src/moves/reader.js';

const MODULE_ID = 'starforged-companion';
const A64_LINE = 'I find Tamsin at her ledger stall and ask about the manifest.';
const A64_TOLD = 'The walk to the Hollow Spire docks takes the better part of the morning.';
const BLEAK = { id: 'act-bleak', type: 'settlement', name: 'Bleakhold Station' };
const SPIRE = { id: 'act-spire', type: 'settlement', name: 'Hollow Spire' };

const at = (session, scene, k, opts = {}) => ({ ...recordedEvent(session, k, opts), scene });
/** Session 2 at Hollow Spire, Tamsin met there; session 3 at Bleakhold, with no Tamsin. */
function sessions() {
  return {
    two: [
      at('sess-2', null, 'session.begun', { d: { number: 2, table: {} } }),
      at('sess-2', 'sc-2a', 'scene.started', { d: { sceneId: 'sc-2a', reason: 'first', cause: 'first', what: 'the session begins', place: SPIRE } }),
      at('sess-2', 'sc-2a', 'frame', { d: { location: 'Tamsin\'s ledger stall, Hollow Spire docks', present: ['Mira Kestrel', 'Tamsin Okoro'] } }),
      at('sess-2', 'sc-2a', 'scene.ended', { d: { sceneId: 'sc-2a', turn: false } }),
    ],
    three: [
      at('sess-3', null, 'session.begun', { d: { number: 3, table: {} } }),
      at('sess-3', 'sc-3', 'scene.started', { d: { sceneId: 'sc-3', reason: 'first', cause: 'first', what: 'the session begins', place: BLEAK } }),
      at('sess-3', 'sc-3', 'frame', { d: { location: 'the Kobayashi IV\'s berth, Bleakhold Station', present: ['Mira Kestrel'] } }),
    ],
  };
}
function readOf() {
  const { two, three } = sessions();
  const source = recordSourceOf('sess-3', three, { number: 3 });
  source.pages.unshift({ ...recordSourceOf('sess-2', two, { number: 2 }).pages[0], createdAt: 0 });
  return readRecord({ session: 'campaign' }, source);
}

function seat({ lastKnown = null, present = ['Mira Kestrel'] } = {}) {
  game.actors._reset();
  for (const p of [BLEAK, SPIRE]) {
    game.actors._set(p.id, makeTestActor({ id: p.id, name: p.name, type: 'location',
      flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${p.id}`, name: p.name } } } }));
  }
  game.actors._set('npc-tamsin', makeTestActor({ id: 'npc-tamsin', name: 'Tamsin Okoro', type: 'character',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-tamsin', name: 'Tamsin Okoro', role: 'Broker', active: true,
      ...(lastKnown ? { lastKnown } : {}) } } } }));
  game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
  const state = {
    currentSessionId: 'sess-3', sessionNumber: 3, currentSceneId: 'sc-3',
    currentLocationId: BLEAK.id, currentLocationType: 'settlement',
    settlementIds: [BLEAK.id, SPIRE.id], connectionIds: ['npc-tamsin'],
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-3' },
    sceneFrame: { location: 'the Kobayashi IV\'s berth, Bleakhold Station', present, sceneId: 'sc-3' },
  };
  game.settings._store.set(`${MODULE_ID}.campaignState`, state);
  return state;
}

describe('D5 — a person is where the record last had them with the characters', () => {
  beforeEach(() => seat());

  it('Tamsin was last with the characters at Hollow Spire, in session 2 — by her name or a word of it', () => {
    expect(lastSeenWith(readOf(), 'Tamsin Okoro')).toMatchObject({ place: { id: SPIRE.id, name: 'Hollow Spire' }, session: 2 });
    expect(nameSaidIn('Tamsin', 'Tamsin Okoro')).toBe(true);
    expect(lastSeenWith(readOf(), 'Joss Varrow')).toBeNull();
  });

  it('her own LAST KNOWN outranks the record', () => {
    const state = seat({ lastKnown: { location: { value: 'at a berth on Bleakhold Station\'s lower ring', sessionNum: 3 } } });
    expect(whereaboutsOf({ name: 'Tamsin Okoro', entityId: 'npc-tamsin' }, { campaignState: state, read: readOf() }))
      .toMatchObject({ placeId: BLEAK.id, from: 'last known', session: 3 });
    const plain = seat();
    expect(whereaboutsOf({ name: 'Tamsin Okoro', entityId: 'npc-tamsin' }, { campaignState: plain, read: readOf() }))
      .toEqual({ where: 'at Hollow Spire', placeId: SPIRE.id, placeName: 'Hollow Spire', from: 'record', session: 2 });
  });

  it('a64: the line names Tamsin, who is at Hollow Spire — another place than the characters\'', () => {
    expect(elsewhereOf(A64_LINE, seat(), { read: readOf() })).toEqual({
      here: 'Bleakhold Station', underway: null,
      places: [{ id: SPIRE.id, name: 'Hollow Spire' }],
      people: [{ name: 'Tamsin Okoro', where: 'at Hollow Spire', placeId: SPIRE.id }],
    });
  });

  it('a person in the scene\'s frame is here; a line naming only the characters\' place names nothing elsewhere', () => {
    expect(elsewhereOf(A64_LINE, seat({ present: ['Mira Kestrel', 'Tamsin Okoro'] }), { read: readOf() })).toBeNull();
    expect(elsewhereOf('I walk the length of Bleakhold Station\'s ring.', seat(), { read: readOf() })).toBeNull();
    expect(elsewhereOf('I check the hold for leaks.', seat(), { read: readOf() })).toBeNull();
  });

  it('a line naming another place alone is told that place', () => {
    expect(elsewhereOf('I look for a ride to Hollow Spire.', seat(), { read: readOf() }))
      .toMatchObject({ places: [{ name: 'Hollow Spire' }], people: [] });
  });
});

describe('D6 — NOT SO [whereabouts]', () => {
  const ELSEWHERE = { here: 'Bleakhold Station', underway: null, places: [{ id: SPIRE.id, name: 'Hollow Spire' }],
    people: [{ name: 'Tamsin Okoro', where: 'at Hollow Spire', placeId: SPIRE.id }] };
  const withWords = { ...ELSEWHERE, words: elsewhereWords(ELSEWHERE) };

  it('a paced line and a typed move are told the other place is reached only by a journey, and who is not here', () => {
    for (const mode of ['paced', 'move']) {
      const lines = obligationsFor({ mode, resolution: mode === 'move' ? { moveId: 'gather_information', outcome: 'weak_hit' } : null,
        line: A64_LINE, whereabouts: withWords });
      expect(lines.find(o => o.kind === 'whereabouts'), mode).toMatchObject({ list: 'NOT SO',
        judge: 'The narration has the characters walk to, travel to or arrive at Hollow Spire, or has Tamsin Okoro with them in person — with no journey\'s move.' });
      expect(formatObligationsBlock(lines), mode).toContain('- [whereabouts] The characters are at Bleakhold Station. Hollow Spire is another place: '
        + 'they reach it only by a journey\'s move — never narrate them walking or arriving there. Tamsin Okoro is at Hollow Spire, not here.');
    }
  });

  it('a journey\'s own move is told none; nor is any mode but a beat of play', () => {
    for (const moveId of ['set_a_course', 'undertake_an_expedition', 'finish_an_expedition']) {
      expect(obligationsFor({ mode: 'move', resolution: { moveId, outcome: 'strong_hit' }, whereabouts: withWords }).map(o => o.kind), moveId)
        .not.toContain('whereabouts');
    }
    for (const mode of ['oracle', 'set-piece']) expect(obligationsFor({ mode, whereabouts: withWords }).map(o => o.kind)).not.toContain('whereabouts');
    // A Batch Mode round is a beat of play (issue #399's audit N28); narrator.js roundLinesOf gives a round with
    // a journey's move none.
    expect(obligationsFor({ mode: 'round', whereabouts: withWords }).map(o => o.kind)).toContain('whereabouts');
  });

  it('between places, the line says so', () => {
    const lines = obligationsFor({ mode: 'paced', whereabouts: { ...withWords, here: null, underway: 'Source of the distress call' } });
    expect(formatObligationsBlock(lines)).toContain('- [whereabouts] The characters are between places, on the expedition Source of the distress call. Hollow Spire is another place');
  });

  it('a64\'s narration trips its judge by the other place\'s name; one that names neither the place nor Tamsin does not', () => {
    const lines = obligationsFor({ mode: 'paced', line: A64_LINE, whereabouts: withWords });
    expect(trippedLines(A64_TOLD, lines).map(o => o.kind)).toContain('whereabouts');
    expect(trippedLines('Tamsin\'s voice crackles over the comm.', lines).map(o => o.kind)).toContain('whereabouts');
    expect(trippedLines('The berth lights flicker over the hull.', lines).map(o => o.kind)).not.toContain('whereabouts');
    // A place's generic words trip nothing on their own.
    expect(elsewhereWords({ places: [{ name: 'Kaan Station' }] })).not.toContain('station');
  });
});

describe('a64, through the paced narration', () => {
  const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
  const reply = (text) => ({ content: [{ type: 'text', text }], usage: {}, stop_reason: 'end_turn' });
  let journals;

  beforeEach(async () => {
    vi.clearAllMocks();
    journals = installJournalMock();
    const { two, three } = sessions();
    await seedSessionRecord('sess-2', two, { number: 2, createdAt: Date.now() - 7_200_000 });
    await seedSessionRecord('sess-3', three, { number: 3 });
    game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    seat();
    apiPost.mockImplementation(async (url, headers, body, opts) => reply(String(opts?.label ?? '').startsWith('narrator:narratePacedInput')
      ? `You keep to the berth and send word to Tamsin.${SIDECAR}` : opts?.label === 'obligationJudge' ? '{"violations":[]}' : 'Session 2 ended at Hollow Spire.'));
  });
  afterEach(() => journals.restore());

  it('its narrator is told where Tamsin is and that Hollow Spire is a journey away — in the scene block, and as NOT SO', async () => {
    await narratePacedInput(A64_LINE, game.settings.get(MODULE_ID, 'campaignState'), { speakerActorId: 'pc-mira' });
    const narration = apiPost.mock.calls.find(c => c[3]?.label === 'narrator:narratePacedInput')?.[2];
    expect(narration, 'the line was narrated').toBeTruthy();
    const system = narration.system.map(b => b.text).join('\n');
    expect(system).toContain('  Elsewhere: Tamsin Okoro — at Hollow Spire, not here');
    expect(system).toContain('  Elsewhere: Hollow Spire — another place, reached only by a journey\'s move');
    // Where the characters are is [here]'s, on every beat of play since round 7
    // (narrationHeldToThePlace.test.js); [whereabouts] tells what the line names elsewhere.
    expect(narration.messages[0].content).toContain('- [here] The characters are at Bleakhold Station');
    expect(narration.messages[0].content).toContain('- [whereabouts] Hollow Spire is another place');
    // Her card says where the record last had her with the characters.
    expect(system).toContain('LAST SEEN with the characters (the session record): at Hollow Spire (Session 2)');
  });
});

describe('D7 — the reader', () => {
  beforeEach(() => seat());

  it('is told who and what the line names elsewhere', () => {
    const situation = readLineSituation(game.actors.get('pc-mira'), { campaignState: game.settings.get(MODULE_ID, 'campaignState'), line: 'I go and find Hollow Spire\'s harbourmaster.' });
    expect(situation.elsewhere).toMatchObject({ places: [{ name: 'Hollow Spire' }] });
    expect(buildReaderSituationBlock(situation)).toContain('- Elsewhere: Hollow Spire is another place — reached only by a journey.');
  });

  it('its rule reads a line that seeks someone or something elsewhere as that journey', () => {
    expect(buildReaderSystemPrompt()).toContain('A line that seeks someone or something ELSEWHERE (the situation\'s Elsewhere: another place than the characters\', or a person at one) is that journey — set_a_course for a charted place, else undertake_an_expedition — never a walk across the scene.');
  });
});

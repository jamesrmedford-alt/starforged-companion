/**
 * STARFORGED COMPANION
 * tests/unit/narrationHeldToThePlace.test.js
 *
 * CHARACTERS-MOVED-BY-THE-NARRATION, the seventh live round (2026-11-26;
 * explorations/long-haul-live-20261126-030646/). The record held where the
 * characters were, and the prose did not: a60's line "I fly the Kobayashi IV's
 * skiff to her stall" named no one, and the narration flew Mira to Hollow
 * Spire while the record had her at Bleakhold Station. Its frame named the
 * Hollow Spire docks five narrations running — each refused for the record,
 * and each posted to the table all the same — and a comm call at a57 had put
 * Tamsin in the frame's "present". The sixth round's a64 walked her there.
 *
 * The fix, certain and before the narration posts — NOT SO [here]:
 *   - the fact block's frame naming another recorded place, its present
 *     holding in person someone the record has at one, or a sentence of the
 *     prose taking the characters there, is asked again with what the record
 *     says (obligations.js, checks.js hereViolations);
 *   - the paced card then offers the journey to that place (journeyOfferOf);
 *   - a voice over a comm is "remote", never "present"
 *     (sidecarParser.js), and the record never takes in person someone it
 *     has elsewhere (sceneLifecycle.js framedAtThePlace).
 * Never on a journey's own move.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { hereOf } from '../../src/factContinuity/whereabouts.js';
import { readRecord } from '../../src/record/read.js';
import { recordedEvent, recordSourceOf, seedSessionRecord } from '../helpers/sessionRecordSeed.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { obligationsFor, formatObligationsBlock } from '../../src/moves/contracts/obligations.js';
import { hereViolations, certainViolations, narrateKeepingObligations, redraftBlock } from '../../src/moves/contracts/checks.js';
import { extractSidecar } from '../../src/factContinuity/sidecarParser.js';
import { applySceneFrame } from '../../src/factContinuity/ledgers.js';
import { framedAtThePlace } from '../../src/factContinuity/sceneLifecycle.js';
import { narratePacedInput, journeyOfferOf } from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';
const EXPLORATIONS = path.resolve(__dirname, '../../test/ci/playwright/explorations');
const replayOf = (folder) => JSON.parse(fs.readFileSync(path.join(EXPLORATIONS, folder, 'replay.json'), 'utf8'));
const replyText = (x) => x.response.content.map(c => c.text ?? '').join('');
const ROUND_7 = replayOf('long-haul-live-20261126-030646');
const ROUND_6 = replayOf('long-haul-live-20261125-232143');
/** The narration of play a step's reply was (narratePacedInput or narrateResolution, its first draft). */
const narrationAt = (run, step) => replyText(run.recording.exchanges
  .find(x => x.step === step && /narratePacedInput$|narrateResolution$/.test(x.kind)));

const BLEAK = { id: 'act-bleak', type: 'settlement', name: 'Bleakhold Station' };
const SPIRE = { id: 'act-spire', type: 'settlement', name: 'Hollow Spire' };
/** Where the record had them at a57–a72: Bleakhold, with Tamsin last seen at Hollow Spire. */
const HERE = {
  here: 'Bleakhold Station', underway: null, places: [{ id: SPIRE.id, name: 'Hollow Spire' }],
  people: [{ name: 'Tamsin Okoro', where: 'at Hollow Spire', placeName: 'Hollow Spire' }], markers: ['Kobayashi IV'],
};
const hereLine = (here = HERE) => obligationsFor({ mode: 'paced', here }).find(o => o.kind === 'here');
const violationsAt = (run, step, here = HERE) => {
  const raw = narrationAt(run, step);
  const { prose, sidecar } = extractSidecar(raw);
  return hereViolations(prose, sidecar, hereLine(here));
};

describe('NOT SO [here] — where the record has the characters, on every beat of play', () => {
  it('a paced line, a typed move and a Batch Mode round are told it; a journey\'s own move and a set-piece are not — an oracle only when given the place', () => {
    for (const mode of ['paced', 'move']) {
      const lines = obligationsFor({ mode, resolution: mode === 'move' ? { moveId: 'develop_your_relationship', outcome: 'strong_hit' } : null, here: HERE });
      expect(lines.find(o => o.kind === 'here'), mode).toMatchObject({ list: 'NOT SO', here: 'Bleakhold Station', places: HERE.places, people: HERE.people });
      expect(formatObligationsBlock(lines), mode).toContain('- [here] The characters are at Bleakhold Station: they go to another place only by a journey\'s move '
        + '— never narrate them reaching one — and the fact block\'s "location" is a spot within Bleakhold Station.');
    }
    for (const moveId of ['set_a_course', 'undertake_an_expedition', 'finish_an_expedition']) {
      expect(obligationsFor({ mode: 'move', resolution: { moveId, outcome: 'strong_hit' }, here: HERE }).map(o => o.kind), moveId).not.toContain('here');
    }
    expect(obligationsFor({ mode: 'set-piece', here: HERE }).map(o => o.kind)).not.toContain('here');
    // A Batch Mode round is a beat of play (issue #399's audit N28); narrator.js roundLinesOf gives a round with
    // a journey's move no place.
    expect(obligationsFor({ mode: 'round', here: HERE }).map(o => o.kind)).toContain('here');
    // An oracle follow-up is held to the place only when the narrator gives it one: a journey's complication
    // at its destination (PEOPLE-WAITING-AT-THE-ARRIVAL, round 8 — arrivalHeldToThePlace.test.js). A question
    // asked of the oracle is given none.
    expect(obligationsFor({ mode: 'oracle', here: HERE }).map(o => o.kind)).toContain('here');
    expect(obligationsFor({ mode: 'oracle', oracle: { kind: 'oracle_yes_no', question: 'Is anyone aboard?', rolledLine: 'd100 = 99 → NO' } })
      .map(o => o.kind)).not.toContain('here');
  });

  it('between places it says so; with no place and no expedition it is not told', () => {
    const between = obligationsFor({ mode: 'paced', here: { ...HERE, here: null, underway: 'Source of the distress call' } });
    expect(formatObligationsBlock(between)).toContain('- [here] The characters are between places, on the expedition Source of the distress call: '
      + 'they reach a place only by the journey\'s move — never narrate them arriving at one.');
    expect(obligationsFor({ mode: 'paced', here: { ...HERE, here: null, underway: null } }).map(o => o.kind)).not.toContain('here');
  });

  it('[whereabouts] beside it leaves the characters\' place to [here], once', () => {
    const whereabouts = { here: 'Bleakhold Station', underway: null, places: HERE.places,
      people: [{ name: 'Tamsin Okoro', where: 'at Hollow Spire', placeId: SPIRE.id }], words: ['hollow', 'spire', 'tamsin'] };
    const block = formatObligationsBlock(obligationsFor({ mode: 'paced', here: HERE, whereabouts }));
    expect(block).toContain('- [whereabouts] Hollow Spire is another place: they reach it only by a journey\'s move');
    expect(block.match(/The characters are at Bleakhold Station/g)).toHaveLength(1);
  });
});

describe('the seventh round\'s replies, read against the record (explorations/long-haul-live-20261126-030646)', () => {
  it('a60: the frame, the present and the prose — "The skiff clears the ring and noses down toward Hollow Spire\'s docks"', () => {
    const found = violationsAt(ROUND_7, 'a60');
    expect(found.map(v => v.note.split(';')[0])).toEqual([
      'the fact block\'s "location" puts them at Hollow Spire',
      'Tamsin Okoro is at Hollow Spire, not here: one heard over a comm goes under "remote", never "present" — or leave them out',
      'the prose takes them to Hollow Spire',
    ]);
    expect(found[2].quote).toBe('The skiff clears the ring and noses down toward Hollow Spire\'s docks.');
    expect(found.find(v => v.placeId)).toMatchObject({ placeId: SPIRE.id, placeName: 'Hollow Spire' });
  });

  it('a61–a64 and a69: each frame at the Hollow Spire docks', () => {
    for (const step of ['a61', 'a62', 'a63', 'a64', 'a69']) {
      expect(violationsAt(ROUND_7, step).some(v => v.note.startsWith('the fact block\'s "location" puts them at Hollow Spire')), step).toBe(true);
    }
  });

  it('a57–a59: Tamsin on the comm, listed present — told she goes under "remote"', () => {
    for (const step of ['a57', 'a58', 'a59']) {
      expect(violationsAt(ROUND_7, step).map(v => v.quote), step).toEqual(['Tamsin Okoro']);
    }
  });

  it('a65–a68, a70, a72: the stall moved to Bleakhold to agree with the record — Tamsin present where the record never had her', () => {
    for (const step of ['a65', 'a66', 'a67', 'a68', 'a70', 'a72']) {
      expect(violationsAt(ROUND_7, step).map(v => v.quote), step).toEqual(['Tamsin Okoro']);
    }
  });

  it('controls: the berth and the cockpit at Bleakhold (a52, a54–a56), the wreck\'s console (a71) — nothing', () => {
    for (const step of ['a52', 'a54', 'a55', 'a56', 'a71']) expect(violationsAt(ROUND_7, step), step).toEqual([]);
  });

  it('the sixth round\'s a64: "The walk to the Hollow Spire docks takes the better part of the morning."', () => {
    const { prose } = extractSidecar(narrationAt(ROUND_6, 'a64'));
    expect(prose).toContain('The walk to the Hollow Spire docks takes the better part of the morning.');
    expect(hereViolations(prose, null, hereLine()).map(v => v.quote)).toContain('The walk to the Hollow Spire docks takes the better part of the morning.');
  });
});

describe('the prose check moves no one who is not moving', () => {
  const told = (prose) => hereViolations(prose, null, hereLine());
  it('what could or would happen; someone else travelling; the characters going about their own place; the place in talk', () => {
    expect(told('You could fly the skiff to Hollow Spire by morning, if Tamsin will see you.')).toEqual([]);
    expect(told('The trip to Hollow Spire would take the rest of the day.')).toEqual([]);
    expect(told('A hauler heads in to Hollow Spire under a ragged escort.')).toEqual([]);
    expect(told('You walk down to the Bleakhold Station docks, where the Hollow Spire ferry waits.')).toEqual([]);
    expect(told('"Fly to Hollow Spire, then," Tamsin says over the comm.')).toEqual([]);
    expect(told('You lay in a course for Hollow Spire and wait for the clamps.')).toEqual([]);
    // A place is named as a name is written: a planet called Haven is not "a safe haven".
    const haven = hereLine({ ...HERE, places: [{ id: 'act-haven', name: 'Haven' }], people: [] });
    expect(hereViolations('You walk into a safe haven of crates and lamplight.', { sceneFrame: { location: 'a safe haven in the hold', present: [] } }, haven)).toEqual([]);
    expect(hereViolations('You walk into Haven\'s market at dusk.', null, haven)).toHaveLength(1);
  });
  it('the characters arriving there — by "you", their skiff or their ship by name', () => {
    expect(told('You arrive at Hollow Spire as the shift bells ring.')).toHaveLength(1);
    expect(told('The Kobayashi IV docks at Hollow Spire an hour later.')).toHaveLength(1);
    expect(told('Your skiff touches down on Hollow Spire\'s lower ring.')).toHaveLength(1);
  });
  it('a place\'s core name is the place: "Bleakhold" is Bleakhold Station', () => {
    const fromSpire = hereLine({ ...HERE, here: 'Hollow Spire', places: [{ id: BLEAK.id, name: 'Bleakhold Station' }], people: [] });
    expect(hereViolations('You walk into Bleakhold before the shift change.', null, fromSpire)).toHaveLength(1);
    expect(hereViolations('', { sceneFrame: { location: 'Bleakhold docks', present: [] } }, fromSpire)).toHaveLength(1);
  });
  it('between places, a frame at any recorded place is an arrival no move made', () => {
    const between = hereLine({ ...HERE, here: null, underway: 'Source of the distress call', places: [{ id: SPIRE.id, name: 'Hollow Spire' }, { id: BLEAK.id, name: 'Bleakhold Station' }] });
    expect(hereViolations('', { sceneFrame: { location: 'a berth on Bleakhold\'s ring', present: [] } }, between)).toHaveLength(1);
    expect(hereViolations('', { sceneFrame: { location: 'the skiff\'s cramped cockpit', present: [] } }, between)).toEqual([]);
    // A place the frame is away from, or bound for, is not where it puts them.
    expect(hereViolations('', { sceneFrame: { location: 'the cockpit, a day out from Hollow Spire', present: [] } }, between)).toEqual([]);
    expect(hereViolations('', { sceneFrame: { location: 'the Kobayashi IV\'s bridge, bound for Bleakhold Station', present: [] } }, between)).toEqual([]);
  });
  it('someone over the comm under "remote" is not present', () => {
    const sidecar = { sceneFrame: { location: 'the Kobayashi IV\'s berth, Bleakhold Station', present: ['Mira Kestrel'], remote: ['Tamsin Okoro'] } };
    expect(hereViolations('Tamsin\'s voice comes thin over the comm.', sidecar, hereLine())).toEqual([]);
  });
});

describe('asked again before it posts — and the card offers the journey', () => {
  const corrected = 'You ready the skiff at the Kobayashi IV\'s lock, the credits sealed in a pouch. Hollow Spire is a crossing away.\n'
    + '```json\n{"newTruths":[],"stateChanges":[],"sceneFrame":{"location":"the Kobayashi IV\'s lock, Bleakhold Station","present":["Mira Kestrel"],'
    + '"remote":["Tamsin Okoro"],"situation":"Mira readies the skiff"}}\n```';

  it('round 7\'s a60 draft is re-asked with what the record says; its verdict names the place, and the card\'s Roll becomes Set a Course', async () => {
    const asked = [];
    const call = vi.fn(async (addendum) => { asked.push(addendum); return asked.length === 1 ? narrationAt(ROUND_7, 'a60') : corrected; });
    const obligations = obligationsFor({ mode: 'paced', offer: 'develop_your_relationship', here: HERE });
    const kept = await narrateKeepingObligations(call, obligations, { judge: false });
    expect(kept).toMatchObject({ reasked: true, stillBroken: [] });
    expect(kept.raw).toBe(corrected);
    expect(asked[1]).toContain('## YOUR DRAFT — NOT POSTED');
    expect(asked[1]).toContain('- [here] The characters are at Bleakhold Station');
    expect(asked[1]).toContain('the fact block\'s "location" puts them at Hollow Spire; the characters are at Bleakhold Station: Hollow Spire is reached only '
      + 'by a journey\'s move — when the line seeks it, tell them making ready to go, and stop there');
    expect(asked[1]).toContain('Tamsin Okoro is at Hollow Spire, not here: one heard over a comm goes under "remote"');
    expect(journeyOfferOf(kept, 'develop_your_relationship')).toEqual({ moveId: 'set_a_course', placeId: SPIRE.id, placeName: 'Hollow Spire' });
    // A card already offering a journey keeps its own; a beat held to nothing offers none.
    expect(journeyOfferOf(kept, 'set_a_course')).toBeNull();
    expect(journeyOfferOf({ verdicts: [] }, 'develop_your_relationship')).toBeNull();
  });

  it('the re-ask is held to the same check: a second draft still at Hollow Spire is still broken', async () => {
    const call = vi.fn(async () => narrationAt(ROUND_7, 'a61'));
    const kept = await narrateKeepingObligations(call, obligationsFor({ mode: 'paced', here: HERE }), { judge: false });
    expect(kept.reasked).toBe(true);
    expect(kept.stillBroken.map(v => v.tag)).toContain('here');
  });

  it('the draft block carries each check\'s note once', () => {
    const lines = obligationsFor({ mode: 'paced', here: HERE });
    const { prose, sidecar } = extractSidecar(narrationAt(ROUND_7, 'a60'));
    const block = redraftBlock(prose, certainViolations(prose, lines, { sidecar }), lines);
    expect(block.match(/- \[here\]/g)).toHaveLength(1);
    expect(block).toContain('the prose takes them to Hollow Spire');
  });
});

describe('a voice over a comm is "remote", never "present"', () => {
  it('the fact block\'s present entry marked as on the comm goes under remote; a remote list is kept', () => {
    const { sidecar } = extractSidecar('Tamsin answers.\n```json\n{"sceneFrame":{"location":"the berth","present":["Mira Kestrel","Tamsin Okoro (on comms)"],'
      + '"remote":["Joss Varrow"],"situation":"a call"}}\n```');
    expect(sidecar.sceneFrame).toMatchObject({ present: ['Mira Kestrel'], remote: ['Tamsin Okoro', 'Joss Varrow'] });
  });

  it('the stored frame keeps who is remote', () => {
    const state = { currentSceneId: 'sc-3', sceneTruths: [] };
    expect(applySceneFrame({ location: 'the berth', present: ['Mira Kestrel'], remote: ['Tamsin Okoro'], situation: 'a call' }, state)).toBe(true);
    expect(state.sceneFrame).toMatchObject({ present: ['Mira Kestrel'], remote: ['Tamsin Okoro'] });
  });

  it('the record never takes in person someone it has at another place; a remote voice stays remote', () => {
    const frame = { location: 'the berth', present: ['Mira Kestrel', 'Tamsin Okoro'], remote: ['Joss Varrow'], situation: 'talk' };
    const kept = framedAtThePlace(frame, null, { currentLocationId: null }, { elsewhere: ['Tamsin Okoro'] });
    expect(kept).toMatchObject({ present: ['Mira Kestrel'], remote: ['Joss Varrow'] });
    expect(framedAtThePlace(frame, null, { currentLocationId: null })).toBe(frame);
  });
});

// ── The world: Bleakhold Station now, Tamsin met at Hollow Spire in session 2 ──

const at = (session, scene, k, opts = {}) => ({ ...recordedEvent(session, k, opts), scene });
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
function seat({ currentLocationId = BLEAK.id } = {}) {
  game.actors._reset();
  for (const p of [BLEAK, SPIRE]) {
    game.actors._set(p.id, makeTestActor({ id: p.id, name: p.name, type: 'location',
      flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${p.id}`, name: p.name } } } }));
  }
  game.actors._set('npc-tamsin', makeTestActor({ id: 'npc-tamsin', name: 'Tamsin Okoro', type: 'character',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-tamsin', name: 'Tamsin Okoro', role: 'Broker', active: true } } } }));
  game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
  const state = {
    currentSessionId: 'sess-3', sessionNumber: 3, currentSceneId: 'sc-3',
    currentLocationId, currentLocationType: currentLocationId ? 'settlement' : null,
    settlementIds: [BLEAK.id, SPIRE.id], connectionIds: ['npc-tamsin'],
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-3' },
    sceneFrame: { location: 'the Kobayashi IV\'s berth, Bleakhold Station', present: ['Mira Kestrel'], sceneId: 'sc-3' },
  };
  game.settings._store.set(`${MODULE_ID}.campaignState`, state);
  return state;
}

describe('hereOf — what the record says of where everyone is', () => {
  it('the characters at Bleakhold Station; Hollow Spire another place; Tamsin at it, by the record', () => {
    expect(hereOf(seat(), { read: readOf(), vehicle: 'Kobayashi IV' })).toEqual({
      here: 'Bleakhold Station', hereId: BLEAK.id, underway: null,
      places: [{ id: SPIRE.id, name: 'Hollow Spire' }],
      people: [{ name: 'Tamsin Okoro', where: 'at Hollow Spire', placeName: 'Hollow Spire' }],
      markers: ['Kobayashi IV'],
    });
  });
  it('at Hollow Spire, Tamsin is here and Bleakhold is the other place', () => {
    expect(hereOf(seat({ currentLocationId: SPIRE.id }), { read: readOf() }))
      .toMatchObject({ here: 'Hollow Spire', places: [{ id: BLEAK.id, name: 'Bleakhold Station' }], people: [] });
  });
  it('between places on an expedition; nowhere at all is null', () => {
    expect(hereOf(seat({ currentLocationId: null }), { read: readOf(), underway: 'Source of the distress call' }))
      .toMatchObject({ here: null, underway: 'Source of the distress call', places: [{ name: 'Bleakhold Station' }, { name: 'Hollow Spire' }] });
    expect(hereOf(seat({ currentLocationId: null }), { read: readOf() })).toBeNull();
  });
});

describe('through the paced narration — a60\'s line, the record at Bleakhold', () => {
  const A60_LINE = 'I fly the Kobayashi IV\'s skiff to her stall and lay my own last ration of credits on her ledger to cover the risk she\'s taking, then say it to her face.';
  const STOPPED = 'You ready the skiff at the lock and seal the credits in a pouch for the crossing.\n'
    + '```json\n{"newTruths":[],"stateChanges":[],"sceneFrame":{"location":"the Kobayashi IV\'s lock, Bleakhold Station","present":["Mira Kestrel"],"situation":"ready to go"}}\n```';
  const reply = (text) => ({ content: [{ type: 'text', text }], usage: {}, stop_reason: 'end_turn' });
  let journals;

  beforeEach(async () => {
    vi.clearAllMocks();
    ChatMessage._reset();
    journals = installJournalMock();
    const { two, three } = sessions();
    await seedSessionRecord('sess-2', two, { number: 2, createdAt: Date.now() - 7_200_000 });
    await seedSessionRecord('sess-3', three, { number: 3 });
    game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    seat();
    apiPost.mockImplementation(async (url, headers, body, opts) => {
      const label = String(opts?.label ?? '');
      if (label === 'narrator:narratePacedInput') return reply(narrationAt(ROUND_7, 'a60'));
      if (label === 'narrator:narratePacedInput:reask') return reply(STOPPED);
      return reply(label === 'obligationJudge' ? '{"violations":[]}' : 'Session 2 ended at Hollow Spire.');
    });
  });
  afterEach(() => journals.restore());

  it('the flight is asked again, the table reads the stopped beat, and its card offers Set a Course for Hollow Spire', async () => {
    const text = await narratePacedInput(A60_LINE, game.settings.get(MODULE_ID, 'campaignState'),
      { speakerActorId: 'pc-mira', suggestedMove: 'develop_your_relationship' });
    const calls = apiPost.mock.calls.map(c => c[3]?.label);
    expect(calls).toContain('narrator:narratePacedInput:reask');
    const first = apiPost.mock.calls.find(c => c[3]?.label === 'narrator:narratePacedInput')[2];
    expect(first.messages[0].content).toContain('- [here] The characters are at Bleakhold Station');
    // …and, told in the second person, its character is "you" (BEAT-IN-THE-THIRD-PERSON; beatInTheSecondPerson.test.js).
    expect(first.messages[0].content).toContain('- [person] The player\'s character is "you", for the whole narration: never "Mira Kestrel" or "Mira"');
    expect(text).toContain('You ready the skiff at the lock');
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.pacedNarrative);
    expect(card.content).toContain('Roll Set a Course');
    expect(card.flags[MODULE_ID]).toMatchObject({ suggestedMove: 'set_a_course', suggestedMoveTargetId: SPIRE.id });
    expect(card.flags[MODULE_ID].offerReading).toBeUndefined();
    expect(card.content).not.toContain('noses down toward Hollow Spire');
  });
});

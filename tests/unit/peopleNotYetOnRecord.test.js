/**
 * STARFORGED COMPANION
 * tests/unit/peopleNotYetOnRecord.test.js
 *
 * The maintainer's call after the eighth live round (2026-11-26,
 * PEOPLE-WAITING-AT-THE-ARRIVAL (c)): "Unconfirmed characters should be
 * tracked as real until they are confirmed or dismissed." Round 8's a72 had
 * the Bleakhold berth's visitor — a draft no one confirmed, "Unknown Hatchway
 * Figure" — follow the PC "across the docks" to Hollow Spire, and the record
 * held no whereabouts for him.
 *
 * A pending person row of a "New Entities Detected" card is tracked as a
 * recorded person is: where the record last had them with the characters
 * (a scene's frame naming them), read by [here], [whereabouts], the frame a
 * narration keeps and a who-vow's people met. Their name is often a
 * description, whose words are anyone's, so they are matched whole: across
 * the eight kept runs, matching a draft by a word of its name would have
 * "seen" Ilse Kestrel in 51 frames — by the PC's own surname. The narrator is
 * told them in THE SCENE, so its fact block names them so. Confirm makes them
 * the roster's; Dismiss drops them.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { seedSessionRecord } from '../helpers/sessionRecordSeed.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { narratePacedInput } from '../../src/narration/narrator.js';
import { pendingDraftRows } from '../../src/entities/pendingDrafts.js';
import { pendingPeopleOf, placeAtTime, lastSeenWith, hereOf, elsewhereOf, elsewhereWords } from '../../src/factContinuity/whereabouts.js';
import { framedAtThePlace } from '../../src/factContinuity/sceneLifecycle.js';
import { readRecord } from '../../src/record/read.js';
import { recordedEvent, recordSourceOf } from '../helpers/sessionRecordSeed.js';
import { obligationsFor } from '../../src/moves/contracts/obligations.js';
import { certainViolations } from '../../src/moves/contracts/checks.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';
const BLEAK = { id: 'act-bleak', type: 'settlement', name: 'Bleakhold Station' };
const SPIRE = { id: 'act-spire', type: 'settlement', name: 'Hollow Spire' };
const T = 1_800_000_000_000;

const row = (index, type, name, status = 'pending', description = '') => ({ index, type, name, status, description });
const card = (id, at, drafts) => ({ id, timestamp: at, flags: { [MODULE_ID]: { draftEntityCard: true, drafts } } });
/** Two cards: the berth's (older) and the arrival's (newer). */
function cards({ clerk = 'pending', vance = 'pending' } = {}) {
  return [
    card('card-berth', T + 2_000, [
      row(0, 'connection', 'Station Clerk', clerk, 'A flat-voiced station clerk at the hatch who presses Mira for a berth fee.'),
      row(1, 'connection', 'Officer', 'dismissed'),
      row(2, 'ship', 'Marrow Dray'),
    ]),
    card('card-spire', T + 6_000, [
      row(0, 'connection', 'Vance Oduya', vance, 'The Hollow Spire dockmaster.'),
      row(1, 'connection', 'Mira Kestrel'),          // the detector's slip — the PC
      row(2, 'connection', 'Tamsin'),                // the recorded Tamsin Okoro's own name
    ]),
  ];
}

const at = (k, scene, when, opts = {}) => ({ ...recordedEvent('sess-3', k, { ...opts, at: when }), scene });
/** Session 3: the berth at Bleakhold (the clerk and Vance seen there by name), then Hollow Spire. */
function readOf({ seenAtSpire = [] } = {}) {
  const events = [
    at('session.begun', null, T, { d: { number: 3, table: {} } }),
    at('scene.started', 'sc-berth', T + 1_000, { d: { sceneId: 'sc-berth', reason: 'first', cause: 'first', what: 'the session begins', place: BLEAK } }),
    at('frame', 'sc-berth', T + 1_500, { d: { location: 'the berth, Bleakhold Station', present: ['Mira Kestrel', 'Station Clerk', 'Vance Oduya', 'the station guard'] } }),
    at('scene.ended', 'sc-berth', T + 4_000, { d: { sceneId: 'sc-berth', turn: true } }),
    at('scene.started', 'sc-spire', T + 5_000, { d: { sceneId: 'sc-spire', reason: 'arrival', cause: 'place', what: 'they arrive', place: SPIRE } }),
    at('frame', 'sc-spire', T + 5_500, { d: { location: 'Tamsin\'s ledger stall, Hollow Spire docks', present: ['Mira Kestrel', ...seenAtSpire] } }),
  ];
  return readRecord({ session: 'campaign' }, recordSourceOf('sess-3', events, { number: 3 }));
}

function seat({ dismissed = [], vanceRecorded = false } = {}) {
  game.actors._reset();
  for (const p of [BLEAK, SPIRE]) {
    game.actors._set(p.id, makeTestActor({ id: p.id, name: p.name, type: 'location',
      flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${p.id}`, name: p.name } } } }));
  }
  game.actors._set('npc-tamsin', makeTestActor({ id: 'npc-tamsin', name: 'Tamsin Okoro', type: 'character',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-tamsin', name: 'Tamsin Okoro', active: true } } } }));
  if (vanceRecorded) {
    game.actors._set('npc-vance', makeTestActor({ id: 'npc-vance', name: 'Vance Oduya', type: 'character',
      flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-vance', name: 'Vance Oduya', active: true } } } }));
  }
  game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
  const state = {
    currentSessionId: 'sess-3', sessionNumber: 3, currentSceneId: 'sc-spire',
    currentLocationId: SPIRE.id, currentLocationType: 'settlement',
    settlementIds: [BLEAK.id, SPIRE.id], connectionIds: ['npc-tamsin', ...(vanceRecorded ? ['npc-vance'] : [])],
    dismissedEntities: dismissed,
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-spire' },
    sceneFrame: { location: 'Tamsin\'s ledger stall, Hollow Spire docks', present: ['Mira Kestrel'], sceneId: 'sc-spire' },
  };
  game.settings._store.set(`${MODULE_ID}.campaignState`, state);
  return state;
}

describe('the people not yet on record', () => {
  beforeEach(() => { game.messages = { contents: cards() }; });

  it('are the draft cards\' pending person rows: the newest first, never a dismissed name, a PC or a recorded person', () => {
    expect(pendingDraftRows({ type: 'connection' }).map(r => r.name)).toEqual(['Station Clerk', 'Vance Oduya', 'Mira Kestrel', 'Tamsin']);
    expect(pendingPeopleOf(seat()).map(p => p.name)).toEqual(['Vance Oduya', 'Station Clerk']);
    expect(pendingPeopleOf(seat({ dismissed: ['Vance Oduya'] })).map(p => p.name)).toEqual(['Station Clerk']);
    expect(pendingPeopleOf(seat())[0]).toMatchObject({ exact: true, at: T + 6_000, description: 'The Hollow Spire dockmaster.' });
  });

  it('confirmed, a person is the roster\'s; dismissed, they are gone', () => {
    game.messages = { contents: cards({ vance: 'confirmed' }) };
    expect(pendingPeopleOf(seat({ vanceRecorded: true })).map(p => p.name)).toEqual(['Station Clerk']);
    game.messages = { contents: cards({ clerk: 'dismissed' }) };
    expect(pendingPeopleOf(seat()).map(p => p.name)).toEqual(['Vance Oduya']);
  });

  it('came into the story where the record\'s scene was at their card\'s time', () => {
    expect(placeAtTime(readOf(), T + 2_000)).toBe('Bleakhold Station');
    expect(placeAtTime(readOf(), T + 6_000)).toBe('Hollow Spire');
    expect(placeAtTime(readOf(), T - 1)).toBeNull();
  });
});

describe('tracked as a recorded person is, and matched whole', () => {
  beforeEach(() => { game.messages = { contents: cards() }; });

  it('a frame that names them whole is a sighting; one that shares a word of a description is not', () => {
    expect(lastSeenWith(readOf(), 'Station Clerk', { exact: true })).toMatchObject({ place: { id: BLEAK.id } });
    // "the station guard" says "station": a word of a recorded person's name would do, a draft's never.
    const guardOnly = readRecord({ session: 'campaign' }, recordSourceOf('sess-3', [
      at('session.begun', null, T, { d: { number: 3, table: {} } }),
      at('scene.started', 'sc-x', T + 1_000, { d: { sceneId: 'sc-x', reason: 'first', cause: 'first', what: 'x', place: BLEAK } }),
      at('frame', 'sc-x', T + 1_500, { d: { location: 'the berth', present: ['Mira Kestrel', 'the station guard'] } }),
    ], { number: 3 }));
    expect(lastSeenWith(guardOnly, 'Station Clerk', { exact: true })).toBeNull();
    expect(lastSeenWith(guardOnly, 'Station Clerk')).not.toBeNull();
  });

  it('[here] at Hollow Spire holds them to Bleakhold: a frame with them present is asked again', () => {
    const here = hereOf(seat(), { read: readOf() });
    expect(here.people).toEqual(expect.arrayContaining([
      { name: 'Vance Oduya', where: 'at Bleakhold Station', placeName: 'Bleakhold Station', exact: true },
      { name: 'Station Clerk', where: 'at Bleakhold Station', placeName: 'Bleakhold Station', exact: true },
    ]));
    const lines = obligationsFor({ mode: 'paced', here });
    const frame = (present) => ({ sceneFrame: { location: 'Tamsin\'s ledger stall, Hollow Spire docks', present } });
    const tags = (present) => certainViolations('You count the coins onto the counter.', lines, { sidecar: frame(present) }).map(v => v.tag);
    expect(tags(['Mira Kestrel', 'Vance Oduya'])).toEqual(['here']);
    expect(tags(['Mira Kestrel', 'the Station Clerk'])).toEqual(['here']);
    // The Spire's own station master shares a word with the Bleakhold clerk's description, and is no one elsewhere.
    expect(tags(['Mira Kestrel', 'the station master'])).toEqual([]);
  });

  it('the frame a narration keeps leaves out one the record has elsewhere, matched whole', () => {
    const prior = { location: 'Tamsin\'s ledger stall, Hollow Spire docks', present: ['Mira Kestrel'], sceneId: 'sc-spire' };
    const next = { location: 'Tamsin\'s ledger stall, Hollow Spire docks', present: ['Mira Kestrel', 'Station Clerk', 'the station master'] };
    const kept = framedAtThePlace(next, prior, seat(), { elsewhere: [{ name: 'Station Clerk', exact: true }] });
    expect(kept.present).toEqual(['Mira Kestrel', 'the station master']);
  });

  it('[whereabouts]: a line that names them whole is told where they are; a description\'s words trip nothing', () => {
    expect(elsewhereOf('I ask the dock hands after Vance Oduya.', seat(), { read: readOf() }))
      .toMatchObject({ people: [{ name: 'Vance Oduya', where: 'at Bleakhold Station', exact: true }] });
    expect(elsewhereOf('I ask the station master about the fee.', seat(), { read: readOf() })?.people ?? []).toEqual([]);
    expect(elsewhereWords({ people: [{ name: 'Station Clerk', exact: true }] })).toEqual([]);
    expect(elsewhereWords({ people: [{ name: 'Vance Oduya', exact: true }] })).toEqual(expect.arrayContaining(['vance', 'oduya']));
  });
});

describe('the narrator is told them, in THE SCENE', () => {
  it('by the draft\'s name, what it says of them, and where they are', () => {
    const state = seat();
    const block = buildLedgerBlock(state, { pendingPeople: [
      { name: 'Station Clerk', description: 'A flat-voiced station clerk at the hatch who presses Mira for a berth fee and a name on the berth, every time she passes.',
        where: 'last with the characters at Bleakhold Station' },
      { name: 'Vance Oduya', description: '', where: 'came into the story at Hollow Spire' },
    ] }).combined;
    expect(block).toContain('  Not yet on record — people met; when one is in the scene, the fact block names them so, in "present" or "remote":');
    expect(block).toMatch(/\n {4}Station Clerk — A flat-voiced station clerk at the hatch who presses Mira for a berth fee and a name on…; last with the characters at Bleakhold Station\n/);
    expect(block).toContain('\n    Vance Oduya; came into the story at Hollow Spire');
    expect(buildLedgerBlock(state, {}).combined).not.toContain('Not yet on record');
  });
});

describe('through a paced narration', () => {
  const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
  const reply = (text) => ({ content: [{ type: 'text', text }], usage: {}, stop_reason: 'end_turn' });
  let journals;

  beforeEach(async () => {
    vi.clearAllMocks();
    journals = installJournalMock();
    const events = [
      at('session.begun', null, T, { d: { number: 3, table: {} } }),
      at('scene.started', 'sc-berth', T + 1_000, { d: { sceneId: 'sc-berth', reason: 'first', cause: 'first', what: 'the session begins', place: BLEAK } }),
      at('frame', 'sc-berth', T + 1_500, { d: { location: 'the berth, Bleakhold Station', present: ['Mira Kestrel'] } }),
      at('scene.ended', 'sc-berth', T + 4_000, { d: { sceneId: 'sc-berth', turn: true } }),
      at('scene.started', 'sc-spire', T + 5_000, { d: { sceneId: 'sc-spire', reason: 'arrival', cause: 'place', what: 'they arrive', place: SPIRE } }),
    ];
    await seedSessionRecord('sess-3', events, { number: 3 });
    game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    seat();
    game.messages = { contents: cards() };
    apiPost.mockImplementation(async (url, headers, body, opts) => reply(String(opts?.label ?? '').startsWith('narrator:narratePacedInput')
      ? `You count the coins onto the counter.${SIDECAR}` : opts?.label === 'obligationJudge' ? '{"violations":[]}' : 'Session 3.'));
  });
  afterEach(() => journals.restore());

  it('its scene block names the people met, not yet on record, and where they came into the story', async () => {
    await narratePacedInput('I count out the credits for Tamsin.', game.settings.get(MODULE_ID, 'campaignState'), { speakerActorId: 'pc-mira' });
    const narration = apiPost.mock.calls.find(c => c[3]?.label === 'narrator:narratePacedInput')?.[2];
    expect(narration, 'the line was narrated').toBeTruthy();
    const system = narration.system.map(b => b.text).join('\n');
    expect(system).toContain('  Not yet on record — people met;');
    expect(system).toContain('    Vance Oduya — The Hollow Spire dockmaster; came into the story at Hollow Spire');
    expect(system).toContain('    Station Clerk — A flat-voiced station clerk at the hatch who presses Mira for a berth fee; came into the story at Bleakhold Station');
    expect(system).not.toMatch(/\n {4}(?:Mira Kestrel|Tamsin|Officer)\b/);
  });
});

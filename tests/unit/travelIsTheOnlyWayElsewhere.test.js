/**
 * STARFORGED COMPANION
 * tests/unit/travelIsTheOnlyWayElsewhere.test.js
 *
 * Issue #393, overhaul 8 slice 1 (D1, D2) — one record of where the
 * characters are, and travel the only way to another place
 * (CHARACTERS-MOVED-BY-THE-NARRATION, the sixth live long haul):
 *
 *   - D2: an arrival sets the characters' place whether or not the ship's
 *     record and token follow. With Auto-Move (or Ship Positioning) off, a
 *     hit on Set a Course left them where they set out, and every reader said
 *     they were still there.
 *   - D1/D2: a journey that leaves sets out — Undertake an Expedition's first
 *     leg, a Set a Course that misses (waylaid). The place is none: aboard,
 *     between places, until an arrival. The round's a22–a24 set out for the
 *     distress call's source while every reader said "Place: Hollow Spire".
 *     The scene block and the reader say "between places, on the expedition".
 *   - An expedition begun at a site, for no other recorded place, explores
 *     the site: the characters stay.
 *   - A scene begun between places turns at the arrival, as a place.
 *
 * On a booted table (tests/helpers/multiClient.js), the move pipeline with
 * the interpreter, the dice and Claude stubbed at their boundaries, as
 * setACourseArrival.test.js.
 */

/* global structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpretation: null, dice: [] }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { sceneStores, sceneAnchorOf, anchorFilled, sceneTurnDue } from '../../src/factContinuity/sceneTurns.js';
import { sceneForReading, formatSceneForReading, expeditionUnderway } from '../../src/narration/narratorPrompt.js';

const REPLY = 'The hull groans as the drive spools up.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const STRONG = [0.15, 0.25, 0.99];   // challenge 2, 3; action 6: a strong hit
const MISS   = [0.85, 0.95, 0.0];    // challenge 9, 10; action 1: a miss
const AT_PORT = { sectorId: 'sec-1', nearestSettlementId: 'actor-port', nearestPlanetId: null, nearestLocationId: null,
  freeText: '', updatedAt: 1, updatedBy: 'set_a_course', narrationId: null, previous: null, tokenBefore: null };

let table, ship, tracksStore;

function tracksJournal(tracks = []) {
  tracksStore = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); },
  };
}

async function seat({ settings = {}, campaign = {} } = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, ...settings,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
      currentSceneId: 'sc-1', sceneTruths: [],
      sectors: [{ id: 'sec-1', name: 'Outlands Mark', region: 'outlands', sceneId: null, mapData: { settlements: [], discoveries: [] } }],
      activeSectorId: 'sec-1',
      settlementIds: ['actor-port', 'actor-bleak'], locationIds: [], shipIds: ['ship-cv'],
      currentLocationId: 'actor-port', currentLocationType: 'settlement',
      ...campaign,
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.journal._set(tracksJournal([]));
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 }, supply: 3 } });
  ship = table.addActor({ id: 'ship-cv', type: 'starship', name: 'Wayfinder',
    flags: { [MODULE_ID]: { entityType: 'ship', ship: { _id: 'rec-ship', name: 'Wayfinder', isCommandVehicle: true, position: { ...AT_PORT } } } } });
  for (const [id, name] of [['actor-port', 'Port Vigil'], ['actor-bleak', 'Bleakhold']]) {
    table.addActor({ id, type: 'location', name,
      flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${id}`, name, sectorId: 'sec-1' } } } });
  }
  scriptClaude(table, { fallback: () => REPLY });
}

async function move(interpretation, dice, line) {
  control.interpretation = { adds: 0, rationale: 'test', mischiefApplied: false, ...interpretation };
  control.dice = dice;
  await table.client('pl-1').chat(line, { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await table.drain();
}
const setACourse = (dice) => move({ moveId: 'set_a_course', moveName: 'Set A Course', statUsed: 'supply', moveTarget: 'Bleakhold' },
  dice, 'We plot the jump to Bleakhold and hold the course.');
const undertake = (moveTarget, line) => move({ moveId: 'undertake_an_expedition', moveName: 'Undertake An Expedition', statUsed: 'wits',
  moveTarget, expeditionRank: 'dangerous' }, STRONG, line);

const state = () => table.world.campaignState();
const narrationSystem = () => table.claude.calls.filter(c => /NARRATOR ROLE/.test(c.system ?? '')).at(-1)?.system ?? '';

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

describe('D2 — an arrival sets the characters\' place whether or not the ship follows', () => {
  it('Auto-Move off: a strong hit on Set a Course for Bleakhold — they are at Bleakhold; the ship\'s record is left for !at', async () => {
    await seat({ settings: { 'factContinuity.shipAutoMoveOnCourse': false } });
    await setACourse(STRONG);
    expect(state()).toMatchObject({ currentLocationId: 'actor-bleak', currentLocationType: 'settlement' });
    expect(ship.flags[MODULE_ID].ship.position).toMatchObject({ nearestSettlementId: 'actor-port' });
  }, 60_000);

  it('Ship Positioning off: the same', async () => {
    await seat({ settings: { 'factContinuity.shipPositioning': false } });
    await setACourse(STRONG);
    expect(state().currentLocationId).toBe('actor-bleak');
  }, 60_000);

  it('control: both on, the place and the ship\'s record arrive together', async () => {
    await seat();
    await setACourse(STRONG);
    expect(state().currentLocationId).toBe('actor-bleak');
    expect(ship.flags[MODULE_ID].ship.position).toMatchObject({ nearestSettlementId: 'actor-bleak' });
  }, 60_000);
});

describe('D1 — a journey that leaves sets out: no place, between places, until an arrival', () => {
  it('a Set a Course that misses: waylaid, they are no longer at Port Vigil, and its narration is not told they are', async () => {
    await seat();
    await setACourse(MISS);
    expect(state()).toMatchObject({ currentLocationId: null, currentLocationType: null });
    expect(narrationSystem()).not.toContain('Place:    Port Vigil');
  }, 60_000);

  it('a22: Undertake an Expedition for the distress call\'s source — between places, and the scene block says so', async () => {
    await seat();
    await undertake('the distress call\'s source', 'We set out on the bearing to the distress call\'s source.');
    expect(tracksStore[`${MODULE_ID}.tracks`].filter(t => t.type === 'expedition')).toHaveLength(1);
    expect(state()).toMatchObject({ currentLocationId: null, currentLocationType: null });
    expect(narrationSystem()).toMatch(/ {2}Place: {4}none — the characters are between places, on the expedition [^\n]*distress call[^\n]*, until it arrives/);
    expect(narrationSystem()).not.toContain('Place:    Port Vigil');
  }, 60_000);

  it('an expedition for the place they are at leaves nothing: they stay', async () => {
    await seat();
    await undertake('Port Vigil', 'We sweep the approaches to Port Vigil for the beacon.');
    expect(state().currentLocationId).toBe('actor-port');
  }, 60_000);

  it('an expedition begun inside a derelict, for no other recorded place, explores it: they stay', async () => {
    await seat({ campaign: { locationIds: ['loc-wreck'], currentLocationId: 'loc-wreck', currentLocationType: 'location' } });
    table.addActor({ id: 'loc-wreck', type: 'location', name: 'The Silent Hulk',
      flags: { [MODULE_ID]: { entityType: 'location', location: { _id: 'rec-wreck', name: 'The Silent Hulk', type: 'derelict', status: 'unexplored', sectorId: 'sec-1' } } } });
    await undertake('the derelict\'s lower decks', 'We pick our way down into the lower decks.');
    expect(state().currentLocationId).toBe('loc-wreck');
  }, 60_000);
});

describe('the scene, and the reader, between places', () => {
  const HOLLOW = { id: 'set-hollow', type: 'settlement', name: 'Hollow Spire' };
  const SOURCE = { id: 'loc-source', type: 'location', name: 'Source of the Distress Call' };
  const EXPEDITION = { id: 'trk-source', type: 'expedition', label: 'Source of the distress call' };

  it('a scene begun between places turns at the arrival, as a place — the arrival is not filled in silently', () => {
    const between = sceneAnchorOf(sceneStores({ place: null, ship: null, openTracks: [EXPEDITION] }), { sceneId: 'sc-2', cause: 'expedition', what: 'the expedition has begun' });
    const arrived = sceneStores({ place: SOURCE, ship: null, openTracks: [] });
    const beat = { moveId: 'finish_an_expedition', endingIds: ['trk-source'] };
    expect(anchorFilled(between, arrived, { sceneId: 'sc-2', beat })).toBeNull();
    expect(sceneTurnDue(between, arrived, beat)).toEqual({ cause: 'place', what: 'the characters have reached Source of the Distress Call' });
  });

  it('control: a scene begun with no place, its first recorded place by no arrival, takes it with no turn', () => {
    const none = sceneAnchorOf(sceneStores({ place: null, ship: null, openTracks: [] }), { sceneId: 'sc-2', cause: 'session', what: 'the session begins' });
    const atHollow = sceneStores({ place: HOLLOW, ship: null, openTracks: [] });
    const filled = anchorFilled(none, atHollow, { sceneId: 'sc-2', beat: { moveId: null } });
    expect(filled.place).toMatchObject({ id: 'set-hollow' });
    expect(sceneTurnDue(filled, atHollow, { moveId: null })).toBeNull();
  });

  it('the reader is told the scene the same way', () => {
    const read = sceneForReading({ currentLocationId: null, sceneFrame: null }, { underway: expeditionUnderway([EXPEDITION]) });
    expect(formatSceneForReading(read)).toContain('Place: none — between places, on the expedition Source of the distress call.');
    // No expedition open: no "between places"; a fight or a finished expedition is none.
    expect(sceneForReading({ currentLocationId: null }, { underway: '' }).between).toBe('');
    expect(expeditionUnderway([{ type: 'combat', label: 'Raiders' }, { ...EXPEDITION, completed: true }])).toBe('');
  });
});

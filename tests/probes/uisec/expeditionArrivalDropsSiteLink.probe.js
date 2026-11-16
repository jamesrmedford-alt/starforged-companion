// tests/probes/uisec/expeditionArrivalDropsSiteLink.probe.js
//
// UISEC-01 · EXPEDITION-ARRIVAL-SITE-LINK-DROPPED (INCOMPLETE-FIX of issue #342 Z14)
//
// Scenario: an expedition's track is linked to the site it is for (`siteId`,
// stamped when the Undertake an Expedition began it — index.js
// applyOutcomeEffects → updateTrackFields). Finish an Expedition is documented
// to arrive "at the site the expedition was for — its track's `siteId` link,
// else the unexplored site its label names" (exploration-flow.md §3,
// siteDiscovery.selectExpeditionSite). The reveal reads the link from the
// completed track (movePipeline: `fin.track.siteId`, the stored record). The
// ARRIVAL reads it from `listProgressTracks()` (index.js expeditionArrival),
// whose projection carries id / label / rank / type / ticks / completed /
// combatState / positions — never `siteId`. So the arrival always falls back
// to the label ladder, and the two halves of one move disagree whenever the
// label no longer names the linked site at finish time:
//
//   A. the GM charted the site first (`!reveal-site`) — the label ladder only
//      sees unexplored sites, so the crew "arrives" nowhere;
//   B. the crew named the pin ("Unexplored Site" — the active sector's one
//      unexplored site), and a second unexplored site has appeared since (an
//      uncharted destination recorded by another expedition, issue #348 PT07):
//      the finish charts the linked site, the ship stays where it set out;
//   C. the active sector changed and holds a namesake ("Derelict Starship"
//      repeats across sectors): the finish charts the linked site and docks
//      the ship at the OTHER sector's still-unexplored namesake.
//
// Correct: the ship, its position record and CURRENT LOCATION follow the site
// the track links — the one the same move charts.
// Today: they follow the label (nowhere, or another site).
//
// Production wiring: a player's typed line → the real move pipeline on the
// canonical GM (interpreter / dice / Claude stubbed at their boundaries), as
// tests/unit/expeditionArrivalAtSite.test.js.

/* global structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpretation: null, dice: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { listProgressTracks, updateTrackFields } from '../../../src/ui/progressTracks.js';

const REPLY = 'The hulk fills the viewport.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const GRID = 100;
const BLEAK_XY = { x: 3 * GRID, y: 2 * GRID };
const SITE_XY  = { x: 14 * GRID, y: 1 * GRID };

let table;
let ship;

function makeTracksJournal(tracks = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
}

function pin(id, xy, text, flags) {
  return {
    id, x: xy.x, y: xy.y, text,
    flags: { [MODULE_ID]: { sectorNote: true, ...flags } },
    update: vi.fn(async function (patch) {
      for (const [k, v] of Object.entries(patch)) {
        if (k.startsWith(`flags.${MODULE_ID}.`)) this.flags[MODULE_ID][k.slice(`flags.${MODULE_ID}.`.length)] = v;
        else this[k] = v;
      }
    }),
  };
}

function siteActor(id, name, { status = 'unexplored', type = 'derelict', sectorId = 'sec-1' } = {}) {
  return table.addActor({
    id, type: 'location', name,
    flags: { [MODULE_ID]: { entityType: 'location', location: {
      _id: `rec-${id}`, name, type, status, sectorId, canonicalLocked: true,
    } } },
  });
}

/** The world the crew is in: at Bleakhold, sector sec-1 with the linked site `site-1`. */
async function world({ sectors, activeSectorId = 'sec-1', locationIds = ['actor-site'] }) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
      currentSceneId: 'sc-1', sceneTruths: [],
      sectors, activeSectorId,
      settlementIds: ['actor-bleak'], locationIds, shipIds: ['ship-cv'],
      currentLocationId: 'actor-bleak', currentLocationType: 'settlement',
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 } } });
  ship = table.addActor({
    id: 'ship-cv', type: 'starship', name: 'Wayfinder',
    flags: { [MODULE_ID]: { entityType: 'ship', ship: {
      _id: 'rec-ship', name: 'Wayfinder', isCommandVehicle: true,
      position: { sectorId: 'sec-1', nearestSettlementId: 'actor-bleak', nearestPlanetId: null, nearestLocationId: null,
        freeText: '', updatedAt: 1, updatedBy: 'set_a_course', narrationId: null, previous: null },
    } } },
  });
  table.addActor({
    id: 'actor-bleak', type: 'location', name: 'Bleakhold',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: 'Bleakhold', sectorId: 'sec-1' } } },
  });
  const token = {
    id: 'tok-ship', x: BLEAK_XY.x, y: BLEAK_XY.y,
    flags: { [MODULE_ID]: { commandVehicle: true } },
    update: vi.fn(async function (patch) { Object.assign(this, patch); }),
  };
  table.scenes.set('scene-1', {
    id: 'scene-1', grid: { size: GRID },
    flags: { [MODULE_ID]: { sectorScene: true, sectorId: 'sec-1' } },
    notes: { contents: [
      pin('note-bleak', BLEAK_XY, 'Bleakhold', { settlementId: 'gen-A', actorId: 'actor-bleak', locationType: 'orbital' }),
      pin('note-site', SITE_XY, 'Unexplored Site', { siteNote: true, siteId: 'site-1', actorId: 'actor-site', siteType: 'derelict', discovered: false }),
    ] },
    drawings: { contents: [] },
    tokens: { contents: [token] },
  });
  scriptClaude(table, { fallback: () => REPLY });
}

/** Finish the expedition `exp-1` (label, linked to site-1) on a strong hit. */
async function finish(label) {
  table.journal._set(makeTracksJournal([
    { id: 'exp-1', label, type: 'expedition', rank: 'dangerous', ticks: 40, completed: false, siteId: 'site-1' },
  ]));
  control.interpretation = {
    adds: 0, rationale: 'test', mischiefApplied: false,
    moveId: 'finish_an_expedition', moveName: 'Finish An Expedition', statUsed: null,
    isProgressMove: true, moveTarget: label, moveTargetId: 'exp-1',
  };
  control.dice = [0.25, 0.35];   // challenge 3, 4 against progress 10: a strong hit
  await table.client('pl-1').chat('We bring the ship alongside at last — the expedition is over.', { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await table.drain();
}

const SITE_1 = (over = {}) => ({ id: 'site-1', name: 'Derelict Starship', type: 'derelict', discovered: false, actorId: 'actor-site', ...over });
const SEC_1  = (discoveries) => ({ id: 'sec-1', name: 'Outlands Mark', region: 'outlands', sceneId: 'scene-1', mapData: { settlements: [], discoveries } });

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => { table?.scenes.delete('scene-1'); table?.teardown(); });
beforeEach(() => { control.interpretation = null; control.dice = []; });

const position = () => ship.flags[MODULE_ID].ship.position;
const state    = () => table.world.campaignState();

describe('UISEC-01: Finish an Expedition arrives at the site its track links', () => {
  it('control: the link is stored on the track, and the label ladder still finds a lone unexplored site ("the ghost signal")', async () => {
    await world({ sectors: [SEC_1([SITE_1()])] });
    siteActor('actor-site', 'Derelict Starship');
    await finish('the ghost signal');

    expect(state().sectors[0].mapData.discoveries[0].discovered).toBe(true);
    expect(state().currentLocationId).toBe('actor-site');
    expect(position().nearestLocationId).toBe('actor-site');
  }, 30_000);

  it('control: updateTrackFields stores the siteId on the track record', async () => {
    await world({ sectors: [SEC_1([SITE_1()])] });
    table.journal._set(makeTracksJournal([
      { id: 'exp-9', label: 'the ghost signal', type: 'expedition', rank: 'dangerous', ticks: 8, completed: false },
    ]));
    const saved = await table.client('gm-1').run(() => updateTrackFields('exp-9', { siteId: 'site-1' }));
    expect(saved?.siteId).toBe('site-1');
  }, 30_000);

  it('the listing the arrival reads its track from carries the link', async () => {
    await world({ sectors: [SEC_1([SITE_1()])] });
    table.journal._set(makeTracksJournal([
      { id: 'exp-1', label: 'the ghost signal', type: 'expedition', rank: 'dangerous', ticks: 8, completed: false, siteId: 'site-1' },
    ]));
    const listed = await table.client('gm-1').run(() => listProgressTracks());
    // index.js expeditionArrival: selectExpeditionSite(…, { siteId: track?.siteId ?? null })
    expect(listed.find(t => t.id === 'exp-1')?.siteId).toBe('site-1');
  }, 30_000);

  it('A — the GM charted the site first (!reveal-site): the crew still arrives there', async () => {
    await world({ sectors: [SEC_1([SITE_1({ discovered: true })])] });
    siteActor('actor-site', 'Derelict Starship', { status: 'visited' });
    await finish('the ghost signal');

    // Today: the label names no unexplored site and no place — the crew stays "at" Bleakhold.
    expect(state().currentLocationId).toBe('actor-site');
    expect(position()).toMatchObject({ nearestLocationId: 'actor-site', updatedBy: 'expedition' });
  }, 30_000);

  it('B — the pin\'s own label, and a second unexplored site recorded since: the finish charts the linked site AND arrives there', async () => {
    await world({
      sectors: [SEC_1([
        SITE_1(),
        // An uncharted destination another expedition recorded meanwhile (issue #348 PT07).
        { id: 'site-2', name: 'Gap', type: 'uncharted', discovered: false, workingLabel: true, actorId: 'actor-gap' },
      ])],
      locationIds: ['actor-site', 'actor-gap'],
    });
    siteActor('actor-site', 'Derelict Starship');
    siteActor('actor-gap', 'Gap', { type: 'uncharted' });
    await finish('Unexplored Site');

    // The reveal follows the link (the stored track's siteId) …
    expect(state().sectors[0].mapData.discoveries[0].discovered).toBe(true);
    expect(state().sectors[0].mapData.discoveries[1].discovered).toBe(false);
    // … and so must the arrival. Today: currentLocationId stays 'actor-bleak'.
    expect(state().currentLocationId).toBe('actor-site');
    expect(position().nearestLocationId).toBe('actor-site');
  }, 30_000);

  it('C — the active sector changed and holds a namesake: the ship docks at the site the finish charts, not the other sector\'s', async () => {
    await world({
      sectors: [
        SEC_1([SITE_1()]),
        { id: 'sec-2', name: 'Vega Reach', region: 'expanse', sceneId: null, mapData: { settlements: [], discoveries: [
          { id: 'site-9', name: 'Derelict Starship', type: 'derelict', discovered: false, actorId: 'actor-site-2' },
        ] } },
      ],
      activeSectorId: 'sec-2',
      locationIds: ['actor-site', 'actor-site-2'],
    });
    siteActor('actor-site', 'Derelict Starship');
    siteActor('actor-site-2', 'Derelict Starship', { sectorId: 'sec-2' });
    await finish('Derelict Starship');

    // The finish charts the linked site (sector 1's) …
    expect(state().sectors[0].mapData.discoveries[0].discovered).toBe(true);
    expect(state().sectors[1].mapData.discoveries[0].discovered).toBe(false);
    // … today the ship docks at sector 2's unexplored namesake.
    expect(state().currentLocationId).toBe('actor-site');
    expect(position().nearestLocationId).toBe('actor-site');
  }, 30_000);
});

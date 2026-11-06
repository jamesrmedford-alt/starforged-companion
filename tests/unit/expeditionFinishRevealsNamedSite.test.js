// tests/unit/expeditionFinishRevealsNamedSite.test.js
//
// Finishing an expedition charts only a site the expedition was for (issue
// #342 D7, FINISH-REVEALS-SITE-OF-UNRELATED-EXPEDITION — the maintainer's
// option A).
//
// Undertake an Expedition is for any perilous journey ("trailblaze a route
// through perilous space, journey over hazardous terrain, or survey a
// mysterious site"), and a Terminus sector has one site. The crew undertook
// "the expedition to Bleakhold" — a settlement — and the Undertake's stamp
// linked no site (selectSectorSite with requireLabelMatch: "a guess there
// would tie unrelated expeditions to the one remaining site"); the finish ran
// the same ladder WITHOUT requireLabelMatch, so its last rung — the sole
// undiscovered site — charted the frontier derelict: "◈ Site Discovered —
// Derelict Starship", its location Actor "visited", though the crew went to
// Bleakhold. Now the finish reveals only a site its track links (siteId) or its
// label names — exact, whole words, the type keyword, or the pin's own
// "Unexplored Site" for the active sector's one unexplored site (which the
// Undertake's stamp links too: the only way a crew can name a site it has not
// reached). `!reveal-site` keeps the guess.
//
// Production wiring: a player's typed line → the real move pipeline on the
// canonical GM (interpreter / dice / Claude stubbed at their boundaries).

/* global structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpretation: null, dice: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'The docking clamps close around the hull.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
let table;
let tracks;

function makeTracksJournal(initial = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(initial) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
    tracks: () => store[`${MODULE_ID}.tracks`],
  };
}

/** Finish an expedition (a strong hit) whose track carries this label, linked or not. */
async function finish(label, siteId = null) {
  tracks = makeTracksJournal([
    { id: 'exp-1', label, type: 'expedition', rank: 'dangerous', ticks: 40, completed: false, ...(siteId ? { siteId } : {}) },
  ]);
  table.journal._set(tracks);
  control.interpretation = {
    adds: 0, rationale: 'test', mischiefApplied: false,
    moveId: 'finish_an_expedition', moveName: 'Finish An Expedition', statUsed: null,
    isProgressMove: true, moveTarget: label, moveTargetId: 'exp-1',
  };
  control.dice = [0.25, 0.35];   // challenge 3, 4 against progress 10: a strong hit
  await table.client('pl-1').chat('We reach the end of the long haul.', { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await table.drain();
}

/** Undertake a new expedition (a strong hit) toward this destination. */
async function undertake(label) {
  tracks = makeTracksJournal([]);
  table.journal._set(tracks);
  control.interpretation = {
    adds: 0, rationale: 'test', mischiefApplied: false,
    moveId: 'undertake_an_expedition', moveName: 'Undertake An Expedition', statUsed: 'wits',
    isProgressMove: false, moveTarget: label, moveTargetId: null, expeditionRank: 'dangerous',
  };
  control.dice = [0.0, 0.1, 0.99];   // challenge 1, 2; action 6: a strong hit
  await table.client('pl-1').chat('We plot a course into the dark.', { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

const sector = (id, name, discoveries) => ({ id, name, region: 'terminus', mapData: { settlements: [], discoveries } });
const derelict = (discovered = false) => ({ id: 'site-1', name: 'Derelict Starship', type: 'derelict', discovered, actorId: 'actor-site' });

async function seed(sectors, activeSectorId = 'sec-1') {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
      currentSceneId: 'sc-1', sceneTruths: [],
      sectors, activeSectorId, settlementIds: ['actor-bleak'], locationIds: ['actor-site'],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({
    id: 'actor-bleak', type: 'location', name: 'Bleakhold',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: 'Bleakhold', sectorId: 'sec-1' } } },
  });
  table.addActor({
    id: 'actor-site', type: 'location', name: 'Derelict Starship',
    flags: { [MODULE_ID]: { entityType: 'location', location: { _id: 'rec-site', name: 'Derelict Starship', type: 'derelict', status: 'unexplored', sectorId: 'sec-1' } } },
  });
  scriptClaude(table, { fallback: () => REPLY });
}

// A Terminus sector: one site, at the frontier, still unexplored.
beforeEach(async () => { await seed([sector('sec-1', "Devil's Reach", [derelict()])]); });

const site = () => table.world.campaignState().sectors.find(s => s.id === 'sec-1').mapData.discoveries[0];
const siteActorStatus = () => table.actors.get('actor-site').flags[MODULE_ID].location.status;

describe('finishing an expedition charts only the site it was for', () => {
  it('the expedition to Bleakhold finishes, and the frontier derelict stays uncharted', async () => {
    await finish('the expedition to Bleakhold');

    expect(table.cards(f => f.expeditionFinishCard)).toHaveLength(1);   // it finished (the setup is real)
    expect(site().discovered).toBe(false);                               // it was charted by the sole-site guess
    expect(table.cards(f => f.siteDiscovered)).toHaveLength(0);          // "◈ Site Discovered — Derelict Starship"
    expect(siteActorStatus()).toBe('unexplored');
  }, 30_000);

  it('a trailblaze that names no place ("across the Rift") charts nothing either', async () => {
    await finish('across the Rift');

    expect(table.cards(f => f.expeditionFinishCard)).toHaveLength(1);
    expect(site().discovered).toBe(false);
    expect(table.cards(f => f.siteDiscovered)).toHaveLength(0);
  }, 30_000);

  it('with the active sector\'s sites charted, an unrelated finish charts no other sector\'s lone site', async () => {
    await seed([
      sector('sec-1', "Devil's Reach", [derelict()]),
      sector('sec-2', 'Outlands Mark', [{ id: 'site-2', name: 'Precursor Vault — Spire', type: 'vault', discovered: true, actorId: null }]),
    ], 'sec-2');
    await finish('the expedition to Bleakhold');

    expect(table.cards(f => f.expeditionFinishCard)).toHaveLength(1);
    expect(site().discovered).toBe(false);
    expect(table.cards(f => f.siteDiscovered)).toHaveLength(0);
  }, 30_000);

  it('an expedition named for the pin\'s own "Unexplored Site" charts the active sector\'s one unexplored site — and the crew arrives there', async () => {
    await finish('Unexplored Site');

    expect(site().discovered).toBe(true);
    expect(table.cards(f => f.siteDiscovered)).toHaveLength(1);
    // The arrival follows the site the finish charts (issue #342 Z14).
    expect(table.world.campaignState().currentLocationId).toBe('actor-site');
  }, 30_000);

  it('control: an expedition linked to the site (its siteId) charts it', async () => {
    await finish('the derelict signal', 'site-1');
    expect(site().discovered).toBe(true);
    expect(table.cards(f => f.siteDiscovered)).toHaveLength(1);
  }, 30_000);

  it('control: an expedition whose label names the site by its type charts it', async () => {
    await finish('the derelict');
    expect(site().discovered).toBe(true);
  }, 30_000);
});

describe('the Undertake links the expedition the crew names after the pin', () => {
  it('"Unexplored Site" is linked to the active sector\'s one unexplored site', async () => {
    await undertake('Unexplored Site');

    const [track] = tracks.tracks();
    expect(track).toMatchObject({ label: 'Unexplored Site', type: 'expedition' });
    expect(track.siteId).toBe('site-1');
  }, 30_000);

  it('control: an expedition to Bleakhold is linked to no site', async () => {
    await undertake('the expedition to Bleakhold');

    const [track] = tracks.tracks();
    expect(track).toMatchObject({ label: 'the expedition to Bleakhold', type: 'expedition' });
    expect(track.siteId ?? null).toBeNull();
  }, 30_000);
});

describe('`!reveal-site` keeps the guess', () => {
  it('control: with no name, the GM\'s `!reveal-site` reveals the sole unexplored site', async () => {
    await table.client('gm-1').chat('!reveal-site');
    await table.settle();
    await table.drain();

    expect(site().discovered).toBe(true);
    expect(table.cards(f => f.siteDiscovered)).toHaveLength(1);
  }, 30_000);
});

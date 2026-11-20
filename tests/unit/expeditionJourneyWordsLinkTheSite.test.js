// tests/unit/expeditionJourneyWordsLinkTheSite.test.js
//
// Issue #364 EXPEDITION-JOURNEY-WORDS-SITE-LINK (found while fixing issue
// #364 EXPEDITION-JOURNEY-WORDS-FRAGMENT).
//
// A new expedition is linked to the unexplored site its label names
// (siteDiscovery.selectExpeditionSite: the site's name, a fragment of it as
// whole words, its type), and the Finish an Expedition that completes it
// charts that site and docks there, by the link. The site ladder compared the
// whole label, journey words included, so "the Sunken" linked the unexplored
// "The Sunken Vaults" but "the expedition to the Sunken" linked nothing.
// Before EXPEDITION-JOURNEY-WORDS-FRAGMENT that expedition then recorded a
// second, uncharted destination for the vault; since, the place resolver finds
// the vault's location, so nothing is recorded and nothing linked — and its
// finish charted nothing.
//
// Now an expedition typed as one asks the site ladder with the journey words
// at its label's edges taken off too (nameMatch.withoutJourneyWords), after
// the whole label. The expedition a course is read as asks as the course did.
//
// Production wiring: the player's lines through the GM's real pipeline on a
// booted table (expedition start → finish), as
// tests/unit/expeditionJourneyWordsAroundAFragment.test.js.

/* global structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpretation: null, dice: [], confirmed: [] }));
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
  ...(await original()),
  confirmInterpretation: vi.fn(async (interp) => { control.confirmed.push(structuredClone(interp)); return true; }),
  getMischiefDial: vi.fn(() => 'balanced'),
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
import { selectExpeditionSite } from '../../src/sectors/siteDiscovery.js';

const REPLY = 'The stars wheel past.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const VAULT = 'The Sunken Vaults';
const STRONG_ACTION   = [0.15, 0.25, 0.99];   // challenge 2, 3; action die 6: a strong hit
const STRONG_PROGRESS = [0.05, 0.05];         // challenge 1, 1 against any progress: a strong hit

let table, tracksStore, scene;

function makeTracksJournal() {
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); },
  };
}
const state  = () => table.world.campaignState();
const sector = () => state().sectors.find(s => s.id === 'sec-1');
const vault  = () => sector().mapData.discoveries.find(d => d.id === 'site-vault');
const expeditions = () => tracksStore[`${MODULE_ID}.tracks`].filter(t => t.type === 'expedition');

async function say(interpretation, dice, text) {
  control.interpretation = { adds: 0, rationale: 'test', mischiefApplied: false, ...interpretation };
  control.dice = dice;
  await table.client('pl-1').chat(text, { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await table.drain();
}
const setACourse = (target) => say(
  { moveId: 'set_a_course', moveName: 'Set A Course', statUsed: 'supply', moveTarget: target },
  STRONG_ACTION, 'Please set a course.');
const undertakeExpedition = (target) => say(
  { moveId: 'undertake_an_expedition', moveName: 'Undertake An Expedition', statUsed: 'wits', moveTarget: target },
  STRONG_ACTION, 'We set out into the dark.');
const finishExpedition = (target) => say(
  { moveId: 'finish_an_expedition', moveName: 'Finish An Expedition', statUsed: null, isProgressMove: true, moveTarget: target },
  STRONG_PROGRESS, 'We reach it at last.');

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => { table?.scenes.delete('scene-1'); table?.teardown(); });

beforeEach(async () => {
  control.confirmed = [];
  tracksStore = { [`${MODULE_ID}.tracks`]: [] };
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
      currentSceneId: 'sc-1', sceneTruths: [],
      sectors: [{ id: 'sec-1', name: 'Outlands Mark', region: 'outlands', regionLabel: 'Outlands', sceneId: 'scene-1',
        mapData: { settlements: [{ id: 'gen-V', name: 'Port Vigil', gridX: 3, gridY: 2 }],
          discoveries: [{ id: 'site-vault', name: VAULT, type: 'vault', discovered: false, actorId: 'actor-vault', gridX: 6, gridY: 6 }] } }],
      activeSectorId: 'sec-1',
      // The crew is at Port Vigil; the vault is on the map, unexplored.
      settlementIds: ['actor-vigil'], locationIds: ['actor-vault'],
      currentLocationId: 'actor-vigil', currentLocationType: 'settlement',
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 }, supply: 3 } });
  table.addActor({ id: 'actor-vigil', type: 'location', name: 'Port Vigil',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-vigil', name: 'Port Vigil', sectorId: 'sec-1' } } } });
  table.addActor({ id: 'actor-vault', type: 'location', name: VAULT,
    flags: { [MODULE_ID]: { entityType: 'location', location: { _id: 'rec-vault', name: VAULT, type: 'vault', status: 'unexplored', sectorId: 'sec-1' } } } });
  table.journal._set(makeTracksJournal());
  scene = {
    id: 'scene-1', grid: { size: 100 }, flags: { [MODULE_ID]: { sectorScene: true, sectorId: 'sec-1' } },
    dimensions: { sceneX: 200, sceneY: 200, sceneWidth: 1792, sceneHeight: 1024 },
    notes: { contents: [] }, drawings: { contents: [] }, tokens: { contents: [] },
    createEmbeddedDocuments: vi.fn(async (type, data) => {
      const docs = data.map((d, i) => ({ id: `${type}-${scene.notes.contents.length + i}`, ...d,
        update: vi.fn(async function (patch) { Object.assign(this, patch); }) }));
      if (type === 'Note') scene.notes.contents.push(...docs);
      if (type === 'Drawing') scene.drawings.contents.push(...docs);
      return docs;
    }),
  };
  table.scenes.set('scene-1', scene);
  scriptClaude(table, { fallback: () => REPLY });
});

describe('issue #364 EXPEDITION-JOURNEY-WORDS-SITE-LINK — an expedition whose label wraps a fragment of an unexplored site\'s name in journey words', () => {
  for (const label of ['the expedition to the Sunken', 'a journey toward the Sunken', 'the Sunken expedition']) {
    it(`"${label}" is for the vault: linked to it, and its finish charts it and docks there`, async () => {
      await undertakeExpedition(label);

      expect(control.confirmed.at(-1), 'typed as an expedition (setup)').toMatchObject({ moveId: 'undertake_an_expedition' });
      expect(expeditions()).toHaveLength(1);
      // It linked no site: compared whole, the label named none.
      expect(expeditions()[0].siteId ?? null, 'the expedition is for the vault').toBe('site-vault');
      expect(sector().mapData.discoveries.map(d => d.name), 'no other destination is recorded').toEqual([VAULT]);

      await finishExpedition(label);

      expect(expeditions()[0].completed, 'it finished (setup)').toBe(true);
      expect(vault().discovered, 'the vault is charted').toBe(true);
      expect(table.cards(f => f.siteDiscovered), 'its Site Discovered card').toHaveLength(1);
      expect(state().currentLocationId, 'the crew is at the vault').toBe('actor-vault');
    }, 30_000);
  }
});

describe('issue #364 EXPEDITION-JOURNEY-WORDS-SITE-LINK — controls', () => {
  it('"the Sunken" alone was linked to the vault already', async () => {
    await undertakeExpedition('the Sunken');

    expect(expeditions()[0].siteId).toBe('site-vault');
    await finishExpedition('the Sunken');
    expect(vault().discovered).toBe(true);
    expect(state().currentLocationId).toBe('actor-vault');
  }, 30_000);

  it('the site ladder: the whole label first, the journey words off only when asked, and a place beside the vault is not the vault', () => {
    const cs = state();
    const ask = (label, opts) => selectExpeditionSite(cs, label, opts)?.site?.id ?? null;

    expect(ask('the expedition to the Sunken', { journeyWords: true })).toBe('site-vault');
    expect(ask('the expedition to the Sunken')).toBeNull();
    expect(ask('the Sunken')).toBe('site-vault');
    expect(ask('the expedition to the wreck beyond the Sunken', { journeyWords: true })).toBeNull();
    expect(ask('the expedition', { journeyWords: true })).toBeNull();
  });

  it('"the wreck beyond the Sunken" is still a new uncharted destination', async () => {
    await undertakeExpedition('the expedition to the wreck beyond the Sunken');

    expect(sector().mapData.discoveries.map(d => d.name)).toEqual([VAULT, 'Expedition to the Wreck Beyond the Sunken']);
    expect(expeditions()[0].siteId).toBe(sector().mapData.discoveries[1].id);
    expect(vault().discovered).toBe(false);
  }, 30_000);

  it('a Set a Course for "the expedition to the Sunken" asks as the course did: read as an expedition for a new destination', async () => {
    await setACourse('the expedition to the Sunken');

    expect(control.confirmed.at(-1)).toMatchObject({ moveId: 'undertake_an_expedition' });
    expect(control.confirmed.at(-1).courseRerouted).toMatchObject({ from: 'set_a_course' });
    expect(sector().mapData.discoveries.map(d => d.name)).toEqual([VAULT, 'Expedition to the Sunken']);
  }, 30_000);
});

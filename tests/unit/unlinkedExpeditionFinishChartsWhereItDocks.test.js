// tests/unit/unlinkedExpeditionFinishChartsWhereItDocks.test.js
//
// Issue #364 EXPEDITION-FINISH-JOURNEY-WORDS-SITE (found while fixing issue
// #364 RESOLVER-AMBIGUOUS-PREFIX).
//
// A Finish an Expedition's arrival by name reads the expedition's label
// without the journey words at its edges (index.js resolveCurrentLocationName
// `journeyWords`, issue #364 EXPEDITION-JOURNEY-WORDS-FRAGMENT), and the start
// of a typed expedition asks the site ladder the same way (selectExpeditionSite
// `journeyWords`, EXPEDITION-JOURNEY-WORDS-SITE-LINK). The finish's own site
// ladder did not: its arrival (expeditionArrival) and its reveal
// (movePipeline → revealSectorSite) compared the whole label. So a track with
// no link — begun before that fix, or added in the Progress Tracks panel —
// labelled "the expedition to the Sunken", with "The Sunken Vaults"
// unexplored, docked at the vault by name and charted nothing (issue #362
// AC24's pattern).
//
// Now the finish's arrival and reveal ask the ladder without the journey
// words too, when the whole label names no site — as its start does.
//
// Production wiring: the player's line through the GM's real pipeline on a
// booted table, as tests/unit/expeditionLinksTheSiteItsLabelBegins.test.js.

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
import { revealSectorSite } from '../../src/sectors/siteDiscovery.js';

const REPLY = 'The stars wheel past.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const VAULT = 'The Sunken Vaults';
const STRONG_PROGRESS = [0.05, 0.05];         // challenge 1, 1 against any progress: a strong hit

let table, tracksStore, scene;

function makeTracksJournal() {
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); },
  };
}
const state = () => table.world.campaignState();
const vault = () => state().sectors[0].mapData.discoveries.find(d => d.id === 'site-vault');
const expeditions = () => tracksStore[`${MODULE_ID}.tracks`].filter(t => t.type === 'expedition');

async function finishUnlinked(label) {
  tracksStore[`${MODULE_ID}.tracks`] = [{ id: 'trk-old', type: 'expedition', label, rank: 'dangerous',
    ticks: 40, completed: false, siteId: null }];
  control.interpretation = { adds: 0, rationale: 'test', mischiefApplied: false,
    moveId: 'finish_an_expedition', moveName: 'Finish An Expedition', statUsed: null, isProgressMove: true, moveTarget: label };
  control.dice = STRONG_PROGRESS;
  await table.client('pl-1').chat('We reach it at last.', { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await table.drain();
}

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

describe('issue #364 EXPEDITION-FINISH-JOURNEY-WORDS-SITE — an unlinked expedition whose label says it is a journey to a site', () => {
  // "the expedition to the Sunken" docked at the vault by name and charted
  // nothing; "the Sunk expedition", which its start links to the vault, docked
  // nowhere. "a journey toward the Sunken Vaults expedition" holds the site's
  // whole name, which the whole label's ladder finds: a control, as before.
  for (const label of ['the expedition to the Sunken', 'the Sunk expedition', 'a journey toward the Sunken Vaults expedition']) {
    it(`"${label}" finishes at the vault and charts it: the arrival and the reveal agree`, async () => {
      await finishUnlinked(label);

      expect(expeditions()[0].completed, 'it finished (setup)').toBe(true);
      expect(state().currentLocationId, 'the crew docks at the vault').toBe('actor-vault');
      expect(vault().discovered, 'the reveal charts the vault').toBe(true);
      expect(table.cards(f => f.siteDiscovered), 'its Site Discovered card').toHaveLength(1);
    }, 30_000);
  }

  it('control: a label that names no site without its journey words charts nothing', async () => {
    await finishUnlinked('the expedition to the wreck beyond the Sunken');

    expect(expeditions()[0].completed, 'it finished (setup)').toBe(true);
    expect(vault().discovered, 'no site charted').toBe(false);
    expect(state().currentLocationId, 'not docked at the vault').not.toBe('actor-vault');
  }, 30_000);
});

describe('issue #364 EXPEDITION-FINISH-JOURNEY-WORDS-SITE — the reveal\'s ladder', () => {
  const sectors = () => [{ id: 'sec-a', mapData: { discoveries: [{ id: 'v', name: VAULT, type: 'vault', discovered: false }] } }];
  const reveal = (label, opts = {}) => {
    const st = { sectors: sectors(), activeSectorId: 'sec-a' };
    return revealSectorSite(label, { requireLabelMatch: true, getState: () => st, setState: async () => {},
      updateLoc: async () => {}, restyle: async () => {}, ...opts }).then(r => r?.site?.id ?? null);
  };

  it('with `journeyWords`, a label that names no site whole is asked again without them', async () => {
    expect(await reveal('the expedition to the Sunken', { journeyWords: true })).toBe('v');
    expect(await reveal('the Sunken', { journeyWords: true }), 'the whole label first').toBe('v');
  });

  it('without it (`!reveal-site`\'s question), the whole label only — as before', async () => {
    expect(await reveal('the expedition to the Sunken')).toBeNull();
    expect(await reveal('the expedition to the wreck beyond the Sunken', { journeyWords: true })).toBeNull();
  });
});

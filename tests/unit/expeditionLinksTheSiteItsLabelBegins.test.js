// tests/unit/expeditionLinksTheSiteItsLabelBegins.test.js
//
// Issue #364 EXPEDITION-PREFIX-SITE-LADDER-MISMATCH (found while fixing issue
// #364 EXPEDITION-JOURNEY-WORDS-FRAGMENT and EXPEDITION-JOURNEY-WORDS-SITE-LINK).
//
// In an expedition the place resolver (index.js resolveCurrentLocationName)
// takes a label that begins a place's name ("the Sunk" for "The Sunken
// Vaults"), while the site ladder (siteDiscovery.selectExpeditionSite →
// precursorSites.selectSectorSite) took a site's name, a fragment of it as
// whole words or its type — a word cut short named no site. So an expedition
// for "the Sunk", with "The Sunken Vaults" unexplored on the map, linked no
// site and, its label naming a tracked place, recorded none; its finish
// docked at the vault's location by name, and the reveal charted nothing
// (issue #362 AC24's pattern). "Sunk", which the resolver does not take (the
// location's name starts with its article), recorded a second, uncharted
// destination for the vault.
//
// Now the expedition's ladder (the one that must name its site: the start's
// link, the finish's arrival and reveal) takes a label that begins one
// unexplored site's name, after the exact and whole-word rungs, with the
// journey words handled as before (the whole label, then without them). A
// label that begins two sites' names names neither; the active sector's are
// asked first.
//
// Production wiring: the player's lines through the GM's real pipeline on a
// booted table (expedition start → finish), as
// tests/unit/expeditionJourneyWordsLinkTheSite.test.js.

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
import { selectSectorSite } from '../../src/sectors/precursorSites.js';

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

describe('issue #364 EXPEDITION-PREFIX-SITE-LADDER-MISMATCH — an expedition whose label begins an unexplored site\'s name', () => {
  for (const label of ['the Sunk', 'Sunk', 'the expedition to the Sunk', 'a journey toward Sunk']) {
    it(`"${label}" is for the vault: linked to it, and its finish charts it and docks there`, async () => {
      await undertakeExpedition(label);

      expect(control.confirmed.at(-1), 'typed as an expedition (setup)').toMatchObject({ moveId: 'undertake_an_expedition' });
      expect(expeditions()).toHaveLength(1);
      // It linked no site: the ladder took no word cut short.
      expect(expeditions()[0].siteId ?? null, 'the expedition is for the vault').toBe('site-vault');
      expect(sector().mapData.discoveries.map(d => d.name), 'no other destination is recorded').toEqual([VAULT]);

      await finishExpedition(label);

      expect(expeditions()[0].completed, 'it finished (setup)').toBe(true);
      expect(vault().discovered, 'the vault is charted').toBe(true);
      expect(table.cards(f => f.siteDiscovered), 'its Site Discovered card').toHaveLength(1);
      expect(state().currentLocationId, 'the crew is at the vault').toBe('actor-vault');
    }, 30_000);
  }

  it('a Set a Course for "the Sunk", read as an expedition (the vault is uncharted), is for the vault too', async () => {
    await setACourse('the Sunk');

    expect(control.confirmed.at(-1), 'read as an expedition (setup)').toMatchObject({ moveId: 'undertake_an_expedition' });
    expect(expeditions()[0].siteId ?? null, 'the expedition is for the vault').toBe('site-vault');
    expect(sector().mapData.discoveries.map(d => d.name), 'no other destination is recorded').toEqual([VAULT]);
  }, 30_000);

  it('an expedition for "the Sunk" begun with no link (before this fix) finishes at the vault and charts it: the arrival and the reveal agree', async () => {
    tracksStore[`${MODULE_ID}.tracks`] = [{ id: 'trk-old', type: 'expedition', label: 'the Sunk', rank: 'dangerous',
      ticks: 40, completed: false, siteId: null }];

    await finishExpedition('the Sunk');

    expect(expeditions()[0].completed, 'it finished (setup)').toBe(true);
    expect(vault().discovered, 'the reveal charts the vault').toBe(true);
    expect(state().currentLocationId, 'the arrival is at the vault').toBe('actor-vault');
  }, 30_000);
});

describe('issue #364 EXPEDITION-PREFIX-SITE-LADDER-MISMATCH — the site ladder', () => {
  const site = (id, name, extra = {}) => ({ id, name, type: 'vault', discovered: false, ...extra });
  const sectors = (active, other = []) => [
    { id: 'sec-a', mapData: { discoveries: active } },
    { id: 'sec-b', mapData: { discoveries: other } },
  ];
  const ask = (secs, label, opts = {}) => selectExpeditionSite({ sectors: secs, activeSectorId: 'sec-a' }, label, opts)?.site?.id ?? null;

  it('a label that begins one unexplored site\'s name names it, the article dropped on both sides', () => {
    const secs = sectors([site('v', VAULT)]);
    expect(ask(secs, 'the Sunk')).toBe('v');
    expect(ask(secs, 'Sunk')).toBe('v');
    expect(ask(secs, 'the sunken va')).toBe('v');
    expect(ask(secs, 'the expedition to the Sunk', { journeyWords: true })).toBe('v');
  });

  it('a label that begins two sites\' names names neither; the active sector\'s are asked first', () => {
    expect(ask(sectors([site('v', VAULT), site('s', 'The Sunken Spire', { type: 'derelict' })]), 'the Sunk')).toBeNull();
    expect(ask(sectors([site('v', VAULT)], [site('s', 'The Sunken Spire')]), 'the Sunk')).toBe('v');
    expect(ask(sectors([], [site('v', VAULT), site('s', 'The Sunken Spire')]), 'the Sunk')).toBeNull();
    expect(ask(sectors([], [site('s', 'The Sunken Spire')]), 'the Sunk')).toBe('s');
    // A site that is charted already is not one the label is for.
    expect(ask(sectors([site('v', VAULT), site('s', 'The Sunken Spire', { discovered: true })]), 'the Sunk')).toBe('v');
  });

  it('the earlier rungs still come first, and a label beginning no name names nothing', () => {
    const secs = sectors([site('v', VAULT), site('w', 'Sunk Hollow')]);
    // Exact, then whole words: "the Sunk" is a word of "Sunk Hollow", and begins both names.
    expect(ask(secs, 'the Sunk')).toBe('w');
    expect(ask(secs, 'the Sunken')).toBe('v');
    expect(ask(sectors([site('v', VAULT)]), 'the Drowned')).toBeNull();
    expect(ask(sectors([site('v', VAULT)]), 'the Sunkenness')).toBeNull();
  });

  it('only a ladder that must name its site takes the start of a name: a !reveal-site\'s guessing ladder is as it was', () => {
    const secs = sectors([site('v', VAULT), site('s', 'Kovash Hulk', { type: 'derelict' })]);
    const reveal = (label) => selectSectorSite(secs, label, { activeSectorId: 'sec-a' })?.site?.id ?? null;
    expect(reveal('Sunk')).toBeNull();
    expect(selectSectorSite(secs, 'Sunk', { activeSectorId: 'sec-a', requireLabelMatch: true })?.site?.id).toBe('v');
  });
});

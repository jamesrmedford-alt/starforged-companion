// tests/unit/expeditionLinksTheSiteItDocksAt.test.js
//
// Issue #364 RESOLVER-AMBIGUOUS-PREFIX (found while fixing issue #364
// EXPEDITION-PREFIX-SITE-LADDER-MISMATCH).
//
// With two unexplored sites, "The Sunken Vaults" and "The Sunken Spire", on
// the active sector's map, an expedition for "the Sunk" begins both names.
// The site ladder (precursorSites.selectSectorSite's start rung) named
// neither, while the place resolver's start rung (index.js
// resolveCurrentLocationName) picked one of their locations — the active
// sector's first, else storage order. So the start linked no site and, the
// label naming a tracked place, recorded none; the finish docked at that
// site's location and charted neither.
//
// Now the ladder that must name its site takes the resolver's pick as its
// tie-break, on that rung alone: of the sites the label begins, the one whose
// location the resolver picks — the one the expedition docks at — is the one
// it is for. The start links it; the finish's arrival and reveal, for a track
// with no link, ask the same way. Every unambiguous case is as it was.
//
// Production wiring: the player's lines through the GM's real pipeline on a
// booted table (expedition start → finish), as
// tests/unit/expeditionLinksTheSiteItsLabelBegins.test.js.

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
const SPIRE = 'The Sunken Spire';
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
const sites  = () => state().sectors.flatMap(s => s.mapData.discoveries);
const charted = () => sites().filter(d => d.discovered).map(d => d.id);
const expeditions = () => tracksStore[`${MODULE_ID}.tracks`].filter(t => t.type === 'expedition');

const siteRecord = (id, name, type, actorId, gridX) => ({ id, name, type, discovered: false, actorId, gridX, gridY: 6 });
const locationActor = (id, name, type, sectorId) => ({ id, type: 'location', name,
  flags: { [MODULE_ID]: { entityType: 'location', location: { _id: `rec-${id}`, name, type, status: 'unexplored', sectorId } } } });
const settlementActor = (id, name, sectorId) => ({ id, type: 'location', name,
  flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${id}`, name, sectorId } } } });

const VAULT_SITE = siteRecord('site-vault', VAULT, 'vault', 'actor-vault', 6);
const SPIRE_SITE = siteRecord('site-spire', SPIRE, 'derelict', 'actor-spire', 8);

/**
 * Boot the table: the crew at Port Vigil in the active sector "sec-1"; `active`
 * the active sector's unexplored sites, `far` another sector's; `locationIds`
 * the order the locations are tracked in (the resolver's storage order).
 */
async function boot({ active, far = [], locationIds, settlements = [] }) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
      currentSceneId: 'sc-1', sceneTruths: [],
      sectors: [
        { id: 'sec-1', name: 'Outlands Mark', region: 'outlands', regionLabel: 'Outlands', sceneId: 'scene-1',
          mapData: { settlements: [{ id: 'gen-V', name: 'Port Vigil', gridX: 3, gridY: 2 }], discoveries: structuredClone(active) } },
        { id: 'sec-2', name: 'Far Reach', region: 'expanse', regionLabel: 'Expanse', sceneId: null,
          mapData: { settlements: [], discoveries: structuredClone(far) } },
      ],
      activeSectorId: 'sec-1',
      settlementIds: ['actor-vigil', ...settlements.map(s => s.id)], locationIds,
      currentLocationId: 'actor-vigil', currentLocationType: 'settlement',
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 }, supply: 3 } });
  table.addActor(settlementActor('actor-vigil', 'Port Vigil', 'sec-1'));
  const sectorOf = (id) => (far.some(s => s.actorId === id) ? 'sec-2' : 'sec-1');
  if ([...active, ...far].some(s => s.id === 'site-vault')) table.addActor(locationActor('actor-vault', VAULT, 'vault', sectorOf('actor-vault')));
  if ([...active, ...far].some(s => s.id === 'site-spire')) table.addActor(locationActor('actor-spire', SPIRE, 'derelict', sectorOf('actor-spire')));
  for (const s of settlements) table.addActor(settlementActor(s.id, s.name, 'sec-1'));
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
}

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
beforeEach(() => { control.confirmed = []; tracksStore = { [`${MODULE_ID}.tracks`]: [] }; });

describe('issue #364 RESOLVER-AMBIGUOUS-PREFIX — a label that begins two unexplored sites\' names', () => {
  // The resolver takes the active sector's first location in storage order;
  // the map lists the other site first, so the link follows the resolver.
  for (const [first, siteId, actorId] of [['actor-vault', 'site-vault', 'actor-vault'], ['actor-spire', 'site-spire', 'actor-spire']]) {
    it(`"the Sunk" is for the site whose location the resolver picks (${first} tracked first): linked to it, charted and docked at there`, async () => {
      await boot({ active: first === 'actor-vault' ? [SPIRE_SITE, VAULT_SITE] : [VAULT_SITE, SPIRE_SITE],
        locationIds: first === 'actor-vault' ? ['actor-vault', 'actor-spire'] : ['actor-spire', 'actor-vault'] });

      await undertakeExpedition('the Sunk');

      expect(control.confirmed.at(-1), 'typed as an expedition (setup)').toMatchObject({ moveId: 'undertake_an_expedition' });
      expect(expeditions()).toHaveLength(1);
      // It linked neither site: the ladder named neither, the resolver one.
      expect(expeditions()[0].siteId ?? null, 'the expedition is for the site it will dock at').toBe(siteId);
      expect(sites().map(d => d.id).sort(), 'no other destination is recorded').toEqual(['site-spire', 'site-vault']);

      await finishExpedition('the Sunk');

      expect(expeditions()[0].completed, 'it finished (setup)').toBe(true);
      expect(state().currentLocationId, 'the crew docks at that site').toBe(actorId);
      expect(charted(), 'that site, and only it, is charted').toEqual([siteId]);
      expect(table.cards(f => f.siteDiscovered), 'its Site Discovered card').toHaveLength(1);
    }, 30_000);
  }

  it('"the expedition to the Sunk" is too, its journey words taken off', async () => {
    await boot({ active: [SPIRE_SITE, VAULT_SITE], locationIds: ['actor-vault', 'actor-spire'] });

    await undertakeExpedition('the expedition to the Sunk');

    expect(expeditions()[0].siteId ?? null, 'the expedition is for the vault').toBe('site-vault');
    expect(sites(), 'no other destination is recorded').toHaveLength(2);
  }, 30_000);

  it('a Set a Course for "the Sunk", read as an expedition, is for the site the resolver picks', async () => {
    await boot({ active: [SPIRE_SITE, VAULT_SITE], locationIds: ['actor-vault', 'actor-spire'] });

    await setACourse('the Sunk');

    expect(control.confirmed.at(-1), 'read as an expedition (setup)').toMatchObject({ moveId: 'undertake_an_expedition' });
    expect(expeditions()[0].siteId ?? null, 'the expedition is for the vault').toBe('site-vault');
    expect(sites(), 'no other destination is recorded').toHaveLength(2);
  }, 30_000);

  it('an expedition for "the Sunk" with no link (begun before this fix, or in the Progress Tracks panel) charts the site it docks at', async () => {
    await boot({ active: [SPIRE_SITE, VAULT_SITE], locationIds: ['actor-vault', 'actor-spire'] });
    tracksStore[`${MODULE_ID}.tracks`] = [{ id: 'trk-old', type: 'expedition', label: 'the Sunk', rank: 'dangerous',
      ticks: 40, completed: false, siteId: null }];

    await finishExpedition('the Sunk');

    expect(expeditions()[0].completed, 'it finished (setup)').toBe(true);
    expect(state().currentLocationId, 'the arrival is at the vault').toBe('actor-vault');
    expect(charted(), 'the reveal charts the vault, where it docked').toEqual(['site-vault']);
  }, 30_000);
});

describe('issue #364 RESOLVER-AMBIGUOUS-PREFIX — controls: the unambiguous cases are as they were', () => {
  it('a label that begins one site\'s name still links that site', async () => {
    const hulk = siteRecord('site-hulk', 'Kovash Hulk', 'derelict', 'actor-hulk', 8);
    await boot({ active: [hulk, VAULT_SITE], locationIds: ['actor-vault'] });

    await undertakeExpedition('the Sunk');

    expect(expeditions()[0].siteId ?? null).toBe('site-vault');
  }, 30_000);

  it('a label that begins two sites\' names in different sectors links the active sector\'s, the other tracked first', async () => {
    await boot({ active: [VAULT_SITE], far: [SPIRE_SITE], locationIds: ['actor-spire', 'actor-vault'] });

    await undertakeExpedition('the Sunk');
    expect(expeditions()[0].siteId ?? null, 'the active sector\'s site').toBe('site-vault');

    await finishExpedition('the Sunk');
    expect(state().currentLocationId, 'docked at the active sector\'s site').toBe('actor-vault');
    expect(charted(), 'and it is the one charted').toEqual(['site-vault']);
  }, 30_000);

  it('when the resolver reads the label as a settlement, neither site is linked and nothing is recorded: the finish docks there and charts nothing', async () => {
    await boot({ active: [SPIRE_SITE, VAULT_SITE], locationIds: ['actor-vault', 'actor-spire'],
      settlements: [{ id: 'actor-hold', name: 'The Sunken Hold' }] });

    await undertakeExpedition('the Sunk');
    expect(expeditions()[0].siteId ?? null, 'for neither site').toBeNull();
    expect(sites(), 'nothing is recorded').toHaveLength(2);

    await finishExpedition('the Sunk');
    expect(expeditions()[0].completed, 'it finished (setup)').toBe(true);
    expect(state().currentLocationId, 'docked at the settlement').toBe('actor-hold');
    expect(charted(), 'no site charted').toEqual([]);
  }, 30_000);
});

describe('issue #364 RESOLVER-AMBIGUOUS-PREFIX — the site ladder\'s tie-break', () => {
  const rec = (id, name, actorId, extra = {}) => ({ id, name, type: 'vault', discovered: false, actorId, ...extra });
  const sectors = (active, other = []) => [
    { id: 'sec-a', mapData: { discoveries: active } },
    { id: 'sec-b', mapData: { discoveries: other } },
  ];
  const ask = (secs, label, opts = {}) => selectExpeditionSite({ sectors: secs, activeSectorId: 'sec-a' }, label, opts)?.site?.id ?? null;
  const v = rec('v', VAULT, 'act-v');
  const s = rec('s', SPIRE, 'act-s');

  it('of the sites the label begins, the one at the place the resolver picks', () => {
    expect(ask(sectors([v, s]), 'the Sunk', { placeId: 'act-s' })).toBe('s');
    expect(ask(sectors([v, s]), 'the Sunk', { placeId: 'act-v' })).toBe('v');
    expect(ask(sectors([], [v, s]), 'the Sunk', { placeId: 'act-s' }), 'two in another sector').toBe('s');
    expect(ask(sectors([v, s]), 'the expedition to the Sunk', { journeyWords: true, placeId: 'act-s' })).toBe('s');
  });

  it('a place that is none of them names none; with no place, neither (as before)', () => {
    expect(ask(sectors([v, s]), 'the Sunk', { placeId: 'act-hold' })).toBeNull();
    expect(ask(sectors([v, s]), 'the Sunk')).toBeNull();
    // A charted site is none of the sites the label is for.
    expect(ask(sectors([v, rec('s', SPIRE, 'act-s', { discovered: true }), rec('w', 'The Sunken Well', 'act-w')]), 'the Sunk', { placeId: 'act-s' })).toBeNull();
  });

  it('the place is asked only on that rung: an unambiguous label is as it was', () => {
    expect(ask(sectors([v]), 'the Sunk', { placeId: 'act-other' }), 'one site begun').toBe('v');
    expect(ask(sectors([v], [s]), 'the Sunk', { placeId: 'act-s' }), 'the active sector\'s one').toBe('v');
    expect(ask(sectors([v, s]), VAULT, { placeId: 'act-s' }), 'an exact name').toBe('v');
    expect(ask(sectors([v, rec('w', 'Sunk Hollow', 'act-w')]), 'the Sunk', { placeId: 'act-v' }), 'whole words first').toBe('w');
    expect(ask(sectors([v, s]), 'the Sunk', { siteId: 's', placeId: 'act-v' }), 'a link first').toBe('s');
  });
});

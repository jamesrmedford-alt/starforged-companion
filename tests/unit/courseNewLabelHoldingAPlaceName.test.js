// tests/unit/courseNewLabelHoldingAPlaceName.test.js
//
// Issue #364 COURSE-NEW-LABEL-CONTAINS-SETTLEMENT (left open by issue #364
// COURSE-OLD-LABEL-LOOSER-RUNG-FIRST) — a rule, the maintainer's decision.
//
// A Set a Course asks the place resolver whether its destination is a known,
// charted place; the resolver's last rung takes one name inside the other as
// whole words. So a course for a brand-new destination whose label holds a
// known place's name — "Archer's rendezvous — the gap" with a settlement
// Archer on the map and no site recorded for the gap, "the wreck beyond
// Bleakhold" — was a course to that settlement: no expedition, no uncharted
// site, and the ship docked at the settlement.
//
// The rule: a known place is taken by its name inside the destination only
// when the destination is that name and little else — an article, a word for
// what kind of place it is ("Bleakhold Station", "the Bleakhold settlement").
// A longer label is a new, uncharted destination. A fragment of a place's
// name ("Bleak") still names it. The expedition the course is read as asks
// the same question before it records its uncharted destination: asked the
// looser way it recorded none, and its finish docked at the settlement.
//
// Not changed, and pinned here: the arrival and `!at` read a place in the
// words around it, and an expedition typed as "the expedition to Bleakhold"
// is for Bleakhold (tests/unit/expeditionFinishRevealsNamedSite.test.js). A
// typed expedition's own label is asked by the rule since issue #364
// EXPEDITION-NEW-LABEL-CONTAINS-SETTLEMENT, the journey's words little else
// (tests/unit/expeditionNewLabelHoldingAPlaceName.test.js).
//
// Production wiring: the player's lines through the GM's real pipeline on a
// booted table, as tests/unit/courseOldLabelBeforeLooserRungs.test.js — here
// Archer is on the map BEFORE anything is recorded for the gap.

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
import { placeNameAndLittleElse } from '../../src/entities/nameMatch.js';

const REPLY = 'The stars wheel past.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const GAP      = "Archer's rendezvous — the gap";
const GAP_SITE = "Archer's Rendezvous — The Gap";
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
const openExpeditions = () => tracksStore[`${MODULE_ID}.tracks`].filter(t => t.type === 'expedition' && !t.completed);

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
  STRONG_ACTION, 'We set out for the coordinates she gave us.');
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
        mapData: { settlements: [{ id: 'gen-B', name: 'Bleakhold', gridX: 9, gridY: 4 }, { id: 'gen-V', name: 'Port Vigil', gridX: 3, gridY: 2 }], discoveries: [] } }],
      activeSectorId: 'sec-1',
      // The crew is at Port Vigil. Archer and Bleakhold are on the map; nothing is recorded for the gap.
      settlementIds: ['actor-vigil', 'actor-bleak', 'actor-archer'], locationIds: [],
      currentLocationId: 'actor-vigil', currentLocationType: 'settlement',
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 }, supply: 3 } });
  for (const [id, name] of [['actor-vigil', 'Port Vigil'], ['actor-bleak', 'Bleakhold'], ['actor-archer', 'Archer']]) {
    table.addActor({ id, type: 'location', name,
      flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${id}`, name, sectorId: 'sec-1' } } } });
  }
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

describe('issue #364 COURSE-NEW-LABEL-CONTAINS-SETTLEMENT — a course for a new destination whose label holds a known place\'s name', () => {
  it('"Archer\'s rendezvous — the gap" with Archer on the map is an expedition for a new uncharted site — not a course to Archer', async () => {
    await setACourse(GAP);

    expect(control.confirmed.at(-1), 'read as Undertake an Expedition').toMatchObject({ moveId: 'undertake_an_expedition' });
    expect(control.confirmed.at(-1).courseRerouted).toMatchObject({ from: 'set_a_course', destination: GAP });
    // The expedition sets out (issue #393 D2): between places, at Archer never.
    expect(state().currentLocationId, 'nobody arrived at Archer').toBeNull();
    // The expedition is for the gap: an uncharted site under its working label, and the track links it.
    expect(sector().mapData.discoveries, 'the gap is recorded').toHaveLength(1);
    expect(sector().mapData.discoveries[0]).toMatchObject({ name: GAP_SITE, type: 'uncharted', discovered: false });
    expect(openExpeditions()).toHaveLength(1);
    expect(openExpeditions()[0].siteId, 'the expedition is for that site').toBe(sector().mapData.discoveries[0].id);
  }, 30_000);

  it('"the wreck beyond Bleakhold" is a new destination too — not a course to Bleakhold', async () => {
    await setACourse('the wreck beyond Bleakhold');

    expect(control.confirmed.at(-1)).toMatchObject({ moveId: 'undertake_an_expedition' });
    expect(state().currentLocationId, 'set out — not at Bleakhold').toBeNull();
    expect(sector().mapData.discoveries.map(d => d.name)).toEqual(['Wreck Beyond Bleakhold']);
  }, 30_000);

  it('the expedition that course became is finished at the gap — charted, and the crew there, not at Archer', async () => {
    await setACourse(GAP);
    const [site] = sector().mapData.discoveries;
    expect(site, 'the gap is recorded, not yet charted (setup)').toMatchObject({ name: GAP_SITE, type: 'uncharted', discovered: false });

    await finishExpedition(GAP);

    expect(sector().mapData.discoveries[0], 'the gap is charted').toMatchObject({ discovered: true });
    expect(state().currentLocationId, 'the crew is at the gap, not at Archer').toBe(site.actorId);
  }, 30_000);
});

describe('issue #364 COURSE-NEW-LABEL-CONTAINS-SETTLEMENT — control: the name and little else is still a course to that place', () => {
  for (const target of ['Bleakhold Station', 'the Bleakhold settlement', 'Bleakhold outpost', 'the Bleakhold', 'Bleak', 'Bleakhold']) {
    it(`"${target}" arrives at Bleakhold`, async () => {
      await setACourse(target);

      expect(control.confirmed.at(-1)).toMatchObject({ moveId: 'set_a_course' });
      expect(state().currentLocationId).toBe('actor-bleak');
      expect(sector().mapData.discoveries, 'no site is recorded').toEqual([]);
      expect(openExpeditions()).toEqual([]);
    }, 30_000);
  }

  it('a fragment of a place\'s name still names it: "Vigil" is Port Vigil', async () => {
    table.world.setSetting('campaignState', { ...state(), currentLocationId: 'actor-bleak' });
    await setACourse('Vigil');

    expect(control.confirmed.at(-1)).toMatchObject({ moveId: 'set_a_course' });
    expect(state().currentLocationId).toBe('actor-vigil');
  }, 30_000);
});

describe('issue #364 COURSE-NEW-LABEL-CONTAINS-SETTLEMENT — the arrival and `!at` read a place in the words around it, and "the expedition to Bleakhold" is for Bleakhold, as before', () => {
  it('an Undertake an Expedition typed for "the expedition to Bleakhold" is for Bleakhold: no uncharted site is recorded', async () => {
    await undertakeExpedition('the expedition to Bleakhold');

    expect(openExpeditions()).toHaveLength(1);
    expect(openExpeditions()[0].siteId ?? null).toBeNull();
    expect(sector().mapData.discoveries).toEqual([]);
  }, 30_000);

  const resolver = async () => (await table.client('gm-1').import('../../src/index.js')).resolveCurrentLocationName;

  it('the resolver asked as for a destination takes the name and little else; asked plainly, any label that holds the name', async () => {
    const resolve = await resolver();
    const gm = table.client('gm-1');
    const ask = (label, opts) => gm.run(() => resolve(label, state(), opts))?.id ?? null;

    expect(ask(GAP, { asDestination: true })).toBeNull();
    expect(ask('the wreck beyond Bleakhold', { asDestination: true })).toBeNull();
    expect(ask('Bleakhold Station', { asDestination: true })).toBe('actor-bleak');
    expect(ask('Vigil', { asDestination: true })).toBe('actor-vigil');
    // The arrival's and `!at`'s question: unchanged.
    expect(ask(GAP)).toBe('actor-archer');
    expect(ask('the wreck beyond Bleakhold')).toBe('actor-bleak');
  });

  it('`!at the docks of Bleakhold` still sets Bleakhold', async () => {
    await table.client('gm-1').chat('!at the docks of Bleakhold');
    await table.settle();
    await table.drain();

    expect(state().currentLocationId).toBe('actor-bleak');
  }, 30_000);
});

describe('issue #364 COURSE-NEW-LABEL-CONTAINS-SETTLEMENT — placeNameAndLittleElse: the words a place\'s name may stand among', () => {
  it('an article and a word for the kind of place — by the kind of record', () => {
    expect(placeNameAndLittleElse('Bleakhold Station', 'Bleakhold', 'settlement')).toBe(true);
    expect(placeNameAndLittleElse('the Bleakhold settlement', 'Bleakhold', 'settlement')).toBe(true);
    expect(placeNameAndLittleElse('The outpost, Bleakhold', 'Bleakhold', 'settlement')).toBe(true);
    expect(placeNameAndLittleElse('the Kovash Hulk wreck', 'Kovash Hulk', 'location')).toBe(true);
    expect(placeNameAndLittleElse('the Sunken Vaults', 'Sunken', 'location')).toBe(true);
    expect(placeNameAndLittleElse('planet Kaan', 'Kaan', 'planet')).toBe(true);
  });

  it('anything more is another place', () => {
    expect(placeNameAndLittleElse("Archer's rendezvous — the gap", 'Archer', 'settlement')).toBe(false);
    expect(placeNameAndLittleElse('the wreck beyond Bleakhold', 'Bleakhold', 'settlement')).toBe(false);
    expect(placeNameAndLittleElse('the docks of Bleakhold', 'Bleakhold', 'settlement')).toBe(false);
    // A word for another kind of place is not this one's: a wreck is no settlement, a station no planet.
    expect(placeNameAndLittleElse('the Bleakhold wreck', 'Bleakhold', 'settlement')).toBe(false);
    expect(placeNameAndLittleElse('Kaan Station', 'Kaan', 'planet')).toBe(false);
    expect(placeNameAndLittleElse('Station', 'Bleakhold', 'settlement')).toBe(false);
  });
});

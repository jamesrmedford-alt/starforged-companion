// tests/unit/expeditionNewLabelHoldingAPlaceName.test.js
//
// Issue #364 EXPEDITION-NEW-LABEL-CONTAINS-SETTLEMENT (left open by issue
// #364 COURSE-NEW-LABEL-CONTAINS-SETTLEMENT).
//
// The maintainer's rule for a travel destination: a known place is taken by
// its name inside the destination only when the destination is that name and
// little else — an article, a word for what kind of place it is. A longer
// label is a new, uncharted destination. A Set a Course asked that way; an
// Undertake an Expedition typed as one did not: the start of a new expedition
// asked the place resolver the looser way (one name inside the other, as
// whole words), so with a settlement Archer on the map an expedition for
// "Archer's rendezvous — the gap" — or, with Bleakhold, for "the wreck beyond
// Bleakhold" — was read as one for the settlement: no uncharted site was
// recorded, the track linked none, and its finish docked at the settlement.
//
// An expedition's label is the destination as the move reads it (the
// interpreter's moveTarget, kept as the track's label), and it may say that
// it is a journey there: "the expedition to Bleakhold" — the module's own
// words for one (its plan's label, resolver.js expeditionPlanRequest). So for
// an expedition the journey's own words count as "little else" too: the
// move's nouns (expedition, journey) and the prepositions that only say
// "towards" (to, for, toward, towards, into). A preposition that places the
// destination beside the known place (beyond, near, past, outside, off …)
// does not: that is what makes it another place.
//
// Production wiring: the player's lines through the GM's real pipeline on a
// booted table (expedition start → finish), as
// tests/unit/courseNewLabelHoldingAPlaceName.test.js.

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
        mapData: { settlements: [{ id: 'gen-B', name: 'Bleakhold', gridX: 9, gridY: 4 }, { id: 'gen-V', name: 'Port Vigil', gridX: 3, gridY: 2 }], discoveries: [] } }],
      activeSectorId: 'sec-1',
      // The crew is at Port Vigil. Archer and Bleakhold are on the map; nothing is recorded for the gap or the wreck.
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

describe('issue #364 EXPEDITION-NEW-LABEL-CONTAINS-SETTLEMENT — an expedition typed for a new destination whose label holds a known place\'s name', () => {
  for (const [label, siteName, settlement] of [
    [GAP, GAP_SITE, 'actor-archer'],
    ['the wreck beyond Bleakhold', 'Wreck Beyond Bleakhold', 'actor-bleak'],
    ['the listening post near Bleakhold', 'Listening Post Near Bleakhold', 'actor-bleak'],
  ]) {
    it(`"${label}" is for a new uncharted site: recorded, linked, and its finish docks there — not at the settlement`, async () => {
      await undertakeExpedition(label);

      expect(control.confirmed.at(-1), 'typed as an expedition (setup)').toMatchObject({ moveId: 'undertake_an_expedition' });
      expect(control.confirmed.at(-1).courseRerouted ?? null, 'not a course read as one (setup)').toBeNull();
      // It was read as the settlement: nothing recorded, nothing linked.
      expect(sector().mapData.discoveries, 'the destination is recorded').toHaveLength(1);
      const [site] = sector().mapData.discoveries;
      expect(site).toMatchObject({ name: siteName, type: 'uncharted', discovered: false });
      expect(expeditions()).toHaveLength(1);
      expect(expeditions()[0].siteId, 'the expedition is for that site').toBe(site.id);
      // The expedition set out (issue #393 D2): between places until its finish.
      expect(state().currentLocationId, 'nobody has arrived anywhere yet').toBeNull();

      await finishExpedition(label);

      expect(expeditions()[0].completed, 'it finished (setup)').toBe(true);
      expect(sector().mapData.discoveries[0], 'the site is charted').toMatchObject({ discovered: true });
      expect(state().currentLocationId, 'the crew is at the new site').toBe(site.actorId);
      expect(state().currentLocationId, 'not at the settlement its label holds').not.toBe(settlement);
    }, 30_000);
  }
});

describe('issue #364 EXPEDITION-NEW-LABEL-CONTAINS-SETTLEMENT — control: the name and little else is an expedition for that place', () => {
  for (const label of [
    'the expedition to Bleakhold', 'Bleakhold', 'the Bleakhold settlement',
    'the Bleakhold expedition', 'a journey toward Bleakhold Station', 'expedition into the Bleakhold outpost', 'Bleak',
  ]) {
    it(`"${label}" is for Bleakhold: no site is recorded or linked, and its finish docks at Bleakhold`, async () => {
      await undertakeExpedition(label);

      expect(expeditions()).toHaveLength(1);
      expect(expeditions()[0]).toMatchObject({ label, type: 'expedition' });
      expect(expeditions()[0].siteId ?? null).toBeNull();
      expect(sector().mapData.discoveries).toEqual([]);

      await finishExpedition(label);

      expect(expeditions()[0].completed, 'it finished (setup)').toBe(true);
      expect(state().currentLocationId).toBe('actor-bleak');
      expect(sector().mapData.discoveries).toEqual([]);
    }, 30_000);
  }
});

describe('issue #364 EXPEDITION-NEW-LABEL-CONTAINS-SETTLEMENT — the other questions asked of the place resolver are as they were', () => {
  const resolver = async () => (await table.client('gm-1').import('../../src/index.js')).resolveCurrentLocationName;

  it('the journey\'s words are an expedition\'s only: a course\'s question, the arrival\'s and `!at`\'s are unchanged', async () => {
    const resolve = await resolver();
    const gm = table.client('gm-1');
    const ask = (label, opts) => gm.run(() => resolve(label, state(), opts))?.id ?? null;
    const asExpedition = { asDestination: true, journeyWords: true };

    // An expedition's own label.
    expect(ask('the expedition to Bleakhold', asExpedition)).toBe('actor-bleak');
    expect(ask('a journey toward Bleakhold Station', asExpedition)).toBe('actor-bleak');
    expect(ask('the wreck beyond Bleakhold', asExpedition)).toBeNull();
    expect(ask('the expedition to the wreck beyond Bleakhold', asExpedition)).toBeNull();
    expect(ask(GAP, asExpedition)).toBeNull();
    // A fragment of a place's name still names it.
    expect(ask('Vigil', asExpedition)).toBe('actor-vigil');
    // A Set a Course's question (travel.chartedPlaceFor) — the journey's words are not a course's.
    expect(ask('the expedition to Bleakhold', { asDestination: true })).toBeNull();
    expect(ask('Bleakhold Station', { asDestination: true })).toBe('actor-bleak');
    // The words alone do nothing: the arrival's and `!at`'s question takes any label that holds the name.
    expect(ask('the wreck beyond Bleakhold')).toBe('actor-bleak');
    expect(ask('the wreck beyond Bleakhold', { journeyWords: true })).toBe('actor-bleak');
    expect(ask(GAP)).toBe('actor-archer');
  });

  it('a Set a Course for "the wreck beyond Bleakhold" is still read as an expedition for a new site (the course\'s own question)', async () => {
    await setACourse('the wreck beyond Bleakhold');

    expect(control.confirmed.at(-1)).toMatchObject({ moveId: 'undertake_an_expedition' });
    expect(control.confirmed.at(-1).courseRerouted).toMatchObject({ from: 'set_a_course' });
    expect(sector().mapData.discoveries.map(d => d.name)).toEqual(['Wreck Beyond Bleakhold']);
    expect(expeditions()[0].siteId).toBe(sector().mapData.discoveries[0].id);
  }, 30_000);

  it('the arrival by name still reads a place in the words around it: an expedition with no site, labelled "the docks of Bleakhold", finishes at Bleakhold', async () => {
    tracksStore[`${MODULE_ID}.tracks`] = [
      { id: 'exp-old', label: 'the docks of Bleakhold', type: 'expedition', rank: 'dangerous', ticks: 24, completed: false },
    ];
    await finishExpedition('the docks of Bleakhold');

    expect(expeditions()[0].completed, 'it finished (setup)').toBe(true);
    expect(state().currentLocationId).toBe('actor-bleak');
  }, 30_000);

  it('`!at the wreck beyond Bleakhold` still sets Bleakhold', async () => {
    await table.client('gm-1').chat('!at the wreck beyond Bleakhold');
    await table.settle();
    await table.drain();

    expect(state().currentLocationId).toBe('actor-bleak');
  }, 30_000);
});

describe('issue #364 EXPEDITION-NEW-LABEL-CONTAINS-SETTLEMENT — placeNameAndLittleElse: the journey\'s own words, for an expedition', () => {
  const forExpedition = (label, name, kind = 'settlement') => placeNameAndLittleElse(label, name, kind, { journey: true });

  it('the move\'s nouns and the prepositions that only say "towards" count as little else', () => {
    for (const label of [
      'the expedition to Bleakhold', 'Expedition to Bleakhold', 'the Bleakhold expedition', 'expeditions to Bleakhold',
      'a journey to Bleakhold', 'the journey toward Bleakhold', 'journeys towards Bleakhold',
      'the expedition for Bleakhold', 'an expedition into Bleakhold', 'to Bleakhold',
      'the expedition to the Bleakhold settlement', 'the journey to Bleakhold Station',
    ]) {
      expect(forExpedition(label, 'Bleakhold'), label).toBe(true);
    }
    expect(forExpedition('the expedition to the Kovash Hulk wreck', 'Kovash Hulk', 'location')).toBe(true);
  });

  it('a preposition that places the destination beside the known place makes it another place', () => {
    for (const prep of ['beyond', 'near', 'past', 'outside', 'off', 'under', 'above', 'behind', 'around', 'beneath', 'below', 'between', 'from', 'of', 'by', 'at', 'through', 'across', 'over', 'after', 'before', 'within', 'inside', 'along', 'against', 'on', 'in']) {
      expect(forExpedition(`the expedition ${prep} Bleakhold`, 'Bleakhold'), prep).toBe(false);
    }
    expect(forExpedition('the wreck beyond Bleakhold', 'Bleakhold')).toBe(false);
    expect(forExpedition('the expedition to the wreck beyond Bleakhold', 'Bleakhold')).toBe(false);
    expect(forExpedition("Archer's rendezvous — the gap", 'Archer')).toBe(false);
    expect(forExpedition('the docks of Bleakhold', 'Bleakhold')).toBe(false);
    // A word for another kind of place is still not this one's.
    expect(forExpedition('the expedition to the Bleakhold wreck', 'Bleakhold')).toBe(false);
  });

  it('without the option — a Set a Course\'s question — the journey\'s words are not little else', () => {
    expect(placeNameAndLittleElse('the expedition to Bleakhold', 'Bleakhold', 'settlement')).toBe(false);
    expect(placeNameAndLittleElse('a journey toward Bleakhold', 'Bleakhold', 'settlement')).toBe(false);
    expect(placeNameAndLittleElse('the Bleakhold settlement', 'Bleakhold', 'settlement')).toBe(true);
  });
});

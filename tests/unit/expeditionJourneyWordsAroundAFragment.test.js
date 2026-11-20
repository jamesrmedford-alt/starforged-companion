// tests/unit/expeditionJourneyWordsAroundAFragment.test.js
//
// Issue #364 EXPEDITION-JOURNEY-WORDS-FRAGMENT (left open by issue #364
// EXPEDITION-NEW-LABEL-CONTAINS-SETTLEMENT).
//
// An expedition's label is the destination as the move reads it, and it may
// say that it is a journey there — "the expedition to ‹name›", the module's
// own words for one. The journey's own words (expedition, journey; to,
// toward, towards, for, into) were "little else" only beside a known place's
// WHOLE name. The place resolver's other two rungs — a name the label begins
// ("Bleak" for Bleakhold) and a fragment of a place's name ("the gap" for
// "Archer's Rendezvous — The Gap") — compared the whole label, journey words
// included. So "the expedition to Bleak" recorded a new uncharted site,
// "Expedition to Bleak", though "Bleak" alone is for Bleakhold; and
// "expedition to the gap" recorded a second site beside the charted one.
// At the finish the arrival by name asked the same label the same way, so an
// expedition read as one for Bleakhold docked nowhere.
//
// Now, for an expedition's own label, the journey words at its edges are
// taken off before those rungs — at the expedition's start and in the arrival
// by name at its finish. The whole label is still asked first (a place may be
// called by it exactly), and a preposition that places the destination beside
// the known place is still no journey word ("the wreck beyond Bleakhold").
//
// Production wiring: the player's lines through the GM's real pipeline on a
// booted table (expedition start → finish), as
// tests/unit/expeditionNewLabelHoldingAPlaceName.test.js.

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
import { withoutJourneyWords } from '../../src/entities/nameMatch.js';

const REPLY = 'The stars wheel past.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
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
const chartedGap = () => ({ id: 'site-gap', name: GAP_SITE, type: 'uncharted', discovered: true, actorId: 'actor-gap', gridX: 6, gridY: 6 });

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
        mapData: { settlements: [{ id: 'gen-B', name: 'Bleakhold', gridX: 9, gridY: 4 }, { id: 'gen-V', name: 'Port Vigil', gridX: 3, gridY: 2 }],
          discoveries: [chartedGap()] } }],
      activeSectorId: 'sec-1',
      // The crew is at Port Vigil. Bleakhold and Archer are on the map, and the gap is charted.
      settlementIds: ['actor-vigil', 'actor-bleak', 'actor-archer'], locationIds: ['actor-gap'],
      currentLocationId: 'actor-vigil', currentLocationType: 'settlement',
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 }, supply: 3 } });
  for (const [id, name] of [['actor-vigil', 'Port Vigil'], ['actor-bleak', 'Bleakhold'], ['actor-archer', 'Archer']]) {
    table.addActor({ id, type: 'location', name,
      flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${id}`, name, sectorId: 'sec-1' } } } });
  }
  table.addActor({ id: 'actor-gap', type: 'location', name: GAP_SITE,
    flags: { [MODULE_ID]: { entityType: 'location', location: { _id: 'rec-gap', name: GAP_SITE, type: 'derelict', status: 'visited', sectorId: 'sec-1' } } } });
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

describe('issue #364 EXPEDITION-JOURNEY-WORDS-FRAGMENT — an expedition whose label wraps the start of a known place\'s name in journey words', () => {
  for (const label of ['the expedition to Bleak', 'an expedition toward Bleak', 'to Bleak', 'a journey into Bleak', 'the Bleak expedition']) {
    it(`"${label}" is for Bleakhold, as "Bleak" is: nothing recorded or linked, and its finish docks at Bleakhold`, async () => {
      await undertakeExpedition(label);

      expect(control.confirmed.at(-1), 'typed as an expedition (setup)').toMatchObject({ moveId: 'undertake_an_expedition' });
      expect(expeditions()).toHaveLength(1);
      expect(expeditions()[0]).toMatchObject({ label, type: 'expedition' });
      // It recorded a new uncharted site under the label ("Expedition to Bleak") and linked it.
      expect(sector().mapData.discoveries.map(d => d.name), 'no new site is recorded').toEqual([GAP_SITE]);
      expect(expeditions()[0].siteId ?? null, 'the expedition is linked to no site').toBeNull();

      await finishExpedition(label);

      expect(expeditions()[0].completed, 'it finished (setup)').toBe(true);
      // Asked the whole label, the arrival named no place: the crew stayed where they set out.
      expect(state().currentLocationId, 'the crew is at Bleakhold').toBe('actor-bleak');
      expect(sector().mapData.discoveries.map(d => d.name)).toEqual([GAP_SITE]);
    }, 30_000);
  }
});

describe('issue #364 EXPEDITION-JOURNEY-WORDS-FRAGMENT — an expedition whose label wraps a fragment of a charted site\'s name in journey words', () => {
  it('"expedition to the gap" is for the charted Archer\'s Rendezvous — The Gap: no second site, and its finish docks there', async () => {
    await undertakeExpedition('expedition to the gap');

    expect(expeditions()).toHaveLength(1);
    // It recorded a second site, "Expedition to the Gap", beside the charted one.
    expect(sector().mapData.discoveries.map(d => d.name), 'no second site is recorded').toEqual([GAP_SITE]);
    expect(state().locationIds, 'no second location is made').toEqual(['actor-gap']);
    expect(expeditions()[0].siteId ?? null).toBeNull();

    await finishExpedition('expedition to the gap');

    expect(expeditions()[0].completed, 'it finished (setup)').toBe(true);
    expect(state().currentLocationId, 'the crew is at the charted site').toBe('actor-gap');
    expect(state().currentLocationType).toBe('location');
  }, 30_000);

  it('the finish\'s own words name its place the same way: an expedition begun with no destination, finished "to Bleak", docks at Bleakhold', async () => {
    tracksStore[`${MODULE_ID}.tracks`] = [
      { id: 'exp-old', label: 'Expedition', type: 'expedition', rank: 'dangerous', ticks: 24, completed: false },
    ];
    await finishExpedition('the expedition to Bleak');

    expect(expeditions()[0].completed, 'it finished (setup)').toBe(true);
    expect(state().currentLocationId).toBe('actor-bleak');
  }, 30_000);

  it('control: "the gap" alone is for the charted site already', async () => {
    await undertakeExpedition('the gap');

    expect(sector().mapData.discoveries.map(d => d.name)).toEqual([GAP_SITE]);
    await finishExpedition('the gap');
    expect(state().currentLocationId).toBe('actor-gap');
  }, 30_000);
});

describe('issue #364 EXPEDITION-JOURNEY-WORDS-FRAGMENT — controls', () => {
  const resolver = async () => (await table.client('gm-1').import('../../src/index.js')).resolveCurrentLocationName;

  it('the resolver: an expedition\'s own label loses its journey words before the start and fragment rungs — nobody else\'s does', async () => {
    const resolve = await resolver();
    const gm = table.client('gm-1');
    const ask = (label, opts) => gm.run(() => resolve(label, state(), opts))?.id ?? null;
    const asExpedition = { asDestination: true, journeyWords: true };

    expect(ask('the expedition to Bleak', asExpedition)).toBe('actor-bleak');
    expect(ask('expedition to the gap', asExpedition)).toBe('actor-gap');
    expect(ask('the Vigil expedition', asExpedition)).toBe('actor-vigil');
    // The arrival by name at the finish asks the same label the same way.
    expect(ask('the expedition to Bleak', { journeyWords: true })).toBe('actor-bleak');
    expect(ask('expedition to the gap', { journeyWords: true })).toBe('actor-gap');
    // A preposition that places the destination beside the known place is no journey word.
    expect(ask('the wreck beyond Bleakhold', asExpedition)).toBeNull();
    expect(ask('the expedition to the wreck beyond Bleak', asExpedition)).toBeNull();
    // Journey words and nothing else name no place — they are not a prefix of every name.
    expect(ask('the expedition', asExpedition)).toBeNull();
    expect(ask('an expedition to the', asExpedition)).toBeNull();
    // A Set a Course's question is unchanged: the journey's words are not a course's.
    expect(ask('the expedition to Bleak', { asDestination: true })).toBeNull();
    expect(ask('Bleak', { asDestination: true })).toBe('actor-bleak');
    // The arrival's question for a course is unchanged too.
    expect(ask('the expedition to Bleak')).toBeNull();
  });

  it('withoutJourneyWords: the journey words at a label\'s edges, with the article that leads them', () => {
    expect(withoutJourneyWords('the expedition to Bleak')).toBe('Bleak');
    expect(withoutJourneyWords('expedition to the gap')).toBe('the gap');
    expect(withoutJourneyWords('a journey toward Bleakhold Station')).toBe('Bleakhold Station');
    expect(withoutJourneyWords('expeditions into the Bleak Reach')).toBe('the Bleak Reach');
    expect(withoutJourneyWords('the Bleak expedition')).toBe('Bleak');
    expect(withoutJourneyWords('for Bleak')).toBe('Bleak');
    // Nothing at the edges to take off.
    expect(withoutJourneyWords('the wreck beyond Bleakhold')).toBe('the wreck beyond Bleakhold');
    expect(withoutJourneyWords("Journey's End")).toBe("Journey's End");
    expect(withoutJourneyWords('the gap')).toBe('the gap');
    // Only the journey's words: nothing is left to name a place.
    expect(withoutJourneyWords('the expedition')).toBe('');
    expect(withoutJourneyWords('an expedition to the')).toBe('');
  });

  it('a Set a Course for "Bleak" (no journey words) still arrives at Bleakhold', async () => {
    await setACourse('Bleak');

    expect(control.confirmed.at(-1)).toMatchObject({ moveId: 'set_a_course' });
    expect(state().currentLocationId).toBe('actor-bleak');
    expect(sector().mapData.discoveries.map(d => d.name)).toEqual([GAP_SITE]);
  }, 30_000);

  it('an expedition for "the wreck beyond Bleakhold" is still for a new uncharted site, and its finish docks there', async () => {
    await undertakeExpedition('the wreck beyond Bleakhold');

    const names = sector().mapData.discoveries.map(d => d.name);
    expect(names).toEqual([GAP_SITE, 'Wreck Beyond Bleakhold']);
    const site = sector().mapData.discoveries[1];
    expect(expeditions()[0].siteId).toBe(site.id);

    await finishExpedition('the wreck beyond Bleakhold');
    expect(state().currentLocationId).toBe(site.actorId);
  }, 30_000);

  it('a Set a Course for "the expedition to Bleak" is read as an expedition for a new site, as before — the course asks without the journey words', async () => {
    await setACourse('the expedition to Bleak');

    expect(control.confirmed.at(-1)).toMatchObject({ moveId: 'undertake_an_expedition' });
    expect(control.confirmed.at(-1).courseRerouted).toMatchObject({ from: 'set_a_course' });
    expect(sector().mapData.discoveries.map(d => d.name)).toEqual([GAP_SITE, 'Expedition to Bleak']);
  }, 30_000);
});

// tests/probes/uisec/chartedSiteRenamedThenDuplicated.probe.js
//
// UISEC-04 · UNCHARTED-SITE-DUPLICATED-AFTER-RENAME (IDENTITY-BY-NAME — a duplicate minted)
//
// Scenario: an expedition to an unnamed destination records it as an uncharted
// site under its working label (issue #348 PT07); Finish an Expedition charts
// it, and the Site Discovered card tells the GM to "give it its name by
// renaming its location". The GM does. The discovery record keeps the working
// label as its `name` (siteDiscovery.siteDisplayName reads the Actor's first).
// Later the table — or the interpreter, reading the recent scene — names the
// place by its old working label again ("set a course for Archer's
// rendezvous").
//
//   - the arrival's name resolver knows only the location's new name, so the
//     course is "not a charted place" and is rerouted to Undertake an
//     Expedition (travel.js rerouteUnchartedCourse);
//   - the new expedition's "is this already a site?" check
//     (selectExpeditionSite → selectSectorSite, requireLabelMatch) finds the
//     site by its record's name — and returns null because it is already
//     charted: an exact name "resolves to that site or to nothing";
//   - null reads as "no such site", so recordUnchartedDestination mints a
//     second location Actor, a second discovery record of the same name and a
//     second "Unexplored Site" pin for a place the crew has already charted.
//
// Correct: a label that names a site the sector already holds — charted or
// not — records no second site ("a label that already names a site or a
// tracked place, nothing is recorded" — recordUnchartedDestination's contract).
// Today: two discovery records named "Archer's Rendezvous — The Gap", two
// location Actors, two pins.
//
// Production wiring: the player's lines through the GM's real pipeline on a
// booted table, as tests/unit/travelUnchartedDestination.test.js.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpretation: null, dice: [], confirmed: [] }));
vi.mock('../../../src/pacing/router.js', async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (original) => ({
  ...(await original()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()),
  confirmInterpretation: vi.fn(async (interp) => { control.confirmed.push(structuredClone(interp)); return true; }),
  getMischiefDial: vi.fn(() => 'balanced'),
}));
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The stars wheel past.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const GAP      = "Archer's rendezvous — the gap";
const GAP_SITE = "Archer's Rendezvous — The Gap";
const NEW_NAME = 'Tessellate Station';
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
const sitePins = () => scene.notes.contents.filter(n => n.flags?.[MODULE_ID]?.siteNote);

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
const finishExpedition = () => say(
  { moveId: 'finish_an_expedition', moveName: 'Finish An Expedition', statUsed: null, isProgressMove: true, moveTarget: GAP },
  STRONG_PROGRESS, 'We reach the gap at last.');

/** The crew set out for the gap, reached it, and it was charted. */
async function chartTheGap() {
  await setACourse(GAP);
  await finishExpedition();
  const [site] = sector().mapData.discoveries;
  expect(site).toMatchObject({ name: GAP_SITE, type: 'uncharted', discovered: true });
  return site;
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
        mapData: { settlements: [{ id: 'gen-B', name: 'Bleakhold', gridX: 9, gridY: 4 }], discoveries: [] } }],
      activeSectorId: 'sec-1',
      settlementIds: ['actor-bleak'], locationIds: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 }, supply: 3 } });
  table.addActor({ id: 'actor-bleak', type: 'location', name: 'Bleakhold',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: 'Bleakhold', sectorId: 'sec-1' } } } });
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

describe('UISEC-04: a charted uncharted-destination is one place, whatever it is called afterwards', () => {
  it('control: before any rename, a course back to its working label is a Set a Course to the charted place — no second site', async () => {
    await chartTheGap();
    await setACourse(GAP);

    expect(control.confirmed.at(-1)).toMatchObject({ moveId: 'set_a_course' });
    expect(sector().mapData.discoveries).toHaveLength(1);
    expect(sitePins()).toHaveLength(1);
  }, 30_000);

  it('after the GM renames its location (as the Site Discovered card invites), the old working label still names that site — no second site, location or pin is made', async () => {
    const site = await chartTheGap();
    const location = table.actors.find(a => a.id === site.actorId);
    // The GM's rename, as the rename sync leaves it: the Actor and its record carry the new name.
    location.name = NEW_NAME;
    location.flags[MODULE_ID].location.name = NEW_NAME;
    const locationsBefore = state().locationIds.length;

    // The table still calls it by the label the story used.
    await setACourse(GAP);

    // Today: 2 discovery records (both named GAP_SITE), a second location Actor and a second "Unexplored Site" pin.
    expect(sector().mapData.discoveries.map(d => d.name)).toEqual([GAP_SITE]);
    expect(state().locationIds).toHaveLength(locationsBefore);
    expect(sitePins()).toHaveLength(1);
  }, 30_000);
});

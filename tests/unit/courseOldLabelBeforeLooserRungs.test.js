// tests/unit/courseOldLabelBeforeLooserRungs.test.js
//
// Issue #364 COURSE-OLD-LABEL-LOOSER-RUNG-FIRST (left open by issue #364
// AT-COMMAND-OLD-LABEL; issue #362 AC50's course).
//
// An uncharted destination's discovery record keeps its working label as its
// name ("Archer's rendezvous — the gap") after it is charted and the GM
// renames its location. A Set a Course by that label is a course to the site
// (AC50) — but the course asked the place resolver's whole ladder first, and
// the site's record only when the ladder found nothing. The ladder's looser
// rungs take a name the label begins, or one name inside the other as whole
// words: with a settlement called "Archer" on the map, "Archer's rendezvous —
// the gap" was a course to Archer. The ship docked at the settlement and the
// current location said Archer, though the label names a charted site.
//
// The course now asks in `!at`'s order (tests/unit/atCommandOldWorkingLabel):
// a place called exactly that; then the charted site whose record keeps
// exactly that name — the course goes there by its location's id; only then
// the looser rungs.
//
// Pinned beside it, and unchanged by the fix: the same label while the site
// is still uncharted is an expedition even with Archer on the map — its
// location Actor carries the label, so the resolver's exact rung finds the
// unexplored site before any looser rung is tried (issue #348 PT06–PT08).
//
// Production wiring: the player's lines through the GM's real pipeline on a
// booted table, as tests/unit/chartedSiteOldLabelNoDuplicate.test.js.

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
const finishExpedition = () => say(
  { moveId: 'finish_an_expedition', moveName: 'Finish An Expedition', statUsed: null, isProgressMove: true, moveTarget: GAP },
  STRONG_PROGRESS, 'We reach the gap at last.');

/** The crew set out for the gap: it is recorded as an uncharted site under its working label. */
async function setOutForTheGap() {
  await undertakeExpedition(GAP);
  const [site] = sector().mapData.discoveries;
  expect(site, 'the gap is recorded, not yet charted (setup)').toMatchObject({ name: GAP_SITE, type: 'uncharted', discovered: false });
  return site;
}

/** …reached it, it was charted, and the GM renamed its location as the Site Discovered card invites. */
async function chartAndRenameTheGap() {
  await setOutForTheGap();
  await finishExpedition();
  const [site] = sector().mapData.discoveries;
  expect(site, 'the gap is charted (setup)').toMatchObject({ name: GAP_SITE, discovered: true });
  const location = table.actors.find(a => a.id === site.actorId);
  location.name = NEW_NAME;
  location.flags[MODULE_ID].location.name = NEW_NAME;
  return site;
}

/** A settlement called "Archer" is on the map: one name inside the label, as a whole word. */
function archerIsFounded({ at = false } = {}) {
  table.addActor({ id: 'actor-archer', type: 'location', name: 'Archer',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-archer', name: 'Archer', sectorId: 'sec-1' } } } });
  table.world.setSetting('campaignState', { ...state(),
    settlementIds: [...state().settlementIds, 'actor-archer'],
    ...(at ? { currentLocationId: 'actor-bleak', currentLocationType: 'settlement' } : {}) });
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

describe('issue #364 COURSE-OLD-LABEL-LOOSER-RUNG-FIRST — a course by a site\'s record name goes to that site, whatever place a looser rung finds', () => {
  it('a renamed site\'s old working label with a settlement "Archer" on the map: the course arrives at the site, not at Archer', async () => {
    const site = await chartAndRenameTheGap();
    archerIsFounded({ at: true });   // the crew left for Bleakhold meanwhile

    await setACourse(GAP);

    // It was a Set a Course with no id, and the arrival's name resolver docked at the settlement.
    expect(control.confirmed.at(-1).moveId).toBe('set_a_course');
    expect(state().currentLocationId, 'the crew is at the renamed site, not at Archer').toBe(site.actorId);
    expect(control.confirmed.at(-1).moveTargetId, 'the course names the site by its location\'s id').toBe(site.actorId);
    expect(sector().mapData.discoveries).toHaveLength(1);
    expect(sitePins()).toHaveLength(1);
  }, 30_000);

  it('control: the same label while the site is still uncharted is an expedition for that site — not a Set a Course to Archer', async () => {
    const site = await setOutForTheGap();
    archerIsFounded({ at: true });
    const before = state().currentLocationId;

    await setACourse(GAP);

    expect(control.confirmed.at(-1), 'read as Undertake an Expedition').toMatchObject({ moveId: 'undertake_an_expedition' });
    expect(control.confirmed.at(-1).courseRerouted).toMatchObject({ from: 'set_a_course', destination: GAP });
    expect(state().currentLocationId, 'nobody arrived at Archer').toBe(before);
    // The expedition already open for the site goes on: no second site, no second track.
    expect(sector().mapData.discoveries.map(d => d.id)).toEqual([site.id]);
    expect(openExpeditions()).toHaveLength(1);
  }, 30_000);

  it('control: "please set a course" for the scene\'s uncharted destination is that expedition too, with Archer on the map', async () => {
    await setOutForTheGap();
    archerIsFounded({ at: true });

    await setACourse(null);   // names none: the scene's destination, the gap

    expect(control.confirmed.at(-1)).toMatchObject({ moveId: 'undertake_an_expedition', moveTarget: GAP_SITE });
    expect(state().currentLocationId).toBe('actor-bleak');
  }, 30_000);

  it('control: a place called exactly what the course says is that place — the exact name first', async () => {
    await chartAndRenameTheGap();
    archerIsFounded({ at: true });

    await setACourse('Archer');

    expect(control.confirmed.at(-1)).toMatchObject({ moveId: 'set_a_course' });
    expect(control.confirmed.at(-1).moveTargetId ?? null).toBeNull();
    expect(state().currentLocationId).toBe('actor-archer');
  }, 30_000);

  it('control: a label no site record keeps still takes the looser rungs — "Archer\'s dock" is a course to Archer', async () => {
    await chartAndRenameTheGap();
    archerIsFounded({ at: true });

    await setACourse("Archer's dock");

    expect(control.confirmed.at(-1)).toMatchObject({ moveId: 'set_a_course' });
    expect(state().currentLocationId).toBe('actor-archer');
  }, 30_000);

  it('control: without a namesake settlement the renamed site\'s old label arrives at the site, as since issue #362 AC50', async () => {
    const site = await chartAndRenameTheGap();
    table.world.setSetting('campaignState', { ...state(), currentLocationId: 'actor-bleak', currentLocationType: 'settlement' });

    await setACourse(GAP);

    expect(control.confirmed.at(-1)).toMatchObject({ moveId: 'set_a_course', moveTargetId: site.actorId });
    expect(state().currentLocationId).toBe(site.actorId);
  }, 30_000);
});

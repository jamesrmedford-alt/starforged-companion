// tests/unit/atCommandOldWorkingLabel.test.js
//
// Issue #364 AT-COMMAND-OLD-LABEL (left open by issue #362 AC50).
//
// An expedition to an unnamed destination records it as an uncharted site
// under its working label; Finish an Expedition charts it, and the Site
// Discovered card invites the GM to rename its location. The discovery record
// keeps the working label as its `name`. Since AC50 a Set a Course by that old
// label arrives at the site — but the GM's `!at ‹old working label›` asked the
// name resolver alone, which knows the location by its new name: "No
// settlement, location, or planet named … found", and nothing was set.
//
// `!at` now has one more exact rung, after the exact name and before the
// looser ones: the name a site's discovery record keeps, resolved to the
// site's location by its id. The pipeline's own uses of the resolver are
// unchanged (the course takes that step in travel.js).
//
// Production wiring: the crew charts the place through the GM's real pipeline
// on a booted table (tests/unit/chartedSiteOldLabelNoDuplicate.test.js), then
// the GM types `!at`.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpretation: null, dice: [] }));
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
  confirmInterpretation: vi.fn(async () => true),
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
const atCards = () => table.cards(f => f.atCommandCard);

async function say(interpretation, dice, text) {
  control.interpretation = { adds: 0, rationale: 'test', mischiefApplied: false, ...interpretation };
  control.dice = dice;
  await table.client('pl-1').chat(text, { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await table.drain();
}
const at = async (arg) => { await table.client('gm-1').chat(`!at ${arg}`); await table.settle(); await table.drain(); };

/** The crew set out for the gap, reached it, it was charted — and they went back to Bleakhold. */
async function chartTheGap() {
  await say({ moveId: 'set_a_course', moveName: 'Set A Course', statUsed: 'supply', moveTarget: GAP }, STRONG_ACTION, 'Please set a course.');
  await say({ moveId: 'finish_an_expedition', moveName: 'Finish An Expedition', statUsed: null, isProgressMove: true, moveTarget: GAP },
    STRONG_PROGRESS, 'We reach the gap at last.');
  const [site] = sector().mapData.discoveries;
  expect(site).toMatchObject({ name: GAP_SITE, type: 'uncharted', discovered: true });
  table.world.setSetting('campaignState', { ...state(), currentLocationId: 'actor-bleak', currentLocationType: 'settlement' });
  return site;
}

/** The GM's rename, as the rename sync leaves it: the Actor and its record carry the new name; the discovery record keeps the label. */
function renameLocation(site, name) {
  const location = table.actors.find(a => a.id === site.actorId);
  location.name = name;
  location.flags[MODULE_ID].location.name = name;
}

/** A settlement founded since, whose name is a whole word of the working label: the looser rungs would pick it. */
function foundArcher() {
  table.addActor({ id: 'actor-archer', type: 'location', name: 'Archer',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-archer', name: 'Archer', sectorId: 'sec-1' } } } });
  table.world.setSetting('campaignState', { ...state(), settlementIds: [...state().settlementIds, 'actor-archer'] });
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => { table?.scenes.delete('scene-1'); table?.teardown(); });

beforeEach(async () => {
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

describe('issue #364 AT-COMMAND-OLD-LABEL — `!at` by a charted destination\'s old working label', () => {
  it('control: before any rename, `!at ‹working label›` sets the charted site as the current location', async () => {
    const site = await chartTheGap();
    await at(GAP);
    expect(state()).toMatchObject({ currentLocationId: site.actorId, currentLocationType: 'location' });
  }, 30_000);

  it('control: after the rename, `!at ‹new name›` finds it', async () => {
    const site = await chartTheGap();
    renameLocation(site, NEW_NAME);
    await at(NEW_NAME);
    expect(state().currentLocationId).toBe(site.actorId);
  }, 30_000);

  it('after the GM renames its location, `!at ‹old working label›` still sets that site — and the card names it as it is called now', async () => {
    const site = await chartTheGap();
    renameLocation(site, NEW_NAME);
    const cards = atCards().length;

    await at(GAP);

    expect(state(), 'the current location after `!at` by the old label')
      .toMatchObject({ currentLocationId: site.actorId, currentLocationType: 'location' });
    expect(atCards(), 'one card').toHaveLength(cards + 1);
    expect(String(atCards().at(-1).content)).toContain(`Current location set to <strong>${NEW_NAME}</strong> (location)`);
    // Nothing is minted for it.
    expect(sector().mapData.discoveries).toHaveLength(1);
  }, 30_000);

  it('the record\'s own name wins over a looser match — never the settlement "Archer" the label only contains', async () => {
    const site = await chartTheGap();
    renameLocation(site, NEW_NAME);
    foundArcher();
    await at(`the ${GAP}`);   // a leading article and case aside
    expect(state().currentLocationId).toBe(site.actorId);
  }, 30_000);

  it('a name no place and no site record keeps is still not found, and nothing is written', async () => {
    const site = await chartTheGap();
    renameLocation(site, NEW_NAME);
    const cards = atCards().length;
    await at('the Far Reach relay');
    expect(state().currentLocationId).toBe('actor-bleak');
    expect(atCards()).toHaveLength(cards);
  }, 30_000);

  it('the pipeline\'s resolver is unchanged: the record-name rung is `!at`\'s own', async () => {
    const site = await chartTheGap();
    renameLocation(site, NEW_NAME);
    foundArcher();
    const { resolveCurrentLocationName } = await table.client('gm-1').import('../../src/index.js');
    const gm = table.client('gm-1');
    expect(gm.run(() => resolveCurrentLocationName('Tessellate', state()))?.id, 'a prefix still resolves').toBe(site.actorId);
    expect(gm.run(() => resolveCurrentLocationName(GAP, state(), { siteRecordNames: true }))?.id).toBe(site.actorId);
    expect(gm.run(() => resolveCurrentLocationName(GAP, state()))?.id, 'without the rung: the looser match, as before').toBe('actor-archer');
  }, 30_000);
});

// tests/probes/uisec/unchartedSiteClearedAsDerelict.probe.js
//
// UISEC-06 · UNCHARTED-SITE-CLEARED-AS-DERELICT (WRONG-DETAIL, cosmetic)
//
// Scenario: issue #348 PT07 added a third kind of site to
// `mapData.discoveries` — type "uncharted", a destination the crew set out for
// under a working label. The Site Discovered card was taught the new type
// (siteDiscovery.postSiteDiscoveryCard); the `!clear-site` card was not: it
// words every site that is not a vault as a derelict
// (index.js handleClearSiteCommand: `type === "vault" ? "vault" : "derelict"`).
// A GM who marks a charted rendezvous point fully explored is told "The
// derelict is fully explored" for a place that is no wreck.
//
// Correct: the card does not call an uncharted destination a derelict (or a vault).
// Today: "◈ Site Cleared — Archer's Rendezvous — The Gap … The derelict is fully explored."
//
// Production wiring: the player's lines and the GM's `!clear-site` through the
// real chat routing on a booted table (tests/unit/travelUnchartedDestination.test.js).

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpretation: null, dice: [] }));
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
  confirmInterpretation: vi.fn(async () => true),
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
const STRONG_ACTION   = [0.15, 0.25, 0.99];
const STRONG_PROGRESS = [0.05, 0.05];

let table, tracksStore, scene;

const state  = () => table.world.campaignState();
const sector = () => state().sectors.find(s => s.id === 'sec-1');

async function say(interpretation, dice, text) {
  control.interpretation = { adds: 0, rationale: 'test', mischiefApplied: false, ...interpretation };
  control.dice = dice;
  await table.client('pl-1').chat(text, { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await table.drain();
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
  table.journal._set({
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); },
  });
  scene = {
    id: 'scene-1', grid: { size: 100 }, flags: { [MODULE_ID]: { sectorScene: true, sectorId: 'sec-1' } },
    dimensions: { sceneX: 200, sceneY: 200, sceneWidth: 1792, sceneHeight: 1024 },
    notes: { contents: [] }, drawings: { contents: [] }, tokens: { contents: [] },
    createEmbeddedDocuments: vi.fn(async (type, data) => {
      const docs = data.map((d, i) => ({ id: `${type}-${i}`, ...d,
        update: vi.fn(async function (patch) { Object.assign(this, patch); }) }));
      if (type === 'Note') scene.notes.contents.push(...docs);
      if (type === 'Drawing') scene.drawings.contents.push(...docs);
      return docs;
    }),
  };
  table.scenes.set('scene-1', scene);
  scriptClaude(table, { fallback: () => REPLY });
});

describe('UISEC-06: !clear-site on a charted uncharted destination', () => {
  it('control: the crew charts the gap, and its Site Discovered card words it as an uncharted place', async () => {
    await say({ moveId: 'set_a_course', moveName: 'Set A Course', statUsed: 'supply', moveTarget: GAP }, STRONG_ACTION, 'Please set a course.');
    await say({ moveId: 'finish_an_expedition', moveName: 'Finish An Expedition', statUsed: null, isProgressMove: true, moveTarget: GAP },
      STRONG_PROGRESS, 'We reach the gap at last.');
    expect(sector().mapData.discoveries[0]).toMatchObject({ name: GAP_SITE, type: 'uncharted', discovered: true });
    const [discovered] = table.cards(f => f.siteDiscovered);
    expect(discovered.content).toMatch(/no chart showed before/);
    expect(discovered.content).not.toMatch(/derelict|vault/i);
  }, 30_000);

  it('the Site Cleared card does not call it a derelict', async () => {
    await say({ moveId: 'set_a_course', moveName: 'Set A Course', statUsed: 'supply', moveTarget: GAP }, STRONG_ACTION, 'Please set a course.');
    await say({ moveId: 'finish_an_expedition', moveName: 'Finish An Expedition', statUsed: null, isProgressMove: true, moveTarget: GAP },
      STRONG_PROGRESS, 'We reach the gap at last.');

    await table.client('gm-1').chat('!clear-site');
    await table.settle();
    await table.drain();

    const [cleared] = table.cards(f => f.siteCleared);
    expect(cleared).toBeTruthy();                                   // the command ran and cleared it
    expect(sector().mapData.discoveries[0].cleared).toBe(true);
    // Today: "<p>The derelict is fully explored. Its secrets are yours — or spent.</p>"
    expect(cleared.content).not.toMatch(/derelict/i);
  }, 30_000);
});

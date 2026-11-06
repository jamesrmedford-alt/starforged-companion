// tests/probes/sectors/finishUnrelatedExpeditionRevealsSite.probe.js
//
// SECT-D1 (decision row) — finishing an expedition to a SETTLEMENT charts the
// sector's lone unexplored site.
//
// Undertake an Expedition is for any perilous journey ("trailblaze a route
// through perilous space, journey over hazardous terrain, or survey a
// mysterious site"). A Terminus sector has one site (siteCountForRegion). The
// crew undertakes "the expedition to Bleakhold" — a settlement; the stamp
// links no site (selectSectorSite with requireLabelMatch: "a guess there
// would tie unrelated expeditions to the one remaining site"). They finish it,
// and the finish's reveal runs the same ladder WITHOUT requireLabelMatch, so
// its last rung — the sole undiscovered site — charts the derelict at the
// frontier: "◈ Site Discovered — Derelict Starship", its location Actor marked
// "visited", the narrator's Charted sites naming it, though the crew went to
// Bleakhold. The probe asserts the recommended option (B): a finish whose
// label names another known place reveals nothing.
//
// Production wiring: a player's typed line → the real move pipeline on the
// canonical GM (interpreter / dice / Claude stubbed at their boundaries).

/* global structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpretation: null, dice: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The docking clamps of Bleakhold close around the hull.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
let table;

function makeTracksJournal(tracks = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
}

async function finish(label, siteId = null) {
  table.journal._set(makeTracksJournal([
    { id: 'exp-1', label, type: 'expedition', rank: 'dangerous', ticks: 40, completed: false, ...(siteId ? { siteId } : {}) },
  ]));
  control.interpretation = {
    adds: 0, rationale: 'test', mischiefApplied: false,
    moveId: 'finish_an_expedition', moveName: 'Finish An Expedition', statUsed: null,
    isProgressMove: true, moveTarget: label, moveTargetId: 'exp-1',
  };
  control.dice = [0.25, 0.35];   // challenge 3, 4 against progress 10: a strong hit
  await table.client('pl-1').chat('We reach the end of the long haul.', { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
      currentSceneId: 'sc-1', sceneTruths: [],
      // A Terminus sector: one site, at the frontier, still unexplored.
      sectors: [{ id: 'sec-1', name: 'Devil\'s Reach', region: 'terminus',
        mapData: { settlements: [], discoveries: [{ id: 'site-1', name: 'Derelict Starship', type: 'derelict', discovered: false, actorId: 'actor-site' }] } }],
      activeSectorId: 'sec-1', settlementIds: ['actor-bleak'], locationIds: ['actor-site'],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({
    id: 'actor-bleak', type: 'location', name: 'Bleakhold',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: 'Bleakhold', sectorId: 'sec-1' } } },
  });
  table.addActor({
    id: 'actor-site', type: 'location', name: 'Derelict Starship',
    flags: { [MODULE_ID]: { entityType: 'location', location: { _id: 'rec-site', name: 'Derelict Starship', type: 'derelict', status: 'unexplored', sectorId: 'sec-1' } } },
  });
  scriptClaude(table, { fallback: () => REPLY });
});

const site = () => table.world.campaignState().sectors[0].mapData.discoveries[0];

describe('SECT-D1: finishing an expedition to a settlement leaves the unexplored site unexplored', () => {
  it('the expedition to Bleakhold finishes, and the frontier derelict stays uncharted', async () => {
    await finish('the expedition to Bleakhold');

    expect(table.cards(f => f.expeditionFinishCard)).toHaveLength(1);   // it finished (the setup is real)
    expect(site().discovered).toBe(false);                               // actual: true — the sole-site guess
    expect(table.cards(f => f.siteDiscovered)).toHaveLength(0);          // actual: "◈ Site Discovered — Derelict Starship"
  }, 30_000);

  it('control: an expedition linked to the site (its siteId) charts it', async () => {
    await finish('the derelict signal', 'site-1');
    expect(site().discovered).toBe(true);
    expect(table.cards(f => f.siteDiscovered)).toHaveLength(1);
  }, 30_000);
});

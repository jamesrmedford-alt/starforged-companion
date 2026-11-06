// tests/unit/expeditionStampRenamedSite.test.js
//
// Known-issues EXPEDITION-STAMP-SITE-NAME (found while fixing issue #342 Z14):
// the Undertake an Expedition's site link reads a site by the name the table
// knows it by — its location Actor's, which a GM may rename — as the finish
// does (siteDiscovery.selectExpeditionSite).
//
// An unexplored site's pin reads "Unexplored Site"; the GM renamed the
// sector's precursor vault (generated "Precursor Vault — Sphere") on its
// sheet to "The Ghost Spire" and the crew sets out for it by that name. The
// Undertake stamped its expedition→site link with selectSectorSite over the
// discovery records' generated names only, so the new name matched nothing —
// and "ghost" is a derelict keyword, so the type-keyword rung linked the
// sector's one unexplored DERELICT. The finish arrives at and charts the site
// its track links: the expedition to the Ghost Spire docked the ship at the
// derelict and charted it, while the vault the crew named stayed unexplored.
// A renamed site with no keyword in its new name was linked to nothing, so
// the finish found it only while the label still named it. The stamp now goes
// through selectExpeditionSite, the finish's own ladder (the location Actor's
// name first — issue #326 W75's siteDisplayName).
//
// Production wiring: a player's typed line → the real move pipeline on the
// canonical GM (interpreter / dice / Claude stubbed at their boundaries).

/* global structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpretation: null, dice: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'The long haul begins.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
let table;
let tracks;

function makeTracksJournal(initial = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(initial) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
    tracks: () => store[`${MODULE_ID}.tracks`],
  };
}

/** Undertake a new expedition (a strong hit) toward this destination; the track it began. */
async function undertake(label) {
  tracks = makeTracksJournal([]);
  table.journal._set(tracks);
  control.interpretation = {
    adds: 0, rationale: 'test', mischiefApplied: false,
    moveId: 'undertake_an_expedition', moveName: 'Undertake An Expedition', statUsed: 'wits',
    isProgressMove: false, moveTarget: label, moveTargetId: null, expeditionRank: 'dangerous',
  };
  control.dice = [0.0, 0.1, 0.99];   // challenge 1, 2; action 6: a strong hit
  await table.client('pl-1').chat('We plot a course into the dark.', { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await table.drain();
  const [track] = tracks.tracks();
  return track;
}

/** The journey made: finish that expedition (a strong hit), by its track. */
async function finish(track) {
  const stored = tracks.tracks().find(t => t.id === track.id);
  await tracks.setFlag(MODULE_ID, 'tracks', tracks.tracks().map(t => (t.id === stored.id ? { ...t, ticks: 40 } : t)));
  control.interpretation = {
    adds: 0, rationale: 'test', mischiefApplied: false,
    moveId: 'finish_an_expedition', moveName: 'Finish An Expedition', statUsed: null,
    isProgressMove: true, moveTarget: track.label, moveTargetId: track.id,
  };
  control.dice = [0.25, 0.35];   // challenge 3, 4 against progress 10: a strong hit
  await table.client('pl-1').chat('We reach the end of the long haul.', { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

const VAULT    = { id: 'site-v', name: 'Precursor Vault — Sphere', type: 'vault', discovered: false, actorId: 'actor-vault' };
const DERELICT = { id: 'site-d', name: 'Derelict Starship', type: 'derelict', discovered: false, actorId: 'actor-derelict' };

/** The sector's unexplored sites; `vaultName` / `derelictName` — what the GM renamed each to on its sheet. */
async function seed({ vaultName = VAULT.name, derelictName = DERELICT.name, sites = [VAULT, DERELICT] } = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
      currentSceneId: 'sc-1', sceneTruths: [],
      sectors: [{ id: 'sec-1', name: "Devil's Reach", region: 'outlands', mapData: { settlements: [], discoveries: structuredClone(sites) } }],
      activeSectorId: 'sec-1', settlementIds: ['actor-bleak'], locationIds: ['actor-vault', 'actor-derelict'],
      currentLocationId: 'actor-bleak', currentLocationType: 'settlement',
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({
    id: 'actor-bleak', type: 'location', name: 'Bleakhold',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: 'Bleakhold', sectorId: 'sec-1' } } },
  });
  // A location Actor renamed on its sheet: the rename sync keeps its record's name in step.
  const site = (id, name, type) => table.addActor({
    id, type: 'location', name,
    flags: { [MODULE_ID]: { entityType: 'location', location: { _id: `rec-${id}`, name, type, status: 'unexplored', sectorId: 'sec-1', canonicalLocked: true } } },
  });
  site('actor-vault', vaultName, 'vault');
  site('actor-derelict', derelictName, 'derelict');
  scriptClaude(table, { fallback: () => REPLY });
}

const discovery = (id) => table.world.campaignState().sectors[0].mapData.discoveries.find(d => d.id === id);

describe('the Undertake links the site the crew names by the name the GM gave it', () => {
  it('an expedition to the renamed vault ("the Ghost Spire") is linked to the vault', async () => {
    await seed({ vaultName: 'The Ghost Spire' });
    const track = await undertake('the Ghost Spire');

    expect(track, 'the expedition began (setup)').toMatchObject({ label: 'the Ghost Spire', type: 'expedition' });
    // It was 'site-d': the generated names matched nothing, and "ghost" is a derelict keyword.
    expect(track.siteId).toBe('site-v');
  }, 30_000);

  it('…so finishing it charts the vault and docks there, and the derelict stays unexplored', async () => {
    await seed({ vaultName: 'The Ghost Spire' });
    await finish(await undertake('the Ghost Spire'));

    expect(table.cards(f => f.expeditionFinishCard), 'it finished (setup)').toHaveLength(1);
    expect({ vault: discovery('site-v').discovered, derelict: discovery('site-d').discovered })
      .toEqual({ vault: true, derelict: false });
    expect(table.world.campaignState().currentLocationId).toBe('actor-vault');
  }, 30_000);

  it('a renamed derelict the crew names by its new name ("Kessa\'s Rest") is linked to it', async () => {
    await seed({ derelictName: "Kessa's Rest", sites: [DERELICT, { ...VAULT, discovered: true }] });
    const track = await undertake("Kessa's Rest");

    // It was linked to nothing: the finish found the site only while the label still named it.
    expect(track.siteId).toBe('site-d');
  }, 30_000);

  it('control: a site the crew names by its generated name is linked to it', async () => {
    await seed();
    const track = await undertake('Derelict Starship');
    expect(track.siteId).toBe('site-d');
  }, 30_000);

  it('control: an expedition to a settlement is linked to no site', async () => {
    await seed();
    const track = await undertake('the expedition to Bleakhold');
    expect(track.siteId ?? null).toBeNull();
  }, 30_000);
});

/**
 * STARFORGED COMPANION
 * tests/unit/enterFrayNameOnly.test.js
 *
 * Known-issues ENTER-FRAY-SOLE-FIGHT / FRAY-SOLE-FIGHT-FALLBACK — a move that
 * begins a track matches an open one by name only.
 *
 * Entering the fray against a new foe while exactly one fight was open
 * resumed that fight: the threshold check, the move's fight lookup and the
 * threshold card's create resolved the foe with selectCombatTrack, whose
 * sole-open-fight fallback (meant for a combat move whose foe the
 * interpreter named loosely) returned the open fight — no threshold card,
 * the opening position written onto the old fight, no second track. And an
 * Undertake an Expedition naming a new destination marked the one open
 * expedition. Enter the Fray now matches its foe by name alone, and a named
 * Undertake its destination: a new name begins a new fight (its threshold
 * card) or a new expedition.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// The pipeline: no pacing call, the confirm dialog accepted, the interpreter
// answering `control.interpretation` (a typed move), and scripted dice inside
// the REAL resolveMove (`control.dice`, consumed in order).
const control = vi.hoisted(() => ({ dice: [], interpretation: null, onConfirm: null }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    ...control.interpretation, playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => { await control.onConfirm?.(); return true; }),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const r of control.dice) dice.mockReturnValueOnce(r);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'Steel rings down the corridor.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table, journal;
// The moves narrated this session, as each move narration's flags (moveId,
// outcome), oldest first — it read the session move log, retired with issue
// #326 W58.
const sessionLog = () => table.cards(f => f.narratorCard && f.resolutionId && !f.burnSuperseded).map(c => c.flags[MODULE_ID]);
const tracks = () => journal.getFlag(MODULE_ID, 'tracks') ?? [];
const track = (id) => tracks().find(t => t.id === id);

/** The "Starforged Progress Tracks" journal: a document-level flag store, as progressTracks.js writes it. */
function makeTracksJournal() {
  const flags = {};
  return {
    id:      'tracks-journal',
    name:    'Starforged Progress Tracks',
    getFlag: (mod, key) => flags[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { flags[`${mod}.${key}`] = JSON.parse(JSON.stringify(value)); },
  };
}

/** Open a track through the real store on the GM's client. */
async function openTrack(label, { type = 'combat', rank = 'dangerous', ...fields } = {}) {
  const gm = table.client('gm-1');
  const store = await gm.import('../../src/ui/progressTracks.js');
  return gm.run(async () => {
    const created = await store.addProgressTrack({ label, type, rank });
    await store.updateTrackFields(created.id, fields);
    return created;
  });
}

/** A player types a combat move; the canonical GM's pipeline runs it. */
async function typedMove(interpretation, dice) {
  control.interpretation = interpretation;
  control.dice = dice;
  await table.client('pl-1').chat('I go for the turret controls.', { speaker: { actor: 'pc-pat' } });
  await table.settle();
  await table.drain();
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [];
  control.interpretation = null;
  control.onConfirm = null;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
  journal = makeTracksJournal();
  table.journal._set(journal);
  scriptClaude(table, { fallback: () => REPLY });
});

// Strike +iron: challenge 2 and 3, action 6 + iron 3 = 9 — a strong hit (in control), marked twice.
const STRIKE_STRONG = [0.15, 0.25, 0.9];
// Enter the Fray +edge: challenge 2 and 3, action 6 + edge 2 = 8 — a strong hit (in control).
const FRAY_STRONG = STRIKE_STRONG;

const typedFray = (moveTarget) => ({
  moveId: 'enter_the_fray', moveName: 'Enter the Fray', statUsed: 'edge', adds: 0,
  moveTarget, combatRank: 'formidable', rationale: 'test', mischiefApplied: false,
});
const typedUndertake = (moveTarget) => ({
  moveId: 'undertake_an_expedition', moveName: 'Undertake An Expedition', statUsed: 'wits', adds: 0,
  moveTarget, rationale: 'test', mischiefApplied: false,
});

describe('Enter the Fray matches its foe by name only (ENTER-FRAY-SOLE-FIGHT)', () => {
  it('one fight open: a new foe gets its threshold card, and the open fight keeps its position', async () => {
    const boarders = await openTrack('Boarders', { ticks: 8, combatState: 'bad_spot', positions: { 'pc-pat': 'bad_spot' } });

    await typedMove(typedFray('Ironclad raiders'), FRAY_STRONG);

    expect(sessionLog().map(e => [e.moveId, e.outcome])).toEqual([['enter_the_fray', 'strong_hit']]);
    const [threshold] = table.cards(f => f.combatThresholdCard);
    expect(threshold, 'a threshold card for the new foe').toBeTruthy();
    expect(threshold.flags[MODULE_ID]).toMatchObject({ label: 'Ironclad raiders', position: 'in_control' });
    // The opening position rides the card — it was written onto the old fight.
    expect(track(boarders.id).combatState).toBe('bad_spot');
    expect(track(boarders.id).positions?.['pc-pat']).toBe('bad_spot');
  });

  it('the threshold card begins a second fight while one is open', async () => {
    await openTrack('Boarders');
    const gm = table.client('gm-1');
    const { createCombatTrackFromThreshold } = await gm.import('../../src/index.js');
    await gm.run(() => createCombatTrackFromThreshold({ label: 'Ironclad raiders', rank: 'extreme', position: 'in_control', actorId: 'pc-pat' }));
    await table.settle();

    expect(tracks().map(t => t.label)).toEqual(['Boarders', 'Ironclad raiders']);
    const raiders = tracks().find(t => t.label === 'Ironclad raiders');
    expect(raiders.rank).toBe('extreme');
    expect(raiders.positions?.['pc-pat']).toBe('in_control');
    expect(tracks()[0].positions?.['pc-pat']).toBeUndefined();
  });

  it('control: a foe that is the open fight by name posts no card and positions that fight', async () => {
    const boarders = await openTrack('Boarders', { ticks: 8, combatState: 'bad_spot' });

    await typedMove(typedFray('the boarders'), FRAY_STRONG);

    expect(table.cards(f => f.combatThresholdCard)).toHaveLength(0);
    expect(tracks()).toHaveLength(1);
    expect(track(boarders.id).positions?.['pc-pat']).toBe('in_control');
  });
});

describe('a named Undertake an Expedition matches by name only (FRAY-SOLE-FIGHT-FALLBACK)', () => {
  it('one expedition open: a new destination begins its own, and the open one is not marked', async () => {
    const vault = await openTrack('The Vault of Tears', { type: 'expedition', rank: 'formidable', ticks: 12 });

    await typedMove(typedUndertake('The Drift'), STRIKE_STRONG);

    expect(sessionLog().map(e => [e.moveId, e.outcome])).toEqual([['undertake_an_expedition', 'strong_hit']]);
    expect(tracks().map(t => t.label)).toEqual(['The Vault of Tears', 'The Drift']);
    expect(track(vault.id).ticks).toBe(12);
  });

  it('control: an unnamed Undertake still marks the one open expedition', async () => {
    const vault = await openTrack('The Vault of Tears', { type: 'expedition', rank: 'formidable', ticks: 12 });

    await typedMove(typedUndertake(null), STRIKE_STRONG);

    expect(tracks()).toHaveLength(1);
    expect(track(vault.id).ticks).toBe(12 + 4);                        // one formidable mark
  });
});

/**
 * STARFORGED COMPANION
 * tests/unit/progressTrackSelection.test.js
 *
 * Which fight a move acts on when more than one is open — on a booted table,
 * through the real move pipeline (issue #306). Tracks are written by the real
 * store (src/ui/progressTracks.js) on the GM's client, and the Progress Tracks
 * panel's own Roll handler starts each Take Decisive Action.
 *
 * R05: the store's reader (listProgressTracks) dropped each fight's position,
 * so tick enrichment could never hand the resolver the scored fight's own
 * position: with two fights open, Take Decisive Action's bad-spot downgrade
 * never applied. And a combat move's position was written only while a single
 * fight was open — with two, nothing recorded it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// The pipeline: no pacing call, the confirm dialog accepted, the interpreter
// answering `control.interpretation` (a typed move), and scripted dice inside
// the REAL resolveMove (`control.dice`, consumed in order).
const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
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
  confirmInterpretation: vi.fn(() => Promise.resolve(true)),
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
// d10 challenge dice: 0.25 → 3, 0.35 → 4; d6 action die: 0.9 → 6, 0.1 → 1.
const CHALLENGE_3_4 = [0.25, 0.35];

let table, journal;
const world = () => table.world.campaignState();
const sessionLog = () => world().sessionLogs?.['sess-1'] ?? [];
const tracks = () => journal.getFlag(MODULE_ID, 'tracks') ?? [];
const track = (id) => tracks().find(t => t.id === id);

/** The "Starforged Progress Tracks" journal: a document-level flag store, as progressTracks.js writes it. */
function makeTracksJournal() {
  const flags = {};
  return {
    id:      'tracks-journal',
    name:    'Starforged Progress Tracks',
    getFlag: (mod, key) => flags[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { flags[`${mod}.${key}`] = structuredClone(value); },
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

/** The GM clicks Roll on a Progress Tracks panel row (the panel's own handler). */
async function panelRoll(trackId) {
  const gm = table.client('gm-1');
  const { ProgressTrackApp } = await gm.import('../../src/ui/progressTracks.js');
  await gm.run(() => ProgressTrackApp.DEFAULT_OPTIONS.actions.rollProgress.call({}, null, { dataset: { trackId } }));
  await table.settle();
  await table.drain();
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

describe('two fights open: a fight\'s own position reaches Take Decisive Action (issue #306 R05)', () => {
  it('in a bad spot, a strong hit without a match counts as a weak hit', async () => {
    const boarders = await openTrack('Boarders', { ticks: 32, combatState: 'bad_spot' });
    await openTrack('Turret', { rank: 'formidable', ticks: 4 });

    control.dice = CHALLENGE_3_4;            // score 8 beats 3 and 4, no match
    await panelRoll(boarders.id);

    expect(sessionLog().map(e => [e.moveId, e.outcome])).toEqual([['take_decisive_action', 'weak_hit']]);
    expect(track(boarders.id).completed).toBe(true);    // a weak hit still ends the fight
  });

  it('in control, the same roll stays a strong hit', async () => {
    const boarders = await openTrack('Boarders', { ticks: 32, combatState: 'in_control' });
    await openTrack('Turret', { rank: 'formidable', ticks: 4 });

    control.dice = CHALLENGE_3_4;
    await panelRoll(boarders.id);

    expect(sessionLog().map(e => [e.moveId, e.outcome])).toEqual([['take_decisive_action', 'strong_hit']]);
  });

  it('a Strike\'s position lands on the fight it targeted, not on nothing', async () => {
    const boarders = await openTrack('Boarders', { ticks: 8, combatState: 'in_control' });
    const turret   = await openTrack('Turret', { rank: 'formidable', ticks: 4, combatState: 'in_control' });

    // Strike +iron: challenge 3 and 9, action 6 + iron 3 = 9 — beats 3, not 9: a weak hit.
    await typedMove(
      { moveId: 'strike', moveName: 'Strike', statUsed: 'iron', adds: 0, moveTarget: 'Turret', rationale: 'test', mischiefApplied: false },
      [0.25, 0.85, 0.9],
    );

    expect(sessionLog().map(e => [e.moveId, e.outcome])).toEqual([['strike', 'weak_hit']]);
    expect(track(turret.id).combatState).toBe('bad_spot');      // the Strike's own fight
    expect(track(turret.id).ticks).toBe(4 + 2 * 4);             // marked twice (formidable: one box a mark)
    expect(track(boarders.id).combatState).toBe('in_control');  // the other fight untouched
    expect(track(boarders.id).ticks).toBe(8);
  });
});

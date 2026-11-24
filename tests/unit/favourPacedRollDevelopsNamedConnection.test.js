/**
 * STARFORGED COMPANION
 * tests/unit/favourPacedRollDevelopsNamedConnection.test.js
 *
 * Something done for a connection, offered — and the offer followed to that
 * connection's track (known-issues FAVOUR-TO-A-CONNECTION-READ-AS-TALK).
 *
 * The pacing reader's rules now say a favour or a gift to a connection is at
 * least offered Develop Your Relationship (readersFavourToConnection.test.js).
 * This is every hop after its answer, on a booted table with the real router,
 * narrator, cards and pipeline — at a table that knows more than one person,
 * as every table does after a session or two:
 *
 *   the reader offers develop_your_relationship
 *     → the line is narrated, and its card carries the move
 *     → the press posts the line again as its speaker with the move forced
 *       (cardActions.applyPacedRoll) — with no target: the card knows none,
 *       and a forced move asks no reader
 *     → the pipeline finds the connection the line names
 *       (statEnrichment.enrichBondedDevelop) and makes the move for them: a
 *       mark of progress for a connection not yet bonded, a roll +rank for a
 *       bonded one.
 *
 * With no target the develop fell back to the sole bonded connection —
 * whoever the favour was for — and with several known and none bonded it
 * marked nothing at all, so the offer led nowhere.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Challenge dice 3 and 4, then an action die of 7: +3 (formidable) is a strong hit.
const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.65] }));
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
import { scriptClaude, isReaderCall } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { resolveMove } from '../../src/moves/resolver.js';

// The measured line (the readers' test's develop-2; run 2's a60 without its move name).
const COUNTER = "I offer to watch Tamsin's counter for an hour while she rests.";
const isClassifier = (call) => /pacing pre-classifier/.test(call.system ?? '');
const OFFERED = JSON.stringify({
  decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: 'develop_your_relationship', sceneChallenge: null,
  category: 'social', confidence: 0.75, reasoning: 'A favour that costs her an hour, done for her connection.',
});
const NARRATION = 'Tamsin looks at the stool, then at you, and says nothing for a moment.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
let actors;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

/** Mira's table: the people it knows, each a card ({ id, name, ticks, bonded, rank }). */
async function seed(connections) {
  control.dice = [0.25, 0.35, 0.65];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'fav-s1', sessionNumber: 2,
      currentSceneId: 'fav-scene', sceneTruths: [], clocks: [], connectionIds: connections.map(c => c.id) },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  actors = {};
  actors.mira = table.addActor({ id: 'pc-mira', name: 'Mira Kestrel', ownership: { 'pl-1': 3 } });
  for (const c of connections) {
    actors[c.id] = table.addActor({
      id: c.id, name: c.name, type: 'character',
      flags: { [MODULE_ID]: { entityType: 'connection', connection: {
        _id: `rec-${c.id}`, name: c.name, rank: c.rank ?? 'dangerous', role: 'Broker',
        relationshipTicks: c.ticks ?? 0, bonded: !!c.bonded, active: true, history: [],
      } } },
    });
  }
  scriptClaude(table, { fallback: (call) => (isReaderCall(call) ? '{}' : NARRATION) }).when(isClassifier, OFFERED);
  resolveMove.mockClear();
}

const ticksOf = (id) => actors[id].flags[MODULE_ID].connection.relationshipTicks;
const bondsLegacy = () => table.world.campaignState().legacyTracks?.bonds?.ticks ?? 0;

/** Mira says the line; the reader offers the move; she presses the card's Roll. */
async function sayAndPress(line) {
  await table.client('pl-1').chat(line, { speaker: { actor: 'pc-mira', alias: 'Mira Kestrel' } });
  await table.settle(); await table.drain();
  const [card] = table.cards(f => f.narratorCard && f.pacedNarrative === true);
  expect(card, 'the line was narrated').toBeTruthy();
  expect(card.flags[MODULE_ID].suggestedMove, 'with the move on its card').toBe('develop_your_relationship');
  expect(card.content).toContain('data-action="sf-paced-roll"');
  const readersBefore = table.claude.calls.filter(isReaderCall).length;

  table.client('pl-1').click(card._id ?? card.id, '[data-action="sf-paced-roll"]');
  await table.settle(); await table.drain();

  const [forced] = table.cards(f => f.forcedMoveId === 'develop_your_relationship');
  expect(forced, 'the forced move was posted').toBeTruthy();
  expect(forced.speaker?.actor).toBe('pc-mira');
  // The card knew no target, and no reader was asked for one.
  expect(forced.flags[MODULE_ID].forcedMoveTarget ?? null).toBeNull();
  expect(forced.flags[MODULE_ID].forcedMoveTargetId ?? null).toBeNull();
  expect(table.claude.calls.filter(isReaderCall)).toHaveLength(readersBefore);
  expect(resolveMove).toHaveBeenCalledTimes(1);
  return { interpretation: resolveMove.mock.calls[0][0], resolution: resolveMove.mock.results[0].value };
}

describe('a favour to a connection: offered on the card, and its Roll develops the one the line names', () => {
  it('several people known, none bonded: Tamsin\'s track is marked by her rank (nothing was marked)', async () => {
    await seed([
      { id: 'npc-idris',  name: 'Idris Vane',   ticks: 0 },
      { id: 'npc-tamsin', name: 'Tamsin Okoro', ticks: 16 },
      { id: 'npc-oren',   name: 'Oren Halvard', ticks: 4 },
    ]);
    const { interpretation } = await sayAndPress(COUNTER);

    expect(interpretation).toMatchObject({ moveId: 'develop_your_relationship', moveTargetId: 'npc-tamsin', moveTarget: 'Tamsin Okoro', statUsed: null });
    // A dangerous connection: a development is two boxes (8 ticks). No roll.
    expect(ticksOf('npc-tamsin')).toBe(24);
    expect([ticksOf('npc-idris'), ticksOf('npc-oren')]).toEqual([0, 4]);
    expect(bondsLegacy()).toBe(0);
  }, 30_000);

  it('another connection is bonded: it is still Tamsin\'s (the bonded one was developed instead)', async () => {
    await seed([
      { id: 'npc-sable',  name: 'Sable',        ticks: 40, bonded: true, rank: 'formidable' },
      { id: 'npc-tamsin', name: 'Tamsin Okoro', ticks: 16 },
    ]);
    const { interpretation } = await sayAndPress(COUNTER);

    expect(interpretation).toMatchObject({ moveTargetId: 'npc-tamsin', statUsed: null });
    expect(ticksOf('npc-tamsin')).toBe(24);
    expect(bondsLegacy(), 'Sable was not developed: no roll, no bonds legacy').toBe(0);
  }, 30_000);

  it('the line names the bonded one: her rank is rolled, and a strong hit marks the bonds legacy', async () => {
    await seed([
      { id: 'npc-sable',  name: 'Sable',        ticks: 40, bonded: true, rank: 'formidable' },
      { id: 'npc-tamsin', name: 'Tamsin Okoro', ticks: 16 },
    ]);
    const { interpretation, resolution } = await sayAndPress('I bring Sable the reactor coil she has been short of all season, and take no payment for it.');

    expect(interpretation).toMatchObject({ moveTargetId: 'npc-sable', moveTarget: 'Sable', statUsed: 'formidable', statValue: 3 });
    expect(resolution.outcome).toBe('strong_hit');
    expect(bondsLegacy()).toBe(2);
    expect(ticksOf('npc-tamsin')).toBe(16);
  }, 30_000);
});

/**
 * STARFORGED COMPANION
 * tests/unit/forgeNamedBondedNotRolled.test.js
 *
 * Known-issues FORGE-NAMED-BONDED-SCORED (issue #345 AA50's residual). A
 * typed Forge a Bond naming a bonded connection exactly — no picker id — was
 * scored on that bond's own relationship track (selectConnection's name rungs
 * ignored `unbonded`), and the forge then skipped it as already bonded (a
 * debug line): a hit said a bond was forged over a forge that marked nothing.
 * A Batch Mode round's refused forge reading said its track was "deleted or
 * finished". The name rungs now take `unbonded` for a forge, so the move is
 * not rolled and its card — and a round's refusal — say it was bonded.
 *
 * The stages run on the canonical GM of a simulated table, as a round runs
 * them (movePipelineStages.test.js's set-up).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ ...control.interpretation })),
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
import { selectConnection } from '../../src/moves/developRelationship.js';

const FORGE = (moveTarget) => ({
  moveId: 'forge_a_bond', moveName: 'Forge a Bond', statUsed: null, adds: 0,
  isProgressMove: true, moveTarget, rationale: 'test', mischiefApplied: false,
});

let table, pipeline;
const gm = () => table.client('gm-1');
const world = () => table.world.campaignState();
const resultCards = () => table.cards(f => f.moveResolution);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

const connection = (id, name, rec) => table.addActor({
  id, name, type: 'character',
  flags: { [MODULE_ID]: { entityType: 'connection', connection: {
    _id: `rec-${id}`, name, rank: 'dangerous', role: 'Pilot', active: true, history: [], ...rec,
  } } },
});

beforeEach(async () => {
  control.dice = [0.0, 0.0];                         // challenge 1 and 1: 32 ticks (score 8) beats both
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [], connectionIds: ['conn-sable', 'conn-vex'] },
  } } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  connection('conn-sable', 'Sable', { relationshipTicks: 32, bonded: true });
  connection('conn-vex', 'Vex', { relationshipTicks: 32, bonded: false });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table);
  pipeline = await gm().import('../../src/moves/movePipeline.js');
});

/** Read and roll a line on the canonical GM — what a round does for one entry. */
async function readAndRoll(narration) {
  return gm().run(async () => {
    const campaignState = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
    const read = await pipeline.readMove({
      narration, speakerActorId: 'pc-kira', campaignState, apiKey: 'sk-ant-gina', dial: 'balanced', gatherChoices: true,
    });
    const rolled = await pipeline.rollMove({
      interpretation: read.interpretation, campaignState, speakerActorId: 'pc-kira', narration, combatPosition: read.combatPosition,
    });
    return { refused: rolled.refused, refusedReason: rolled.refusedReason ?? null, outcome: rolled.resolution?.outcome ?? null };
  });
}

describe('a typed Forge a Bond naming a bonded connection (FORGE-NAMED-BONDED-SCORED)', () => {
  it('is not rolled — the card and the refusal say it is already bonded', async () => {
    control.interpretation = FORGE('Sable');
    const rolled = await readAndRoll('I ask Sable to stand with us for good.');
    await table.settle();

    expect(rolled.refused).toBe('track-gone');
    expect(rolled.refusedReason).toBe('Sable is already bonded — there is no bond to forge.');
    const [card] = table.cards(f => f.trackGoneCard);
    expect(card?.content).toContain('<strong>Sable</strong> is already bonded');
    expect(resultCards()).toEqual([]);
    expect(world().legacyTracks?.bonds?.ticks ?? 0).toBe(0);
  }, 30_000);

  it('control: naming the un-bonded connection rolls its track', async () => {
    control.interpretation = FORGE('Vex');
    const rolled = await readAndRoll('I ask Vex to stand with us for good.');

    expect(rolled.refused).toBeNull();
    expect(rolled.outcome).toBe('strong_hit');
  }, 30_000);
});

describe('selectConnection: a forge\'s name rungs take `unbonded` (FORGE-NAMED-BONDED-SCORED)', () => {
  const list = [
    { _id: 'a', __hostId: 'h-sable', name: 'Sable', bonded: true,  active: true },
    { _id: 'b', __hostId: 'h-vex',   name: 'Vex',   bonded: false, active: true },
  ];

  it('a name — exact or a whole-word part — of a bonded connection resolves nothing, not the sole un-bonded one', () => {
    expect(selectConnection(list, 'Sable', { unbonded: true })).toBeNull();
    expect(selectConnection(list, 'Captain Sable', { unbonded: true })).toBeNull();
  });

  it('control: a develop still finds the bonded connection by name, and a forge the un-bonded one', () => {
    expect(selectConnection(list, 'Sable')?._id).toBe('a');
    expect(selectConnection(list, 'Vex', { unbonded: true })?._id).toBe('b');
  });
});

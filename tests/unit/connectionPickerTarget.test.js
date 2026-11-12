/**
 * STARFORGED COMPANION
 * tests/unit/connectionPickerTarget.test.js
 *
 * Issue #301 B01 — the connection picker's choice reaches the move it forces.
 * applyConnectionPick posted Develop Your Relationship / Forge a Bond with no
 * target, and a forced move skips the interpreter, so the name in the
 * narration was never read: Forge a Bond scored 0 against "no connection"
 * (several un-bonded connections — a guaranteed miss) or the sole bonded
 * connection's full track (and then forged nothing), and Develop Your
 * Relationship marked the sole bonded connection instead of the one picked.
 *
 * Composition on a booted table (tests/helpers/multiClient.js): the 🔗 / 🤝
 * button on a GM-authored connection card → the picker the click posts → a
 * player's pick on their own client → the relay → the forced move the
 * canonical GM posts → the real pipeline, progress enrichment and resolveMove
 * (scripted dice) → the connection records.
 *
 * Issue #314 Q06 — a bonded Develop Your Relationship rolls +rank in the
 * pipeline, from the picker and typed, as `!bond` does.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Challenge dice 3 and 4, then an action die of 7 (unused by progress moves).
// `interpret` scripts a typed (unforced) move; null = a forced move only.
// `bondDice` = [action, challenge, challenge] for `!bond`'s own roll.
const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.65], interpret: null, bondDice: null }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  // A forced move must never reach the interpreter.
  interpretMove: vi.fn(async () => {
    if (!control.interpret) throw new Error('interpreter called for a forced move');
    return { ...control.interpret };
  }),
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
    rollActionDie:     () => (control.bondDice ? control.bondDice[0] : original.rollActionDie()),
    rollChallengeDice: () => (control.bondDice ? control.bondDice.slice(1) : original.rollChallengeDice()),
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { resolveMove } from '../../src/moves/resolver.js';

const MODULE_ID = 'starforged-companion';

let table;
let actors;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

/**
 * A table where Pat (pl-1) plays Bex and the crew knows `connections`
 * ({ id, name, ticks, bonded, rank }).
 */
async function seed(connections) {
  control.dice = [0.25, 0.35, 0.65];
  control.interpret = null;
  control.bondDice = null;
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
    connectionIds: connections.map(c => c.id),
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  actors = {};
  actors.bex = table.addActor({ id: 'pc-bex', name: 'Bex', ownership: { 'pl-1': 3 } });
  for (const c of connections) {
    actors[c.id] = table.addActor({
      id: c.id, name: c.name, type: 'character',
      flags: { [MODULE_ID]: {
        entityType: 'connection',
        connection: {
          _id: `rec-${c.id}`, name: c.name, rank: c.rank ?? 'dangerous', role: 'Pilot',
          relationshipTicks: c.ticks, bonded: !!c.bonded, active: true, history: [],
        },
      } },
    });
  }
  resolveMove.mockClear();
}

const record = (id) => actors[id].flags[MODULE_ID].connection;
const bondsTicks = () => table.world.campaignState().legacyTracks?.bonds?.ticks ?? 0;

/** Pat clicks the connection card's button, then picks `hostId` on the picker it posts. */
async function pickFromCard(action, hostId) {
  const button = action === 'forge' ? 'sf-forge-bond' : 'sf-develop-relationship';
  const card = await table.client('gm-1').run(() => ChatMessage.create({
    content: `<div class="sf-move-card"><button type="button" data-action="${button}">pick</button></div>`,
    flags: { [MODULE_ID]: { connectionSuggestion: { eligible: true } } },
  }));
  await table.settle();
  table.client('pl-1').click(card.id, `[data-action="${button}"]`);
  await table.settle();
  const [picker] = table.cards(f => f.connectionPicker);
  expect(picker, 'the click posts a connection picker').toBeTruthy();
  table.client('pl-1').click(picker._id, `[data-action="sf-connection-pick"][data-host-id="${hostId}"]`);
  await table.settle();
  expect(resolveMove).toHaveBeenCalledTimes(1);
  const [interpretation] = resolveMove.mock.calls[0];
  return { interpretation, resolution: resolveMove.mock.results[0].value };
}

describe('Forge a Bond from the picker', () => {
  it('several un-bonded connections: the pick is scored and forged (was score 0, a certain miss)', async () => {
    await seed([
      { id: 'conn-kira',  name: 'Kira',  ticks: 8 },
      { id: 'conn-sable', name: 'Sable', ticks: 32 },
    ]);
    const { interpretation, resolution } = await pickFromCard('forge', 'conn-sable');

    expect(interpretation).toMatchObject({
      moveId: 'forge_a_bond', moveTarget: 'Sable', moveTargetId: 'conn-sable', statValue: 32,
    });
    expect(resolution.outcome).toBe('strong_hit');   // score 8 beats 3 and 4
    expect(record('conn-sable').bonded).toBe(true);
    expect(record('conn-kira').bonded).toBe(false);
    expect(bondsTicks()).toBeGreaterThan(0);
  });

  it('with one bonded connection, the pick — not the bonded one — is scored and forged', async () => {
    await seed([
      { id: 'conn-kira',  name: 'Kira',  ticks: 40, bonded: true },
      { id: 'conn-sable', name: 'Sable', ticks: 32 },
      { id: 'conn-rook',  name: 'Rook',  ticks: 8 },
    ]);
    const { interpretation } = await pickFromCard('forge', 'conn-sable');

    expect(interpretation.statValue).toBe(32);       // was Kira's 40
    expect(record('conn-sable').bonded).toBe(true);
    expect(record('conn-rook').bonded).toBe(false);
  });

  it('typed with no target: the sole un-bonded connection is scored and forged, never the bonded one', async () => {
    await seed([
      { id: 'conn-kira',  name: 'Kira',  ticks: 40, bonded: true },
      { id: 'conn-sable', name: 'Sable', ticks: 32 },
    ]);
    control.interpret = {
      moveId: 'forge_a_bond', moveName: 'Forge A Bond', statUsed: null, adds: 0, isProgressMove: true,
      moveTarget: null, rationale: 'test', mischiefApplied: false,
    };
    await table.client('pl-1').chat('Time to make it official between us.', { speaker: { actor: 'pc-bex' } });
    await table.settle();

    expect(resolveMove.mock.calls[0][0].statValue).toBe(32);   // was Kira's 40
    expect(record('conn-sable').bonded).toBe(true);            // was: "already bonded", nothing forged
  });
});

describe('Develop Your Relationship from the picker', () => {
  it('marks the picked connection — not the sole bonded one', async () => {
    await seed([
      { id: 'conn-kira',  name: 'Kira',  ticks: 40, bonded: true },
      { id: 'conn-sable', name: 'Sable', ticks: 16 },
      { id: 'conn-rook',  name: 'Rook',  ticks: 8 },
    ]);
    const before = bondsTicks();
    const { interpretation } = await pickFromCard('develop', 'conn-sable');

    expect(interpretation).toMatchObject({ moveId: 'develop_your_relationship', moveTargetId: 'conn-sable' });
    expect(record('conn-sable').relationshipTicks).toBe(24);   // one dangerous mark
    expect(record('conn-rook').relationshipTicks).toBe(8);
    expect(record('conn-kira')).toMatchObject({ relationshipTicks: 40, rank: 'dangerous' });
    expect(bondsTicks()).toBe(before);                         // no bonds-legacy mark for Kira
  });

  it('with several un-bonded connections the pick is still marked (was: nothing)', async () => {
    await seed([
      { id: 'conn-kira',  name: 'Kira',  ticks: 0 },
      { id: 'conn-sable', name: 'Sable', ticks: 0 },
    ]);
    await pickFromCard('develop', 'conn-kira');
    expect(record('conn-kira').relationshipTicks).toBe(8);
    expect(record('conn-sable').relationshipTicks).toBe(0);
  });
});

describe('Develop Your Relationship with a bonded connection rolls +rank (issue #314 Q06)', () => {
  // Challenge 4 and 7, action die 3: only the rank's adds can make a hit of it.
  const DICE = [0.35, 0.65, 0.4];

  it('from the picker: epic Vega is 3 + 5 = 8 against 4 and 7 — a strong hit, 2 bonds ticks (was +0, a miss, 0)', async () => {
    await seed([{ id: 'conn-vega', name: 'Vega', ticks: 40, bonded: true, rank: 'epic' }]);
    control.dice = DICE;
    const { interpretation, resolution } = await pickFromCard('develop', 'conn-vega');

    expect(interpretation).toMatchObject({ moveId: 'develop_your_relationship', moveTargetId: 'conn-vega', moveTarget: 'Vega', statUsed: 'epic', statValue: 5, adds: 0 });
    expect(resolution).toMatchObject({ actionDie: 3, statValue: 5, actionScore: 8, challengeDice: [4, 7], outcome: 'strong_hit' });
    expect(bondsTicks()).toBe(2);
    const card = table.cards(f => f.moveResolution).at(-1);
    expect(card.content).toContain('+epic (5)');
    expect(card.content).toMatch(/Action: 3 \+ 5\s*= <strong>8<\/strong>/);
  });

  it('typed: the named bonded connection is resolved before the dice and rolled +rank', async () => {
    await seed([
      { id: 'conn-vega',  name: 'Vega',  ticks: 40, bonded: true, rank: 'formidable' },
      { id: 'conn-sable', name: 'Sable', ticks: 8 },
    ]);
    control.dice = DICE;
    control.interpret = {
      moveId: 'develop_your_relationship', moveName: 'Develop Your Relationship', statUsed: null, adds: 0,
      moveTarget: 'Vega', rationale: 'test', mischiefApplied: false,
    };
    await table.client('pl-1').chat('I open up to Vega about the Archive.', { speaker: { actor: 'pc-bex' } });
    await table.settle();

    const [interpretation] = resolveMove.mock.calls[0];
    expect(interpretation).toMatchObject({ moveTargetId: 'conn-vega', statUsed: 'formidable', statValue: 3 });
    expect(resolveMove.mock.results[0].value).toMatchObject({ actionScore: 6, outcome: 'weak_hit' });   // 3 + 3 beats 4, not 7
    // The weak hit takes +2 momentum, credited to the roller — no bonds tick
    // (issue #322 V01: the pipeline marked 1 tick, `!bond` gave +2 momentum).
    expect(bondsTicks()).toBe(0);
    expect(actors.bex.system.momentum.value).toBe(4);
    expect(table.cards(f => f.developRelationshipCard).at(-1).content).toMatch(/take \+2 momentum/);
    expect(record('conn-sable').relationshipTicks).toBe(8);
  });

  it.each([
    ['troublesome', 1], ['dangerous', 2], ['formidable', 3], ['extreme', 4], ['epic', 5],
  ])('%s: the stat is the rank, worth +%i', async (rank, adds) => {
    await seed([{ id: 'conn-vega', name: 'Vega', ticks: 40, bonded: true, rank }]);
    control.dice = DICE;
    const { resolution } = await pickFromCard('develop', 'conn-vega');
    expect(resolution).toMatchObject({ statUsed: rank, statValue: adds, actionScore: 3 + adds });
  });

  it("an un-bonded pick is still no roll's worth: +0, its own track marked", async () => {
    await seed([{ id: 'conn-sable', name: 'Sable', ticks: 8, rank: 'epic' }]);
    control.dice = DICE;
    const { interpretation } = await pickFromCard('develop', 'conn-sable');
    expect(interpretation).toMatchObject({ statUsed: null, statValue: 0 });
    expect(record('conn-sable').relationshipTicks).toBe(9);   // one epic mark
    expect(bondsTicks()).toBe(0);
  });

  it('parity with `!bond`: the same dice score the same, and both pay 2 ticks', async () => {
    await seed([{ id: 'conn-vega', name: 'Vega', ticks: 40, bonded: true, rank: 'epic' }]);
    control.dice = DICE;
    const { resolution } = await pickFromCard('develop', 'conn-vega');
    expect(resolution).toMatchObject({ actionScore: 8, outcome: 'strong_hit' });
    expect(bondsTicks()).toBe(2);

    control.bondDice = [3, 4, 7];
    await table.client('pl-1').chat('!bond Vega', { speaker: { actor: 'pc-bex' } });
    await table.settle();

    expect(table.cards(f => f.bondCommandCard).at(-1).content).toContain('Action: 3 + 5 = <strong>8</strong>');
    expect(bondsTicks()).toBe(4);
  });

  // Issue #322 V01: a Test Your Relationship hit develops a bonded connection,
  // whose consequences cannot know the bond — the develop branch adds the
  // development's +2 momentum to them, for the roller. Known-issues
  // TEST-RELATIONSHIP-DEVELOP-ROLL: the development is a Develop Your
  // Relationship roll of its own, +the connection's rank (`bondDice`) — it
  // was paid on the test's own +heart roll.
  const typedTest = () => ({
    moveId: 'test_your_relationship', moveName: 'Test Your Relationship', statUsed: 'heart', adds: 0,
    moveTarget: 'Vega', rationale: 'test', mischiefApplied: false,
  });

  it("Test Your Relationship's hit with a bonded connection: its own develop roll's weak hit — +2 momentum to the roller, no tick", async () => {
    await seed([{ id: 'conn-vega', name: 'Vega', ticks: 40, bonded: true, rank: 'formidable' }]);
    control.dice = DICE;                       // the test: 3 + heart 2 = 5 against 4 and 7
    control.bondDice = [3, 4, 7];              // the develop roll: 3 + formidable 3 = 6 against 4 and 7
    control.interpret = typedTest();
    await table.client('pl-1').chat('Vega asks whether I still trust her.', { speaker: { actor: 'pc-bex' } });
    await table.settle();

    expect(resolveMove.mock.results[0].value).toMatchObject({ moveId: 'test_your_relationship', outcome: 'weak_hit' });
    expect(bondsTicks()).toBe(0);
    expect(actors.bex.system.momentum.value).toBe(4);
    // On the resolution the card and the persist read.
    expect(resolveMove.mock.results[0].value.consequences.momentumChange).toBe(2);
    expect(table.cards(f => f.developRelationshipCard).at(-1).content)
      .toContain('Develop Your Relationship (+formidable): 3 + 3 = <strong>6</strong> vs 4, 7 — weak hit');
  });

  it("Test Your Relationship's weak hit, its develop roll a strong hit: the bond's 2 ticks, not the test's +2 momentum", async () => {
    await seed([{ id: 'conn-vega', name: 'Vega', ticks: 40, bonded: true, rank: 'formidable' }]);
    control.dice = DICE;                       // the test: a weak hit
    control.bondDice = [6, 2, 3];              // the develop roll: 6 + 3 = 9 beats 2 and 3 — a strong hit
    control.interpret = typedTest();
    await table.client('pl-1').chat('Vega asks whether I still trust her.', { speaker: { actor: 'pc-bex' } });
    await table.settle();

    expect(resolveMove.mock.results[0].value).toMatchObject({ outcome: 'weak_hit' });
    expect(bondsTicks()).toBe(2);
    expect(actors.bex.system.momentum.value).toBe(2);
  });

  // Issue #322 V01 (the audit's bondWeakHit probe): the same weak hit paid 1
  // bonds tick through the pipeline and +2 momentum through `!bond`. Both pay
  // the move's text now — +2 momentum to the roller, no tick.
  it('parity with `!bond` on a weak hit: both pay +2 momentum to the roller, and no tick', async () => {
    await seed([{ id: 'conn-vega', name: 'Vega', ticks: 40, bonded: true, rank: 'formidable' }]);
    control.dice = DICE;                       // 3 + 3 = 6 against 4 and 7
    const { resolution } = await pickFromCard('develop', 'conn-vega');
    expect(resolution).toMatchObject({ actionScore: 6, outcome: 'weak_hit' });
    expect(bondsTicks()).toBe(0);
    expect(actors.bex.system.momentum.value).toBe(4);

    control.bondDice = [3, 4, 7];
    await table.client('pl-1').chat('!bond Vega', { speaker: { actor: 'pc-bex' } });
    await table.settle();

    expect(table.cards(f => f.bondCommandCard).at(-1).content).toMatch(/Weak hit\.<\/strong> Take \+2 momentum/);
    expect(bondsTicks()).toBe(0);
    expect(actors.bex.system.momentum.value).toBe(6);
  });
});

// Known-issues BOND-DEVELOP-UPGRADE: a Burn Momentum (or Improve Result) that
// upgraded a bonded Develop Your Relationship to a strong hit marked no bonds
// ticks and raised no rank on a match — the development ran in the
// pipeline's develop branch alone, which an upgrade did not re-run. The
// upgrade now applies what its outcome adds (movePipeline
// applyDevelopRelationship, from the upgrade's applyOutcomeEffects).
describe('a bonded Develop Your Relationship upgraded by Burn Momentum (BOND-DEVELOP-UPGRADE)', () => {
  const BURN = '[data-action="sf-burn-momentum"]';

  async function developVega(dice) {
    await seed([{ id: 'conn-vega', name: 'Vega', ticks: 40, bonded: true, rank: 'formidable' }]);
    actors.bex.system.momentum.value = 9;
    control.dice = dice;
    control.interpret = {
      moveId: 'develop_your_relationship', moveName: 'Develop Your Relationship', statUsed: null, adds: 0,
      moveTarget: 'Vega', rationale: 'test', mischiefApplied: false,
    };
    await table.client('pl-1').chat('I open up to Vega about the Archive.', { speaker: { actor: 'pc-bex' } });
    await table.settle(); await table.drain();
    const card = table.cards(f => f.moveResolution).at(-1);
    expect(card.flags[MODULE_ID].burn?.canBurn, 'Bex can burn').toBe(true);
    table.client('pl-1').click(card._id, BURN);
    await table.settle(); await table.drain();
  }

  it('a weak hit burned to a strong hit marks the bond\'s 2 ticks', async () => {
    await developVega([0.35, 0.65, 0.4]);           // 3 + 3 = 6 against 4 and 7: a weak hit; momentum 9 beats both

    expect(bondsTicks()).toBe(2);
    expect(actors.bex.system.momentum.value).toBe(2);                   // reset; the strong hit takes no momentum
    expect(record('conn-vega').rank).toBe('formidable');
  });

  it('a miss with a match burned to a strong hit marks 2 ticks and raises the rank', async () => {
    await developVega([0.65, 0.65, 0.4]);           // 6 against 7 and 7: a miss with a match

    expect(bondsTicks()).toBe(2);
    expect(record('conn-vega').rank).toBe('extreme');
  });
});

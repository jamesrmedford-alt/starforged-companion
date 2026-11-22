/**
 * STARFORGED COMPANION
 * tests/unit/generatedSequences.test.js
 *
 * Issue #302 slice C — generated command sequences against an independent
 * model.
 *
 * The audits behind issues #300 and #301 found their defects at the
 * boundaries example tests do not reach by themselves: the right move marking
 * the wrong character's vow because both vows had one name, a picked
 * connection dropped on the way to the roll, a pressed button paying twice.
 * Ninety related tests passed while those four were live, and two of them
 * asserted the defect. A test written beside the code inherits its
 * assumptions.
 *
 * So this file does not say what the code should do, case by case. It says
 * what the game's rules do (tests/helpers/sequence/rules.js, model.js — the
 * move text and the recorded decisions, nothing from src/), lets fast-check
 * make sequences of things a table does (commands.js), plays each one on a
 * booted multi-client table through the paths players use (world.js), and
 * after every command compares the table with the model: each vow and
 * connection by the document made for it, never by name; each bond Item
 * against its connection; the crew's legacy tracks against every sheet;
 * every client against the world; the move lock released.
 *
 * When a sequence fails, fast-check removes commands until the shortest one
 * that still fails is left, and prints it with the seed and path that
 * replay it:
 *
 *   SEQUENCE_SEED=<seed> SEQUENCE_PATH=<path> npx vitest run tests/unit/generatedSequences.test.js
 *
 * A reduced failure becomes an ordinary test in "sequences that once failed",
 * below — the corpus only finds; those keep.
 *
 * The corpus is fixed-seed, so a pull request runs the same sequences every
 * time. A broader run is on demand: SEQUENCE_RUNS=2000 SEQUENCE_SEED=$RANDOM.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fc from 'fast-check';

const control = vi.hoisted(() => ({ dice: [], recommitDice: null, unread: [] }));

vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: async () => true,
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: async () => [],
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) =>
  (await import('../helpers/sequence/pipelineMocks.js')).scriptedResolver(await importOriginal(), control));

import { bootSequenceTable, SequenceWorld, PCS } from '../helpers/sequence/world.js';
import * as M from '../helpers/sequence/model.js';
import {
  AddConnection, AddVow, DevelopRelationship, ForgeBond, FulfilVow, ReachMilestone, RecommitVow, RenameConnection,
  RepeatLastPress, applyFixture, compare, resetTally, startingWorld, tally, vowAndConnectionCommands,
} from '../helpers/sequence/commands.js';

// The fixed corpus a pull request runs. Chosen once; changing it changes which
// sequences run, so change it on purpose.
const CORPUS_SEED = 302;
const RUNS         = Number(process.env.SEQUENCE_RUNS) || 50;
const MAX_COMMANDS = Number(process.env.SEQUENCE_MAX_COMMANDS) || 20;
const SEED         = process.env.SEQUENCE_SEED ? Number(process.env.SEQUENCE_SEED) : CORPUS_SEED;
const PATH         = process.env.SEQUENCE_PATH || undefined;

/** Every command, each roll's three outcomes, each way a milestone's vow is chosen, and a press by two at once. */
const EVERY_KIND = [
  'AddVow', 'ReachMilestone', 'ReachMilestone:named', 'ReachMilestone:sole', 'ReachMilestone:picked',
  'FulfilVow', 'FulfilVow:strong_hit', 'FulfilVow:weak_hit', 'FulfilVow:miss', 'RecommitVow', 'RenameVow',
  'AddConnection', 'DevelopRelationship', 'ForgeBond', 'ForgeBond:strong_hit', 'ForgeBond:weak_hit', 'ForgeBond:miss',
  'RecommitConnection', 'RenameConnection', 'RepeatLastPress', 'ReorderActors', 'pressed by two at once',
];

let table;
beforeAll(async () => { table = await bootSequenceTable(); }, 30_000);
afterAll(() => table?.teardown());

/** A fresh model and world for one sequence, the fixture in both. */
async function begin(fixture = {}) {
  const model = M.createModel(PCS);
  const world = await SequenceWorld.start(table, control, applyFixture(model, fixture));
  compare(model, world, 'the start');
  return { model, real: world };
}

/** Run hand-written commands in order, each checked as a generated one is. */
async function play(commands, fixture = {}) {
  const { model, real } = await begin(fixture);
  for (const command of commands) {
    expect(command.check(model), `${command} — its precondition holds`).toBe(true);
    await command.run(model, real);
  }
  return { model, world: real };
}

describe('generated sequences: vows and connections', () => {
  it(`${RUNS} sequences of up to ${MAX_COMMANDS} commands leave the table as the rules say`, async () => {
    const property = fc.asyncProperty(
      startingWorld,
      fc.commands(vowAndConnectionCommands(), { maxCommands: MAX_COMMANDS, size: 'max' }),
      async (fixture, commands) => { await fc.asyncModelRun(() => begin(fixture), commands); },
    );
    resetTally();
    await fc.assert(property, { seed: SEED, path: PATH, numRuns: RUNS, endOnFailure: !!PATH });
    console.info(`generated sequences (seed ${SEED}, ${RUNS} runs): ${[...tally].sort().map(([k, n]) => `${k} ${n}`).join(", ")}`);
    // A corpus whose commands never ran, or whose rolls never hit, passed
    // nothing. The fixed corpus must have done every kind of thing.
    if (!PATH && SEED === CORPUS_SEED && RUNS >= 50) expect(EVERY_KIND.filter(kind => !tally.get(kind)), 'kinds the corpus never ran').toEqual([]);
  }, 600_000);
});

describe('the sequences the properties are about, written out', () => {
  it('two characters\' vows of one name: each is marked, fulfilled and paid as its own', async () => {
    const { world } = await play([
      new AddVow(0, 0, 'dangerous'),                 // v1: Kira's "Find Kade"
      new AddVow(1, 0, 'troublesome'),               // v2: Ash's "Find Kade"
      new ReachMilestone(1, 0, true),                // Ash, by name
      new ReachMilestone(0, 0, true),                // Kira, by name
      new ReachMilestone(1, 0, false),               // Ash, unnamed: his one open vow
      new FulfilVow(1, 0, [1, 2]),                   // Ash: 6 boxes vs 1,2 — a strong hit
      new FulfilVow(0, 0, [9, 9]),                   // Kira: 2 boxes vs 9,9 — a miss
    ]);
    const seen = world.observe();
    expect(seen.pcs['pc-ash'].vows).toEqual([{ ref: 'v2', name: 'Find Kade', rank: 'troublesome', ticks: 24, fulfilled: true }]);
    expect(seen.pcs['pc-kira'].vows).toEqual([{ ref: 'v1', name: 'Find Kade', rank: 'dangerous', ticks: 8, fulfilled: false }]);
    expect(seen.legacy.quests).toBe(1);
  });

  it('a picked connection is the one developed and bonded, with a namesake beside it and its own name changed', async () => {
    const { world } = await play([
      new DevelopRelationship(0, 0),                 // c1 (Kira's Sable): 8 → 16
      new RenameConnection(1, 0),                    // c2 "Vega" → "Sable": two Sables
      new DevelopRelationship(1, 0),                 // Ash picks his: c2 0 → 4
      new RenameConnection(0, 2),                    // c1 "Sable" → "Orrin"
      new ForgeBond(0, 0, [1, 3]),                   // Kira: c1, 4 boxes vs 1,3 — a strong hit
      new RepeatLastPress(),
    ], { connections: [
      { name: 'Sable', rank: 'dangerous',  boxes: 2, holderPick: 0 },
      { name: 'Vega',  rank: 'formidable', boxes: 0, holderPick: 1 },
    ] });
    const seen = world.observe();
    expect(seen.connections).toEqual([
      { ref: 'c1', name: 'Orrin', rank: 'dangerous',  ticks: 16, bonded: true },
      { ref: 'c2', name: 'Sable', rank: 'formidable', ticks: 4,  bonded: false },
    ]);
    expect(seen.pcs['pc-kira'].bonds).toEqual([{ connection: 'c1', name: 'Orrin', rank: 'dangerous', ticks: 16, forged: true }]);
    expect(seen.legacy.bonds).toBe(2);
  });

  it('a button two people press in the same moment acts once: a pick, a milestone, a recommit, a Confirm', async () => {
    const { world } = await play([
      new DevelopRelationship(0, 0, true),           // Pat and the GM both pick Sable: 8 → 16, once
      new ReachMilestone(0, 1, false, true),         // Kira, unnamed, two open vows: both press v2 on the card
      new FulfilVow(0, 0, [10, 10]),                 // v1: 3 boxes vs 10,10 — a miss, and its recommit offer
      new RecommitVow(0, [2, 6], true),              // both press 🔁: 2 boxes cleared and one rank up, once
      new AddConnection(1, 1, true),                 // the GM confirms Vega for Ash as Quinn presses Confirm too
    ], {
      vows: [[{ name: 'Find Kade', rank: 'formidable', boxes: 3 }, { name: 'Pay the debt', rank: 'dangerous', boxes: 0 }], []],
      connections: [{ name: 'Sable', rank: 'dangerous', boxes: 2, holderPick: 0 }],
    });
    const seen = world.observe();
    expect(seen.connections).toEqual([
      { ref: 'c3', name: 'Sable', rank: 'dangerous', ticks: 16, bonded: false },
      { ref: 'c4', name: 'Vega',  rank: 'dangerous', ticks: 0,  bonded: false },
    ]);
    expect(seen.pcs['pc-kira'].vows).toEqual([
      { ref: 'v1', name: 'Find Kade',    rank: 'extreme',   ticks: 4, fulfilled: false },
      { ref: 'v2', name: 'Pay the debt', rank: 'dangerous', ticks: 8, fulfilled: false },
    ]);
    expect(seen.pcs['pc-ash'].bonds).toEqual([{ connection: 'c4', name: 'Vega', rank: 'dangerous', ticks: 0, forged: false }]);
  });

  it('a connection made in play is one card, held by the character it was confirmed for; pressing Confirm again makes no second', async () => {
    const { world } = await play([
      new AddConnection(1, 3),                       // c1: "Thess" for Ash
      new RepeatLastPress(),
      new DevelopRelationship(1, 0),                 // Ash picks Thess: 0 → 8
    ]);
    expect(world.observe().pcs['pc-ash'].bonds).toEqual([{ connection: 'c1', name: 'Thess', rank: 'dangerous', ticks: 8, forged: false }]);
    expect(world.observe().pcs['pc-kira'].bonds).toEqual([]);
  });
});

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
 * Two corpora, both fixed-seed, so a pull request runs the same sequences
 * every time: vows and connections, and "the table" — the same commands with
 * sessions ended and begun, pages reloaded and connections dropped among
 * them. A broader run is on demand:
 *
 *   SEQUENCE_RUNS=2000 SEQUENCE_TABLE_RUNS=400 SEQUENCE_SEED=$RANDOM npx vitest run tests/unit/generatedSequences.test.js
 *
 * Nothing here is mocked (tests/helpers/sequence/world.js says why): the
 * modules on every simulated page are the real ones.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
import { bootSequenceTable, usableTable, SequenceWorld, PCS } from '../helpers/sequence/world.js';
import * as M from '../helpers/sequence/model.js';
import {
  AddConnection, AddVow, BeginSession, DevelopRelationship, DropAndRejoin, EndSession, ForgeBond, FulfilVow, ReachMilestone,
  RecommitVow, Reload, RenameConnection,
  RepeatLastPress, applyFixture, compare, resetTally, startingWorld, tableCommands, tally, vowAndConnectionCommands,
} from '../helpers/sequence/commands.js';

// The fixed corpus a pull request runs. Chosen once; changing it changes which
// sequences run, so change it on purpose.
const CORPUS_SEED = 302;
const RUNS         = Number(process.env.SEQUENCE_RUNS) || 100;
const TABLE_RUNS   = Number(process.env.SEQUENCE_TABLE_RUNS) || 25;
const MAX_COMMANDS = Number(process.env.SEQUENCE_MAX_COMMANDS) || 20;
const SEED         = process.env.SEQUENCE_SEED ? Number(process.env.SEQUENCE_SEED) : CORPUS_SEED;
const PATH         = process.env.SEQUENCE_PATH || undefined;

/** Every command, each roll's three outcomes, each way a milestone's vow is chosen, and a press by two at once. */
const EVERY_KIND = [
  'AddVow', 'ReachMilestone', 'ReachMilestone:named', 'ReachMilestone:sole', 'ReachMilestone:picked',
  'FulfilVow', 'FulfilVow:strong_hit', 'FulfilVow:weak_hit', 'FulfilVow:miss', 'FulfilVow:deepened its connection', 'RecommitVow', 'RenameVow',
  'AddConnection', 'DevelopRelationship', 'ForgeBond', 'ForgeBond:strong_hit', 'ForgeBond:weak_hit', 'ForgeBond:miss',
  'RecommitConnection', 'RenameConnection', 'RepeatLastPress', 'ReorderActors', 'pressed by two at once',
];

/** What the table corpus adds: a session ended and begun each way, a reload and a dropped connection at each seat. */
const TABLE_KINDS = [
  'EndSession:focus', 'EndSession:no focus', 'BeginSession:vignette', 'BeginSession:no vignette',
  'Reload:the GM', 'Reload:a player', 'DropAndRejoin:the GM', 'DropAndRejoin:a player',
  'ReachMilestone', 'FulfilVow', 'FulfilVow:deepened its connection', 'DevelopRelationship', 'ForgeBond', 'pressed by two at once',
];

let table;
beforeAll(async () => { table = await bootSequenceTable(); }, 30_000);
afterAll(async () => { SequenceWorld.release(); await table?.teardown(); });

/** A fresh model and world for one sequence, the fixture in both. */
async function begin(fixture = {}) {
  const model = M.createModel(PCS);
  table = await usableTable(table);
  const world = await SequenceWorld.start(table, applyFixture(model, fixture));
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
    if (!PATH && SEED === CORPUS_SEED && RUNS >= 100) expect(EVERY_KIND.filter(kind => !tally.get(kind)), 'kinds the corpus never ran').toEqual([]);
  }, 600_000);
});

describe('generated sequences: the table — sessions, reloads, dropped connections', () => {
  it(`${TABLE_RUNS} sequences of up to ${MAX_COMMANDS} commands, among them sessions ended and begun and pages reloaded`, async () => {
    const property = fc.asyncProperty(
      startingWorld,
      fc.commands(tableCommands(), { maxCommands: MAX_COMMANDS, size: 'max' }),
      async (fixture, commands) => { await fc.asyncModelRun(() => begin(fixture), commands); },
    );
    // A GM page that lived through a dropped connection refuses what is
    // relayed to it, and says so in its console: the stand-down, working.
    expectConsoleError(/this page lost its connection to the server/);
    resetTally();
    await fc.assert(property, { seed: SEED, path: PATH, numRuns: TABLE_RUNS, endOnFailure: !!PATH });
    console.info(`generated table sequences (seed ${SEED}, ${TABLE_RUNS} runs): ${[...tally].sort().map(([k, n]) => `${k} ${n}`).join(", ")}`);
    if (!PATH && SEED === CORPUS_SEED && TABLE_RUNS >= 25) expect(TABLE_KINDS.filter(kind => !tally.get(kind)), 'kinds the table corpus never ran').toEqual([]);
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

  it('a session ended and begun by two people at once ends and begins once: its momentum is paid once each way', async () => {
    const { world } = await play([
      new EndSession(1, true, true),                 // Pat and Quinn both end it, each noting a focus: +1 momentum, once
      new BeginSession(0, true, true),               // the GM and Pat both begin the next, with a vignette: +1, once
      new ReachMilestone(0, 0, true),                // and play goes on in it
    ], { vows: [[{ name: 'Find Kade', rank: 'dangerous', boxes: 0 }], []] });
    const seen = world.observe();
    expect(seen.sessionOpen).toBe(true);
    expect([seen.pcs['pc-kira'].momentum, seen.pcs['pc-ash'].momentum]).toEqual([4, 4]);
    expect(seen.pcs['pc-kira'].vows).toEqual([{ ref: 'v1', name: 'Find Kade', rank: 'dangerous', ticks: 8, fulfilled: false }]);
  });

  it('the GM\'s page reloads, then a player\'s: the session stays open, what was marked is kept and not marked again, and play goes on', async () => {
    const { world } = await play([
      new ReachMilestone(0, 0, true),                // v1: 0 → 8
      new DevelopRelationship(0, 0),                 // c2: 8 → 16
      new Reload(0),                                 // the GM's page
      new Reload(1),                                 // Pat's page
      new RepeatLastPress(),                         // Pat's fresh page shows the picker spent
      new ReachMilestone(0, 0, false),               // v1: 8 → 16, resolved by the GM's fresh page
      new ForgeBond(0, 0, [1, 2]),                   // c2: 4 boxes vs 1,2 — a strong hit, picked on Pat's fresh page
    ], {
      vows: [[{ name: 'Find Kade', rank: 'dangerous', boxes: 0 }], []],
      connections: [{ name: 'Sable', rank: 'dangerous', boxes: 2, holderPick: 0 }],
    });
    const seen = world.observe();
    expect(seen.sessionOpen).toBe(true);
    expect(seen.pcs['pc-kira'].vows).toEqual([{ ref: 'v1', name: 'Find Kade', rank: 'dangerous', ticks: 16, fulfilled: false }]);
    expect(seen.connections).toEqual([{ ref: 'c2', name: 'Sable', rank: 'dangerous', ticks: 16, bonded: true }]);
    expect(seen.legacy.bonds).toBe(2);
  });

  it('a vow sworn to a connection deepens that one when it is fulfilled — renamed, with her old name given to another, across a reload', async () => {
    const { world } = await play([
      new RenameConnection(0, 1),                    // c2 "Sable" → "Vega": the vow's link shows her new name
      new RenameConnection(1, 0),                    // c3 "Orrin" → "Sable": the name the vow was sworn under is another's
      new Reload(0),                                 // the GM's page
      new ReachMilestone(0, 0, true),                // v1: 36 → 40
      new FulfilVow(0, 0, [3, 9]),                   // v1: 10 boxes vs 3,9 — a strong hit; formidable: two marks
    ], {
      vows: [[{ name: 'Find Kade', rank: 'formidable', boxes: 9, swornTo: 0 }], []],
      connections: [
        { name: 'Sable', rank: 'dangerous', boxes: 1, holderPick: 0 },
        { name: 'Orrin', rank: 'dangerous', boxes: 0, holderPick: 1 },
      ],
    });
    const seen = world.observe();
    expect(seen.links).toEqual({ v1: { connection: 'c2', name: 'Vega' } });
    expect(seen.connections).toEqual([
      { ref: 'c2', name: 'Vega',  rank: 'dangerous', ticks: 20, bonded: false },    // 4 + two marks of 8
      { ref: 'c3', name: 'Sable', rank: 'dangerous', ticks: 0,  bonded: false },
    ]);
    expect(seen.pcs['pc-kira'].bonds, 'her bond on Kira\'s sheet follows').toEqual([{ connection: 'c2', name: 'Vega', rank: 'dangerous', ticks: 20, forged: false }]);
  });

  it('a vow sworn to a connection, missed and recommitted: nothing is deepened until it is fulfilled, and then by its raised rank', async () => {
    const { world } = await play([
      new FulfilVow(0, 0, [10, 10]),                 // v1: 4 boxes vs 10,10 — a miss
      new RecommitVow(0, [1, 5]),                    // one box cleared; dangerous → formidable
      new FulfilVow(0, 0, [1, 2]),                   // 3 boxes vs 1,2 — a strong hit; formidable now: two marks
      new RepeatLastPress(),
    ], {
      vows: [[{ name: 'Pay the debt', rank: 'dangerous', boxes: 4, swornTo: 0 }], []],
      connections: [{ name: 'Thess', rank: 'formidable', boxes: 2, holderPick: 1 }],
    });
    expect(world.observe().connections).toEqual([{ ref: 'c2', name: 'Thess', rank: 'formidable', ticks: 16, bonded: false }]);
  });

  it('the GM\'s connection drops and comes back: her page stands down, a move made meanwhile is not resolved, and her reload brings the table back', async () => {
    expectConsoleError(/this page lost its connection to the server/);
    const { model, world } = await play([
      new DropAndRejoin(0),                          // the GM: the same page, a dropped connection behind it
    ], { vows: [[{ name: 'Find Kade', rank: 'dangerous', boxes: 0 }], []] });
    // decisions.md → "A GM page whose connection dropped stands down until it
    // reloads": with no other GM the table waits. Pat's move is posted, and
    // nothing resolves it — no mark, no lock left behind.
    await world.reachMilestone('v1', { pc: 'pc-kira', name: 'Find Kade', byName: true });
    compare(model, world, 'a move posted while the GM\'s page stands down');
    expect(world.observe().pcs['pc-kira'].vows[0].ticks).toBe(0);

    for (const command of [new Reload(0), new ReachMilestone(0, 0, true)]) {
      expect(command.check(model)).toBe(true);
      await command.run(model, world);
    }
    expect(world.observe().pcs['pc-kira'].vows[0].ticks).toBe(8);
  });
});

// Found beside the generated flows, by reading the vow's payoff while mapping
// it, and fixed: a vow sworn to a connection was linked by the connection's
// name, so a renamed NPC card was no longer found, and another card given the
// old name was marked in its place. The link is the card now, by its id.
describe('a vow sworn to a connection develops that connection, whatever its card is called (VOW-CONNECTION-LINK-BY-NAME)', () => {
  const CONNECTIONS = [
    { ref: 'c2', name: 'Sable', rank: 'dangerous', ticks: 8, holder: 'pc-kira' },
    { ref: 'c3', name: 'Orrin', rank: 'dangerous', ticks: 0, holder: 'pc-ash' },
  ];
  const linkOf = (world) => world.vowItem('v1').flags['starforged-companion'] ?? {};
  const relationships = (world) => world.observe().connections.map(c => `${c.ref} ${c.ticks}`).join(', ');

  /** Kira swears "Find Kade" on her sheet, links it to Sable (c2) with the vow card's 🤝 Link, and fills its track. */
  async function swornWithTheCard() {
    table = await usableTable(table);
    const world = await SequenceWorld.start(table, { connections: CONNECTIONS });
    await world.addVow('v1', { pc: 'pc-kira', name: 'Find Kade', rank: 'dangerous' });
    await world.linkVow('v1', 'c2', { pc: 'pc-kira' });
    await world.setVowTicks('v1', { pc: 'pc-kira', ticks: 40 });
    return world;
  }

  /** A world from before the fix: the vow holds Sable's name, and no card's id. */
  async function swornBeforeTheFix() {
    table = await usableTable(table);
    return SequenceWorld.start(table, {
      vows: [{ ref: 'v1', pc: 'pc-kira', name: 'Find Kade', rank: 'dangerous', ticks: 40, swornTo: 'Sable' }],
      connections: CONNECTIONS,
    });
  }

  /** Fulfilled on a strong hit: each connection's ticks after it, as "c2 16, c3 0". */
  async function fulfilled(world) {
    await world.fulfilVow('v1', { pc: 'pc-kira', name: 'Find Kade', challenge: [1, 2] });
    expect(world.observe().pcs['pc-kira'].vows[0].fulfilled).toBe(true);
    return relationships(world);
  }

  it('the vow card\'s Link ties the vow to the connection\'s card, by its id', async () => {
    const world = await swornWithTheCard();
    expect(linkOf(world)).toMatchObject({ linkedConnectionName: 'Sable', linkedConnectionId: world.hostId('c2') });
    expect(await fulfilled(world)).toBe('c2 16, c3 0');
  });

  it('with her card renamed, the progress is still hers — and the vow shows her new name', async () => {
    const world = await swornWithTheCard();
    await world.renameConnection('c2', { name: 'Vega' });
    expect(linkOf(world)).toMatchObject({ linkedConnectionName: 'Vega', linkedConnectionId: world.hostId('c2') });
    expect(await fulfilled(world)).toBe('c2 16, c3 0');
    expect(world.card(f => f.payoffFailureCard), 'no "Vow payoff incomplete" card').toBe(null);
  });

  it('with her card renamed and another given her old name, the other connection is not marked in her place', async () => {
    const world = await swornWithTheCard();
    await world.renameConnection('c2', { name: 'Vega' });
    await world.renameConnection('c3', { name: 'Sable' });
    expect(await fulfilled(world)).toBe('c2 16, c3 0');
  });

  it('a link made before the fix still develops the connection its name names', async () => {
    expect(await fulfilled(await swornBeforeTheFix())).toBe('c2 16, c3 0');
  });

  it('a link made before the fix is tied to its card when the GM\'s world next loads — renames after that do not lose it', async () => {
    const world = await swornBeforeTheFix();
    expect(linkOf(world).linkedConnectionId ?? null).toBe(null);
    await world.reload('gm-1');
    expect(linkOf(world)).toMatchObject({ linkedConnectionName: 'Sable', linkedConnectionId: world.hostId('c2') });
    await world.renameConnection('c2', { name: 'Vega' });
    await world.renameConnection('c3', { name: 'Sable' });
    expect(await fulfilled(world)).toBe('c2 16, c3 0');
  });

  it('a card renamed while no GM was at the table: the vow takes its name at the next world load', async () => {
    const world = await swornWithTheCard();
    // The name changed on the card and its record with no page there to follow it.
    const card = world.actor(world.hostId('c2'));
    card.name = 'Vega';
    card.flags['starforged-companion'].connection.name = 'Vega';
    await world.reload('gm-1');
    expect(linkOf(world)).toMatchObject({ linkedConnectionName: 'Vega', linkedConnectionId: world.hostId('c2') });
  });

  it('a name two cards share cannot say which card: a link made before the fix stays by its name', async () => {
    table = await usableTable(table);
    const world = await SequenceWorld.start(table, {
      vows: [{ ref: 'v1', pc: 'pc-kira', name: 'Find Kade', rank: 'dangerous', ticks: 40, swornTo: 'Sable' }],
      connections: [CONNECTIONS[0], { ...CONNECTIONS[1], name: 'Sable' }],
    });
    await world.reload('gm-1');
    expect(linkOf(world).linkedConnectionId ?? null).toBe(null);
    expect(linkOf(world).linkedConnectionName).toBe('Sable');
  });
});

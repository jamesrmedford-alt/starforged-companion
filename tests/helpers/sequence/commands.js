/**
 * STARFORGED COMPANION
 * tests/helpers/sequence/commands.js — the commands a generated sequence is made of
 *
 * Issue #302 slice C. Each command is one thing someone at the table does.
 * It has a precondition read from the model (`check`), and a `run` that
 * applies it to the model (model.js), does it at the table (world.js), waits
 * for the table to go quiet, and compares the two. fast-check generates the
 * sequences, and on a failure removes commands — keeping each one's
 * precondition true — until the shortest sequence that still fails is left.
 *
 * A command is generated before the things it acts on exist, so it carries
 * picks, not names: "the roller's nth open vow", taken modulo however many
 * there are when it runs. Names come from two short lists, so that namesakes
 * and reused names turn up often — a vow called what another character's vow
 * is called, a connection renamed to a name that was someone else's.
 *
 * The preconditions keep a selection explicit, never ambiguous: one character
 * does not hold two vows of one name, and a new connection's name is not in
 * use. A move is made in an open session; between sessions the sheets can
 * still be edited and the cards renamed. What is being tested is that an explicit selection reaches its target
 * whatever else shares its name, sits beside it or was pressed before — not
 * what the table should do when asked something ambiguous.
 *
 * A vow sworn to a connection comes with the starting world (the link as the
 * vow card's 🤝 Link makes it: the connection's card, by its id), and the
 * commands then act around it — the card renamed, another given its old
 * name, the pages reloaded, the vow recommitted and fulfilled. Swearing one
 * mid-sequence is not a command: the vow card lists the connections there
 * were when it was posted and follows its vow's sheet until it is sworn, and
 * neither the rules nor the decisions say enough about that card for a model
 * of it that is not the code's own (known-issues SEQUENCE-LINK-NOT-GENERATED).
 *
 * A connection may start bonded, and one is bonded mid-sequence by a Forge a
 * Bond hit. Develop Your Relationship with it is then a roll, +their rank
 * (DevelopBondedRelationship), and a vow sworn to it, fulfilled, marks no
 * progress: its roller is offered that roll, once (FulfilVow, then
 * TakeBondRoll on the offer) — the move's own text, and issue #373's
 * decision 4. Until that decision nothing written said what a bonded
 * relationship takes from a fulfilled vow, and such a vow was not fulfilled
 * here.
 */

import fc from "fast-check";
import { expect } from "vitest";
import * as M from "./model.js";
import { BOND_ROLL_ADDS, RANKS, TICKS_PER_BOX, TRACK_BOXES } from "./rules.js";

export const VOW_NAMES = Object.freeze(["Find Kade", "Pay the debt", "Free the miners"]);
export const CONNECTION_NAMES = Object.freeze(["Sable", "Vega", "Orrin", "Thess"]);
const MAX_VOWS_EACH = 3;
const MAX_CONNECTIONS = 4;

const dice = (challenge) => `${challenge[0]},${challenge[1]}`;
/** An action roll's dice: the action die, then the challenge dice. */
const rolled = (actionDie, challenge) => `${actionDie} vs ${dice(challenge)}`;
/** A press two people make in the same moment: the roller's player and the GM (for a draft, the GM and the player). */
const twice = (doubled) => (doubled ? ", pressed by two at once" : "");

/** The table against the model, after `step`. */
export function compare(model, world, step) {
  const label = `after ${step}`;
  expect(world.observe(), label).toEqual(M.expected(model));
  const cards = [...world.connections.values()].map(c => c.hostId).sort();
  expect(world.health(), label).toEqual({ listedConnections: cards, connectionCards: cards, clientsBehind: [], errors: [] });
  expect(world.dice, `${label}: its dice were rolled, all of them`).toEqual([]);
}

/**
 * What ran: each command by kind, and each roll by its outcome. A corpus that
 * passes because its commands' preconditions never held, or because no vow
 * was ever fulfilled, has checked nothing — the test file asserts on this.
 */
export const tally = new Map();
export const resetTally = () => tally.clear();
const count = (key) => tally.set(key, (tally.get(key) ?? 0) + 1);

/**
 * Shared shape. A command prints as its picks (`pending`) — what fast-check
 * generated, the same in every run, and what its counterexample lists.
 * `described` is what the picks resolved to in the run at hand; the
 * comparison is labelled with it, so the assertion under "Caused by" names
 * the vow or connection acted on. (The counterexample cannot: fast-check
 * runs the same command objects again while it looks for a shorter failure,
 * against other fixtures, where a pick resolves to something else.)
 */
class Command {
  described = null;
  toString() { return this.pending(); }
  async finish(model, world, outcome = null, doubled = false) {
    await world.quiet();
    compare(model, world, this.described ?? this.pending());
    count(this.constructor.name);
    if (outcome) count(`${this.constructor.name}:${outcome}`);
    if (doubled) count("pressed by two at once");
  }
}

// ── vows ────────────────────────────────────────────────────────────────────

export class AddVow extends Command {
  constructor(pcPick, namePick, rank) { super(); Object.assign(this, { pcPick, namePick, rank }); }
  pending() { return `AddVow(pc#${this.pcPick}, "${VOW_NAMES[this.namePick]}", ${this.rank})`; }
  #what(model) { return { pc: M.pick(model.pcs, this.pcPick), name: VOW_NAMES[this.namePick] }; }
  check(model) {
    const { pc, name } = this.#what(model);
    const theirs = model.vows.filter(v => v.pc === pc);
    return theirs.length < MAX_VOWS_EACH && !theirs.some(v => v.name === name);
  }
  async run(model, world) {
    const { pc, name } = this.#what(model);
    const vow = M.addVow(model, { pc, name, rank: this.rank });
    this.described = `AddVow(${vow.ref}: ${pc} "${name}" ${this.rank})`;
    await world.addVow(vow.ref, { pc, name, rank: this.rank });
    await this.finish(model, world);
  }
}

export class ReachMilestone extends Command {
  constructor(pcPick, vowPick, byName, doubled = false) { super(); Object.assign(this, { pcPick, vowPick, byName, doubled }); }
  pending() { return `ReachMilestone(pc#${this.pcPick}, vow#${this.vowPick}, ${this.byName ? "named" : "unnamed"}${twice(this.doubled)})`; }
  #vow(model) { return M.pick(M.openVows(model, M.pick(model.pcs, this.pcPick)), this.vowPick); }
  check(model) { return M.canPlay(model) && !!this.#vow(model); }
  async run(model, world) {
    const vow = this.#vow(model);
    const asked = !this.byName && M.openVows(model, vow.pc).length > 1;   // unnamed with several open: the card asks which
    this.described = `ReachMilestone(${vow.ref} "${vow.name}" of ${vow.pc}, ${this.byName ? "named" : asked ? `picked on the card${twice(this.doubled)}` : "the one open vow"})`;
    M.reachMilestone(model, vow);
    if (asked) model.pressed = true;
    await world.reachMilestone(vow.ref, { pc: vow.pc, name: vow.name, byName: this.byName, doubled: this.doubled });
    await this.finish(model, world, this.byName ? "named" : asked ? "picked" : "sole", asked && this.doubled);
  }
}

export class FulfilVow extends Command {
  constructor(pcPick, vowPick, challenge) { super(); Object.assign(this, { pcPick, vowPick, challenge }); }
  pending() { return `FulfilVow(pc#${this.pcPick}, vow#${this.vowPick}, dice ${dice(this.challenge)})`; }
  #vow(model) { return M.pick(M.openVows(model, M.pick(model.pcs, this.pcPick)), this.vowPick); }
  check(model) { return M.canPlay(model) && !!this.#vow(model); }
  async run(model, world) {
    const vow = this.#vow(model);
    const before = vow.ticks;
    const sworn = M.swornConnection(model, vow);
    const outcome = M.fulfilVow(model, vow, this.challenge);
    // Sworn to a connection, a hit deepens it — or, a bond already shared, offers its roll.
    const paid = !!sworn && outcome !== "miss";
    this.described = `FulfilVow(${vow.ref} "${vow.name}" of ${vow.pc}, ${before} ticks vs ${dice(this.challenge)} → ${outcome}${sworn ? `; sworn to ${sworn.ref} "${sworn.name}"${sworn.bonded ? ", already bonded" : ""}` : ""})`;
    await world.fulfilVow(vow.ref, { pc: vow.pc, name: vow.name, challenge: this.challenge });
    await this.finish(model, world, outcome);
    if (paid) count(sworn.bonded ? "FulfilVow:offered its bonded connection's roll" : "FulfilVow:deepened its connection");
  }
}

export class RecommitVow extends Command {
  constructor(vowPick, challenge, doubled = false) { super(); Object.assign(this, { vowPick, challenge, doubled }); }
  pending() { return `RecommitVow(vow#${this.vowPick}, dice ${dice(this.challenge)}${twice(this.doubled)})`; }
  #vow(model) { return M.pick(M.openVows(model).filter(v => v.offer), this.vowPick); }
  check(model) { return M.canPlay(model) && !!this.#vow(model); }
  async run(model, world) {
    const vow = this.#vow(model);
    this.described = `RecommitVow(${vow.ref} "${vow.name}" of ${vow.pc}, ${vow.rank} ${vow.ticks} ticks, dice ${dice(this.challenge)}${twice(this.doubled)})`;
    M.recommitVow(model, vow, this.challenge);
    model.pressed = true;
    await world.recommitVow(vow.ref, { pc: vow.pc, challenge: this.challenge, doubled: this.doubled });
    await this.finish(model, world, null, this.doubled);
  }
}

export class RenameVow extends Command {
  constructor(vowPick, namePick) { super(); Object.assign(this, { vowPick, namePick }); }
  pending() { return `RenameVow(vow#${this.vowPick}, "${VOW_NAMES[this.namePick]}")`; }
  #vow(model) { return M.pick(M.openVows(model), this.vowPick); }
  check(model) {
    const vow = this.#vow(model);
    return !!vow && !model.vows.some(v => v.pc === vow.pc && v.name === VOW_NAMES[this.namePick]);
  }
  async run(model, world) {
    const vow = this.#vow(model);
    const name = VOW_NAMES[this.namePick];
    this.described = `RenameVow(${vow.ref} of ${vow.pc}: "${vow.name}" → "${name}")`;
    M.renameVow(model, vow, name);
    await world.renameVow(vow.ref, { pc: vow.pc, name });
    await this.finish(model, world);
  }
}

// ── connections ─────────────────────────────────────────────────────────────

/** The unbonded connections `pc` holds: the ones their player would be offered. */
const theirUnbonded = (model, pc) => M.unbonded(model).filter(c => c.holders.includes(pc));
/** The bonded ones. */
const theirBonded = (model, pc) => M.bonded(model).filter(c => c.holders.includes(pc));

export class AddConnection extends Command {
  constructor(pcPick, namePick, doubled = false) { super(); Object.assign(this, { pcPick, namePick, doubled }); }
  pending() { return `AddConnection(pc#${this.pcPick}, "${CONNECTION_NAMES[this.namePick]}"${twice(this.doubled)})`; }
  check(model) {
    return M.canPlay(model)
      && model.connections.length < MAX_CONNECTIONS && !model.connections.some(c => c.name === CONNECTION_NAMES[this.namePick]);
  }
  async run(model, world) {
    const pc = M.pick(model.pcs, this.pcPick);
    const name = CONNECTION_NAMES[this.namePick];
    // A connection made from a narration starts at the default rank (Make a Connection gives it one; the card's is dangerous).
    const connection = M.addConnection(model, { name, rank: "dangerous", holder: pc });
    this.described = `AddConnection(${connection.ref}: "${name}" for ${pc}${twice(this.doubled)})`;
    model.pressed = true;
    await world.addConnection(connection.ref, { pc, name, doubled: this.doubled });
    await this.finish(model, world, null, this.doubled);
  }
}

export class DevelopRelationship extends Command {
  constructor(pcPick, connectionPick, doubled = false) { super(); Object.assign(this, { pcPick, connectionPick, doubled }); }
  pending() { return `DevelopRelationship(pc#${this.pcPick}, connection#${this.connectionPick}${twice(this.doubled)})`; }
  #who(model) { const pc = M.pick(model.pcs, this.pcPick); return { pc, connection: M.pick(theirUnbonded(model, pc), this.connectionPick) }; }
  check(model) { return M.canPlay(model) && !!this.#who(model).connection; }
  async run(model, world) {
    const { pc, connection } = this.#who(model);
    this.described = `DevelopRelationship(${connection.ref} "${connection.name}", picked by ${pc}${twice(this.doubled)})`;
    M.developRelationship(model, connection);
    model.pressed = true;
    await world.developRelationship(connection.ref, { pc, doubled: this.doubled });
    await this.finish(model, world, null, this.doubled);
  }
}

export class ForgeBond extends Command {
  constructor(pcPick, connectionPick, challenge, doubled = false) { super(); Object.assign(this, { pcPick, connectionPick, challenge, doubled }); }
  pending() { return `ForgeBond(pc#${this.pcPick}, connection#${this.connectionPick}, dice ${dice(this.challenge)}${twice(this.doubled)})`; }
  #who(model) { const pc = M.pick(model.pcs, this.pcPick); return { pc, connection: M.pick(theirUnbonded(model, pc), this.connectionPick) }; }
  check(model) { return M.canPlay(model) && !!this.#who(model).connection; }
  async run(model, world) {
    const { pc, connection } = this.#who(model);
    const before = connection.ticks;
    const outcome = M.forgeBond(model, connection, this.challenge);
    this.described = `ForgeBond(${connection.ref} "${connection.name}", picked by ${pc}${twice(this.doubled)}, ${before} ticks vs ${dice(this.challenge)} → ${outcome})`;
    model.pressed = true;
    await world.forgeBond(connection.ref, { pc, challenge: this.challenge, doubled: this.doubled });
    await this.finish(model, world, outcome, this.doubled);
  }
}

/** Develop Your Relationship with a connection already bonded: a roll +their rank, and no progress. */
export class DevelopBondedRelationship extends Command {
  constructor(pcPick, connectionPick, actionDie, challenge, doubled = false) { super(); Object.assign(this, { pcPick, connectionPick, actionDie, challenge, doubled }); }
  pending() { return `DevelopBondedRelationship(pc#${this.pcPick}, connection#${this.connectionPick}, dice ${rolled(this.actionDie, this.challenge)}${twice(this.doubled)})`; }
  #who(model) { const pc = M.pick(model.pcs, this.pcPick); return { pc, connection: M.pick(theirBonded(model, pc), this.connectionPick) }; }
  check(model) { return M.canPlay(model) && !!this.#who(model).connection; }
  async run(model, world) {
    const { pc, connection } = this.#who(model);
    const rank = connection.rank;
    const { outcome, raised } = M.developBondedRelationship(model, connection, pc, this.actionDie, this.challenge);
    this.described = `DevelopBondedRelationship(${connection.ref} "${connection.name}", picked by ${pc}${twice(this.doubled)}, ${this.actionDie} +${BOND_ROLL_ADDS[rank]} (${rank}) vs ${dice(this.challenge)} → ${outcome}${raised ? `, raised to ${connection.rank}` : ""})`;
    model.pressed = true;
    await world.developBondedRelationship(connection.ref, { pc, actionDie: this.actionDie, challenge: this.challenge, doubled: this.doubled });
    await this.finish(model, world, outcome, this.doubled);
    if (raised) count("DevelopBondedRelationship:raised its rank");
  }
}

/** The roll a fulfilled vow left its roller for a connection already bonded, taken on the offer card. Once. */
export class TakeBondRoll extends Command {
  constructor(offerPick, actionDie, challenge, doubled = false) { super(); Object.assign(this, { offerPick, actionDie, challenge, doubled }); }
  pending() { return `TakeBondRoll(offer#${this.offerPick}, dice ${rolled(this.actionDie, this.challenge)}${twice(this.doubled)})`; }
  #vow(model) { return M.pick(M.bondRollOffers(model), this.offerPick); }
  check(model) { return M.canPlay(model) && !!this.#vow(model); }
  async run(model, world) {
    const vow = this.#vow(model);
    const connection = M.swornConnection(model, vow);
    const rank = connection.rank;
    const { outcome, raised } = M.takeBondRoll(model, vow, this.actionDie, this.challenge);
    this.described = `TakeBondRoll(${vow.ref} "${vow.name}" of ${vow.pc}, for ${connection.ref} "${connection.name}"${twice(this.doubled)}, ${this.actionDie} +${BOND_ROLL_ADDS[rank]} (${rank}) vs ${dice(this.challenge)} → ${outcome}${raised ? `, raised to ${connection.rank}` : ""})`;
    model.pressed = true;
    await world.takeBondRoll(connection.ref, { pc: vow.pc, actionDie: this.actionDie, challenge: this.challenge, doubled: this.doubled });
    await this.finish(model, world, outcome, this.doubled);
    if (raised) count("TakeBondRoll:raised its rank");
  }
}

export class RecommitConnection extends Command {
  constructor(connectionPick, challenge, doubled = false) { super(); Object.assign(this, { connectionPick, challenge, doubled }); }
  pending() { return `RecommitConnection(connection#${this.connectionPick}, dice ${dice(this.challenge)}${twice(this.doubled)})`; }
  #connection(model) { return M.pick(M.unbonded(model).filter(c => c.offer && c.holders.length), this.connectionPick); }
  check(model) { return M.canPlay(model) && !!this.#connection(model); }
  async run(model, world) {
    const connection = this.#connection(model);
    this.described = `RecommitConnection(${connection.ref} "${connection.name}", ${connection.rank} ${connection.ticks} ticks, dice ${dice(this.challenge)}${twice(this.doubled)})`;
    M.recommitConnection(model, connection, this.challenge);
    model.pressed = true;
    await world.recommitConnection(connection.ref, { pc: connection.holders[0], challenge: this.challenge, doubled: this.doubled });
    await this.finish(model, world, null, this.doubled);
  }
}

export class RenameConnection extends Command {
  constructor(connectionPick, namePick) { super(); Object.assign(this, { connectionPick, namePick }); }
  pending() { return `RenameConnection(connection#${this.connectionPick}, "${CONNECTION_NAMES[this.namePick]}")`; }
  #connection(model) { return M.pick(M.liveConnections(model), this.connectionPick); }
  check(model) {
    const connection = this.#connection(model);
    return !model.gmStale && !!connection && connection.name !== CONNECTION_NAMES[this.namePick];
  }
  async run(model, world) {
    const connection = this.#connection(model);
    const name = CONNECTION_NAMES[this.namePick];
    this.described = `RenameConnection(${connection.ref}: "${connection.name}" → "${name}")`;
    M.renameConnection(model, connection, name);
    await world.renameConnection(connection.ref, { name });
    await this.finish(model, world);
  }
}

// ── disturbances: nothing in the model moves ────────────────────────────────

/** The card button just pressed, pressed again: it was consumed, and grants nothing more. */
export class RepeatLastPress extends Command {
  pending() { return "RepeatLastPress()"; }
  check(model) { return model.pressed === true; }
  async run(model, world) {
    this.described = `RepeatLastPress(${world.lastPress?.selector ?? "?"} by ${world.lastPress?.client ?? "?"})`;
    await world.repeatLastPress();
    await this.finish(model, world);
  }
}

/** The world's actors in another order: who an effect reaches does not depend on it. */
export class ReorderActors extends Command {
  constructor(shift) { super(); this.shift = shift; }
  pending() { return `ReorderActors(${this.shift})`; }
  check() { return true; }
  async run(model, world) {
    this.described = this.pending();
    world.reorderActors(this.shift);
    await this.finish(model, world);
  }
}

// ── the table: sessions, reloads, dropped connections ───────────────────────

const SEATS = Object.freeze(["gm-1", "pl-1", "pl-2"]);

/** Who types a session command: one seat, or that seat and the next in the same moment. */
const typists = (seatPick, doubled) => ({ by: M.pick(SEATS, seatPick), also: doubled ? M.pick(SEATS, seatPick + 1) : null });
const typedBy = ({ by, also }) => (also ? `by ${by} and ${also} at once` : `by ${by}`);

export class EndSession extends Command {
  constructor(seatPick, focus, doubled = false) { super(); Object.assign(this, { seatPick, focus, doubled }); }
  pending() { return `EndSession(${typedBy(typists(this.seatPick, this.doubled))}, ${this.focus ? "a focus noted" : "no focus"})`; }
  check(model) { return model.session.active && !model.gmStale; }
  async run(model, world) {
    this.described = this.pending();
    M.endSession(model, { focus: this.focus });
    await world.endSession({ ...typists(this.seatPick, this.doubled), focus: this.focus });
    await this.finish(model, world, this.focus ? "focus" : "no focus", this.doubled);
  }
}

export class BeginSession extends Command {
  constructor(seatPick, vignette, doubled = false) { super(); Object.assign(this, { seatPick, vignette, doubled }); }
  pending() { return `BeginSession(${typedBy(typists(this.seatPick, this.doubled))}, ${this.vignette ? "a vignette" : "no vignette"})`; }
  check(model) { return !model.session.active && !model.gmStale; }
  async run(model, world) {
    this.described = this.pending();
    M.beginSession(model, { vignette: this.vignette });
    await world.beginSession({ ...typists(this.seatPick, this.doubled), vignette: this.vignette });
    await this.finish(model, world, this.vignette ? "vignette" : "no vignette", this.doubled);
  }
}

/** A page reload: nothing committed is lost, and nothing consumed is given again. */
export class Reload extends Command {
  constructor(seatPick) { super(); this.seatPick = seatPick; }
  pending() { return `Reload(${M.pick(SEATS, this.seatPick)})`; }
  check() { return true; }
  async run(model, world) {
    this.described = this.pending();
    if (M.pick(SEATS, this.seatPick) === "gm-1") M.gmReloaded(model);
    await world.reload(M.pick(SEATS, this.seatPick));
    await this.finish(model, world, M.pick(SEATS, this.seatPick) === "gm-1" ? "the GM" : "a player");
  }
}

/**
 * A connection that drops and comes back on the same page. A player's page
 * carries on. The GM's stands down until it reloads, and with no other GM
 * the table waits: nothing that needs the GM runs until Reload(gm-1).
 */
export class DropAndRejoin extends Command {
  constructor(seatPick) { super(); this.seatPick = seatPick; }
  pending() { return `DropAndRejoin(${M.pick(SEATS, this.seatPick)})`; }
  check() { return true; }
  async run(model, world) {
    this.described = this.pending();
    if (M.pick(SEATS, this.seatPick) === "gm-1") M.gmDropped(model);
    await world.dropAndRejoin(M.pick(SEATS, this.seatPick));
    await this.finish(model, world, M.pick(SEATS, this.seatPick) === "gm-1" ? "the GM" : "a player");
  }
}

// ── generation ──────────────────────────────────────────────────────────────

const pcPick   = fc.nat({ max: 5 });
const anyPick  = fc.nat({ max: 11 });
const vowName  = fc.nat({ max: VOW_NAMES.length - 1 });
const connName = fc.nat({ max: CONNECTION_NAMES.length - 1 });
const rank     = fc.constantFrom(...RANKS);
const challenge = fc.tuple(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 10 }));
const actionDie = fc.integer({ min: 1, max: 6 });
/** An action roll's challenge dice — a match one time in three: a strong hit with one is what raises a bonded connection's rank. */
const actionChallenge = fc.oneof({ weight: 2, arbitrary: challenge }, { weight: 1, arbitrary: fc.integer({ min: 1, max: 10 }).map(n => [n, n]) });
const doubled  = fc.boolean();

/** The vow and connection commands (slice C, step 2). */
export function vowAndConnectionCommands() {
  return [
    fc.tuple(pcPick, vowName, rank).map(a => new AddVow(...a)),
    fc.tuple(pcPick, anyPick, fc.boolean(), doubled).map(a => new ReachMilestone(...a)),
    fc.tuple(pcPick, anyPick, fc.boolean(), doubled).map(a => new ReachMilestone(...a)),   // twice: progress is what makes a hit possible
    fc.tuple(pcPick, anyPick, challenge).map(a => new FulfilVow(...a)),
    fc.tuple(anyPick, challenge, doubled).map(a => new RecommitVow(...a)),
    fc.tuple(anyPick, vowName).map(a => new RenameVow(...a)),
    fc.tuple(pcPick, connName, doubled).map(a => new AddConnection(...a)),
    fc.tuple(pcPick, anyPick, doubled).map(a => new DevelopRelationship(...a)),
    fc.tuple(pcPick, anyPick, doubled).map(a => new DevelopRelationship(...a)),
    fc.tuple(pcPick, anyPick, challenge, doubled).map(a => new ForgeBond(...a)),
    fc.tuple(anyPick, challenge, doubled).map(a => new RecommitConnection(...a)),
    fc.tuple(anyPick, connName).map(a => new RenameConnection(...a)),
    fc.constant(null).map(() => new RepeatLastPress()),
    fc.nat({ max: 5 }).map(shift => new ReorderActors(shift)),
  ];
}

/** Sessions, reloads and dropped connections, among everything above (slice C, step 3). */
export function tableCommands() {
  const seat = fc.nat({ max: SEATS.length - 1 });
  return [
    ...vowAndConnectionCommands(),
    fc.tuple(seat, fc.boolean(), doubled).map(a => new EndSession(...a)),
    fc.tuple(seat, fc.boolean(), doubled).map(a => new BeginSession(...a)),
    fc.tuple(seat, fc.boolean(), doubled).map(a => new BeginSession(...a)),   // twice: a closed session shuts every move out
    seat.map(s => new Reload(s)),
    fc.constant(0).map(s => new Reload(s)),                          // the GM's reload is what ends a stand-down
    seat.map(s => new DropAndRejoin(s)),
  ];
}

/**
 * A connection already bonded, among the vow and connection commands (issue
 * #373 slice 0): Develop Your Relationship with it as the roll it is, and the
 * roll a vow fulfilled for it leaves its roller — each twice: their
 * preconditions wait on a bond, and on a hit on a vow sworn to one — with a
 * page reloaded among them, so an offer card and its claim are read back from
 * the world. A list of its own, beside the two above: adding a command to
 * those would change every sequence their fixed seed makes.
 */
export function bondedCommands() {
  const seat = fc.nat({ max: SEATS.length - 1 });
  return [
    ...vowAndConnectionCommands(),
    fc.tuple(pcPick, anyPick, actionDie, actionChallenge, doubled).map(a => new DevelopBondedRelationship(...a)),
    fc.tuple(pcPick, anyPick, actionDie, actionChallenge, doubled).map(a => new DevelopBondedRelationship(...a)),
    fc.tuple(anyPick, actionDie, actionChallenge, doubled).map(a => new TakeBondRoll(...a)),
    fc.tuple(anyPick, actionDie, actionChallenge, doubled).map(a => new TakeBondRoll(...a)),
    seat.map(s => new Reload(s)),
  ];
}

/**
 * What a sequence starts with: up to two vows a character and up to three
 * connections, of any rank and any progress. A sequence that began from
 * nothing would spend its commands getting to where a roll can hit; the
 * fixture puts every rank, tracks near their tenth box and namesakes across
 * the two sheets within reach of a short one.
 */
const startingVows = fc.uniqueArray(
  // swornTo: a pick among the starting connections — the vow is sworn to that one — or null.
  fc.record({ name: fc.constantFrom(...VOW_NAMES), rank, boxes: fc.nat({ max: TRACK_BOXES }), swornTo: fc.option(pcPick, { nil: null }) }),
  { maxLength: 2, selector: v => v.name },
);
const startingConnection = { name: fc.constantFrom(...CONNECTION_NAMES), rank, boxes: fc.nat({ max: TRACK_BOXES }), holderPick: pcPick };
export const startingWorld = fc.record({
  vows: fc.tuple(startingVows, startingVows),
  // Two connections may share a name from the start: the crew knows two Sables.
  connections: fc.array(fc.record(startingConnection), { maxLength: 3 }),
});
/** The same, with half its connections already bonded — as an earlier Forge a Bond left them. */
export const startingWorldWithBonds = fc.record({
  vows: fc.tuple(startingVows, startingVows),
  connections: fc.array(fc.record({ ...startingConnection, bonded: fc.boolean() }), { maxLength: 3 }),
});

/** Put a generated fixture into a fresh model; returns it in world.js's fixture shape. */
export function applyFixture(model, { vows = [], connections = [] } = {}) {
  const out = { vows: [], connections: [] };
  const sworn = [];   // [vow, its entry in `out`, the pick] — resolved once the connections exist
  vows.forEach((list, i) => {
    const pc = model.pcs[i];
    for (const { name, rank: r, boxes, swornTo = null } of list ?? []) {
      const vow = M.addVow(model, { pc, name, rank: r });
      vow.ticks = boxes * TICKS_PER_BOX;
      out.vows.push({ ref: vow.ref, pc, name, rank: r, ticks: vow.ticks });
      if (swornTo !== null) sworn.push([vow, out.vows.at(-1), swornTo]);
    }
  });
  for (const { name, rank: r, boxes, holderPick, bonded = false } of connections) {
    const holder = M.pick(model.pcs, holderPick);
    const connection = M.addConnection(model, { name, rank: r, holder });
    connection.ticks = boxes * TICKS_PER_BOX;
    connection.bonded = bonded === true;
    out.connections.push({ ref: connection.ref, name, rank: r, ticks: connection.ticks, holder, bonded: connection.bonded });
  }
  for (const [vow, entry, pick] of sworn) {
    const connection = M.pick(model.connections, pick);
    if (!connection) continue;                       // a world with no connections: sworn to no one
    M.swearTo(model, vow, connection);
    entry.swornToRef = connection.ref;
  }
  return out;
}

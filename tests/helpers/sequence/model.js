/**
 * STARFORGED COMPANION
 * tests/helpers/sequence/model.js — what a sequence of commands should leave
 *
 * Issue #302 slice C. A small model of the crew's vows, connections and
 * legacy tracks, moved forward by the rules in rules.js and by nothing from
 * src/. A generated sequence applies each command here and to a simulated
 * table (world.js), then compares `expected(model)` with what the table
 * holds. The model names things by its own refs (v1, c2…); the table maps a
 * ref to the document it created for it — so a name can change, collide or be
 * reused without the model losing track of which thing is which, and the
 * comparison shows when the table did.
 *
 * What it tracks
 *   - each vow: whose it is, its name, rank, ticks, and whether it is
 *     fulfilled;
 *   - each connection: its name, rank, ticks, whether a bond is forged, and
 *     which characters hold it;
 *   - the crew's quests and bonds legacy tracks, in ticks ever marked;
 *   - each character's momentum, which nothing here should move.
 */

import {
  MOMENTUM_START, bondReward, fulfilReward, markProgress, outcomeOf, progressScore, recommit,
} from "./rules.js";

export function createModel(pcs) {
  return {
    pcs: [...pcs],
    momentum: Object.fromEntries(pcs.map(pc => [pc, MOMENTUM_START])),
    legacy: { quests: 0, bonds: 0 },
    vows: [],
    connections: [],
    refs: 0,
    pressed: false,   // a card button has been pressed (commands.js RepeatLastPress)
  };
}

const nextRef = (model, prefix) => `${prefix}${++model.refs}`;

// ── selection ───────────────────────────────────────────────────────────────

export const openVows = (model, pc = null) => model.vows.filter(v => v.status === "open" && (pc === null || v.pc === pc));
export const liveConnections = (model) => model.connections;
export const unbonded = (model) => model.connections.filter(c => !c.bonded);
/** The nth of a list, wrapping — a command is generated before the list exists. */
export const pick = (list, n) => (list.length ? list[n % list.length] : null);

// ── vows ────────────────────────────────────────────────────────────────────

export function addVow(model, { pc, name, rank }) {
  const vow = { ref: nextRef(model, "v"), pc, name, rank, ticks: 0, status: "open", offer: false };
  model.vows.push(vow);
  return vow;
}

export function reachMilestone(model, vow) {
  vow.ticks = markProgress(vow.ticks, vow.rank);
}

/** @returns {"strong_hit"|"weak_hit"|"miss"} */
export function fulfilVow(model, vow, challenge) {
  const outcome = outcomeOf(progressScore(vow.ticks), challenge);
  if (outcome === "miss") {
    vow.offer = true;                        // the quest is undone: recommit, or give it up
    return outcome;
  }
  vow.status = "fulfilled";
  vow.offer = false;
  model.legacy.quests += fulfilReward(vow.rank, outcome);
  return outcome;
}

export function recommitVow(model, vow, challenge) {
  Object.assign(vow, recommit(vow.ticks, vow.rank, challenge));
  vow.offer = false;
}

export function renameVow(model, vow, name) {
  vow.name = name;
}

// ── connections ─────────────────────────────────────────────────────────────

export function addConnection(model, { name, rank, holder }) {
  const connection = { ref: nextRef(model, "c"), name, rank, ticks: 0, bonded: false, holders: holder ? [holder] : [], offer: false };
  model.connections.push(connection);
  return connection;
}

export function developRelationship(model, connection) {
  connection.ticks = markProgress(connection.ticks, connection.rank);
}

/** @returns {"strong_hit"|"weak_hit"|"miss"} */
export function forgeBond(model, connection, challenge) {
  const outcome = outcomeOf(progressScore(connection.ticks), challenge);
  if (outcome === "miss") {
    connection.offer = true;
    return outcome;
  }
  connection.bonded = true;
  connection.offer = false;
  model.legacy.bonds += bondReward(connection.rank, outcome);
  return outcome;
}

export function recommitConnection(model, connection, challenge) {
  Object.assign(connection, recommit(connection.ticks, connection.rank, challenge));
  connection.offer = false;
}

export function renameConnection(model, connection, name) {
  connection.name = name;
}

// ── what the table should hold ──────────────────────────────────────────────

/**
 * The model as the table is read (world.js `observe`): the same shape, so the
 * two compare with toEqual and a difference names the field.
 */
export function expected(model) {
  const pcs = {};
  for (const pc of model.pcs) {
    pcs[pc] = {
      momentum: model.momentum[pc],
      legacyOnSheet: { ...model.legacy },
      vows: model.vows.filter(v => v.pc === pc)
        .map(v => ({ ref: v.ref, name: v.name, rank: v.rank, ticks: v.ticks, fulfilled: v.status === "fulfilled" })),
      bonds: model.connections.filter(c => c.holders.includes(pc))
        .map(c => ({ connection: c.ref, name: c.name, rank: c.rank, ticks: c.ticks, forged: c.bonded })),
    };
  }
  return {
    legacy: { ...model.legacy },
    pcs,
    connections: model.connections.map(c => ({ ref: c.ref, name: c.name, rank: c.rank, ticks: c.ticks, bonded: c.bonded })),
    moveInFlight: false,
  };
}

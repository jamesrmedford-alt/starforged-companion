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
 *   - each vow: whose it is, its name, rank, ticks, whether it is
 *     fulfilled, and the connection it was sworn to, if any;
 *   - each connection: its name, rank, ticks, whether a bond is forged, and
 *     which characters hold it;
 *   - the crew's quests and bonds legacy tracks, in ticks ever marked;
 *   - whether a session is open, and whether the GM's page can act;
 *   - each character's momentum, which only a session's beginning and end
 *     move here.
 */

import {
  MOMENTUM_START, bondReward, deepen, fulfilReward, gainMomentum, markProgress, outcomeOf, progressScore, recommit,
} from "./rules.js";

export function createModel(pcs) {
  return {
    pcs: [...pcs],
    momentum: Object.fromEntries(pcs.map(pc => [pc, MOMENTUM_START])),
    legacy: { quests: 0, bonds: 0 },
    session: { active: true },
    gmStale: false,   // the GM's page lived through a dropped connection and has not reloaded
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
  const vow = { ref: nextRef(model, "v"), pc, name, rank, ticks: 0, status: "open", offer: false, swornTo: null };
  model.vows.push(vow);
  return vow;
}

/** The vow is sworn to a connection: the connection itself, whatever it is called later. */
export function swearTo(model, vow, connection) {
  vow.swornTo = connection.ref;
}

/** The connection a vow is sworn to, or null. */
export const swornConnection = (model, vow) => (vow?.swornTo ? model.connections.find(c => c.ref === vow.swornTo) ?? null : null);

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
  // Sworn to a connection: the fulfilment deepens that relationship, once.
  const connection = swornConnection(model, vow);
  if (connection) connection.ticks = deepen(connection.ticks, connection.rank, vow.rank);
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

// ── the GM's page ───────────────────────────────────────────────────────────
//
// decisions.md → "A GM page whose connection dropped stands down until it
// reloads": from the drop it is never the canonical GM and writes no campaign
// state; with no other GM the table waits for the reload. This table has one
// GM, so while her page is stale nothing that needs a GM happens — no move is
// resolved, no card button acts, no session begins or ends.

export function gmDropped(model) { model.gmStale = true; }
export function gmReloaded(model) { model.gmStale = false; }
/** A move can be made: a session is open and the GM's page can act. */
export const canPlay = (model) => model.session.active && !model.gmStale;

// ── sessions ────────────────────────────────────────────────────────────────

const everyoneGains = (model) => { for (const pc of model.pcs) model.momentum[pc] = gainMomentum(model.momentum[pc]); };

/** End a Session: the session closes; a focus noted for next time is +1 momentum to every player. */
export function endSession(model, { focus }) {
  model.session.active = false;
  if (focus) everyoneGains(model);
}

/** Begin a Session: a session opens; a vignette spotlighted is +1 momentum to every player. */
export function beginSession(model, { vignette }) {
  model.session.active = true;
  if (vignette) everyoneGains(model);
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
  // A vow's link: the connection it was sworn to, and that connection's name
  // as the vow shows it — which is the card's name now, whatever it was.
  const links = {};
  for (const vow of model.vows) {
    const connection = swornConnection(model, vow);
    if (connection) links[vow.ref] = { connection: connection.ref, name: connection.name };
  }
  return {
    legacy: { ...model.legacy },
    pcs,
    links,
    connections: model.connections.map(c => ({ ref: c.ref, name: c.name, rank: c.rank, ticks: c.ticks, bonded: c.bonded })),
    sessionOpen: model.session.active,
    moveInFlight: false,
  };
}

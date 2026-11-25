/**
 * STARFORGED COMPANION
 * tests/unit/moveContracts.test.js
 *
 * Overhaul 4, "moves as contracts" — the table's sweep (design §4.5). The
 * contracts are one table beside MOVES (decision D1); this holds it to the
 * move list, the predicates, and the game's own words:
 *
 *   - every MOVES key has a row, and every row is a MOVES key or a
 *     button-made move (Begin the Scene — no MOVES id: toMoveId gives none);
 *   - every precondition a row names is a predicate predicates.js exports,
 *     and every predicate it exports is used by some row;
 *   - every row's trigger is the vendored move's own trigger words, from its
 *     first word (foundry-ironsworn json-packs/starforged-moves, system.Text —
 *     skipped without the submodule, as sceneChallengeVariantMoves.test.js);
 *   - every `makes` / `ends` names a state of the move-only vocabulary, and
 *     `gated` is "never", "table" or absent.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MOVES, toMoveId } from "../../src/schemas.js";
import { MOVE_CONTRACTS, contractFor } from "../../src/moves/contracts/table.js";

// The one move the module makes from a button, with no MOVES id (toMoveId gives none).
const BUTTON_MOVES = ["begin_the_scene"];
import * as predicates from "../../src/moves/contracts/predicates.js";

const MOVES_DIR = fileURLToPath(new URL("../../vendor/foundry-ironsworn/json-packs/starforged-moves", import.meta.url));
const HAVE_VENDOR = fs.existsSync(MOVES_DIR) && fs.readdirSync(MOVES_DIR).length > 0;

/** The vendored moves, by the row id each is (toMoveId; Begin the Scene by its button id). */
function vendoredMoves() {
  const out = {};
  for (const f of fs.readdirSync(MOVES_DIR)) {
    const d = JSON.parse(fs.readFileSync(path.join(MOVES_DIR, f), "utf8"));
    if (d.type !== "sfmove") continue;
    const id = toMoveId(d.name) ?? (d.name === "Begin the Scene" ? "begin_the_scene" : null);
    if (id) out[id] = d;
  }
  return out;
}

/** A text as its words, markup off: what "the game's own words" means here. */
const words = (text) => String(text ?? "")
  .replace(/@Compendium\[[^\]]*\]\{([^}]*)\}/g, "$1")
  .replace(/[_*]/g, " ")
  .toLowerCase()
  .replace(/[’']/g, "'")
  .split(/[^a-z0-9+'-]+/)
  .filter(Boolean);

/** The first bolded clause of the vendored text — the trigger's own core. */
const firstClause = (text) => (String(text ?? "").match(/__([^_]+)__/) ?? [null, ""])[1];

// The states only a move may make or end (design §7; slice 3's MOVE_ONLY_STATE names their writers).
const MOVE_STATES = new Set(["connection", "bond", "vow-progress", "vow", "fight", "expedition", "scene-challenge",
  "progress:fight", "progress:expedition"]);

// Predicates built by a factory, by the id prefix each builds.
const FACTORIES = { POSITION: "position-", OPEN_TRACK: "open-track-", OPEN_VOW: "open-vow", RECOVERABLE: "recoverable-" };

describe("MOVE_CONTRACTS — one row a move", () => {
  it("every MOVES key has a row, and every row is a MOVES key or a button-made move", () => {
    const rows = Object.keys(MOVE_CONTRACTS);
    expect(Object.keys(MOVES).filter(id => !rows.includes(id))).toEqual([]);
    expect(rows.filter(id => !MOVES[id] && !BUTTON_MOVES.includes(id))).toEqual([]);
    expect(rows).toHaveLength(Object.keys(MOVES).length + BUTTON_MOVES.length);
  });

  it("Begin the Scene is a button's move, with no MOVES id", () => {
    expect(Object.keys(MOVE_CONTRACTS).filter(id => !MOVES[id])).toEqual(BUTTON_MOVES);
    expect(MOVES.begin_the_scene).toBeUndefined();
    expect(toMoveId("Begin the Scene")).toBeNull();
    expect(contractFor("begin_the_scene")).toMatchObject({ group: "scene_challenge", makes: ["scene-challenge"] });
    expect(contractFor("no_such_move")).toBeNull();
  });

  it("each row's group is its move's category", () => {
    for (const [id, row] of Object.entries(MOVE_CONTRACTS)) {
      if (MOVES[id]) expect(row.group, id).toBe(MOVES[id].category);
    }
  });

  it("every precondition a row names is an exported predicate, and every exported predicate is used", () => {
    const constants = Object.entries(predicates).filter(([, v]) => v && typeof v === "object" && typeof v.test === "function");
    const factories = Object.entries(predicates).filter(([, v]) => typeof v === "function");
    const used = Object.values(MOVE_CONTRACTS).flatMap(row => row.requires);
    for (const p of used) {
      expect(typeof p.test, `${p.id} is a predicate`).toBe("function");
      const exported = constants.some(([, v]) => v === p) || Object.values(FACTORIES).some(prefix => p.id.startsWith(prefix));
      expect(exported, `${p.id} comes from predicates.js`).toBe(true);
    }
    for (const [name, p] of constants) expect(used.includes(p), `${name} is used by some row`).toBe(true);
    for (const [name] of factories) {
      expect(FACTORIES[name], `${name} is a known factory`).toBeTruthy();
      expect(used.some(p => p.id.startsWith(FACTORIES[name])), `${name} builds some row's precondition`).toBe(true);
    }
  });

  it("each precondition is hard, soft or a reroute, with a reason in words", () => {
    for (const row of Object.values(MOVE_CONTRACTS)) {
      for (const p of row.requires) {
        expect(typeof p.id).toBe("string");
        expect(["sheet", "tracks", "table", "reading"]).toContain(p.scope);
        if (p.hard) expect(p.instead, `${p.id}: a hard refusal is no reroute`).toBeNull();
      }
    }
  });

  it("makes / ends name only move-only states; gated is never, table or absent", () => {
    for (const [id, row] of Object.entries(MOVE_CONTRACTS)) {
      for (const s of [...row.makes, ...row.ends]) expect(MOVE_STATES.has(s), `${id}: ${s}`).toBe(true);
      expect([null, "never", "table"], id).toContain(row.gated);
      if (row.gated) expect(row.requires, `${id}: a move the gate passes unread requires nothing`).toEqual([]);
    }
  });

  it("the safety tools and the fate moves are never gated; the session's and the XP box's are the table's", () => {
    for (const id of ["set_a_flag", "change_your_fate", "take_a_break", "ask_the_oracle", "pay_the_price"]) expect(MOVE_CONTRACTS[id].gated, id).toBe("never");
    for (const id of ["begin_a_session", "end_a_session", "earn_experience"]) expect(MOVE_CONTRACTS[id].gated, id).toBe("table");
  });

  it("every row has a trigger in words, starting as the game's do", () => {
    for (const [id, row] of Object.entries(MOVE_CONTRACTS)) expect(row.trigger, id).toMatch(/^When (you|your|the) /);
  });
});

describe.skipIf(!HAVE_VENDOR)("MOVE_CONTRACTS — each trigger is the game's own words (the vendored pack)", () => {
  const vendored = HAVE_VENDOR ? vendoredMoves() : {};

  it("every row has its vendored move", () => {
    expect(Object.keys(MOVE_CONTRACTS).filter(id => !vendored[id])).toEqual([]);
  });

  it("every row's trigger is the vendored text's opening words, through its first bolded clause at least", () => {
    for (const [id, row] of Object.entries(MOVE_CONTRACTS)) {
      const text = vendored[id].system.Text;
      const mine = words(row.trigger);
      const theirs = words(text);
      expect(theirs.slice(0, mine.length), `${id}: "${row.trigger}"`).toEqual(mine);
      expect(mine.length, `${id}: the trigger covers its first clause`).toBeGreaterThanOrEqual(words(firstClause(text)).length);
    }
  });

  it("the deeds the readers will be given are the game's: Develop Your Relationship's seven, Reach a Milestone's six", () => {
    expect(MOVE_CONTRACTS.develop_your_relationship.trigger.split(";")).toHaveLength(7);
    expect(MOVE_CONTRACTS.develop_your_relationship.trigger).toContain("giving them something of worth");
    expect(MOVE_CONTRACTS.reach_a_milestone.trigger.split(";")).toHaveLength(6);
    expect(MOVE_CONTRACTS.reach_a_milestone.trigger).toContain("gaining meaningful insight");
  });
});

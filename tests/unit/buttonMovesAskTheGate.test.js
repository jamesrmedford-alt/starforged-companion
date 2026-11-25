/**
 * STARFORGED COMPANION
 * tests/unit/buttonMovesAskTheGate.test.js
 *
 * Overhaul 4, "moves as contracts" — which presses are moves the move gate is
 * asked of (design §6.2), and which are the table's own hand (D7):
 *   Begin the fight (combat.threshold)            → Enter the Fray, asked
 *   the scene-challenge offer's Begin             → Begin the Scene, asked
 *   the Progress Tracks panel's Add of a scene challenge → Begin the Scene, asked
 *   the panel's Add of a fight or an expedition   → the hand, never asked
 *   a "Which vow?" pick (milestone.pick)          → Reach a Milestone, asked
 * Enter the Fray's and Begin the Scene's rows require nothing, so their
 * presses pass by construction; the refusal below is the gate's, forced, to
 * show a refusal changes nothing. The pick's refusal is the gate's own.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const forced = { refuse: null };
vi.mock("../../src/moves/contracts/pressGate.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    gatePress: vi.fn(async (moveId, opts) => (forced.refuse === moveId
      ? { ok: false, refusal: { moveId, code: "forced", why: "the test refuses it", hard: true } }
      : real.gatePress(moveId, opts))),
  };
});

import { gatePress } from "../../src/moves/contracts/pressGate.js";
import { applyCombatThresholdChoice } from "../../src/moves/cardActions.js";
import { applySceneChallengeOffer } from "../../src/moves/sceneChallengeOffer.js";
import { applyProgressTrackEditFromRelay } from "../../src/ui/progressTracks.js";
import { applyMilestonePick } from "../../src/moves/milestonePicker.js";

const MODULE_ID = "starforged-companion";
const GM_CTX = { requesterId: "gm-1", requester: { id: "gm-1", isGM: true }, requesterIsGM: true };
const P1_CTX = { requesterId: "pl-1", requester: { id: "pl-1", isGM: false }, requesterIsGM: false };

function card(id, flags, extra = {}) {
  const msg = {
    id, content: "", author: { isGM: true }, ...extra, flags: { [MODULE_ID]: { ...flags } },
    update: vi.fn(async (changes) => {
      for (const [k, v] of Object.entries(changes)) {
        if (k.startsWith(`flags.${MODULE_ID}.`)) msg.flags[MODULE_ID][k.slice(`flags.${MODULE_ID}.`.length)] = v;
        else msg[k] = v;
      }
      return msg;
    }),
  };
  return msg;
}

const askedOf = (moveId) => gatePress.mock.calls.filter(c => c[0] === moveId).length;

let messages, saved;
beforeEach(() => {
  forced.refuse = null;
  gatePress.mockClear();
  messages = [];
  saved = { messages: game.messages, journal: game.journal };
  game.messages = { get: (id) => messages.find(m => m.id === id) ?? null, contents: messages };
});
afterEach(() => { game.messages = saved.messages; game.journal = saved.journal; });

describe("Begin the fight is Enter the Fray: asked before the card is claimed", () => {
  it("refused: nothing claimed, no fight made", async () => {
    const threshold = card("thr-1", { combatThresholdCard: true, label: "the raiders", actorId: "pc-mira" });
    messages.push(threshold);
    forced.refuse = "enter_the_fray";
    expect(await applyCombatThresholdChoice({ messageId: "thr-1", choice: "fray", rank: "dangerous" }, GM_CTX))
      .toEqual({ applied: false, reason: "cannot" });
    expect(askedOf("enter_the_fray")).toBe(1);
    expect(threshold.update).not.toHaveBeenCalled();
  });

  it("the way out is no move of its own: not asked", async () => {
    const threshold = card("thr-2", { combatThresholdCard: true, label: "the raiders", actorId: "pc-mira" });
    messages.push(threshold);
    forced.refuse = "enter_the_fray";
    expect(await applyCombatThresholdChoice({ messageId: "thr-2", choice: "wayOut" }, GM_CTX)).toEqual({ applied: true });
    expect(askedOf("enter_the_fray")).toBe(0);
  });
});

describe("the scene-challenge offer's Begin is Begin the Scene", () => {
  it("asked before the claim; refused, nothing begun", async () => {
    const offer = card("offer-1", { sceneChallengeOffer: { label: "Escape the Spire", clockId: "clk-1" } });
    messages.push(offer);
    forced.refuse = "begin_the_scene";
    expect(await applySceneChallengeOffer({ messageId: "offer-1" }, GM_CTX)).toEqual({ applied: false, reason: "cannot" });
    expect(askedOf("begin_the_scene")).toBe(1);
    expect(offer.update).not.toHaveBeenCalled();
  });
});

describe("the Progress Tracks panel's Add", () => {
  let tracks;
  beforeEach(() => {
    tracks = [];
    const journal = {
      id: "pt", name: "Starforged Progress Tracks",
      getFlag: (m, k) => (m === MODULE_ID && k === "tracks" ? tracks : undefined),
      setFlag: vi.fn(async (_m, _k, v) => { tracks = structuredClone(v); }),
    };
    game.journal = { ...saved.journal, find: (fn) => (fn(journal) ? journal : null) };
  });

  it("of a scene challenge is Begin the Scene: asked — it requires nothing, so it is made", async () => {
    const res = await applyProgressTrackEditFromRelay({ op: "add", label: "Escape the Spire", type: "scene_challenge", rank: "dangerous" }, GM_CTX);
    expect(res.applied).toBe(true);
    expect(askedOf("begin_the_scene")).toBe(1);
    expect(tracks).toEqual([expect.objectContaining({ label: "Escape the Spire", type: "scene_challenge" })]);
  });

  it("…and refused, nothing is added", async () => {
    forced.refuse = "begin_the_scene";
    expect(await applyProgressTrackEditFromRelay({ op: "add", label: "Escape the Spire", type: "scene_challenge", rank: "dangerous" }, GM_CTX))
      .toEqual({ applied: false, reason: "cannot" });
    expect(tracks).toEqual([]);
  });

  it("of a fight or an expedition is the table's own hand: never asked (D7)", async () => {
    forced.refuse = "enter_the_fray";
    for (const type of ["combat", "expedition"]) {
      expect((await applyProgressTrackEditFromRelay({ op: "add", label: `A ${type}`, type, rank: "dangerous" }, P1_CTX)).applied).toBe(true);
    }
    expect(gatePress).not.toHaveBeenCalled();
    expect(tracks.map(t => t.type)).toEqual(["combat", "expedition"]);
  });
});

describe("a \"Which vow?\" pick is Reach a Milestone", () => {
  it("a vow already full: a player's pick is refused — nothing marked, the picker left open", async () => {
    const vow = { id: "v-full", name: "Find the archive", type: "progress",
      system: { subtype: "vow", rank: "dangerous", current: 40, completed: false }, flags: { [MODULE_ID]: { vowId: "v-full" } },
      update: vi.fn(async () => vow) };
    const pc = makeTestActor({ id: "pc-bex", name: "Bex", hasPlayerOwner: true, items: { contents: [vow] } });
    pc.ownership = { "pl-1": 3 };
    game.actors._setAll([pc]);
    const picker = card("picker-1", { milestonePicker: true, resolved: false, choices: [{ vowId: "v-full", actorId: "pc-bex", marks: 1 }] });
    messages.push(picker);

    expect(await applyMilestonePick({ messageId: "picker-1", actorId: "pc-bex", vowId: "v-full" }, P1_CTX))
      .toEqual({ marked: false, reason: "cannot" });
    expect(askedOf("reach_a_milestone")).toBe(1);
    expect(vow.update).not.toHaveBeenCalled();
    expect(picker.flags[MODULE_ID].resolved).toBe(false);
  });
});

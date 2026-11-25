/**
 * STARFORGED COMPANION
 * tests/unit/combatMoveNeedsAFight.test.js
 *
 * Overhaul 4, "moves as contracts" (D6) — a combat move needs a fight, and
 * only Enter the Fray's commit begins one. Found on the way: a Strike, a
 * Clash or a Gain Ground's "Mark progress" with no fight open made a combat
 * track (combat.js applyCombatProgress's create path), whose rank, vow and
 * objective were never asked — "Combat is offered, not forced" had a back
 * door. Now the move gate refuses such a move before its dice (OPEN_FIGHT —
 * its reason naming ⚔ Begin the fight while a threshold card waits, else
 * offering Enter the Fray), and a mark with no fight makes nothing.
 * (The typed and forced Strike through the chat hook: refusalToldComposition.test.js.)
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { applyCombatProgress } from "../../src/moves/combat.js";
import { readMoveSituation } from "../../src/moves/situation.js";
import { checkMove } from "../../src/moves/contracts/gate.js";

const MODULE_ID = "starforged-companion";

describe("applyCombatProgress — a move's marks never begin a fight", () => {
  const deps = (tracks = []) => ({
    listTracks: vi.fn(async () => tracks),
    createTrack: vi.fn(async (data) => ({ id: "new", ...data })),
    markProgress: vi.fn(async (id) => ({ id })),
  });

  it("no fight open, not beginning one: nothing is made and nothing marked — reason \"none\"", async () => {
    const d = deps();
    expect(await applyCombatProgress({ moveTarget: "the raider", markCount: 2 }, d)).toEqual({ track: null, created: false, marksApplied: 0, reason: "none" });
    expect(d.createTrack).not.toHaveBeenCalled();
    expect(d.markProgress).not.toHaveBeenCalled();
  });

  it("Enter the Fray's commit begins the fight (beginsFight)", async () => {
    const d = deps();
    const out = await applyCombatProgress({ moveTarget: "Raiders", markCount: 0, beginsFight: true, combatRank: "formidable" }, d);
    expect(out).toMatchObject({ created: true, track: { label: "Raiders", type: "combat" } });
    expect(d.createTrack).toHaveBeenCalledTimes(1);
  });

  it("control: with the fight open, a mark lands on it", async () => {
    const d = deps([{ id: "f1", type: "combat", label: "Raiders", completed: false }]);
    expect(await applyCombatProgress({ moveTarget: null, markCount: 2 }, d)).toMatchObject({ created: false, marksApplied: 2, track: { id: "f1" } });
  });

  it("several open and none named stays \"ambiguous\"; a fight named by id and over stays \"gone\"", async () => {
    const two = deps([{ id: "f1", type: "combat", label: "A", completed: false }, { id: "f2", type: "combat", label: "B", completed: false }]);
    expect((await applyCombatProgress({ markCount: 1 }, two)).reason).toBe("ambiguous");
    expect((await applyCombatProgress({ moveTargetId: "gone-id", markCount: 1 }, deps())).reason).toBe("gone");
  });
});

describe("the gate refuses a combat move with no fight, and says what begins one", () => {
  let savedMessages, savedJournal;
  beforeEach(() => {
    game.actors._reset();
    game.actors._set("pc-mira", makeTestActor({ id: "pc-mira", name: "Mira Kestrel" }));
    savedMessages = game.messages;
    savedJournal = game.journal;
    game.messages = { contents: [], get: () => null };
    // An empty Progress Tracks journal: the tracks are read, and no fight is open.
    const journal = { id: "t", name: "Starforged Progress Tracks", getFlag: () => [], setFlag: async () => {} };
    game.journal = { ...savedJournal, find: (fn) => [journal].find(fn) ?? null };
  });
  afterEach(() => { game.messages = savedMessages; game.journal = savedJournal; });

  const verdict = async (moveId) => checkMove(moveId, await readMoveSituation("pc-mira", { campaignState: {} }), { line: "I hit him." });

  it("each of the fight's moves — Enter the Fray offered", async () => {
    for (const move of ["strike", "clash", "gain_ground", "react_under_fire", "take_decisive_action", "face_defeat"]) {
      expect(await verdict(move), move).toMatchObject({ ok: false, code: "open-fight", hard: true, why: "no fight is under way", offer: "enter_the_fray" });
    }
  });

  it("while Enter the Fray's threshold card waits for the roller, the reason names its button and nothing else is offered", async () => {
    game.messages.contents.push({ id: "card", flags: { [MODULE_ID]: { combatThresholdCard: true, resolutionId: "r1", label: "Raiders", actorId: "pc-mira" } } });
    const v = await verdict("strike");
    expect(v).toMatchObject({ ok: false, code: "open-fight", offer: null });
    expect(v.why).toBe("the fight is offered, not begun — Mira Kestrel has not pressed ⚔ Begin the fight on its card");
    // A card already answered waits for nobody.
    game.messages.contents[0].flags[MODULE_ID].thresholdTaken = "wayOut";
    expect((await verdict("strike")).offer).toBe("enter_the_fray");
  });

  it("Enter the Fray itself is made", async () => {
    expect(await verdict("enter_the_fray")).toMatchObject({ ok: true });
  });
});

/**
 * STARFORGED COMPANION
 * tests/unit/moveGate.test.js
 *
 * Overhaul 4, "moves as contracts" — the gate (contracts/gate.js checkMove)
 * over every precondition the table names, against situations read by the
 * real reader (situation.js readMoveSituation) from makeTestActor sheets, NPC
 * cards from the fixture's writer and progress tracks written by the real
 * store (ui/progressTracks.js addProgressTrack) — rules/reachability.md §3:
 * fixture state from the real producer.
 *
 * The rules every predicate keeps: an unknown holds (a list not read, a
 * situation with nothing in it); soft ones are not applied in a fight and a
 * GM's override passes them (with the note the move card carries); a hard
 * one is never overridden; a reader-settled one refuses only an offer re-made
 * after a reading of no move.
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { readMoveSituation } from "../../src/moves/situation.js";
import { checkMove, refusalOf } from "../../src/moves/contracts/gate.js";
import { refusalNote } from "../../src/moves/contracts/obligations.js";
import { addProgressTrack, completeProgressTrack, setCombatTrackPosition } from "../../src/ui/progressTracks.js";
import { addConnectionEntity, addLocationEntity } from "../helpers/fullStateFixture.js";

const MODULE_ID = "starforged-companion";

let journal, savedJournal, savedMessages;

/** The "Starforged Progress Tracks" journal: a flag store, as the real store writes it. */
function tracksJournal() {
  const flags = {};
  return {
    id: "gate-tracks", name: "Starforged Progress Tracks",
    getFlag: (mod, key) => flags[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { flags[`${mod}.${key}`] = structuredClone(value); },
  };
}

const vowItem = (id, name, { ticks = 8, completed = false, forsaken = false } = {}) => ({
  id, name, type: "progress", system: { subtype: "vow", rank: 2, progress: ticks, completed },
  flags: { [MODULE_ID]: { vowId: `vow-${id}`, ...(forsaken ? { forsaken: true } : {}) } },
});
const bondItem = (id, name, connectionId, { ticks = 8, completed = false, lost = false } = {}) => ({
  id, name, type: "progress", system: { subtype: "bond", rank: 2, progress: ticks, completed },
  flags: { [MODULE_ID]: { connectionId, ...(lost ? { lost: true } : {}) } },
});
const companion = (id, name, health = 5) => ({ id, name, type: "asset", system: { category: "Companion", track: { enabled: true, name: "Health", value: health, min: 0, max: 5 } } });

/** Mira at full health, spirit and supply, nothing marked — unless said otherwise. */
function mira({ system = {}, items = [] } = {}) {
  const pc = makeTestActor({ id: "pc-mira", name: "Mira Kestrel", system: { supply: { value: 5 }, ...system }, items: { contents: items } });
  game.actors._set(pc.id, pc);
  return pc;
}
function ash(system = {}) {
  const pc = makeTestActor({ id: "pc-ash", name: "Ash", system: { supply: { value: 5 }, ...system } });
  game.actors._set(pc.id, pc);
  return pc;
}

const situationOf = (actor, campaignState = {}) => readMoveSituation(actor, { campaignState });
const check = async (moveId, actor, reading = {}, opts = {}, campaignState = {}) =>
  checkMove(moveId, await situationOf(actor, campaignState), reading, opts);

beforeEach(() => {
  game.settings._store.clear();
  game.actors._reset();
  global.game.user = { id: "gm-1", isGM: true };
  journal = tracksJournal();
  savedJournal = game.journal;
  game.journal = { ...savedJournal, find: (fn) => [journal].find(fn) ?? null, get: (id) => (id === journal.id ? journal : null) };
  savedMessages = game.messages;
  game.messages = { contents: [], get: () => null };
});
afterEach(() => {
  game.journal = savedJournal;
  game.messages = savedMessages;
});

// ─────────────────────────────────────────────────────────────────────────────

describe("the situation the gate reads", () => {
  it("reads the sheet live, the people, the open tracks, the offered fights, the site", async () => {
    const tamsin = addConnectionEntity(null, { name: "Tamsin Vey" });
    const pc = mira({ items: [vowItem("v1", "Find the raiders"), bondItem("b1", "Tamsin Vey", tamsin.internalId, { ticks: 40 }), companion("c1", "Glowcat", 3)] });
    ash({ health: { value: 2 } });
    const fight = await addProgressTrack({ label: "The boarders", type: "combat", rank: "dangerous" });
    game.messages.contents.push({ id: "card-1", flags: { [MODULE_ID]: { combatThresholdCard: true, resolutionId: "r1", label: "Raiders", actorId: "pc-mira" } } });
    const s = await situationOf(pc, { connectionIds: [tamsin.journalId] });
    expect(s.roller).toMatchObject({ actorId: "pc-mira", name: "Mira Kestrel", meters: { health: 5, spirit: 5, supply: 5 } });
    expect(s.roller.impacts.wounded).toBe(false);
    expect(s.roller.vows).toEqual([expect.objectContaining({ itemId: "v1", name: "Find the raiders", completed: false, ticks: 8 })]);
    // The bond Item finds its person's NPC card by the record's id.
    expect(s.roller.connections).toEqual([expect.objectContaining({ hostId: tamsin.journalId, connectionId: tamsin.internalId, name: "Tamsin Vey", full: true, bonded: false })]);
    expect(s.roller.companions).toEqual([expect.objectContaining({ itemId: "c1", name: "Glowcat", health: 3, max: 5 })]);
    expect(s.party).toEqual([expect.objectContaining({ actorId: "pc-ash", name: "Ash" })]);
    expect(s.party[0].meters.health).toBe(2);
    expect(s.people).toEqual([{ hostId: tamsin.journalId, connectionId: tamsin.internalId, name: "Tamsin Vey" }]);
    expect(s.tracks.fights).toEqual([expect.objectContaining({ id: fight.id, label: "The boarders" })]);
    expect(s.tracks.fightsOffered).toEqual([expect.objectContaining({ resolutionId: "r1", label: "Raiders", actorId: "pc-mira" })]);
    expect(s.scene.combatActive).toBe(true);
    expect(s.table.pcCount).toBe(2);
  });

  it("a sheet edited a moment ago is what it says — not the cached snapshot", async () => {
    const pc = mira();
    pc.system.health.value = 2;
    expect((await situationOf(pc)).roller.meters.health).toBe(2);
  });

  it("never throws: no actor is no roller, tracks that cannot be read are unknown", async () => {
    const s = await readMoveSituation(null, {});
    expect(s.roller).toBeNull();
    game.journal = { ...game.journal, find: () => { throw new Error("journal gone"); } };
    silenceConsoleErrors();
    const t = await situationOf(mira());
    expect(t.tracks).toBeNull();
    expect(t.scene.combatActive).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("fights (D6 — a combat move needs a fight; only Enter the Fray begins one)", () => {
  it("a Strike with no fight is refused outright, with Enter the Fray offered", async () => {
    const v = await check("strike", mira(), { line: "I open fire." });
    expect(v).toMatchObject({ ok: false, code: "open-fight", hard: true, why: "no fight is under way", offer: "enter_the_fray" });
    expect(v.premise.claim).toBe("a fight under way");
    expect(refusalNote(v)).toBe("No Strike — no fight is under way.");
  });

  it("with the fight offered and not begun, the reason names its button, and nothing else is offered", async () => {
    game.messages.contents.push({ id: "card-1", flags: { [MODULE_ID]: { combatThresholdCard: true, resolutionId: "r1", actorId: "pc-mira" } } });
    const v = await check("clash", mira());
    expect(v).toMatchObject({ ok: false, code: "open-fight", offer: null });
    expect(v.why).toMatch(/offered, not begun — Mira Kestrel has not pressed ⚔ Begin the fight on its card/);
  });

  it("a fight under way: the move is made; one named by id and finished since is refused", async () => {
    const fight = await addProgressTrack({ label: "The boarders", type: "combat", rank: "dangerous" });
    expect(await check("strike", mira())).toMatchObject({ ok: true, instead: null });
    await completeProgressTrack(fight.id);
    const v = await check("take_decisive_action", mira(), { targetId: fight.id, target: "The boarders" });
    expect(v).toMatchObject({ ok: false, code: "open-fight", why: '"The boarders" was finished or deleted before the roll', offer: null });
  });

  it("a Strike in a bad spot is made as a Clash; a Clash in control as a Strike — a reroute, never a refusal", async () => {
    const fight = await addProgressTrack({ label: "The boarders", type: "combat", rank: "dangerous" });
    await setCombatTrackPosition(fight.id, "bad_spot", "pc-mira");
    expect(await check("strike", mira())).toMatchObject({ ok: true, instead: "clash" });
    expect(await check("gain_ground", mira())).toMatchObject({ ok: true, instead: "react_under_fire" });
    expect(await check("clash", mira())).toMatchObject({ ok: true, instead: null });
    await setCombatTrackPosition(fight.id, "in_control", "pc-mira");
    expect(await check("clash", mira())).toMatchObject({ ok: true, instead: "strike" });
  });

  it("Battle in a blur needs no fight; one named by id that is over is refused", async () => {
    expect(await check("battle", mira())).toMatchObject({ ok: true });
    const fight = await addProgressTrack({ label: "Skirmish", type: "combat", rank: "dangerous" });
    await completeProgressTrack(fight.id);
    expect(await check("battle", mira(), { targetId: fight.id })).toMatchObject({ ok: false, code: "open-track-combat-named" });
  });

  it("Enter the Fray needs nothing", async () => {
    expect(await check("enter_the_fray", mira())).toMatchObject({ ok: true });
  });
});

describe("expeditions and the waypoint (D6)", () => {
  it("Explore a Waypoint with no expedition and no site is refused, Undertake an Expedition offered", async () => {
    expect(await check("explore_a_waypoint", mira(), {}, {}, { currentLocationType: "star" })).toMatchObject({
      ok: false, code: "expedition-or-site", hard: true, offer: "undertake_an_expedition" });
  });

  it("with an expedition under way, or the crew inside a vault, it is made", async () => {
    const vault = addLocationEntity(null, { name: "The Sunken Vault", type: "vault" });
    expect(await check("explore_a_waypoint", mira(), {}, {}, { currentLocationType: "location", currentLocationId: vault.journalId })).toMatchObject({ ok: true });
    await addProgressTrack({ label: "To the Drift", type: "expedition", rank: "dangerous" });
    expect(await check("explore_a_waypoint", mira(), {}, {}, {})).toMatchObject({ ok: true });
  });

  it("Finish an Expedition with none open is refused; a discovery not from a waypoint is refused soft", async () => {
    expect(await check("finish_an_expedition", mira())).toMatchObject({ ok: false, code: "open-track-expedition", offer: "undertake_an_expedition" });
    const typed = await check("make_a_discovery", mira());
    expect(typed).toMatchObject({ ok: false, code: "from-a-waypoint", hard: false });
    expect(await check("make_a_discovery", mira(), { fromWaypoint: true })).toMatchObject({ ok: true });
  });
});

describe("vows", () => {
  it("Fulfill / Forsake / Reach a Milestone with no open vow are refused", async () => {
    for (const move of ["fulfill_your_vow", "forsake_your_vow", "reach_a_milestone"]) {
      expect(await check(move, mira()), move).toMatchObject({ ok: false, hard: true, why: "Mira Kestrel has no open vow" });
    }
  });

  it("a vow named by id that is fulfilled, or was forsaken, says so", async () => {
    const pc = mira({ items: [vowItem("v1", "Find the raiders", { completed: true }), vowItem("v2", "Avenge Kira", { completed: true, forsaken: true }), vowItem("v3", "Open one")] });
    expect((await check("fulfill_your_vow", pc, { targetId: "v1" })).why).toBe('"Find the raiders" is fulfilled');
    expect((await check("forsake_your_vow", pc, { targetId: "v2" })).why).toBe('"Avenge Kira" was forsaken');
    expect(await check("fulfill_your_vow", pc, { targetId: "v3" })).toMatchObject({ ok: true });
  });

  it("a vow picked by id and deleted before the roll is on no sheet: refused, said so (the track-gone guard it replaces)", async () => {
    const pc = mira({ items: [vowItem("v3", "Open one")] });
    const v = await check("fulfill_your_vow", pc, { targetId: "v-gone", target: "Rescue Dani" });
    expect(v).toMatchObject({ ok: false, code: "open-vow", hard: true });
    expect(v.why).toBe('"Rescue Dani" was deleted before the roll');
    // A crewmate's copy, by id, is a vow on a sheet: made.
    const ash = makeTestActor({ id: "pc-ash", name: "Ash", type: "character", hasPlayerOwner: true, items: { contents: [vowItem("va", "Ash's")] } });
    game.actors._set(ash.id, ash);
    expect(await check("fulfill_your_vow", game.actors.get("pc-mira"), { targetId: "va" })).toMatchObject({ ok: true });
  });

  it("a Forsake Your Vow names the roller's own vow — a crewmate's, by id, is none of theirs", async () => {
    mira({ items: [vowItem("v1", "Mine")] });
    const other = makeTestActor({ id: "pc-ash", name: "Ash", items: { contents: [vowItem("va", "Ash's")] } });
    game.actors._set(other.id, other);
    expect(await check("forsake_your_vow", game.actors.get("pc-mira"), { targetId: "va" })).toMatchObject({ ok: false, code: "open-vow-own" });
    // A Fulfill Your Vow of a roller holding none may act on the table's.
    const holdsNone = makeTestActor({ id: "pc-kira", name: "Kira", items: { contents: [] } });
    game.actors._set(holdsNone.id, holdsNone);
    expect(await check("fulfill_your_vow", holdsNone)).toMatchObject({ ok: true });
  });

  it("Reach a Milestone on a full vow is refused soft, Fulfill Your Vow offered", async () => {
    const v = await check("reach_a_milestone", mira({ items: [vowItem("v1", "Find the raiders", { ticks: 40 })] }));
    expect(v).toMatchObject({ ok: false, code: "room-on-vow", hard: false, offer: "fulfill_your_vow" });
    expect(v.why).toBe('"Find the raiders" is full — it is ready to be fulfilled');
  });
});

describe("connections — a bond Item on the roller's sheet; an NPC card is a person", () => {
  let tamsin, vance;
  beforeEach(() => {
    tamsin = addConnectionEntity(null, { name: "Tamsin Vey" });
    vance = addConnectionEntity(null, { name: "Vance Okoro" });
  });
  const cs = () => ({ connectionIds: [tamsin.journalId, vance.journalId] });

  it("Develop Your Relationship with a person who is no connection of the roller's is refused, Make a Connection offered", async () => {
    const pc = mira({ items: [bondItem("b1", "Tamsin Vey", tamsin.internalId)] });
    const v = await check("develop_your_relationship", pc, { target: "Vance" }, {}, cs());
    expect(v).toMatchObject({ ok: false, code: "their-connection", hard: true, why: "Vance is not Mira Kestrel's connection", offer: "make_a_connection" });
    // By the picker's host id too.
    expect(await check("test_your_relationship", pc, { targetId: vance.journalId }, {}, cs())).toMatchObject({ ok: false, code: "their-connection" });
    expect(await check("develop_your_relationship", pc, { target: "Tamsin" }, {}, cs())).toMatchObject({ ok: true });
    expect(await check("develop_your_relationship", pc, { targetId: tamsin.journalId }, {}, cs())).toMatchObject({ ok: true });
  });

  it("a severed connection is none; no connection at all is told so", async () => {
    const pc = mira({ items: [bondItem("b1", "Tamsin Vey", tamsin.internalId, { lost: true })] });
    expect((await check("develop_your_relationship", pc, {}, {}, cs())).why).toBe("Mira Kestrel has no connection");
  });

  it("a full relationship track: Develop is refused soft, Forge a Bond offered; bonded, Develop rolls +rank", async () => {
    const full = mira({ items: [bondItem("b1", "Tamsin Vey", tamsin.internalId, { ticks: 40 })] });
    const v = await check("develop_your_relationship", full, { target: "Tamsin Vey" }, {}, cs());
    expect(v).toMatchObject({ ok: false, code: "room-on-relationship", hard: false, offer: "forge_a_bond" });
    expect(v.why).toBe("Tamsin Vey's relationship with Mira Kestrel is full — a bond is ready to be forged");
    const bonded = mira({ items: [bondItem("b1", "Tamsin Vey", tamsin.internalId, { ticks: 40, completed: true })] });
    expect(await check("develop_your_relationship", bonded, { target: "Tamsin Vey" }, {}, cs())).toMatchObject({ ok: true });
    // …and a forge on a bond already forged has nothing to forge.
    expect(await check("forge_a_bond", bonded, { target: "Tamsin Vey" }, {}, cs())).toMatchObject({
      ok: false, code: "not-bonded", hard: true, offer: "develop_your_relationship", why: "Tamsin Vey is already bonded — there is no bond to forge" });
  });

  it("Make a Connection with someone already the roller's is refused soft; a new person is made", async () => {
    const pc = mira({ items: [bondItem("b1", "Tamsin Vey", tamsin.internalId)] });
    expect(await check("make_a_connection", pc, { target: "Tamsin Vey" }, {}, cs())).toMatchObject({
      ok: false, code: "not-yet-their-connection", hard: false, offer: "develop_your_relationship" });
    expect(await check("make_a_connection", pc, { target: "Vance Okoro" }, {}, cs())).toMatchObject({ ok: true });
  });

  it("a social move spoken to a fellow player character is roleplay — refused outright", async () => {
    mira();
    ash();
    const v = await check("compel", game.actors.get("pc-mira"), { line: "Ash, open the hatch or I will." }, {}, cs());
    expect(v).toMatchObject({ ok: false, code: "not-at-a-pc", hard: true });
    expect(v.why).toMatch(/spoken to a fellow player character/);
    // A line naming an NPC is that NPC's Compel.
    expect(await check("compel", game.actors.get("pc-mira"), { line: "Vance, tell Ash what you told me." }, {}, cs())).toMatchObject({ ok: true });
  });
});

describe("the table and the sheet's assets", () => {
  it("Aid Your Ally needs another player character", async () => {
    expect(await check("aid_your_ally", mira())).toMatchObject({ ok: false, code: "an-ally", hard: true });
    ash();
    expect(await check("aid_your_ally", game.actors.get("pc-mira"))).toMatchObject({ ok: true });
  });

  it("Withstand Damage needs a vehicle, Companion Takes a Hit a companion", async () => {
    expect(await check("withstand_damage", mira())).toMatchObject({ ok: false, code: "a-vehicle" });
    expect(await check("companion_takes_a_hit", mira())).toMatchObject({ ok: false, code: "a-companion" });
    expect(await check("companion_takes_a_hit", mira({ items: [companion("c1", "Glowcat")] }))).toMatchObject({ ok: true });
  });
});

describe("recovery — the sheet's word, soft (D2)", () => {
  it("Heal with nobody hurt is refused, told why; a wound marked or health down is something", async () => {
    const v = await check("heal", mira());
    expect(v).toMatchObject({ ok: false, code: "recoverable-health", hard: false, offer: null });
    expect(refusalNote(v)).toBe("No Heal — nothing to heal: Mira Kestrel's health is 5 of 5 and no wound is marked.");
    expect(v.premise).toEqual({ claim: "a wound to treat", never: "a cut, a gash, blood or a dressing on them" });
    expect(await check("heal", mira({ system: { health: { value: 3 } } }))).toMatchObject({ ok: true });
    expect(await check("heal", mira({ system: { debility: { wounded: true } } }))).toMatchObject({ ok: true });
  });

  it("Heal is for its patient: an ally hurt, a companion hurt; with no patient named, anyone the party could treat", async () => {
    mira();
    ash({ health: { value: 2 } });
    const roller = game.actors.get("pc-mira");
    expect(await check("heal", roller, { patient: { actorId: "pc-ash" } })).toMatchObject({ ok: true });
    expect(await check("heal", roller, { patient: { self: true } })).toMatchObject({ ok: false, code: "recoverable-health" });
    expect(await check("heal", roller)).toMatchObject({ ok: true });
    game.actors._reset();
    const withCat = mira({ items: [companion("c1", "Glowcat", 2)] });
    expect(await check("heal", withCat, { patient: { companionItemId: "c1" } })).toMatchObject({ ok: true });
  });

  it("Hearten at full spirit, not shaken, is refused; Sojourn with nothing anyone could recover is refused", async () => {
    expect((await check("hearten", mira())).why).toBe("nothing to ease: Mira Kestrel's spirit is 5 of 5 and Mira Kestrel is not shaken");
    expect(await check("sojourn", mira())).toMatchObject({ ok: false, code: "party-has-something-to-recover" });
    expect(await check("sojourn", mira({ system: { spirit: { value: 3 } } }))).toMatchObject({ ok: true });
  });

  it("Resupply and Repair are the reader's where the sheet cannot see: refused only for an offer re-made after a reading of no move", async () => {
    expect(await check("resupply", mira())).toMatchObject({ ok: true });
    expect(await check("resupply", mira(), { readAsNoMove: true })).toMatchObject({ ok: false, code: "recoverable-supply" });
  });

  it("soft refusals are not applied in a fight, and a GM's override passes them with the move card's note — never a hard one", async () => {
    expect(await check("heal", mira(), {}, { override: true })).toMatchObject({
      ok: true, note: "rolled at the GM's word: nothing to heal: Mira Kestrel's health is 5 of 5 and no wound is marked" });
    expect(await check("strike", mira(), {}, { override: true })).toMatchObject({ ok: false, code: "open-fight" });
    await addProgressTrack({ label: "The boarders", type: "combat", rank: "dangerous" });
    expect(await check("heal", mira())).toMatchObject({ ok: true, note: null });
  });
});

describe("the gate's own rules", () => {
  it("an unknown is never a refusal: no situation, tracks that cannot be read", async () => {
    expect(checkMove("strike", null, {})).toMatchObject({ ok: true });
    game.journal = { ...game.journal, find: () => { throw new Error("journal gone"); } };
    silenceConsoleErrors();
    expect(await check("strike", mira())).toMatchObject({ ok: true });
  });

  it("the safety tools, the oracle and the price are never gated; the table's moves pass", async () => {
    for (const move of ["set_a_flag", "change_your_fate", "take_a_break", "ask_the_oracle", "pay_the_price", "begin_a_session", "earn_experience"]) {
      expect(await check(move, mira()), move).toMatchObject({ ok: true });
    }
  });

  it("a scene-challenge move with no challenge open is made as the ordinary move it varies", async () => {
    expect(await check("face_danger_scene_challenge", mira())).toMatchObject({ ok: true, instead: "face_danger" });
  });

  it("Continue a Legacy names its track at the roll — readMove asks which first", async () => {
    expect(await check("continue_a_legacy", mira(), {}, { stage: "read" })).toMatchObject({ ok: true });
    expect(await check("continue_a_legacy", mira(), {}, { stage: "roll" })).toMatchObject({ ok: false, code: "legacy-track-named" });
    expect(await check("continue_a_legacy", mira(), { target: "bonds" }, { stage: "roll" })).toMatchObject({ ok: true });
  });

  it("refusalOf keeps the verdict's words as plain JSON", async () => {
    const v = await check("strike", mira());
    expect(JSON.parse(JSON.stringify(refusalOf(v)))).toEqual({
      moveId: "strike", code: "open-fight", hard: true, why: "no fight is under way",
      premise: { claim: "a fight under way", never: "a blow struck, a shot fired or a foe engaged in a fight" }, offer: "enter_the_fray" });
    expect(refusalOf({ ok: true })).toBeNull();
  });
});

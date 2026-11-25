/**
 * STARFORGED COMPANION
 * tests/unit/statedMissNamesItsTarget.test.js
 *
 * Issue #364 STATED-TARGET-NOT-SHOWN.
 *
 * A miss stated before the roll may cost a vehicle or a companion: "The
 * bike's frame cracks (Withstand Damage −1)". Since issue #364
 * ACTION-STAT-VEHICLE-PRICE-NO-TARGET the interpreter names which one
 * (`stakes.missSuffer.target`) and the price lands on that asset of the
 * roller's — but the Confirm Move dialog, and a Batch Mode round's reading,
 * still showed only "Withstand Damage −1": with a starship in orbit and a
 * hoverbike under them, the player could not tell which the miss would damage.
 *
 * The stakes now name it where they are shown — "Withstand Damage −1 ·
 * Hoverbike" — resolved before the dialog opens (statEnrichment.js
 * nameStatedSufferTarget), and only when the price will land there: a name
 * that matches none of the roller's assets, or several, shows nothing (the
 * price then lands on the command vehicle or the first companion, as it
 * always did), and so does a move that may be rolled for a vehicle or
 * companion of its own, which takes the price first (issue #362 D11).
 *
 * The composition runs a player's typed line through the GM's real pipeline
 * on a booted table (tests/helpers/multiClient.js): the interpreter is the
 * real one, its Claude reply — the stakes, with their target — scripted at
 * the fetch boundary; the Confirm dialog is replaced by a recorder of the
 * stakes it was handed, which the dialog's own renderer then renders; the
 * dice are scripted inside the real resolveMove.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], confirmed: [] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/entities/entityExtractor.js", async (original) => ({
  ...(await original()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()),
  confirmInterpretation: vi.fn(async (interp) => {
    control.confirmed.push(JSON.parse(JSON.stringify(interp.stakes ?? null)));
    return true;
  }),
}));
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const n of control.dice) rng.mockReturnValueOnce(n);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { stakesShown, sufferRouteLabel, statedTargetLands } from "../../src/moves/stakes.js";
import { obligationsFor } from "../../src/moves/contracts/obligations.js";
// The STAKES / PRICE / COST / FIGHT blocks are lines of the narration's one
// obligations block now (overhaul 4, slice 2 — contracts/obligations.js, their
// words kept): each stand-in below is that line, tagged, as the block carries it.
const lineFor = (kind, resolution) => { const o = obligationsFor({ mode: "move", resolution }).find(x => x.kind === kind); return o ? `- [${o.kind}] ${o.text}` : ""; };
const formatStakesBlock = (stakes, outcome, extra = {}) => lineFor("stakes", { stakes, outcome, ...extra });
import { nameStatedSufferTarget } from "../../src/moves/statEnrichment.js";

const isInterpreter = (call) => /You are the move interpreter/.test(call.system ?? "");
const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — a miss (momentum 2 cannot burn it)
const MISS_LINE = "The bike's frame cracks against the far lip of the gap.";
const NARRATION = 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

/** A vendor-shaped asset with a condition track, written by its own update(). */
function asset(id, name, category, trackName, value, extra = {}) {
  const item = { id, name, type: "asset",
    system: { category, abilities: [], track: { enabled: true, name: trackName, value, min: 0, max: 5 }, ...extra },
    update: async (changes) => { if ("system.track.value" in changes) item.system.track.value = changes["system.track.value"]; } };
  return item;
}

let table, ship;
const world         = () => table.world.campaignState();
const shipIntegrity = () => ship.flags[MODULE_ID].ship.integrity;
/** What the dialog showed under "On a miss" (its renderer's own input — stakes.js stakesShown). */
const missShown     = (stakes) => stakesShown(stakes).find(s => s.kind === "miss") ?? null;
/** The dialog's own "At stake" block for those stakes (settingsPanel.js renderStakesBlock). */
async function dialogBlock(stakes) {
  const { renderStakesBlock } = await table.client("gm-1").import("../../src/ui/settingsPanel.js");
  return renderStakesBlock(stakes);
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.dice = MISS;
  control.confirmed.length = 0;
  await table.reset({ world: { settings: { chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: "stn-s1", sessionNumber: 2, currentSceneId: "stn-scene", sceneTruths: [], clocks: [],
  } } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  // The command starship, in orbit, at full integrity.
  ship = table.addActor({ id: "ship-savela", name: "ISV Savela", type: "starship", system: { debility: {} },
    flags: { [MODULE_ID]: { entityType: "ship",
      ship: { _id: "ship-rec", name: "ISV Savela", isCommandVehicle: true, integrity: 5, integrityMax: 5, battered: false } } } });
  await table.client("gm-1").run(() => game.settings.set(MODULE_ID, "campaignState", { ...world(), shipIds: [ship.id] }));
  silenceConsoleErrors();
});

/** The interpreter's reply for the next lines: Face Danger +edge, with these stakes. */
function readAs(reading) {
  scriptClaude(table, { fallback: () => NARRATION }).when(isInterpreter, JSON.stringify({
    moveId: "face_danger", moveName: "Face Danger", statUsed: "edge", confidence: "high", rationale: "A risky jump.", ...reading,
  }), { times: 5 });
}
/** A typed line, read by the real interpreter (its reply scripted), confirmed and rolled to a miss. */
async function typedMiss(pc, line, reading) {
  readAs(reading);
  await table.client("pl-1").chat(line, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
}
const stakesOf = (missSuffer, miss = MISS_LINE) => ({ hit: "You land clean on the far side.", miss, missSuffer });

describe("the Confirm Move dialog names the vehicle or companion a stated miss damages (issue #364 STATED-TARGET-NOT-SHOWN)", () => {
  it("Face Danger +edge on the hoverbike: the dialog says the Hoverbike takes it — and on the miss it does", async () => {
    const bike = asset("bike-1", "Hoverbike", "Support Vehicle", "Integrity", 3);
    const kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { edge: 2 }, items: { contents: [bike] } });
    await typedMiss(kira, "I gun the hoverbike across the gap.", {
      stakes: stakesOf({ move: "withstand_damage", amount: 1, target: "the hoverbike" }) });

    expect(control.confirmed).toHaveLength(1);
    expect(missShown(control.confirmed[0])).toMatchObject({ text: MISS_LINE, cost: "Withstand Damage −1 · Hoverbike" });
    expect(await dialogBlock(control.confirmed[0])).toContain('<span class="confirm-stake-cost">(Withstand Damage −1 · Hoverbike)</span>');
    // What the dialog promised is what the miss did.
    expect(bike.system.track.value).toBe(2);
    expect(shipIntegrity()).toBe(5);
    // The narrator is told what the player saw.
    const narration = table.claude.calls.filter(c => /\[stakes\] The player saw these before rolling:/.test(c.userText ?? "")).at(-1);
    expect(narration.userText).toContain(`- On a miss: ${MISS_LINE} (Withstand Damage −1 · Hoverbike)`);
  }, 60_000);

  it("a companion is named as its cards name it — the name its player gave it, then its kind", async () => {
    const rock = asset("c-rockhorn", "Rockhorn", "Companion", "Health", 4);
    const glow = asset("c-glowcat", "Glowcat", "Companion", "Health", 3, { fields: [{ name: "Name", value: "Ember" }] });
    const kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { edge: 2 }, items: { contents: [rock, glow] } });
    await typedMiss(kira, "Ember and I dash through the closing blast door.", {
      stakes: stakesOf({ move: "companion_takes_a_hit", amount: 1, target: "Ember" }, "The door clips Ember as it slams shut.") });

    expect(missShown(control.confirmed[0]).cost).toBe("Companion Takes a Hit −1 · Ember (Glowcat)");
    expect({ rock: rock.system.track.value, glow: glow.system.track.value }).toEqual({ rock: 4, glow: 2 });
  }, 60_000);

  it("a name that matches none of the roller's assets shows nothing: the dialog does not promise the hoverbike", async () => {
    const bike = asset("bike-1", "Hoverbike", "Support Vehicle", "Integrity", 3);
    const kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { edge: 2 }, items: { contents: [bike] } });
    await typedMiss(kira, "I bring the Savela in low under the guns.", {
      stakes: stakesOf({ move: "withstand_damage", amount: 1, target: "ISV Savela" }, "A burst rakes the hull above the stowed hoverbike.") });

    expect(missShown(control.confirmed[0]).cost).toBe("Withstand Damage −1");
    expect(await dialogBlock(control.confirmed[0])).toContain('<span class="confirm-stake-cost">(Withstand Damage −1)</span>');
    // It lands where an unnamed one always did: the command vehicle.
    expect(bike.system.track.value).toBe(3);
    expect(shipIntegrity()).toBe(4);
  }, 60_000);

  it("a name that matches two of them shows nothing either", async () => {
    const bike  = asset("bike-1", "Hoverbike", "Support Vehicle", "Integrity", 3);
    const rover = asset("rover-1", "Rover", "Support Vehicle", "Integrity", 4);
    const kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { edge: 2 }, items: { contents: [bike, rover] } });
    await typedMiss(kira, "I slew the convoy around the crater.", {
      stakes: stakesOf({ move: "withstand_damage", amount: 1, target: "the Hoverbike and the Rover" }, "The convoy scrapes the crater wall.") });

    expect(missShown(control.confirmed[0]).cost).toBe("Withstand Damage −1");
    expect({ bike: bike.system.track.value, rover: rover.system.track.value }).toEqual({ bike: 3, rover: 4 });
    expect(shipIntegrity()).toBe(4);
  }, 60_000);

  it("a Batch Mode round's reading names it too", async () => {
    const bike = asset("bike-1", "Hoverbike", "Support Vehicle", "Integrity", 3);
    table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { edge: 2 }, items: { contents: [bike] } });
    readAs({ stakes: stakesOf({ move: "withstand_damage", amount: 1, target: "Hoverbike" }) });
    await table.client("gm-1").setSetting("batchMode.enabled", true);
    await table.settle();
    const round = () => table.world.getSetting("batchMode.round");
    const pl = table.client("pl-1");
    const gmRelay = await pl.import("../../src/multiplayer/gmRelay.js");
    await pl.run(() => gmRelay.requestGmAction("batch.submit", { roundId: round().id, text: "I gun the hoverbike across the gap.", submissionId: "k1" }));
    await table.settle(); await table.drain();

    const reading = round().entries["pl-1"].reading;
    expect(reading, "the round read the line").toMatchObject({ moveId: "face_danger" });
    expect(missShown(reading.stakes)).toMatchObject({ text: MISS_LINE, cost: "Withstand Damage −1 · Hoverbike" });
    expect(await dialogBlock(reading.stakes)).toContain("(Withstand Damage −1 · Hoverbike)");
  }, 60_000);
});

describe("naming a stated miss's target — the pieces (issue #364 STATED-TARGET-NOT-SHOWN)", () => {
  const bike  = asset("bike-1", "Hoverbike", "Support Vehicle", "Integrity", 3);
  const rover = asset("rover-1", "Rover", "Support Vehicle", "Integrity", 4);
  const rock  = asset("c-rockhorn", "Rockhorn", "Companion", "Health", 4);
  const glow  = asset("c-glowcat", "Glowcat", "Companion", "Health", 3, { fields: [{ name: "Name", value: "Ember" }] });
  const pc = { id: "pc-1", name: "Kira", type: "character", system: {}, items: { contents: [bike, rover, rock, glow] } };
  const interp = (missSuffer, extra = {}) => ({ moveId: "face_danger", statUsed: "edge",
    stakes: { hit: "h", miss: "m", missSuffer, priceStated: true }, ...extra });
  const DAMAGE = { move: "withstand_damage", amount: 1, target: "the hoverbike" };
  const HIT    = { move: "companion_takes_a_hit", amount: 2, target: "Ember" };

  it("the label names the target of a vehicle's or companion's suffer move, and of no other", () => {
    expect(sufferRouteLabel({ move: "withstand_damage", amount: 1, targetName: "Hoverbike" })).toBe("Withstand Damage −1 · Hoverbike");
    expect(sufferRouteLabel({ move: "companion_takes_a_hit", amount: 2, targetName: "Ember (Glowcat)" })).toBe("Companion Takes a Hit −2 · Ember (Glowcat)");
    expect(sufferRouteLabel({ move: "withstand_damage", amount: 1 })).toBe("Withstand Damage −1");
    // The interpreter's own word for it is not the label: only a resolved name is shown.
    expect(sufferRouteLabel({ move: "withstand_damage", amount: 1, target: "the hoverbike" })).toBe("Withstand Damage −1");
    expect(sufferRouteLabel({ move: "endure_harm", amount: 1, targetName: "Hoverbike" })).toBe("Endure Harm −1");
    for (const targetName of [null, "", "   ", 7, "x".repeat(61)]) {
      expect(sufferRouteLabel({ move: "withstand_damage", amount: 1, targetName })).toBe("Withstand Damage −1");
    }
    expect(sufferRouteLabel({ move: "withstand_damage", amount: 1, targetName: " Hover\nbike " })).toBe("Withstand Damage −1 · Hover bike");
  });

  it("nameStatedSufferTarget names the roller's own asset — and stamps no id: that is the roll's to resolve", () => {
    const i = interp(DAMAGE);
    const before = i.stakes;
    expect(nameStatedSufferTarget(pc, i)).toBe("Hoverbike");
    expect(i.stakes.missSuffer).toEqual({ ...DAMAGE, targetName: "Hoverbike" });
    expect(before.missSuffer.targetName, "the stakes it was given are not changed").toBeUndefined();
    expect(stakesShown(i.stakes).find(s => s.kind === "miss").cost).toBe("Withstand Damage −1 · Hoverbike");
    expect(formatStakesBlock(i.stakes, "miss")).toContain("- On a miss: m (Withstand Damage −1 · Hoverbike)");

    const c = interp(HIT);
    expect(nameStatedSufferTarget(pc, c)).toBe("Ember (Glowcat)");
    // A companion with no given name is its asset's.
    expect(nameStatedSufferTarget(pc, interp({ ...HIT, target: "the rockhorn" }))).toBe("Rockhorn");
  });

  it("never a guess: no target, an unknown name, several named, or the wrong kind names nothing", () => {
    for (const missSuffer of [
      { move: "withstand_damage", amount: 1 },
      { move: "withstand_damage", amount: 1, target: "ISV Savela" },
      { move: "withstand_damage", amount: 1, target: "the Hoverbike and the Rover" },
      { move: "withstand_damage", amount: 1, target: "Glowcat" },
      { move: "companion_takes_a_hit", amount: 1, target: "Hoverbike" },
      { move: "endure_harm", amount: 1, target: "Hoverbike" },
    ]) {
      const i = interp(missSuffer);
      expect(nameStatedSufferTarget(pc, i), JSON.stringify(missSuffer)).toBeNull();
      expect(i.stakes.missSuffer).toEqual(missSuffer);
    }
    expect(nameStatedSufferTarget(null, interp(DAMAGE))).toBeNull();
    expect(nameStatedSufferTarget(pc, { stakes: null })).toBeNull();
    expect(nameStatedSufferTarget(pc, { stakes: { hit: "h", miss: "m", missSuffer: null } })).toBeNull();
  });

  it("a name stamped earlier goes when the asset no longer resolves — the roll re-reads it", () => {
    const i = interp({ ...DAMAGE, targetName: "Hoverbike" });
    const without = { ...pc, items: { contents: [rover, rock, glow] } };
    expect(nameStatedSufferTarget(without, i)).toBeNull();
    expect(i.stakes.missSuffer).toEqual(DAMAGE);
    // A name the reading itself carried is never trusted: only this resolution writes it.
    const forged = interp({ move: "withstand_damage", amount: 1, target: "ISV Savela", targetName: "Hoverbike" });
    expect(nameStatedSufferTarget(pc, forged)).toBeNull();
    expect(stakesShown(forged.stakes).find(s => s.kind === "miss").cost).toBe("Withstand Damage −1");
  });

  it("a move that may be rolled for a vehicle or companion of its own names nothing: that one takes the price first (issue #362 D11)", () => {
    // Rolled +integrity: the roll's own vehicle is resolved at the roll, and the price is its.
    expect(nameStatedSufferTarget(pc, interp(DAMAGE, { statUsed: "integrity" }))).toBeNull();
    // An ability the dialog offers could swap the stat for a vehicle's integrity.
    expect(nameStatedSufferTarget(pc, interp(DAMAGE, { applicableAbilities: [{ key: "a1", statReplacement: "integrity" }] }))).toBeNull();
    // The move already names another vehicle of its own.
    expect(nameStatedSufferTarget(pc, interp(DAMAGE, { vehicleItemId: "rover-1" }))).toBeNull();
    // …or the same one: the price lands where the stakes say.
    expect(nameStatedSufferTarget(pc, interp(DAMAGE, { vehicleItemId: "bike-1" }))).toBe("Hoverbike");
    // An ability that swaps for something else changes nothing.
    expect(nameStatedSufferTarget(pc, interp(DAMAGE, { applicableAbilities: [{ key: "a2", statReplacement: "companion_health" }] }))).toBe("Hoverbike");

    expect(nameStatedSufferTarget(pc, interp(HIT, { statUsed: "companion_health" }))).toBeNull();
    expect(nameStatedSufferTarget(pc, interp(HIT, { applicableAbilities: [{ key: "a3", statReplacement: "companion_health" }] }))).toBeNull();
    expect(nameStatedSufferTarget(pc, interp(HIT, { companionItemId: "c-rockhorn" }))).toBeNull();
    expect(nameStatedSufferTarget(pc, interp(HIT, { patientCompanionItemId: "c-rockhorn" }))).toBeNull();
    // Heal's patient may be a companion, resolved at the roll.
    expect(nameStatedSufferTarget(pc, interp(HIT, { moveId: "heal", statUsed: "heart" }))).toBeNull();
    expect(nameStatedSufferTarget(pc, interp(DAMAGE, { moveId: "heal", statUsed: "heart" }))).toBe("Hoverbike");
  });

  it("statedTargetLands: only a resolved target the price's route goes to", () => {
    const stakes = (missSuffer) => ({ hit: "h", miss: "m", missSuffer, priceStated: true });
    const move = { moveId: "face_danger", statUsed: "edge" };
    expect(statedTargetLands(stakes({ ...DAMAGE, vehicleItemId: "bike-1" }), move)).toBe(true);
    expect(statedTargetLands(stakes({ ...HIT, companionItemId: "c-glowcat" }), move)).toBe(true);
    expect(statedTargetLands(stakes(DAMAGE), move), "not resolved").toBe(false);
    expect(statedTargetLands(stakes({ ...DAMAGE, companionItemId: "c-glowcat" }), move), "the wrong kind of asset").toBe(false);
    expect(statedTargetLands(stakes({ move: "endure_harm", amount: 1, vehicleItemId: "bike-1" }), move)).toBe(false);
    expect(statedTargetLands(stakes({ ...DAMAGE, vehicleItemId: "bike-1" }), { ...move, vehicleItemId: "rover-1" })).toBe(false);
    expect(statedTargetLands(stakes({ ...DAMAGE, vehicleItemId: "bike-1" }), null)).toBe(true);
    expect(statedTargetLands(null, move)).toBe(false);
  });

  it("the dialog's block escapes the name it shows", async () => {
    const block = await dialogBlock({ hit: "h", miss: "m", priceStated: true,
      missSuffer: { move: "withstand_damage", amount: 1, targetName: "R&D <Skiff>" } });
    expect(block).toContain("(Withstand Damage −1 · R&amp;D &lt;Skiff&gt;)");
  });
});

/**
 * STARFORGED COMPANION
 * tests/unit/statedSufferTargetNamed.test.js
 *
 * Issue #364 ACTION-STAT-VEHICLE-PRICE-NO-TARGET.
 *
 * A miss stated before the roll may name one suffer move it costs
 * (`stakes.missSuffer`, issue #353 R1). A stated Withstand Damage or Companion
 * Takes a Hit lands on what the move was made against (issue #362 D11): the
 * support vehicle or companion its roll was made for. A move rolled on an
 * action stat has neither — "I gun the hoverbike across the gap" is Face
 * Danger +edge — so its stated "the bike's frame cracks (Withstand Damage −1)"
 * damaged the command starship in orbit.
 *
 * The interpreter now names the vehicle or companion beside the suffer move
 * (`missSuffer.target`), as it names a move's own target; the name is matched
 * against the roller's own support vehicles and companions before the roll
 * (statEnrichment.js resolveStatedSufferTarget) and the asset's id goes on
 * the price's route. Never read off the miss line, and never a guess: a name
 * that matches none of them leaves the price where it landed before (the
 * prose fallback was issue #345 AA14's defect).
 *
 * The composition runs a player's typed line through the GM's real pipeline
 * on a booted table (tests/helpers/multiClient.js): the interpreter is the
 * real one, its Claude reply — the stakes, with their target — scripted at
 * the fetch boundary; the dice are scripted inside the real resolveMove.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], confirmed: [] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
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
import { normaliseStakes, statedPrice } from "../../src/moves/stakes.js";
import { resolveStatedSufferTarget } from "../../src/moves/statEnrichment.js";

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
const world      = () => table.world.campaignState();
const priceCards = () => table.cards(f => f.payThePriceCard);
const shipIntegrity = () => ship.flags[MODULE_ID].ship.integrity;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.dice = MISS;
  control.confirmed.length = 0;
  await table.reset({ world: { settings: { chronicleAutoEntry: false, narratorSessionSummary: false, campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: "sst-s1", sessionNumber: 2, currentSceneId: "sst-scene", sceneTruths: [], clocks: [],
  } } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  // The command starship, in orbit, at full integrity.
  ship = table.addActor({ id: "ship-savela", name: "ISV Savela", type: "starship", system: { debility: {} },
    flags: { [MODULE_ID]: { entityType: "ship",
      ship: { _id: "ship-rec", name: "ISV Savela", isCommandVehicle: true, integrity: 5, integrityMax: 5, battered: false } } } });
  await table.client("gm-1").run(() => game.settings.set(MODULE_ID, "campaignState", { ...world(), shipIds: [ship.id] }));
  silenceConsoleErrors();
});

/** A typed line, read by the real interpreter (its reply scripted), rolled to a miss. */
async function typedMiss(pc, line, reading) {
  scriptClaude(table, { fallback: () => NARRATION }).when(isInterpreter, JSON.stringify({
    moveId: "face_danger", moveName: "Face Danger", statUsed: "edge", confidence: "high", rationale: "A risky jump.", ...reading,
  }), { times: 5 });
  await table.client("pl-1").chat(line, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
}

describe("a stated vehicle price lands on the vehicle the interpreter names (issue #364 ACTION-STAT-VEHICLE-PRICE-NO-TARGET)", () => {
  it("Face Danger +edge on the hoverbike: its stated Withstand Damage damages the Hoverbike, not the starship in orbit", async () => {
    const bike = asset("bike-1", "Hoverbike", "Support Vehicle", "Integrity", 3);
    const kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { edge: 2 }, items: { contents: [bike] } });
    await typedMiss(kira, "I gun the hoverbike across the gap.", {
      stakes: { hit: "You land clean on the far side.", miss: MISS_LINE,
        missSuffer: { move: "withstand_damage", amount: 1, target: "Hoverbike" } },
    });

    // The interpreter was asked to name it, with the roller's vehicles listed.
    const reading = table.claude.calls.filter(isInterpreter).at(-1);
    expect(reading.system).toContain('also give "target"');
    expect(reading.userText).toContain(`Kira's support vehicles: "Hoverbike"`);
    // The move rolled an action stat: it has no vehicle of its own.
    expect(table.cards(f => f.moveResolution)[0].content).toContain("+edge (2)");

    expect(priceCards()).toHaveLength(1);
    expect(priceCards()[0].content).toContain(`As stated before the roll: <strong>${MISS_LINE}</strong>`);
    expect(priceCards()[0].flags[MODULE_ID].sufferRoutes).toEqual([{ move: "withstand_damage", amount: 1, vehicleItemId: "bike-1" }]);
    expect(bike.system.track.value).toBe(2);
    expect(shipIntegrity()).toBe(5);
    expect(table.cards(f => f.sufferCard && f.suffer === "withstand_damage").at(-1).content).toContain("Hoverbike: 3 → 2");
  }, 60_000);

  it("a stated Companion Takes a Hit lands on the companion named — by the name its player gave it", async () => {
    const rock = asset("c-rockhorn", "Rockhorn", "Companion", "Health", 4);
    const glow = asset("c-glowcat", "Glowcat", "Companion", "Health", 3, { fields: [{ name: "Name", value: "Ember" }] });
    const kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { edge: 2 }, items: { contents: [rock, glow] } });
    await typedMiss(kira, "Ember and I dash through the closing blast door.", {
      stakes: { hit: "You are both through.", miss: "The door clips Ember as it slams shut.",
        missSuffer: { move: "companion_takes_a_hit", amount: 1, target: "Ember" } },
    });

    expect(priceCards()).toHaveLength(1);
    expect(priceCards()[0].flags[MODULE_ID].sufferRoutes).toEqual([
      { move: "companion_takes_a_hit", amount: 1, soloFallback: "endure_harm", companionItemId: "c-glowcat" }]);
    expect({ rock: rock.system.track.value, glow: glow.system.track.value }).toEqual({ rock: 4, glow: 2 });
  }, 60_000);

  it("a target that names none of the roller's vehicles is no target: the command vehicle takes it, as an unnamed one always did", async () => {
    const bike = asset("bike-1", "Hoverbike", "Support Vehicle", "Integrity", 3);
    const kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { edge: 2 }, items: { contents: [bike] } });
    await typedMiss(kira, "I bring the Savela in low under the guns.", {
      // The miss line mentions the hoverbike; the damage is the starship's.
      stakes: { hit: "You are under their arc of fire.", miss: "A burst rakes the hull above the stowed hoverbike.",
        missSuffer: { move: "withstand_damage", amount: 1, target: "ISV Savela" } },
    });

    expect(priceCards()[0].flags[MODULE_ID].sufferRoutes).toEqual([{ move: "withstand_damage", amount: 1 }]);
    expect(bike.system.track.value).toBe(3);
    expect(shipIntegrity()).toBe(4);
  }, 60_000);
});

describe("the stated suffer move's target — the pieces (issue #364)", () => {
  const stakes = (missSuffer) => ({ hit: "h", miss: "m", missSuffer });

  it("normaliseStakes keeps a target name for Withstand Damage and Companion Takes a Hit alone", () => {
    expect(normaliseStakes(stakes({ move: "withstand_damage", amount: 1, target: "  Hoverbike \n" })).missSuffer)
      .toEqual({ move: "withstand_damage", amount: 1, target: "Hoverbike" });
    expect(normaliseStakes(stakes({ move: "companion_takes_a_hit", amount: 2, target: "Glowcat" })).missSuffer)
      .toEqual({ move: "companion_takes_a_hit", amount: 2, target: "Glowcat" });
    // No target, a null one, one that is not a name: the suffer move as before.
    for (const target of [undefined, null, "", "   ", 7, { name: "Hoverbike" }, "x".repeat(61)]) {
      expect(normaliseStakes(stakes({ move: "withstand_damage", amount: 1, target })).missSuffer).toEqual({ move: "withstand_damage", amount: 1 });
    }
    // The character's own suffer moves take none.
    expect(normaliseStakes(stakes({ move: "endure_harm", amount: 1, target: "Hoverbike" })).missSuffer).toEqual({ move: "endure_harm", amount: 1 });
  });

  const bike  = asset("bike-1", "Hoverbike", "Support Vehicle", "Integrity", 3);
  const rover = asset("rover-1", "Rover", "Support Vehicle", "Integrity", 4);
  const glow  = asset("c-glowcat", "Glowcat", "Companion", "Health", 3, { fields: [{ name: "Name", value: "Ember" }] });
  const pc = { id: "pc-1", name: "Kira", type: "character", system: {}, items: { contents: [bike, rover, glow] } };
  const interp = (missSuffer, miss = "m") => ({ moveId: "face_danger", statUsed: "edge",
    stakes: { hit: "h", miss, missSuffer, priceStated: true } });

  it("resolveStatedSufferTarget matches the name against the roller's own assets, as whole words", () => {
    const i = interp({ move: "withstand_damage", amount: 1, target: "the hoverbike" });
    const before = i.stakes;
    expect(resolveStatedSufferTarget(pc, i)).toEqual({ vehicleItemId: "bike-1" });
    expect(i.stakes.missSuffer).toEqual({ move: "withstand_damage", amount: 1, target: "the hoverbike", vehicleItemId: "bike-1" });
    expect(before.missSuffer.vehicleItemId, "the stakes it was given are not changed").toBeUndefined();

    const c = interp({ move: "companion_takes_a_hit", amount: 1, target: "Ember" });
    expect(resolveStatedSufferTarget(pc, c)).toEqual({ companionItemId: "c-glowcat" });
  });

  it("never a guess: no target, an unknown name, several named, or the wrong kind resolves nothing", () => {
    // No target — though the miss line names the bike (issue #345 AA14's prose fallback).
    const prose = interp({ move: "withstand_damage", amount: 1 }, "The hoverbike's frame cracks.");
    expect(resolveStatedSufferTarget(pc, prose)).toBeNull();
    expect(prose.stakes.missSuffer).toEqual({ move: "withstand_damage", amount: 1 });

    for (const missSuffer of [
      { move: "withstand_damage", amount: 1, target: "ISV Savela" },            // the starship: the default
      { move: "withstand_damage", amount: 1, target: "the Hoverbike and the Rover" },
      { move: "withstand_damage", amount: 1, target: "Glowcat" },               // a companion is no vehicle
      { move: "companion_takes_a_hit", amount: 1, target: "Hoverbike" },
      { move: "endure_harm", amount: 1, target: "Hoverbike" },
    ]) {
      const i = interp(missSuffer);
      expect(resolveStatedSufferTarget(pc, i), JSON.stringify(missSuffer)).toBeNull();
      expect(i.stakes.missSuffer).toEqual(missSuffer);
    }
    expect(resolveStatedSufferTarget(null, interp({ move: "withstand_damage", amount: 1, target: "Hoverbike" }))).toBeNull();
    expect(resolveStatedSufferTarget(pc, { stakes: null })).toBeNull();
  });

  it("statedPrice: the move's own vehicle or companion comes first (issue #362 D11); with none, the one the stated move names", () => {
    const named = { hit: "h", miss: "m", priceStated: true,
      missSuffer: { move: "withstand_damage", amount: 1, target: "Hoverbike", vehicleItemId: "bike-1" } };
    expect(statedPrice(named, {}).sufferRoutes).toEqual([{ move: "withstand_damage", amount: 1, vehicleItemId: "bike-1" }]);
    expect(statedPrice(named, { vehicleItemId: "rover-1" }).sufferRoutes).toEqual([{ move: "withstand_damage", amount: 1, vehicleItemId: "rover-1" }]);

    const companion = { hit: "h", miss: "m", priceStated: true,
      missSuffer: { move: "companion_takes_a_hit", amount: 1, target: "Ember", companionItemId: "c-glowcat" } };
    expect(statedPrice(companion, {}).sufferRoutes).toEqual([
      { move: "companion_takes_a_hit", amount: 1, soloFallback: "endure_harm", companionItemId: "c-glowcat" }]);
    expect(statedPrice(companion, { patientCompanionItemId: "c-rockhorn" }).sufferRoutes[0].companionItemId).toBe("c-rockhorn");
    // A name that resolved to nothing puts nothing on the route.
    expect(statedPrice({ ...named, missSuffer: { move: "withstand_damage", amount: 1, target: "Hoverbike" } }, {}).sufferRoutes)
      .toEqual([{ move: "withstand_damage", amount: 1 }]);
  });
});

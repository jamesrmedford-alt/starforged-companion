/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/payoffRetrySufferTargetGoneFinal.test.js
 *
 * Issue #364 PAYOFF-RETRY-SUFFER-TARGET-GONE.
 *
 * A suffer pick's write the world refused goes to the GMs as a `suffer` step
 * with a Retry; an asset effect's refused progress mark as a `rider` step.
 * When what the step changes is gone before the Retry — Withstand Damage's
 * vehicle, Companion Takes a Hit's companion, the vehicle an integrity change
 * or a battered mark is for, the track a cleared mark of progress or an
 * asset's progress mark is for — the Retry put the step on a fresh card with
 * its own Retry on every press, its line printing the raw reason code
 * ("no-vehicle"), and Withstand Damage / Companion Takes a Hit posted their
 * own "Vehicle not found" card on each press too.
 *
 * Now a target the step names by id (the pick's asset, the move's vehicle or
 * companion, the track) gone since — or that track finished — is final: the
 * card is resolved, no fresh Retry, and the GMs are told once, in plain
 * words, on a card with no Retry. A target the step does not name (the
 * command vehicle, the only companion) is looked up at the press: it stays on
 * a fresh Retry card, in plain words. No "not found" card follows a Retry
 * press; the first failure still posts one.
 *
 * On a booted table: each card posted by the GM's own poster with the record
 * a refused write leaves, and the GM's real press of "Retry these steps".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const RETRY = '[data-action="sf-payoff-retry"]';
const VEHICLE_GONE   = "the vehicle is no longer in the world";
const COMPANION_GONE = "the companion is no longer on the character's sheet";
const TRACK_GONE     = "its progress track is no longer in the world";
const TRACK_DONE     = "its progress track is finished, so nothing is left to change on it";

/** A vendor-shaped asset with a condition track, written by its own update(). */
function asset(id, name, category, trackName, value) {
  const item = { id, name, type: "asset",
    system: { category, abilities: [], track: { enabled: true, name: trackName, value, min: 0, max: 5 },
      conditions: [{ name: "Battered", ticked: false }] },
    update: async (changes) => {
      if ("system.track.value" in changes) item.system.track.value = changes["system.track.value"];
      if ("system.conditions" in changes) item.system.conditions = changes["system.conditions"];
      return item;
    } };
  return item;
}

let table, gm, index, executor, kira, tracksStore;
const live        = (card) => table.world.message(card._id);
const failCards   = () => table.cards(f => f.payoffFailureCard);
const retryCards  = () => failCards().filter(c => c.flags[MODULE_ID].retryable !== false);
const finalCards  = () => failCards().filter(c => c.flags[MODULE_ID].retryable === false);
const notFound    = () => table.cards(f => f.error === "vehicle-not-found" || f.error === "companion-not-found");
const dropItem    = (id) => { const at = kira.items.contents.findIndex(i => i.id === id); kira.items.contents.splice(at, 1); };
const tracks      = () => tracksStore[`${MODULE_ID}.tracks`];

async function post(source, step) {
  await gm.run(() => index.postPayoffFailureCard({ source, actorId: "pc-kira", failures: [{ ...step, reason: "refused" }] }));
  await table.settle(); await table.drain();
  return failCards().at(-1);
}
async function retry(card) {
  await gm.click(card._id, RETRY);
  await table.settle(); await table.drain();
}
const suffer = (call, opts = { isMiss: true }) => ({ step: "suffer", call, opts });
const RIDER_PROGRESS = { step: "rider", rider: { resource: "progress", amount: 1, label: "Mark progress", assetName: "Sleuth" },
  track: { id: "t-archive", label: "The Archive" }, shipActorId: null };

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  gm = table.client("gm-1");
  index    = await gm.import("../../src/index.js");
  executor = await gm.import("../../src/moves/sufferExecutor.js");
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "stg-s1", sessionNumber: 1,
      currentSceneId: null, sceneTruths: [], clocks: [] },
  } } });
  scriptClaude(table, { fallback: () => "The crew settles in." });
  silenceConsoleErrors();
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { health: { value: 5 }, momentum: { value: 2 } },
    items: { contents: [asset("bike-1", "Hoverbike", "Support Vehicle", "Integrity", 3),
      asset("c-rockhorn", "Rockhorn", "Companion", "Health", 4)] } });
  // A vehicle Actor the move was rolled against — not the command vehicle.
  table.addActor({ id: "ship-x", type: "starship", name: "Skua",
    flags: { [MODULE_ID]: { entityType: "ship", ship: { _id: "rec-x", name: "Skua", integrity: 4, maxIntegrity: 5, isCommandVehicle: false } } } });
  tracksStore = { [`${MODULE_ID}.tracks`]: [
    { id: "t-archive", label: "The Archive", type: "expedition", rank: "dangerous", ticks: 8, completed: false, createdAt: 1 },
  ] };
  table.journal._set({
    id: "tracks-journal", name: "Starforged Progress Tracks",
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); },
  });
});

describe("issue #364 PAYOFF-RETRY-SUFFER-TARGET-GONE — a target the step names, gone before the GMs' Retry", () => {
  it.each([
    ["Withstand Damage on the support vehicle the pick names", "suffer",
      suffer({ kind: "suffer", sufferId: "withstand_damage", amount: 1, itemId: "bike-1" }), () => dropItem("bike-1"), VEHICLE_GONE],
    ["Withstand Damage on the vehicle the move was rolled against", "suffer",
      suffer({ kind: "suffer", sufferId: "withstand_damage", amount: 1 }, { isMiss: true, vehicleActorId: "ship-x" }),
      () => table.actors.delete("ship-x"), VEHICLE_GONE],
    ["Companion Takes a Hit on the companion the pick names", "suffer",
      suffer({ kind: "suffer", sufferId: "companion_takes_a_hit", amount: 1, itemId: "c-rockhorn" }), () => dropItem("c-rockhorn"), COMPANION_GONE],
    ["the move's support vehicle's integrity", "suffer",
      suffer({ kind: "meter", meterKey: "integrity", delta: -1 }, { vehicleItemId: "bike-1" }), () => dropItem("bike-1"), VEHICLE_GONE],
    ["the move's companion's health", "suffer",
      suffer({ kind: "meter", meterKey: "companionHealth", delta: -1 }, { companionItemId: "c-rockhorn" }), () => dropItem("c-rockhorn"), COMPANION_GONE],
    ["the support vehicle marked battered", "suffer",
      suffer({ kind: "mark-vehicle", impact: "battered" }, { vehicleItemId: "bike-1" }), () => dropItem("bike-1"), VEHICLE_GONE],
    ["a mark of progress cleared, its track removed", "suffer",
      suffer({ kind: "clear-progress", trackId: "t-archive" }, {}), () => tracks().splice(0, 1), TRACK_GONE],
    ["a mark of progress cleared, its track finished", "suffer",
      suffer({ kind: "clear-progress", trackId: "t-archive" }, {}), () => { tracks()[0].completed = true; }, TRACK_DONE],
    ["an asset's progress mark, its track removed", "rider", RIDER_PROGRESS, () => tracks().splice(0, 1), TRACK_GONE],
    ["an asset's progress mark, its track finished", "rider", RIDER_PROGRESS, () => { tracks()[0].completed = true; }, TRACK_DONE],
  ])("%s: the Retry settles it — told once in plain words, no fresh Retry, no 'not found' card", async (_what, source, step, remove, words) => {
    const card = await post(source, step);
    expect(card.flags[MODULE_ID]).toMatchObject({ retryable: true, steps: [{ step: step.step }] });
    remove();

    await retry(card);

    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(retryCards().map(c => c._id), "no fresh card with a Retry").toEqual([card._id]);
    expect(finalCards(), "one card saying why").toHaveLength(1);
    const [told] = finalCards();
    expect(String(told.content)).toContain("Not applied — and no longer owed:");
    expect(String(told.content)).toContain(`— ${words}.`);
    expect(String(told.content)).not.toMatch(/— (no-vehicle|no-companion|track-gone|track-done)\b/);
    expect(gm.render(told._id).querySelector(RETRY)).toBeNull();
    expect(told.whisper).toEqual(["gm-1"]);
    expect(notFound(), "the payoff card says it; no 'not found' card beside it").toEqual([]);
  }, 30_000);

  it("a vehicle the step does not name — the command vehicle, none set — stays on a fresh Retry card in plain words, which applies it once one is", async () => {
    const card = await post("suffer", suffer({ kind: "suffer", sufferId: "withstand_damage", amount: 1 }));

    await retry(card);

    expect(finalCards()).toEqual([]);
    const fresh = retryCards().at(-1);
    expect(fresh._id).not.toBe(card._id);
    expect(String(fresh.content)).toContain("— no vehicle to change.");
    expect(String(fresh.content)).not.toContain("no-vehicle");
    expect(notFound(), "no 'No vehicle to take it' card beside it").toEqual([]);

    // The GM sets a command vehicle: the fresh card's Retry damages it.
    const cv = table.addActor({ id: "ship-cv", type: "starship", name: "Wayfarer",
      flags: { [MODULE_ID]: { entityType: "ship", ship: { _id: "rec-cv", name: "Wayfarer", integrity: 3, maxIntegrity: 5, isCommandVehicle: true } } } });
    await gm.run(() => game.settings.set(MODULE_ID, "campaignState", { ...table.world.campaignState(), shipIds: ["ship-cv"] }));
    await retry(fresh);
    expect(cv.flags[MODULE_ID].ship.integrity).toBe(2);
    expect(failCards()).toHaveLength(2);
  }, 30_000);

  it("a companion the step does not name, with two on the sheet, stays on a fresh Retry card in plain words", async () => {
    kira.items.contents.push(asset("c-glowcat", "Glowcat", "Companion", "Health", 3));
    const card = await post("suffer", suffer({ kind: "suffer", sufferId: "companion_takes_a_hit", amount: 1 }));

    await retry(card);

    expect(finalCards()).toEqual([]);
    const fresh = retryCards().at(-1);
    expect(fresh._id).not.toBe(card._id);
    expect(String(fresh.content)).toContain("— no companion to change.");
    expect(notFound()).toEqual([]);
  }, 30_000);

  it("control: the first failure still posts the executor's own 'Vehicle not found' card", async () => {
    await gm.run(() => executor.executeSuffer("withstand_damage", kira, { amount: 1, itemId: "bike-gone" }));
    await table.settle();
    expect(notFound()).toHaveLength(1);
    expect(String(notFound()[0].content)).toContain("Vehicle not found (id bike-gone)");
  }, 30_000);

  it("control: the vehicle still there — the Retry applies the damage, and no card follows", async () => {
    const card = await post("suffer", suffer({ kind: "suffer", sufferId: "withstand_damage", amount: 1, itemId: "bike-1" }));

    await retry(card);

    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(kira.items.contents.find(i => i.id === "bike-1").system.track.value).toBe(2);
    expect(failCards()).toHaveLength(1);
  }, 30_000);
});

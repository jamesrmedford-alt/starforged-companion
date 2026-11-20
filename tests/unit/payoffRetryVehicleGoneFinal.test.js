/**
 * STARFORGED COMPANION
 * tests/unit/payoffRetryVehicleGoneFinal.test.js
 *
 * Issue #364 PAYOFF-RETRY-VEHICLE-GONE-LOOP (found while sweeping the GMs'
 * Retry for PAYOFF-RETRY-FINAL-OUTCOMES, of the same kind).
 *
 * Two steps of the GMs' payoff card change a vehicle's integrity and name the
 * vehicle by its Actor's id: an asset effect the world refused after a move
 * (`rider`, issue #315 S08) and the integrity a reverted price took, put back
 * (`upgrade` / `assetTrack`, issue #354 P2-09). With that Actor deleted
 * before the Retry the step answers "no-vehicle", on that press and every
 * later one — but a Retry puts every step that fails again on a fresh card
 * with its own Retry, so each press posted another card whose Retry could not
 * succeed.
 *
 * Now that answer is final: the Retry resolves the card, posts no fresh
 * Retry, and tells the GMs once, on a card with no Retry, that the vehicle is
 * no longer in the world. A step refused again beside it still gets its own
 * fresh Retry card.
 *
 * On a booted table: each card posted by the GM's own poster with the record
 * a refused write leaves, and the GM's real press of "Retry these steps".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude, failWrites } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const RETRY = '[data-action="sf-payoff-retry"]';
const GONE  = "the vehicle is no longer in the world";
const RIDER = { step: "rider", rider: { resource: "integrity", amount: 1, label: "+1 integrity", assetName: "Engine Upgrade" },
  track: null, shipActorId: "ship-cv" };
const RESTORE = { step: "upgrade", effect: "assetTrack", track: "integrity", amount: 1, name: "Wayfarer", vehicleActorId: "ship-cv" };

let table, gm, postPayoffFailureCard, kira;
const live       = (card) => table.world.message(card._id);
const failCards  = () => table.cards(f => f.payoffFailureCard);
const retryCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable !== false);
const finalCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable === false);

async function post(source, failures) {
  await gm.run(() => postPayoffFailureCard({ source, actorId: "pc-kira", failures: failures.map(f => ({ ...f, reason: "refused" })) }));
  await table.settle(); await table.drain();
  return failCards().at(-1);
}

async function retry(card) {
  await gm.click(card._id, RETRY);
  await table.settle(); await table.drain();
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  gm = table.client("gm-1");
  ({ postPayoffFailureCard } = await gm.import("../../src/index.js"));
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "veh-s1", sessionNumber: 1,
      currentSceneId: null, sceneTruths: [], shipIds: ["ship-cv"] },
  } } });
  scriptClaude(table, { fallback: () => "The crew settles in." });
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
  table.addActor({ id: "ship-cv", type: "starship", name: "Wayfarer",
    flags: { [MODULE_ID]: { entityType: "ship", ship: { _id: "rec-cv", name: "Wayfarer", integrity: 3, maxIntegrity: 5, isCommandVehicle: true } } } });
});

describe("issue #364 PAYOFF-RETRY-VEHICLE-GONE-LOOP — the step's vehicle deleted before the GMs' Retry", () => {
  it.each([
    ["an asset effect on the ship's integrity", "rider", RIDER],
    ["a reverted price's integrity, put back", "upgrade", RESTORE],
  ])("%s: the Retry settles it — told once, no fresh Retry", async (_what, source, step) => {
    const card = await post(source, [step]);
    expect(card.flags[MODULE_ID]).toMatchObject({ retryable: true, steps: [{ step: step.step }] });
    table.actors.delete("ship-cv");                       // the GM deletes the ship

    await retry(card);

    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(retryCards().map(c => c._id), "no fresh card with a Retry").toEqual([card._id]);
    expect(finalCards(), "one card saying why").toHaveLength(1);
    const [told] = finalCards();
    expect(String(told.content)).toContain("Not applied — and no longer owed:");
    expect(String(told.content)).toContain(`— ${GONE}.`);
    expect(gm.render(told._id).querySelector(RETRY)).toBeNull();
    expect(told.whisper).toEqual(["gm-1"]);
  }, 30_000);

  it("a step refused again beside it still gets its own fresh Retry card, which applies it", async () => {
    const card = await post("rider", [RIDER, { step: "momentum", pcId: "pc-kira", amount: 1 }]);
    table.actors.delete("ship-cv");
    const again = failWrites(table, w => w.kind === "actor.update" && w.id === "pc-kira", { times: 1 });

    await retry(card);

    expect(again.refused).toBe(1);
    expect(finalCards()).toHaveLength(1);
    expect(finalCards()[0].flags[MODULE_ID].steps).toMatchObject([{ step: "rider", shipActorId: "ship-cv" }]);
    const fresh = retryCards().at(-1);
    expect(retryCards().map(c => c._id)).toEqual([card._id, fresh._id]);
    expect(fresh.flags[MODULE_ID]).toMatchObject({ retryable: true, resolved: false, steps: [{ step: "momentum", pcId: "pc-kira", amount: 1 }] });

    await retry(fresh);
    expect(kira.system.momentum.value).toBe(3);
    expect(failCards()).toHaveLength(3);
  }, 30_000);

  it("control: the ship still there — the Retry applies the effect, and no card follows", async () => {
    const card = await post("rider", [RIDER]);

    await retry(card);

    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(table.actors.get("ship-cv").flags[MODULE_ID].ship.integrity).toBe(4);
    expect(failCards()).toHaveLength(1);
  }, 30_000);
});

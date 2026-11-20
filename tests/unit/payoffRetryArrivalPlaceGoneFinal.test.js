/**
 * STARFORGED COMPANION
 * tests/unit/payoffRetryArrivalPlaceGoneFinal.test.js
 *
 * Issue #364 PAYOFF-RETRY-ARRIVAL-PLACE-GONE-LOOP (found while closing
 * PAYOFF-RETRY-INVALID-STEP-LOOP, in the same Retry and of the same kind).
 *
 * A move's arrival whose record the world refused is an `arrival` step on the
 * GMs' payoff card: its Retry writes the place the crew reached as their
 * current location (issue #331 X18). The step names the place by its
 * document's id. With that document deleted before the Retry there is
 * nowhere to arrive — on that press or any later one — but the step answered
 * "invalid step", as if its record were malformed: onto a fresh Retry card on
 * every press, and (once an unreadable record was told as one no Retry can
 * run) with the advice to apply it by hand, which nobody can.
 *
 * Now a place that is gone is its own answer, and final: the Retry resolves
 * the card, posts no fresh Retry, and tells the GMs once, on a card with no
 * Retry, that the place is no longer in the world — nothing is owed. A record
 * that names its place under another type is still an unreadable record.
 *
 * On a booted table: the card as a refused arrival leaves it
 * (tests/unit/refusedMoveRecord.test.js), posted by the GM's own poster, and
 * the GM's real press of "Retry these steps".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude, failWrites, campaignStateWrite } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const RETRY = '[data-action="sf-payoff-retry"]';
const ARRIVAL = { step: "arrival", locationId: "actor-bleak", locationType: "settlement", name: "Bleakhold" };

let table, gm, postPayoffFailureCard;
const world      = () => table.world.campaignState();
const live       = (card) => table.world.message(card._id);
const failCards  = () => table.cards(f => f.payoffFailureCard);
const retryCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable !== false);
const finalCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable === false);

/** The GMs' card for Kira's arrival at Bleakhold, its record refused. */
async function arrivalRefused(step = ARRIVAL) {
  await gm.run(() => postPayoffFailureCard({ source: "persist", actorId: "pc-kira", failures: [{ ...step, reason: "refused" }] }));
  await table.settle(); await table.drain();
  const card = failCards().at(-1);
  expect(card.flags[MODULE_ID], "setup: the arrival, with a Retry").toMatchObject({ retryable: true, steps: [step] });
  return card;
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
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "arr-s1", sessionNumber: 1,
      currentSceneId: null, sceneTruths: [], currentLocationId: null, currentLocationType: null },
  } } });
  scriptClaude(table, { fallback: () => "The crew settles in." });
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
  table.addActor({ id: "actor-bleak", name: "Bleakhold", type: "location",
    system: { subtype: "settlement", klass: "orbital" },
    flags: { [MODULE_ID]: { entityType: "settlement", settlement: { _id: "rec-bleak", name: "Bleakhold", sectorId: "sec-1" } } } });
});

describe("issue #364 PAYOFF-RETRY-ARRIVAL-PLACE-GONE-LOOP — the place deleted before the GMs' Retry records the arrival", () => {
  it("the Retry resolves the card: no fresh Retry card, and the GMs are told once that the place is gone", async () => {
    const card = await arrivalRefused();
    table.actors.delete("actor-bleak");                   // the GM deletes the settlement

    await retry(card);

    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(world().currentLocationId ?? null, "nowhere arrived").toBeNull();
    expect(retryCards().map(c => c._id), "no fresh card with a Retry").toEqual([card._id]);
    expect(finalCards(), "one card saying why").toHaveLength(1);
    const [told] = finalCards();
    expect(String(told.content)).toContain("Not applied — and no longer owed:");
    expect(String(told.content)).toContain("The crew's current location: Bleakhold — the place is no longer in the world.");
    expect(String(told.content), "not told as a record to apply by hand").not.toContain("by hand");
    expect(gm.render(told._id).querySelector(RETRY)).toBeNull();
    expect(told.whisper).toEqual(["gm-1"]);
  }, 30_000);

  it("control: the place still there — the Retry records the arrival, and no card follows", async () => {
    const card = await arrivalRefused();

    await retry(card);

    expect(world()).toMatchObject({ currentLocationId: "actor-bleak", currentLocationType: "settlement" });
    expect(failCards()).toHaveLength(1);
  }, 30_000);

  it("control: refused again with the place still there — a fresh card with its own Retry, which records it", async () => {
    const card = await arrivalRefused();
    const again = failWrites(table, campaignStateWrite(), { times: 1 });

    await retry(card);

    expect(again.refused).toBe(1);
    expect(finalCards()).toEqual([]);
    expect(retryCards()).toHaveLength(2);
    expect(retryCards()[1].flags[MODULE_ID].steps).toEqual([ARRIVAL]);

    await retry(retryCards()[1]);
    expect(world()).toMatchObject({ currentLocationId: "actor-bleak", currentLocationType: "settlement" });
    expect(failCards()).toHaveLength(2);
  }, 30_000);

  it("control: a record that names the place under another type is still one no Retry can run", async () => {
    const card = await arrivalRefused({ ...ARRIVAL, locationType: "planet" });

    await retry(card);

    expect(world().currentLocationId ?? null).toBeNull();
    expect(retryCards().map(c => c._id)).toEqual([card._id]);
    expect(finalCards()).toHaveLength(1);
    expect(String(finalCards()[0].content)).toContain("Not applied — and no Retry can apply it:");
    expect(String(finalCards()[0].content)).not.toContain("no longer owed");
  }, 30_000);
});

/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/payoffRetryBatteredNoConditionFinal.test.js
 *
 * Issue #364 BATTERED-NO-CONDITION-LOOP.
 *
 * Withstand Damage's at-0 cost "mark the vehicle as battered" on a support
 * vehicle marks its asset's Battered condition. A mark the world refused is a
 * `suffer` step on the GMs' payoff card. When the asset has no Battered
 * condition by the time of the Retry, the Retry answered "no-condition": the
 * step went on a fresh card with its own Retry on every press, its line
 * printing the code ("— no-condition.").
 *
 * Now "no-condition" is final: the card is resolved, no fresh Retry is
 * posted, and the GMs are told once, in plain words — "the vehicle has no
 * Battered condition to mark" — on a card with no Retry. Control: an asset
 * with the condition is marked by the Retry.
 *
 * On a booted table: the card posted by the GM's own poster with the record a
 * refused mark leaves, and the GM's real press of "Retry these steps".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const RETRY = '[data-action="sf-payoff-retry"]';
const WORDS = "the vehicle has no Battered condition to mark";
const STEP  = { step: "suffer", call: { kind: "mark-vehicle", impact: "battered" }, opts: { isMiss: true, vehicleItemId: "bike-1" } };

let table, gm, index, bike;
const live       = (card) => table.world.message(card._id);
const failCards  = () => table.cards(f => f.payoffFailureCard);
const retryCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable !== false);
const finalCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable === false);

async function post() {
  await gm.run(() => index.postPayoffFailureCard({ source: "suffer", actorId: "pc-kira", failures: [{ ...STEP, reason: "refused" }] }));
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
  index = await gm.import("../../src/index.js");
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "bnc-s1", sessionNumber: 1,
      currentSceneId: null, sceneTruths: [], clocks: [] },
  } } });
  scriptClaude(table, { fallback: () => "The crew settles in." });
  silenceConsoleErrors();
  bike = { id: "bike-1", name: "Hoverbike", type: "asset",
    system: { category: "Support Vehicle", abilities: [], track: { enabled: true, name: "Integrity", value: 0, min: 0, max: 5 },
      conditions: [{ name: "Battered", ticked: false }] },
    update: async (changes) => {
      if ("system.conditions" in changes) bike.system.conditions = changes["system.conditions"];
      return bike;
    } };
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, items: { contents: [bike] } });
});

describe("issue #364 BATTERED-NO-CONDITION-LOOP — a refused battered mark, its asset with no Battered condition at the Retry", () => {
  it("the Retry settles it — told once in plain words, no fresh Retry, no code printed", async () => {
    const card = await post();
    expect(card.flags[MODULE_ID]).toMatchObject({ retryable: true, steps: [{ step: "suffer" }] });
    bike.system.conditions = [];

    await retry(card);

    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(retryCards().map(c => c._id), "no fresh card with a Retry").toEqual([card._id]);
    expect(finalCards(), "one card saying why").toHaveLength(1);
    const [told] = finalCards();
    expect(String(told.content)).toContain("Not applied — and no longer owed:");
    expect(String(told.content)).toContain(`— ${WORDS}.`);
    expect(String(told.content)).not.toContain("no-condition");
    expect(gm.render(told._id).querySelector(RETRY)).toBeNull();
  }, 30_000);

  it("control: the asset has its Battered condition — the Retry marks it, and no card follows", async () => {
    const card = await post();

    await retry(card);

    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(bike.system.conditions).toEqual([{ name: "Battered", ticked: true }]);
    expect(failCards()).toHaveLength(1);
  }, 30_000);
});

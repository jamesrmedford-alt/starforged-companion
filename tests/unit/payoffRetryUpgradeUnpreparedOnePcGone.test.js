/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/payoffRetryUpgradeUnpreparedOnePcGone.test.js
 *
 * Issue #364 PAYOFF-RETRY-UPGRADE-UNPREPARED-ONE-PC-GONE.
 *
 * A Burn Momentum or Improve Result that reverts a price clears the
 * unprepared mark it made on the crew; a clear the world refused is an
 * `upgrade` step (`unprepared`, every PC it marked) on the GMs' payoff card.
 * With one of those characters deleted before the Retry, the Retry's check
 * answered "invalid step" for the whole step: told once as something to
 * apply by hand, and the characters still in the world were never cleared —
 * though the clear itself skips a character who is gone. Likewise a
 * vehicle's or companion's track to restore on a deleted character's asset
 * answered "invalid step" where the character is simply gone.
 *
 * Now the characters still in the world are checked and cleared (their
 * momentum given back), and with none left the step is final ("no-pc"): told
 * once, no further Retry. An asset track on a deleted character is "no-pc"
 * too.
 *
 * On a booted table: each card posted by the GM's own poster with the record
 * a refused write leaves, and the GM's real press of "Retry these steps".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const RETRY = '[data-action="sf-payoff-retry"]';
const GONE  = "the character's sheet is gone from the world, so there is no one left to receive it";

let table, gm, postPayoffFailureCard, ash, bryn;
const live       = (card) => table.world.message(card._id);
const failCards  = () => table.cards(f => f.payoffFailureCard);
const retryCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable !== false);
const finalCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable === false);

async function post(step) {
  await gm.run(() => postPayoffFailureCard({ source: "upgrade", actorId: "pc-ash", failures: [{ ...step, reason: "refused" }] }));
  await table.settle(); await table.drain();
  return failCards().at(-1);
}
async function retry(card) {
  await gm.click(card._id, RETRY);
  await table.settle(); await table.drain();
}
const pc = (id, name, owner) => table.addActor({ id, name, ownership: { [owner]: 3 },
  system: { momentum: { value: 2, max: 9, min: -6, resetValue: 2 }, debility: { unprepared: true } } });

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
  gm = table.client("gm-1");
  ({ postPayoffFailureCard } = await gm.import("../../src/index.js"));
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "uop-s1", sessionNumber: 1,
      currentSceneId: null, sceneTruths: [] },
  } } });
  scriptClaude(table, { fallback: () => "The crew settles in." });
  silenceConsoleErrors();
  ash  = pc("pc-ash", "Ash", "pl-1");
  bryn = pc("pc-bryn", "Bryn", "pl-2");
});

describe("issue #364 PAYOFF-RETRY-UPGRADE-UNPREPARED-ONE-PC-GONE — a reverted price's unprepared clear, one character gone", () => {
  it("one of the two deleted: the Retry clears the one still in the world, gives back their momentum, and nothing follows", async () => {
    const card = await post({ step: "upgrade", effect: "unprepared", pcIds: ["pc-ash", "pc-bryn"], momentumBack: { "pc-ash": 1, "pc-bryn": 1 } });
    table.actors.delete("pc-ash");

    await retry(card);

    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(bryn.system.debility.unprepared).toBe(false);
    expect(bryn.system.momentum.value).toBe(3);
    expect(failCards(), "neither a closing card nor a fresh Retry").toHaveLength(1);
  }, 30_000);

  it("both deleted: settled as final — told once that the sheet is gone, no fresh Retry", async () => {
    const card = await post({ step: "upgrade", effect: "unprepared", pcIds: ["pc-ash", "pc-bryn"] });
    table.actors.delete("pc-ash");
    table.actors.delete("pc-bryn");

    await retry(card);

    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(retryCards().map(c => c._id)).toEqual([card._id]);
    expect(finalCards()).toHaveLength(1);
    const [told] = finalCards();
    expect(String(told.content)).toContain("Not applied — and no longer owed:");
    expect(String(told.content)).toContain(`— ${GONE}.`);
    expect(String(told.content)).not.toContain("no Retry can apply");
  }, 30_000);

  it("a companion's health to restore on a deleted character's asset: final \"no-pc\", not an unreadable record", async () => {
    const card = await post({ step: "upgrade", effect: "assetTrack", track: "health", amount: 1, pcId: "pc-ash", itemId: "c-rockhorn", name: "Rockhorn" });
    table.actors.delete("pc-ash");

    await retry(card);

    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(retryCards().map(c => c._id)).toEqual([card._id]);
    expect(finalCards()).toHaveLength(1);
    expect(String(finalCards()[0].content)).toContain(`Restore Rockhorn's health by 1, which the reverted price took — ${GONE}.`);
    expect(String(finalCards()[0].content)).toContain("Not applied — and no longer owed:");
  }, 30_000);

  it("pin: a record that names no character for its asset is still unreadable", async () => {
    const card = await post({ step: "upgrade", effect: "assetTrack", track: "health", amount: 1, pcId: null, itemId: "c-rockhorn", name: "Rockhorn" });

    await retry(card);

    expect(finalCards()).toHaveLength(1);
    expect(String(finalCards()[0].content)).toContain("no Retry can apply it");
  }, 30_000);

  it("control: both still in the world — the Retry clears both", async () => {
    const card = await post({ step: "upgrade", effect: "unprepared", pcIds: ["pc-ash", "pc-bryn"] });

    await retry(card);

    expect(ash.system.debility.unprepared).toBe(false);
    expect(bryn.system.debility.unprepared).toBe(false);
    expect(failCards()).toHaveLength(1);
  }, 30_000);
});

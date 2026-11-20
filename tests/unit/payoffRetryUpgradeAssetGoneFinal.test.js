/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/payoffRetryUpgradeAssetGoneFinal.test.js
 *
 * Issue #364 PAYOFF-RETRY-UPGRADE-ASSET-GONE (found while fixing
 * PAYOFF-RETRY-UPGRADE-UNPREPARED-ONE-PC-GONE, in the same function and of
 * the same kind).
 *
 * A Burn Momentum or Improve Result that reverts a price puts back what it
 * took from a support vehicle's integrity or a companion's health; a refused
 * restore is an `upgrade` step (`assetTrack`) on the GMs' payoff card, naming
 * the asset by its Item's id. With that asset removed from the character's
 * sheet (the character still there) before the Retry, the restore answered
 * "no-vehicle" / "no-companion" on every press, onto a fresh Retry card each
 * time — only a vehicle Actor gone was final.
 *
 * Now an asset the step names by id, gone from the sheet, is final: told
 * once, no fresh Retry.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const RETRY = '[data-action="sf-payoff-retry"]';

function asset(id, name, category, trackName, value) {
  const item = { id, name, type: "asset",
    system: { category, abilities: [], track: { enabled: true, name: trackName, value, min: 0, max: 5 }, conditions: [] },
    update: async (changes) => { if ("system.track.value" in changes) item.system.track.value = changes["system.track.value"]; return item; } };
  return item;
}

let table, gm, postPayoffFailureCard, kira;
const live       = (card) => table.world.message(card._id);
const failCards  = () => table.cards(f => f.payoffFailureCard);
const retryCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable !== false);
const finalCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable === false);
const drop       = (id) => kira.items.contents.splice(kira.items.contents.findIndex(i => i.id === id), 1);

async function post(step) {
  await gm.run(() => postPayoffFailureCard({ source: "upgrade", actorId: "pc-kira", failures: [{ ...step, reason: "refused" }] }));
  await table.settle(); await table.drain();
  return failCards().at(-1);
}
async function retry(card) {
  await gm.click(card._id, RETRY);
  await table.settle(); await table.drain();
}
const BIKE = { step: "upgrade", effect: "assetTrack", track: "integrity", amount: 1, pcId: "pc-kira", itemId: "bike-1", name: "Hoverbike" };
const ROCK = { step: "upgrade", effect: "assetTrack", track: "health", amount: 1, pcId: "pc-kira", itemId: "c-rockhorn", name: "Rockhorn" };

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  gm = table.client("gm-1");
  ({ postPayoffFailureCard } = await gm.import("../../src/index.js"));
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "uag-s1", sessionNumber: 1,
      currentSceneId: null, sceneTruths: [] },
  } } });
  scriptClaude(table, { fallback: () => "The crew settles in." });
  silenceConsoleErrors();
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    items: { contents: [asset("bike-1", "Hoverbike", "Support Vehicle", "Integrity", 2),
      asset("c-rockhorn", "Rockhorn", "Companion", "Health", 2)] } });
});

describe("issue #364 PAYOFF-RETRY-UPGRADE-ASSET-GONE — a reverted price's track to restore, its asset gone from the sheet", () => {
  it.each([
    ["a support vehicle's integrity", BIKE, "bike-1", "Restore Hoverbike's integrity by 1, which the reverted price took — the vehicle is no longer in the world."],
    ["a companion's health", ROCK, "c-rockhorn", "Restore Rockhorn's health by 1, which the reverted price took — the companion is no longer on the character's sheet."],
  ])("%s: settled — told once, no fresh Retry", async (_what, step, itemId, line) => {
    const card = await post(step);
    drop(itemId);

    await retry(card);

    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(retryCards().map(c => c._id), "no fresh card with a Retry").toEqual([card._id]);
    expect(finalCards()).toHaveLength(1);
    expect(String(finalCards()[0].content)).toContain("Not applied — and no longer owed:");
    expect(String(finalCards()[0].content)).toContain(line);
  }, 30_000);

  it("control: the companion still on the sheet — the Retry restores it, and no card follows", async () => {
    const card = await post(ROCK);

    await retry(card);

    expect(kira.items.contents.find(i => i.id === "c-rockhorn").system.track.value).toBe(3);
    expect(failCards()).toHaveLength(1);
  }, 30_000);
});

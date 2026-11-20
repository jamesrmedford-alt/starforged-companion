/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/payoffRetrySiteSectorGoneFinal.test.js
 *
 * Issue #364 PAYOFF-RETRY-SITE-SECTOR-GONE.
 *
 * A move's record the world refused leaves its site reveal (`site`) and an
 * uncharted destination's record (`uncharted`) as steps on the GMs' payoff
 * card. The Retry of a site no stored map holds answered "site-gone", and of
 * an uncharted record whose sector is not stored "sector-gone" — and put the
 * step on a fresh Retry card on every press.
 *
 * Nothing removes a sector from the store or a site from a map, and nothing
 * stores a sector again under an id it had once its full record is in: a
 * sector gone from the store is gone for good, and so is a site — unless its
 * own uncharted record still waits on a Retry (this card's or another's),
 * when it can still land. A sector stored without its map — the {id, name}
 * stub sector creation writes before its full record replaces it — is not
 * gone: it answered "sector-gone" too, and now answers "its sector's map is
 * not stored yet", retryable.
 *
 * On a booted table: each card posted by the GM's own poster with the record
 * a refused write leaves, and the GM's real press of "Retry these steps".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const RETRY = '[data-action="sf-payoff-retry"]';
const HULK  = { id: "site-hulk", type: "derelict", name: "The Hulk", discovered: false, gridX: 1, gridY: 1 };
const GAP   = { id: "site-gap", type: "uncharted", name: "Wraith Gap", discovered: false, gridX: 2, gridY: 3,
  nearestSettlementId: null, actorId: null, workingLabel: true };
const mapped = (discoveries) => ({ id: "sec-1", name: "Iron Expanse",
  mapData: { sectorId: "sec-1", gridWidth: 10, gridHeight: 8, settlements: [], passages: [], discoveries } });
const SITE      = { step: "site", sectorId: "sec-1", siteId: GAP.id, name: GAP.name };
const UNCHARTED = { step: "uncharted", sectorId: "sec-1", name: GAP.name, site: GAP };

let table, gm, postPayoffFailureCard;
const live       = (card) => table.world.message(card._id);
const failCards  = () => table.cards(f => f.payoffFailureCard);
const retryCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable !== false);
const finalCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable === false);
const sectors    = () => table.world.campaignState().sectors;
const onMap      = (id) => sectors().find(s => s.id === "sec-1")?.mapData?.discoveries?.find(d => d.id === id) ?? null;
const storeSectors = (list) => gm.run(() => game.settings.set(MODULE_ID, "campaignState", { ...table.world.campaignState(), sectors: list }));

async function post(steps) {
  await gm.run(() => postPayoffFailureCard({ source: "persist", actorId: "pc-kira", failures: steps.map(s => ({ ...s, reason: "refused" })) }));
  await table.settle(); await table.drain();
  return failCards().at(-1);
}
async function retry(card) {
  await gm.click(card._id, RETRY);
  await table.settle(); await table.drain();
}
function expectSettled(card, words) {
  expect(live(card).flags[MODULE_ID].resolved).toBe(true);
  expect(retryCards().filter(c => !live(c).flags[MODULE_ID].resolved), "no live Retry left").toEqual([]);
  expect(finalCards(), "one card saying why").toHaveLength(1);
  const [told] = finalCards();
  expect(String(told.content)).toContain("Not applied — and no longer owed:");
  expect(String(told.content)).toContain(`— ${words}.`);
  expect(gm.render(told._id).querySelector(RETRY)).toBeNull();
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
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "ssg-s1", sessionNumber: 1,
      currentSceneId: null, sceneTruths: [], activeSectorId: "sec-1", sectors: [mapped([HULK])] },
  } } });
  scriptClaude(table, { fallback: () => "The crew settles in." });
  silenceConsoleErrors();
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
});

describe("issue #364 PAYOFF-RETRY-SITE-SECTOR-GONE — a site or a sector gone before the GMs' Retry", () => {
  it("an uncharted record whose sector is no longer stored: settled — told once, no fresh Retry", async () => {
    const card = await post([UNCHARTED]);
    await storeSectors([]);                               // no stored sector has the id

    await retry(card);

    expectSettled(card, "its sector is no longer stored");
    expect(String(finalCards()[0].content)).not.toMatch(/Its sector is no longer stored\./);
  }, 30_000);

  it("a site's reveal whose site is on no map, with nothing waiting to record it: settled — told once", async () => {
    const card = await post([{ step: "site", sectorId: "sec-1", siteId: "site-lost", name: "The Lost Spire" }]);

    await retry(card);

    expectSettled(card, "the site is no longer on the sector map");
  }, 30_000);

  it("pin: an uncharted record whose sector is stored without its map stays retryable, in words — and lands once the map is stored", async () => {
    const card = await post([UNCHARTED]);
    await storeSectors([{ id: "sec-1", name: "Iron Expanse" }]);   // the stub, as sector creation writes it first

    await retry(card);

    expect(finalCards()).toEqual([]);
    const fresh = retryCards().at(-1);
    expect(fresh._id).not.toBe(card._id);
    expect(String(fresh.content)).toContain("— its sector's map is not stored yet.");

    await storeSectors([mapped([HULK])]);                 // its full record replaces the stub
    await retry(fresh);
    expect(onMap(GAP.id)).toMatchObject({ id: GAP.id, type: "uncharted" });
    expect(failCards()).toHaveLength(2);
  }, 30_000);

  it("pin: a site whose uncharted record waits on another card's Retry stays retryable — and is charted once that record lands", async () => {
    const recordCard = await post([UNCHARTED]);
    const siteCard   = await post([SITE]);

    await retry(siteCard);

    expect(finalCards()).toEqual([]);
    const fresh = retryCards().at(-1);
    expect(fresh._id).not.toBe(siteCard._id);
    expect(fresh.flags[MODULE_ID].steps).toMatchObject([{ step: "site", siteId: GAP.id }]);

    await retry(recordCard);
    expect(onMap(GAP.id)).not.toBeNull();
    await retry(fresh);
    expect(onMap(GAP.id).discovered).toBe(true);
    expect(finalCards()).toEqual([]);
  }, 30_000);

  it("pin: a site and its uncharted record on one card — the record lands, the site waits on a fresh Retry that charts it", async () => {
    const card = await post([SITE, UNCHARTED]);

    await retry(card);

    expect(onMap(GAP.id)).toMatchObject({ discovered: false });
    expect(finalCards()).toEqual([]);
    const fresh = retryCards().at(-1);
    expect(fresh.flags[MODULE_ID].steps).toMatchObject([{ step: "site", siteId: GAP.id }]);
    await retry(fresh);
    expect(onMap(GAP.id).discovered).toBe(true);
  }, 30_000);

  it("control: a site still on the map — the Retry charts it, and no card follows", async () => {
    const card = await post([{ step: "site", sectorId: "sec-1", siteId: HULK.id, name: HULK.name }]);

    await retry(card);

    expect(onMap(HULK.id).discovered).toBe(true);
    expect(failCards()).toHaveLength(1);
  }, 30_000);
});

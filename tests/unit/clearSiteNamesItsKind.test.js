/**
 * tests/unit/clearSiteNamesItsKind.test.js
 *
 * `!clear-site` names the site's real kind (issue #362 AC52,
 * CLEAR-SITE-UNCHARTED-CALLED-DERELICT).
 *
 * An uncharted destination (issue #348 PT07 — a discovery record of type
 * "uncharted": the coordinates an NPC gave, "the gap") has been reached and
 * charted. The GM marks it explored with `!clear-site <name>`. The "Site
 * Cleared" card read the site's type as a two-way choice — `type === "vault"
 * ? "vault" : "derelict"` — written when vault and derelict were the only
 * site types; PT07 added a third, and this consumer was not updated: "The
 * derelict is fully explored." for a place that is no wreck. It is "the
 * place" now (siteDiscovery.postSiteDiscoveryCard words the same site as "a
 * place no chart showed before").
 *
 * On a booted table: the GM types the command; the real route and handler run.
 * (The probe tests/probes/uisec/unchartedSiteClearedAsDerelict.probe.js runs
 * the same card after charting the place through the pipeline.)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table;
const clearedCards = () => table.cards(f => f.siteCleared);
const site = (id) => table.world.campaignState().sectors[0].mapData.discoveries.find(d => d.id === id);

function location(id, name, type) {
  return table.addActor({ id, type: "location", name, system: { subtype: type },
    flags: { [MODULE_ID]: { entityType: "location", entityId: `rec-${id}`,
      location: { _id: `rec-${id}`, name, type, status: "visited", sectorId: "sec-1" } } } });
}

async function gmTypes(line) {
  await table.client("gm-1").chat(line);
  await table.settle();
  await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: "sess-1", sessionNumber: 2,
      sectors: [{ id: "sec-1", name: "Outlands Mark", region: "outlands", mapData: { settlements: [], discoveries: [
        { id: "site-gap",   type: "uncharted", name: "Archer's Rendezvous", discovered: true, workingLabel: true, actorId: "loc-gap" },
        { id: "site-wreck", type: "derelict",  name: "Derelict Starship",   discovered: true, actorId: "loc-wreck" },
        { id: "site-vault", type: "vault",     name: "Precursor Vault — Spire", discovered: true, actorId: "loc-vault" },
      ] } }],
      activeSectorId: "sec-1", locationIds: ["loc-gap", "loc-wreck", "loc-vault"],
    },
  } } });
  location("loc-gap", "Archer's Rendezvous", "uncharted");
  location("loc-wreck", "Derelict Starship", "derelict");
  location("loc-vault", "Precursor Vault — Spire", "vault");
});

describe("!clear-site names the kind of site it clears (issue #362 AC52)", () => {
  it("control: a derelict is cleared, and its card calls it the derelict", async () => {
    await gmTypes("!clear-site Derelict Starship");
    expect(site("site-wreck").cleared).toBe(true);
    const [card] = clearedCards();
    expect(card.content).toContain("Site Cleared — Derelict Starship");
    expect(card.content).toContain("The derelict is fully explored.");
  }, 30_000);

  it("an uncharted destination is cleared — and its card does not call it a derelict", async () => {
    await gmTypes("!clear-site Archer's Rendezvous");
    expect(site("site-gap").cleared).toBe(true);          // the clear itself works
    const [card] = clearedCards();
    expect(card.content).toContain("Site Cleared — Archer's Rendezvous");
    // It said "The derelict is fully explored."
    expect(card.content).not.toMatch(/\bThe (derelict|vault) is fully explored/);
    expect(card.content).toContain("The place is fully explored.");
  }, 30_000);

  it("control: a vault is cleared, and its card calls it the vault", async () => {
    await gmTypes("!clear-site Precursor Vault — Spire");
    expect(site("site-vault").cleared).toBe(true);
    const [card] = clearedCards();
    expect(card.content).toContain("The vault is fully explored.");
  }, 30_000);
});

/**
 * PROBE (sectors audit, SO-02) — the U58 shape at five more sites: a handler
 * sets its change on the value `game.settings.get` returned (this client's
 * cached campaignState, by reference) BEFORE a write that can be refused.
 *
 *   !reveal-site / !clear-site   siteDiscovery.js revealSectorSite / clearSectorSite
 *                                (`match.discovered = true` / `record.cleared = true`
 *                                on the store they read, default seams)
 *   !oracle-add                  customOracles.js saveCustomOracle
 *                                (`state.customOracles[id] = …`, and the table
 *                                registered locally first); removeCustomOracle alike
 *   oracle-memory capture        index.js registerOracleMemoryCaptureHook
 *                                (recordOracleResult pushes onto the cached ring)
 *   !lore                        truths/generator.js generateLoreRecap
 *                                (`campaignState.loreRecap = recap` on the cache
 *                                handleLoreCommand passed)
 *
 * What the user does: the GM runs one of these and the world refuses the
 * write (a server error, a dropped connection).
 * What happens: the GM's client keeps the change the world refused. A site
 * reads as revealed there, so a retried `!reveal-site` finds "no matching
 * unexplored site"; a custom table rolls on the GM's client only (no card
 * says it was not saved); and the GM's next whole-object write — any of
 * them — carries the refused change into the world after all.
 * What should happen (rules/foundry-api.md, "set nothing on it before a write
 * that can fail"; decisions.md issue #321 U58): a refused write leaves the
 * GM's cache, and later writes, as they were.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS } from "../../helpers/multiClient.js";
import { failWrites, campaignStateWrite } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const MODULE_ID = "starforged-companion";

let table;
const gm = () => table.client("gm-1");
const world = () => table.world.campaignState();
const gmCache = () => gm().getSetting("campaignState");

async function type(userId, content) {
  await table.client(userId).chat(content);
  await table.settle();
}

const SITE_ACTOR = "loc-derelict-1";

async function seed(extra = {}) {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    currentSessionId: "sess-1",
    sectors: [{
      id: "s1", name: "Devil's Maw", region: "outlands", regionLabel: "Outlands", sceneId: null,
      mapData: { sectorId: "s1", settlements: [], passages: [], discoveries: [
        { id: "site-1", name: "Derelict Starship", type: "derelict", discovered: false, actorId: SITE_ACTOR },
      ] },
    }],
    activeSectorId: "s1",
    locationIds: [SITE_ACTOR],
    ...extra,
  } } } });
  table.addActor({
    id: SITE_ACTOR, name: "Derelict Starship", type: "location",
    flags: { [MODULE_ID]: { entityType: "location", entityId: "e-site-1",
      location: { _id: "e-site-1", name: "Derelict Starship", type: "derelict", status: "unexplored", sectorId: "s1" } } },
  });
}

describe("PROBE SO-02: a refused campaignState write leaves the GM's cache as it was", () => {
  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => { await seed(); });

  it("!reveal-site refused: the site is not revealed on the GM's client either", async () => {
    silenceConsoleErrors();
    failWrites(table, campaignStateWrite("gm-1"), { times: 1 });
    await type("gm-1", "!reveal-site Derelict Starship");

    expect(world().sectors[0].mapData.discoveries[0].discovered).toBe(false);   // the world refused it
    // FAILS today: true — the record in the GM's cache was flipped before the write.
    expect(gmCache().sectors[0].mapData.discoveries[0].discovered).toBe(false);
  });

  it("!reveal-site refused: the GM's retry reveals the site", async () => {
    silenceConsoleErrors();
    failWrites(table, campaignStateWrite("gm-1"), { times: 1 });
    await type("gm-1", "!reveal-site Derelict Starship");
    await type("gm-1", "!reveal-site Derelict Starship");

    // FAILS today: false — the retry finds "No matching unexplored site to
    // reveal" (the GM's cache says it is revealed), so it cannot be retried
    // until a reload, while its Actor already reads "visited".
    expect(world().sectors[0].mapData.discoveries[0].discovered).toBe(true);
  });

  it("!oracle-add refused: the unsaved table is not kept in the GM's cache", async () => {
    silenceConsoleErrors();
    failWrites(table, campaignStateWrite("gm-1"), { times: 1 });
    gm().answerDialogs(d => d.submit({
      'input[name="tableId"]':    "wary",
      'input[name="name"]':       "Wariness",
      'textarea[name="entries"]': "1-3 Calm\n4-6 Wary",
    }));
    await type("gm-1", "!oracle-add");
    expect(world().customOracles?.wary).toBeUndefined();                        // the world refused it
    expect(table.cards(f => f.customOracleCard)).toEqual([]);                   // and no card says otherwise

    // FAILS today: the table sits in the GM's cache (and is registered there).
    expect(gmCache().customOracles?.wary).toBeUndefined();
  });

  it("!oracle-add refused: the GM's next unrelated write does not carry the unsaved table into the world", async () => {
    silenceConsoleErrors();
    failWrites(table, campaignStateWrite("gm-1"), { times: 1 });
    gm().answerDialogs(d => d.submit({
      'input[name="tableId"]':    "wary",
      'input[name="name"]':       "Wariness",
      'textarea[name="entries"]': "1-3 Calm\n4-6 Wary",
    }));
    await type("gm-1", "!oracle-add");
    expect(world().customOracles?.wary).toBeUndefined();

    // Any later whole-object write from the GM — here the oracle-memory
    // capture of an !oracle roll — writes the cached object.
    await type("gm-1", "!oracle yes is the hatch sealed");
    // FAILS today: the refused table is now in the world, on every client.
    expect(world().customOracles?.wary).toBeUndefined();
  });

  it("oracle-memory capture refused: the GM's narrator does not see a result the world never stored", async () => {
    silenceConsoleErrors();
    failWrites(table, campaignStateWrite("gm-1"), { times: 1 });
    await type("pl-1", "!oracle yes is the hatch sealed");

    expect(world().recentOracles ?? []).toEqual([]);                            // refused
    // FAILS today: the GM's cached ring holds it (RECENT ORACLE RESULTS reads it).
    expect(gmCache().recentOracles ?? []).toEqual([]);
  });

  it("!lore refused: the recap the world refused stays out of the GM's cache", async () => {
    silenceConsoleErrors();
    await seed({ worldTruths: { iron: { categoryName: "Iron", title: "Iron vows are sworn upon black iron." } } });
    await table.setClaudeKey("gm-1", "sk-ant-gina");
    table.claude.respond(() => "Black iron remembers every oath.");
    failWrites(table, campaignStateWrite("gm-1"), { times: 1 });
    await type("gm-1", "!lore");

    expect(table.claude.calls.some(c => /world-weary spacer narrator/.test(c.system))).toBe(true);
    expect(world().loreRecap ?? "").toBe("");                                   // refused
    // FAILS today: the cache handleLoreCommand passed was given the recap first.
    expect(gmCache().loreRecap ?? "").toBe("");
  });
});

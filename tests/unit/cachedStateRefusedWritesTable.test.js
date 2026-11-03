// tests/unit/cachedStateRefusedWritesTable.test.js
// A refused campaignState write leaves the GM's cached value — and the cards
// — as the world holds it, across a simulated table (issue #326 W51;
// rules/foundry-api.md). The command writers set their change on the cached
// value before the write: after a refusal the card still claimed it
// (!pace / !roll), a site read as revealed on the GM's client so the retry
// found "no matching unexplored site" (!reveal-site), the narrator saw an
// oracle result the world never stored (the oracle-memory capture), a recap
// sat in the cache (!lore), a custom table rolled on the GM's client only
// and the GM's next whole-object write carried it into the world
// (!oracle-add). (Unit-level cases: cachedStateRefusedWrites.test.js.)

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS } from "../helpers/multiClient.js";
import { failWrites, campaignStateWrite } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const MODULE_ID = "starforged-companion";
const KEY = `${MODULE_ID}.campaignState`;
const SITE_ACTOR = "loc-derelict-1";

let table;
const gm      = () => table.client("gm-1");
const world   = () => table.world.campaignState();
const gmCache = () => gm().getSetting("campaignState");

async function type(userId, content) {
  await table.client(userId).chat(content);
  await table.settle();
}

/** Refuse every campaignState write the GM's client makes (a server error, a dropped socket). */
function refuseGmCampaignStateWrites() {
  table.interceptWrites(w => (w.kind === "setting" && w.key === KEY && w.client === "gm-1")
    ? new Error("Setting [campaignState] could not be saved: the server refused the write")
    : undefined);
}

async function seed(extra = {}) {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: "sess-1", sessionNumber: 1,
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

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { await seed(); });

describe("!pace / !roll / the oracle-memory capture refused (issue #326 W51)", () => {
  it("!pace hot: a refused write leaves no override in the GM's cache, and the card does not claim one", async () => {
    silenceConsoleErrors();
    refuseGmCampaignStateWrites();
    await type("gm-1", "!pace hot");
    expect(world().pacing?.sceneOverride ?? null).toBeNull();
    expect(gmCache().pacing?.sceneOverride ?? null).toBeNull();
    const card = table.cards(f => f.paceCommandCard).at(-1);
    expect(card.content).not.toMatch(/override set to/i);
    expect(card.content).toMatch(/not set/i);
  }, 30_000);

  it("!roll: a refused write leaves no force flag in the GM's cache, and the card does not claim one", async () => {
    silenceConsoleErrors();
    refuseGmCampaignStateWrites();
    await type("gm-1", "!roll");
    expect(world().pacing?.forceNextAsMove ?? false).toBe(false);
    expect(gmCache().pacing?.forceNextAsMove ?? false).toBe(false);
    const card = table.cards(f => f.rollCommandCard).at(-1);
    expect(card.content).not.toMatch(/will route to the move interpreter/i);
    expect(card.content).toMatch(/not recorded/i);
  }, 30_000);

  it("oracle memory: a refused capture leaves the GM's cached recentOracles equal to the world's", async () => {
    silenceConsoleErrors();
    refuseGmCampaignStateWrites();
    await type("pl-1", "!oracle yes likely is the hatch sealed");
    expect(world().recentOracles ?? []).toEqual([]);
    expect(gmCache().recentOracles ?? []).toEqual([]);
  }, 30_000);

  it("control: without a refusal each lands in the world", async () => {
    await type("gm-1", "!pace hot");
    expect(world().pacing?.sceneOverride?.modifier).toBe(3);
    await type("gm-1", "!roll");
    expect(world().pacing?.forceNextAsMove).toBe(true);
    await type("pl-1", "!oracle yes likely is the hatch sealed");
    expect(world().recentOracles?.length).toBe(1);
  }, 30_000);
});

describe("!reveal-site / !clear-site / !oracle-add / !lore refused (issue #326 W51)", () => {
  it("!reveal-site refused: the site is not revealed on the GM's client either", async () => {
    silenceConsoleErrors();
    failWrites(table, campaignStateWrite("gm-1"), { times: 1 });
    await type("gm-1", "!reveal-site Derelict Starship");
    expect(world().sectors[0].mapData.discoveries[0].discovered).toBe(false);
    expect(gmCache().sectors[0].mapData.discoveries[0].discovered).toBe(false);
  });

  it("!reveal-site refused: the GM's retry reveals the site", async () => {
    silenceConsoleErrors();
    failWrites(table, campaignStateWrite("gm-1"), { times: 1 });
    await type("gm-1", "!reveal-site Derelict Starship");
    await type("gm-1", "!reveal-site Derelict Starship");
    expect(world().sectors[0].mapData.discoveries[0].discovered).toBe(true);
  });

  it("!clear-site refused: the site is not cleared on the GM's client either, and the retry clears it", async () => {
    silenceConsoleErrors();
    await type("gm-1", "!reveal-site Derelict Starship");
    failWrites(table, campaignStateWrite("gm-1"), { times: 1 });
    await type("gm-1", "!clear-site Derelict Starship");
    expect(world().sectors[0].mapData.discoveries[0].cleared ?? false).toBe(false);
    expect(gmCache().sectors[0].mapData.discoveries[0].cleared ?? false).toBe(false);
    await type("gm-1", "!clear-site Derelict Starship");
    expect(world().sectors[0].mapData.discoveries[0].cleared).toBe(true);
  });

  it("!oracle-add refused: the unsaved table is in neither the world nor the GM's cache, and the card says so", async () => {
    silenceConsoleErrors();
    failWrites(table, campaignStateWrite("gm-1"), { times: 1 });
    gm().answerDialogs(d => d.submit({
      'input[name="tableId"]':    "wary",
      'input[name="name"]':       "Wariness",
      'textarea[name="entries"]': "1-3 Calm\n4-6 Wary",
    }));
    await type("gm-1", "!oracle-add");
    expect(world().customOracles?.wary).toBeUndefined();
    expect(gmCache().customOracles?.wary).toBeUndefined();
    const cards = table.cards(f => f.customOracleCard);
    expect(cards.map(c => c.content).join(" ")).not.toMatch(/registered/);
    expect(cards.at(-1)?.content ?? "").toMatch(/not saved/);
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
    // A later whole-object write from the GM — the oracle-memory capture of a roll.
    await type("gm-1", "!oracle yes is the hatch sealed");
    expect(world().customOracles?.wary).toBeUndefined();
  });

  it("!lore refused: the recap the world refused stays out of the GM's cache", async () => {
    silenceConsoleErrors();
    await seed({ worldTruths: { iron: { categoryName: "Iron", title: "Iron vows are sworn upon black iron." } } });
    await table.setClaudeKey("gm-1", "sk-ant-gina");
    table.claude.respond(() => "Black iron remembers every oath.");
    failWrites(table, campaignStateWrite("gm-1"), { times: 1 });
    await type("gm-1", "!lore");
    expect(table.claude.calls.some(c => /world-weary spacer narrator/.test(c.system))).toBe(true);
    expect(world().loreRecap ?? "").toBe("");
    expect(gmCache().loreRecap ?? "").toBe("");
  });

  it("control: !reveal-site and !lore land when the world takes the write", async () => {
    await type("gm-1", "!reveal-site Derelict Starship");
    expect(world().sectors[0].mapData.discoveries[0].discovered).toBe(true);
    await seed({ worldTruths: { iron: { categoryName: "Iron", title: "Iron vows are sworn upon black iron." } } });
    await table.setClaudeKey("gm-1", "sk-ant-gina");
    table.claude.respond(() => "Black iron remembers every oath.");
    await type("gm-1", "!lore");
    expect(world().loreRecap).toBe("Black iron remembers every oath.");
  });
});

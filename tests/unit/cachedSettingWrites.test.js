/**
 * STARFORGED COMPANION
 * tests/unit/cachedSettingWrites.test.js
 *
 * Issue #321 U58 — a refused setting write leaves this client's cache as it
 * was. `game.settings.get` returns an object setting's cached value by
 * reference (rules/foundry-api.md), and several handlers set their field on
 * that value and then wrote it. When the write was refused — Take a Break's
 * +1, which the card honestly reports "not recorded" — the GM's cache kept
 * the change anyway: the move pipeline, which reads the same cache, applied
 * the +1 to the next roll, and the GM's next whole-object write (an
 * unrelated Set a Flag) persisted it into the world. Every handler below now
 * writes a copy.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { simulateTable, USERS } from "../helpers/multiClient.js";
import { failWrites, campaignStateWrite } from "../helpers/faults.js";

const MODULE_ID = "starforged-companion";
const CS_KEY    = `${MODULE_ID}.campaignState`;

// ─────────────────────────────────────────────────────────────────────────────
// On a table: the refused Take a Break, then the GM's next write
// ─────────────────────────────────────────────────────────────────────────────

describe("Take a Break on the canonical GM, write refused (issue #321 U58)", () => {
  let table;

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: { campaignState: { sessionActive: true } } } });
  });

  it("a refused Take a Break write leaves no +1 behind on the GM's client", async () => {
    silenceConsoleErrors();
    const gm = table.client("gm-1");
    failWrites(table, campaignStateWrite("gm-1"), { times: 1 });
    gm.answerDialogs(d => d.choose("move_on"));
    await gm.chat("!break");
    await table.settle();

    // The card is honest about the failure …
    const card = table.cards(f => f.takeBreakCard)[0];
    expect(card?.content).toContain("sf-not-recorded");
    expect(table.world.campaignState().nextMoveAdd).toBeUndefined();
    // … and the GM's cached campaignState (what the pipeline reads) agrees.
    expect(gm.getSetting("campaignState").nextMoveAdd).toBeUndefined();
  });

  it("an unrelated later write from the GM does not resurrect the refused +1 into the world", async () => {
    silenceConsoleErrors();
    const gm = table.client("gm-1");
    failWrites(table, campaignStateWrite("gm-1"), { times: 1 });
    gm.answerDialogs(d => d.choose("move_on"));
    await gm.chat("!break");
    await table.settle();
    expect(table.world.campaignState().nextMoveAdd).toBeUndefined();

    // Later the GM sets a flag — applySafetyFlag writes the whole state.
    gm.answerDialogs(d => d.submit({ 'textarea[name="text"]': "spiders", 'select[name="visibility"]': "public" }));
    await gm.chat("!flag");
    await table.settle();

    expect(table.world.campaignState().safetyFlags?.map(f => f.text)).toEqual(["spiders"]);
    expect(table.world.campaignState().nextMoveAdd).toBeUndefined();
  });

  it("a refused `!at <place>` or `!sector <name>` leaves the GM's cached state as it was", async () => {
    silenceConsoleErrors();
    await table.reset({ world: { settings: { campaignState: {
      sessionActive: true, settlementIds: ["actor-bleak"], currentLocationId: null, currentLocationType: null,
      sectors: [{ id: "sec-1", name: "Outlands Mark", regionLabel: "Outlands" }], activeSectorId: null,
    } } } });
    table.addActor({
      id: "actor-bleak", type: "location", name: "Bleakhold",
      flags: { [MODULE_ID]: { entityType: "settlement", settlement: { _id: "rec-bleak", name: "Bleakhold" } } },
    });
    const gm = table.client("gm-1");

    failWrites(table, campaignStateWrite("gm-1"), { times: 1 });
    await gm.chat("!at Bleakhold");
    await table.settle();
    expect(table.world.campaignState().currentLocationId).toBeNull();
    expect(gm.getSetting("campaignState").currentLocationId).toBeNull();

    failWrites(table, campaignStateWrite("gm-1"), { times: 1 });
    await gm.chat("!sector Outlands Mark");
    await table.settle();
    expect(table.world.campaignState().activeSectorId).toBeNull();
    expect(gm.getSetting("campaignState").activeSectorId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Each handler, one client: a refused write changes nothing it cached
// ─────────────────────────────────────────────────────────────────────────────

/** Refuse the next `times` writes of setting `key` ("module.key"); other writes go through. */
function refuse(key, times = 1) {
  const real = game.settings.set.bind(game.settings);
  let left = times;
  return vi.spyOn(game.settings, "set").mockImplementation(async (mod, k, value) => {
    if (`${mod}.${k}` === key && left > 0) {
      left -= 1;
      throw new Error(`test: the world refused the ${k} write`);
    }
    return real(mod, k, value);
  });
}

const cached = (key = CS_KEY) => game.settings._store.get(key);

describe("a refused write leaves this client's cached setting as it was (issue #321 U58)", () => {
  const SEED = () => ({
    sessionActive: true,
    safetyFlags:   [{ _id: "f1", text: "gore", visibility: "public" }],
    safety:        { lines: ["gore"], veils: ["torture"], privateLines: [{ playerId: "pl-9", lines: ["spiders"] }] },
    clocks:        [
      { _id: "c1", name: "Raiders", type: "tension", segments: 6, filled: 3, active: true, advanceOdds: "likely" },
    ],
    currentLocationId:   null,
    currentLocationType: null,
    dismissedEntities:   ["Vex"],
    connectionIds:       [],
  });
  let before;

  beforeEach(() => {
    game.settings._store.set(CS_KEY, SEED());
    game.settings._store.set(`${MODULE_ID}.globalSafetyLines`, ["gore"]);
    game.settings._store.set(`${MODULE_ID}.globalSafetyVeils`, ["torture"]);
    game.settings._store.set(`${MODULE_ID}.privateLines`, ["needles"]);
    before = structuredClone(cached());
  });

  afterEach(() => {
    for (const key of ["campaignState", "globalSafetyLines", "globalSafetyVeils", "privateLines"]) {
      game.settings._store.delete(`${MODULE_ID}.${key}`);
    }
  });

  describe("safety/sessionDialogs.js", () => {
    it("Set a Flag (applySafetyFlag)", async () => {
      const { applySafetyFlag } = await import("../../src/safety/sessionDialogs.js");
      refuse(CS_KEY);
      await expect(applySafetyFlag({ text: "spiders" }, {})).rejects.toThrow(/refused/);
      expect(cached()).toEqual(before);
    });

    it("Take a Break (applyTakeBreak)", async () => {
      const { applyTakeBreak } = await import("../../src/safety/sessionDialogs.js");
      refuse(CS_KEY);
      await expect(applyTakeBreak({}, {})).rejects.toThrow(/refused/);
      expect(cached()).toEqual(before);
    });
  });

  describe("ui/settingsPanel.js", () => {
    let SettingsPanelApp, applyPrivateLinesSync;
    beforeAll(async () => {
      ({ SettingsPanelApp, applyPrivateLinesSync } = await import("../../src/ui/settingsPanel.js"));
    });
    const panel = (value = "spiders") => ({ element: { querySelector: () => ({ value }) }, render() {} });
    const action = (name, app, dataset = {}) =>
      SettingsPanelApp.DEFAULT_OPTIONS.actions[name].call(app, {}, { dataset }).catch(err => err);

    it("a player's Private Lines sync on the GM (applyPrivateLinesSync)", async () => {
      refuse(CS_KEY);
      await expect(applyPrivateLinesSync({ lines: ["snakes"] }, { requesterId: "pl-1" })).rejects.toThrow(/refused/);
      expect(cached()).toEqual(before);
    });

    it("the GM's Lines / Veils sync into campaignState (syncSafetyToCampaignState)", async () => {
      refuse(CS_KEY);
      await action("addLine", panel("snakes"));
      expect(cached(`${MODULE_ID}.globalSafetyLines`)).toEqual(["gore", "snakes"]);   // that write went through
      expect(cached()).toEqual(before);
    });

    it("adding or removing a Line or a Veil", async () => {
      for (const [name, key, dataset] of [
        ["addLine",    "globalSafetyLines", {}],
        ["removeLine", "globalSafetyLines", { item: "gore" }],
        ["addVeil",    "globalSafetyVeils", {}],
        ["removeVeil", "globalSafetyVeils", { item: "torture" }],
      ]) {
        const full = `${MODULE_ID}.${key}`;
        const was = structuredClone(cached(full));
        const spy = refuse(full);
        expect(await action(name, panel(), dataset), name).toBeInstanceOf(Error);
        expect(cached(full), name).toEqual(was);
        spy.mockRestore();
      }
    });

    it("adding or removing a Private Line", async () => {
      const full = `${MODULE_ID}.privateLines`;
      for (const [name, dataset] of [["addPrivateLine", {}], ["removePrivateLine", { item: "needles" }]]) {
        const spy = refuse(full);
        expect(await action(name, panel(), dataset), name).toBeInstanceOf(Error);
        expect(cached(full), name).toEqual(["needles"]);
        spy.mockRestore();
      }
    });
  });

  describe("clocks/clocks.js", () => {
    let clocks;
    beforeAll(async () => { clocks = await import("../../src/clocks/clocks.js"); });

    it("creating a clock (createClock and `!clock new`)", async () => {
      refuse(CS_KEY, 2);
      await expect(clocks.createClock({ name: "Reactor breach", segments: 4 })).rejects.toThrow(/refused/);
      expect(cached()).toEqual(before);
      await expect(clocks.handleClockCommand({ content: "!clock new Pursuit 6 tension" })).rejects.toThrow(/refused/);
      expect(cached()).toEqual(before);
    });

    it("changing a clock (`!clock reset`, through mutateClock)", async () => {
      refuse(CS_KEY);
      await expect(clocks.handleClockCommand({ content: "!clock reset Raiders" })).rejects.toThrow(/refused/);
      expect(cached()).toEqual(before);
    });

    it("Pay the Price's tension-clock advance, and its revert on a burn", async () => {
      refuse(CS_KEY, 2);
      await expect(clocks.advanceTensionClocksForPayThePrice()).rejects.toThrow(/refused/);
      expect(cached()).toEqual(before);
      await expect(clocks.revertTensionClocksForBurn(["c1"])).rejects.toThrow(/refused/);
      expect(cached()).toEqual(before);
    });
  });

  describe("ui/entityPanel.js", () => {
    let EntityPanelApp;
    beforeAll(async () => {
      foundry.applications.api.DialogV2 = { confirm: async () => true };
      ({ EntityPanelApp } = await import("../../src/ui/entityPanel.js"));
    });
    const action = (name, dataset) => EntityPanelApp.DEFAULT_OPTIONS.actions[name]
      .call({ render() {}, element: null }, {}, { dataset }).catch(err => err);

    it("Set as current location", async () => {
      refuse(CS_KEY);
      expect(await action("setCurrentLocation", { journalId: "actor-bleak", type: "settlement" })).toBeInstanceOf(Error);
      expect(cached()).toEqual(before);
    });

    it("Undismiss", async () => {
      refuse(CS_KEY);
      expect(await action("undismiss", { name: "Vex" })).toBeInstanceOf(Error);
      expect(cached()).toEqual(before);
    });
  });
});

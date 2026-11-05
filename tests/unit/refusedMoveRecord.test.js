/**
 * STARFORGED COMPANION
 * tests/unit/refusedMoveRecord.test.js
 *
 * Issue #331 X18 (REFUSED-PERSIST-LOSES-LEGACY-MARK). A move's legacy mark
 * (Make a Discovery, Confront Chaos, a Forge a Bond's bonds legacy, a
 * fulfilment's quests legacy, Finish an Expedition's discoveries), its
 * arrival (`currentLocationId`) and a site reveal live on the pipeline's
 * working copy and reach the world in persistResolution's one write. When
 * the world refused that write the exception fell to the pipeline's catch —
 * "Move interpretation failed. Check your API key…" — and the mark was gone,
 * its "Marked 2 ticks" card standing. A write the world refused after the
 * move resolved goes to the GMs' payoff failure card with a one-press Retry
 * (#306 R04, #315 S08, #326 W52): so does this one now, and the GM's notice
 * says the world did not save the record.
 *
 * On a booted table (tests/helpers/multiClient.js): the GM's real pipeline,
 * the forced moves and the dice scripted at their boundaries.
 */

/* global expectConsoleError */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: null }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    if (!control.dice) return real.resolveMove(...args);
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude, failWrites, campaignStateWrite } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const STRONG_HIT = [0.05, 0.05, 0.99];   // challenge 1, 1; action die 6

let table;
const world = () => table.world.campaignState();
const gm    = () => table.client("gm-1");
/** The move's record: the one campaignState write of the GM's that carries persistResolution's stamp. */
const persistWrite = (w) => campaignStateWrite("gm-1")(w) && !!w.value?.updatedAt && w.value.updatedAt !== (world().updatedAt ?? null);
const failCards = () => table.cards(f => f.payoffFailureCard);

async function kiraMakesADiscovery() {
  control.dice = null;
  await table.client("pl-1").chat("Make a discovery — something wondrous in the ruin.", {
    speaker: { actor: "pc-kira", alias: "Kira" },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: "make_a_discovery" } },
  });
  await table.settle(); await table.drain();
}

async function kiraSetsACourse() {
  control.dice = STRONG_HIT;
  await table.client("pl-1").chat("I set a course for Bleakhold.", {
    speaker: { actor: "pc-kira", alias: "Kira" },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: "set_a_course", forcedMoveTarget: "Bleakhold", forcedMoveTargetId: "actor-bleak" } },
  });
  await table.settle(); await table.drain();
}

async function retry(card) {
  gm().click(card._id, '[data-action="sf-payoff-retry"]');
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "rec-s1", sessionNumber: 1,
      currentSceneId: "rec-scene", sceneTruths: [], clocks: [], legacyTracks: {},
      sectors: [{ id: "sec-1", name: "Reach" }], activeSectorId: "sec-1",
      settlementIds: ["actor-bleak"], shipIds: ["ship-cv"] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
  table.addActor({ id: "ship-cv", type: "starship", name: "Wayfarer",
    flags: { [MODULE_ID]: { entityType: "ship", ship: { _id: "rec-ship", name: "Wayfarer", isCommandVehicle: true } } } });
  table.addActor({ id: "actor-bleak", type: "location", name: "Bleakhold",
    system: { subtype: "settlement", klass: "orbital" },
    flags: { [MODULE_ID]: { entityType: "settlement", settlement: { _id: "rec-bleak", name: "Bleakhold", sectorId: "sec-1" } } } });
  scriptClaude(table, { fallback: () => 'Light spills from the vault.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("X18 — the move's record is refused after a legacy mark", () => {
  it("the GMs get a failure card for the discoveries mark, the notice names the record, and its Retry marks it once", async () => {
    expectConsoleError(/did not save the move's record/);
    const refused = failWrites(table, persistWrite);

    await kiraMakesADiscovery();

    // The move resolved, the player was told the mark landed, the record was refused once.
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    expect(table.cards(f => f.legacyMarkCard && f.track === "discoveries" && f.ticks === 2)).toHaveLength(1);
    expect(refused.refused).toBe(1);
    expect(world().legacyTracks?.discoveries?.ticks ?? 0).toBe(0);
    // The lock is not wedged.
    expect(world().pendingMove).toBe(false);

    const [card] = failCards();
    expect(failCards()).toHaveLength(1);
    expect(card.flags[MODULE_ID]).toMatchObject({ source: "persist", actorId: "pc-kira",
      steps: [{ step: "legacy", track: "discoveries", ticks: 2 }] });
    expect(card.whisper).toEqual(["gm-1"]);
    expect(card.content).toMatch(/Discoveries legacy: \+2 ticks — the world did not save it.*It stands at 0\/40 ticks now/);
    const notices = gm().notifications.map(n => `${n.level}: ${n.message}`);
    expect(notices).toContainEqual(expect.stringMatching(/^error: .*did not save Make a Discovery's record — the roller's meters stand\. What it marked is on the GMs' card, with a Retry\./i));
    expect(notices.some(n => /API key/.test(n))).toBe(false);

    await retry(card);
    expect(world().legacyTracks?.discoveries?.ticks ?? 0).toBe(2);
    await retry(card);                                  // claimed: a second press marks nothing
    expect(world().legacyTracks?.discoveries?.ticks ?? 0).toBe(2);
  }, 30_000);

  it("an arrival on the refused record is a step too, and its Retry sets the current location", async () => {
    expectConsoleError(/did not save the move's record/);
    const refused = failWrites(table, persistWrite);

    await kiraSetsACourse();

    expect(refused.refused).toBe(1);
    expect(world().currentLocationId ?? null).toBeNull();
    const [card] = failCards();
    expect(card.flags[MODULE_ID].steps).toEqual([{ step: "arrival", locationId: "actor-bleak", locationType: "settlement", name: "Bleakhold" }]);
    expect(card.content).toMatch(/current location: Bleakhold — the world did not save it.*\. It is nowhere now\./);

    await retry(card);
    expect(world().currentLocationId).toBe("actor-bleak");
    expect(world().currentLocationType).toBe("settlement");
  }, 30_000);

  it("control: with the write accepted the world has the 2 ticks and no failure card", async () => {
    await kiraMakesADiscovery();

    expect(world().legacyTracks?.discoveries?.ticks ?? 0).toBe(2);
    expect(failCards()).toHaveLength(0);
  }, 30_000);
});

describe("X18 — a refused site reveal's Retry (saveSiteDiscovered)", () => {
  async function storeSite(discovered = false) {
    await gm().run(() => game.settings.set(MODULE_ID, "campaignState", { ...world(),
      sectors: [{ id: "sec-1", name: "Reach", mapData: { discoveries: [{ id: "site-1", type: "derelict", name: "Hollow Bride", discovered }] } }] }));
    await table.settle();
  }
  const save = async (ref) => {
    const { saveSiteDiscovered } = await gm().import("../../src/sectors/siteDiscovery.js");
    return gm().run(() => saveSiteDiscovered(ref));
  };
  const siteNow = () => world().sectors[0].mapData.discoveries[0];

  it("saves the discovered flag on the latest store", async () => {
    await storeSite(false);
    await expect(save({ sectorId: "sec-1", siteId: "site-1" })).resolves.toEqual({ ok: true });
    expect(siteNow().discovered).toBe(true);
  });

  it("a site no longer on the map is not saved, and says why", async () => {
    await storeSite(false);
    await expect(save({ sectorId: "sec-1", siteId: "site-gone" })).resolves.toEqual({ ok: false, reason: "site-gone" });
    await expect(save({ sectorId: null, siteId: "site-1" })).resolves.toEqual({ ok: false, reason: "invalid step" });
  });

  it("a refused write is reported, not thrown", async () => {
    await storeSite(false);
    failWrites(table, campaignStateWrite("gm-1"));
    await expect(save({ sectorId: "sec-1", siteId: "site-1" })).resolves.toMatchObject({ ok: false, reason: "refused" });
    expect(siteNow().discovered).toBe(false);
  });
});

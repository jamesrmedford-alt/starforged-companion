/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/upgradeRefusedWritesOnRetryCard.test.js
 *
 * Issue #362 AC49 UNCHARTED-DESTINATION-NOT-ON-RETRY-CARD — its second path,
 * found by the AC49 fix (P5): a Burn Momentum or Improve Result saves its own
 * effects (no persistResolution follows), and two of them were saved with
 * `persistCampaignStateFields`, which logs a refusal and goes on — an arrival's
 * current location (a Set a Course miss upgraded to a hit) and an uncharted
 * destination's discovery record (an Undertake an Expedition miss upgraded to
 * a hit). A refused write was a console line: no card, no Retry — the
 * expedition's site link named a discovery no stored sector held, so its
 * finish charted nothing; the narrator's CURRENT LOCATION stayed where the
 * crew set out.
 *
 * Fixed: each refused write is a step on the upgrade's payoff card ("Upgraded
 * result not fully applied"), whose Retry saves it — the same `arrival` and
 * `uncharted` steps the move record's card carries (X18).
 *
 * On a booted table, as tests/unit/unchartedDestinationRetry.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ interpretation: null, dice: [] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude, failWrites, campaignStateWrite } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const REPLY = 'The stars wheel past.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const GAP      = "Archer's rendezvous — the gap";
const GAP_SITE = "Archer's Rendezvous — The Gap";
const GRID = 100;
const PORT_XY  = { x: 2 * GRID, y: 2 * GRID };
const BLEAK_XY = { x: 9 * GRID, y: 4 * GRID };
// challenge 6, 7; action die 1 + 2 (or 3) — a miss; momentum 9 burns it to a strong hit
const MISS = [0.55, 0.65, 0.0];
const BURN  = '[data-action="sf-burn-momentum"]';
const RETRY = '[data-action="sf-payoff-retry"]';

let table, tracksStore, scene;
const tracks = () => tracksStore[`${MODULE_ID}.tracks`] ?? [];
const state  = () => table.world.campaignState();
const storedSites = () => state().sectors.find(s => s.id === "sec-1").mapData.discoveries ?? [];
const upgradeCards = () => table.cards(f => f.payoffFailureCard && f.source === "upgrade");

function pin(id, xy, text, flags) {
  return { id, x: xy.x, y: xy.y, text, flags: { [MODULE_ID]: { sectorNote: true, ...flags } },
    update: vi.fn(async function (patch) { Object.assign(this, patch); }) };
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => { table?.scenes.delete("scene-1"); table?.teardown(); });

beforeEach(async () => {
  tracksStore = { [`${MODULE_ID}.tracks`]: [] };
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: "ac49u-s1", sessionNumber: 2,
      currentSceneId: "sc-1", sceneTruths: [],
      sectors: [{ id: "sec-1", name: "Outlands Mark", region: "outlands", regionLabel: "Outlands", sceneId: "scene-1",
        mapData: { settlements: [{ id: "gen-B", name: "Bleakhold", gridX: 9, gridY: 4 }], discoveries: [] } }],
      activeSectorId: "sec-1",
      settlementIds: ["actor-port", "actor-bleak"], shipIds: ["ship-cv"], locationIds: [],
      currentLocationId: "actor-port", currentLocationType: "settlement",
    },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: 9, max: 10, min: -6, resetValue: 2 }, supply: 2 } });
  table.addActor({ id: "ship-cv", type: "starship", name: "Wayfinder",
    flags: { [MODULE_ID]: { entityType: "ship", ship: { _id: "rec-ship", name: "Wayfinder", isCommandVehicle: true,
      position: { sectorId: "sec-1", nearestSettlementId: "actor-port", nearestPlanetId: null, nearestLocationId: null,
        freeText: "", updatedAt: 1, updatedBy: "set_a_course", narrationId: null, previous: null, tokenBefore: null } } } } });
  for (const [id, name] of [["actor-port", "Port Vigil"], ["actor-bleak", "Bleakhold"]]) {
    table.addActor({ id, type: "location", name,
      flags: { [MODULE_ID]: { entityType: "settlement", settlement: { _id: `rec-${id}`, name, sectorId: "sec-1" } } } });
  }
  table.journal._set({ id: "tracks-journal", name: "Starforged Progress Tracks",
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); } });
  scene = {
    id: "scene-1", grid: { size: GRID }, flags: { [MODULE_ID]: { sectorScene: true, sectorId: "sec-1" } },
    dimensions: { sceneX: 200, sceneY: 200, sceneWidth: 1792, sceneHeight: 1024 },
    notes: { contents: [
      pin("note-port", PORT_XY, "Port Vigil", { settlementId: "gen-P", actorId: "actor-port", locationType: "orbital" }),
      pin("note-bleak", BLEAK_XY, "Bleakhold", { settlementId: "gen-B", actorId: "actor-bleak", locationType: "orbital" }),
    ] },
    drawings: { contents: [] },
    tokens: { contents: [{ id: "tok-ship", x: PORT_XY.x, y: PORT_XY.y, flags: { [MODULE_ID]: { commandVehicle: true } },
      update: vi.fn(async function (patch) { Object.assign(this, patch); }) }] },
    createEmbeddedDocuments: vi.fn(async (type, data) => {
      const docs = data.map((d, i) => ({ id: `${type}-${i}`, ...d, update: vi.fn(async function (patch) { Object.assign(this, patch); }) }));
      if (type === "Note") scene.notes.contents.push(...docs);
      if (type === "Drawing") scene.drawings.contents.push(...docs);
      return docs;
    }),
  };
  table.scenes.set("scene-1", scene);
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});

async function missThenBurn(interpretation, line) {
  control.interpretation = { adds: 0, rationale: "test", mischiefApplied: false, ...interpretation };
  control.dice = MISS;
  await table.client("pl-1").chat(line, { speaker: { actor: "pc-kira" } });
  await table.settle(); await table.drain();
  const card = table.cards(f => f.moveResolution).at(-1);
  expect(card.flags[MODULE_ID].burn?.canBurn, "the miss can be burned (setup)").toBe(true);
  await table.client("pl-1").click(card._id, BURN);
  await table.settle(); await table.drain();
  expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed, "the burn landed (setup)").toBe(true);
  return card;
}

const course = () => missThenBurn({ moveId: "set_a_course", moveName: "Set A Course", statUsed: "supply", moveTarget: "Bleakhold" },
  "We hold the course for Bleakhold.");
const expedition = () => missThenBurn({ moveId: "undertake_an_expedition", moveName: "Undertake An Expedition", statUsed: "wits", moveTarget: GAP },
  "We follow the coordinates Archer gave us, out into the gap.");

describe("issue #362 AC49 — an upgrade's own refused writes are on its payoff card, with a Retry", () => {
  it("control: a Set a Course miss burned to a hit arrives — the current location is Bleakhold, and no card is posted", async () => {
    await course();
    expect(state().currentLocationId).toBe("actor-bleak");
    expect(upgradeCards()).toEqual([]);
  }, 30_000);

  it("the arrival's current location refused: it is a step on the upgrade's card, and its Retry saves it", async () => {
    const refused = failWrites(table, (w) => campaignStateWrite("gm-1")(w) && w.value?.currentLocationId === "actor-bleak"
      && state().currentLocationId !== "actor-bleak");
    const card = await course();
    expect(refused.refused, "the arrival's write was refused (setup)").toBe(1);
    // The miss set out (issue #393 D1): between places, where the refused arrival left them.
    expect(state().currentLocationId).toBeNull();

    expect(upgradeCards()).toHaveLength(1);
    const [fail] = upgradeCards();
    expect(fail.flags[MODULE_ID].steps).toContainEqual(expect.objectContaining({ step: "arrival", locationId: "actor-bleak", locationType: "settlement" }));
    expect(String(table.world.message(card._id).content)).toMatch(/Not applied:[^<]*current location Bleakhold/);

    await table.client("gm-1").click(fail._id, RETRY);
    await table.settle(); await table.drain();
    expect(state().currentLocationId).toBe("actor-bleak");
    expect(upgradeCards()).toHaveLength(1);   // the Retry failed no step again
  }, 30_000);

  it("control: an Undertake an Expedition miss burned to a hit records the uncharted destination on its stored sector", async () => {
    await expedition();
    const [track] = tracks();
    expect(storedSites()).toEqual([expect.objectContaining({ id: track.siteId, name: GAP_SITE, type: "uncharted", workingLabel: true })]);
    expect(upgradeCards()).toEqual([]);
  }, 30_000);

  it("the uncharted destination's record refused: it is a step on the upgrade's card, and its Retry stores it — once", async () => {
    const refused = failWrites(table, (w) => campaignStateWrite("gm-1")(w)
      && (w.value?.sectors ?? []).some(s => (s?.mapData?.discoveries ?? []).some(d => d?.name === GAP_SITE))
      && !storedSites().some(d => d?.name === GAP_SITE));
    const card = await expedition();
    expect(refused.refused, "the record's write was refused (setup)").toBe(1);
    const [track] = tracks();
    expect(track?.siteId, "the expedition is linked to its site (setup)").toBeTruthy();
    expect(storedSites()).toEqual([]);

    expect(upgradeCards()).toHaveLength(1);
    const [fail] = upgradeCards();
    expect(fail.flags[MODULE_ID].steps).toContainEqual(expect.objectContaining({
      step: "uncharted", sectorId: "sec-1", site: expect.objectContaining({ id: track.siteId, type: "uncharted", name: GAP_SITE }),
    }));
    expect(String(table.world.message(card._id).content)).toMatch(/Not applied:[^<]*uncharted destination/);

    await table.client("gm-1").click(fail._id, RETRY);
    await table.settle(); await table.drain();
    expect(storedSites().filter(d => d.id === track.siteId)).toEqual([
      expect.objectContaining({ id: track.siteId, name: GAP_SITE, type: "uncharted", discovered: false }),
    ]);
  }, 30_000);
});

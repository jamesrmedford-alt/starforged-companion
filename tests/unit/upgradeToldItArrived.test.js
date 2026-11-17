/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/upgradeToldItArrived.test.js
 *
 * Issue #362 AC06 ARRIVAL-LINE-LOST-ON-UPGRADE (an incomplete fix of issue
 * #348 PT08). A Set a Course weak hit arrives at the roll, and its narration
 * is told "[ARRIVAL: The ship has ARRIVED at <place>. Open the scene there …]".
 * Burned or improved to a strong hit, the upgraded result is narrated in its
 * place — with the result held (the default), as the move's ONE narration —
 * but from a resolution built fresh, and applyOutcomeEffects appended the line
 * only for an upgrade that itself arrives (from a miss): the strong hit was
 * narrated from "Arrived, situation favors you" with no place, the prompt
 * PT08 was filed for.
 *
 * Fixed: the move card's upgrade state carries the place the roll arrived at
 * (`move.arrivalPlace`), and an upgrade of a hit tells its narration the ship
 * arrived there, in the upgraded outcome's words — with no second docking.
 *
 * From the probes tests/probes/idxb/arrivalLineLostOnWeakToStrongUpgrade.probe.js,
 * idxa/heldBurnedCourseNotToldArrival.probe.js and
 * pipe/heldUpgradeNarrationLosesRollContext.probe.js, with their controls.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const control = vi.hoisted(() => ({ interpretation: null, dice: [], abilities: [] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => control.abilities),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/entities/entityExtractor.js", async (original) => ({
  ...(await original()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
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
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const REPLY = 'The docking clamps close around the hull.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const GRID = 100;
const PORT_XY  = { x: 2 * GRID, y: 2 * GRID };
const BLEAK_XY = { x: 9 * GRID, y: 4 * GRID };
const WEAK = [0.25, 0.65, 0.5];    // challenge 3, 7; action 4 + supply 3 = 7: a weak hit (momentum 9 burns it to a strong hit)
const BURN    = '[data-action="sf-burn-momentum"]';
const IMPROVE = '[data-action="sf-improve-result"]';
const KEEP    = '[data-action="sf-keep-result"]';
const FUGITIVE = [{ assetId: null, assetName: "Fugitive", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];
const ARRIVED_AT_BLEAKHOLD = "[ARRIVAL: The ship has ARRIVED at Bleakhold. Open the scene there";
const COURSE = { adds: 0, rationale: "test", mischiefApplied: false,
  moveId: "set_a_course", moveName: "Set A Course", statUsed: "supply", moveTarget: "Bleakhold" };

let table, token, seq = 0;

const settlement = (id, name) => table.addActor({
  id, type: "location", name,
  flags: { [MODULE_ID]: { entityType: "settlement", settlement: { _id: `rec-${id}`, name, sectorId: "sec-1" } } },
});
function pin(id, xy, text, flags) {
  return { id, x: xy.x, y: xy.y, text, flags: { [MODULE_ID]: { sectorNote: true, ...flags } },
    update: vi.fn(async function (patch) { Object.assign(this, patch); }) };
}

async function seat({ momentum = 9, settings = {} } = {}) {
  control.abilities = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false, ...settings,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: "ac06-s1", sessionNumber: 2,
      currentSceneId: "sc-1", sceneTruths: [],
      sectors: [{ id: "sec-1", name: "Outlands Mark", region: "outlands", sceneId: "scene-1", mapData: { settlements: [], discoveries: [] } }],
      activeSectorId: "sec-1",
      settlementIds: ["actor-port", "actor-bleak"], shipIds: ["ship-cv"],
      currentLocationId: "actor-port", currentLocationType: "settlement",
    },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, items: { contents: [] },
    system: { momentum: { value: momentum, max: 10, min: -6, resetValue: 2 }, supply: 3 } });
  table.addActor({ id: "pc-ren", name: "Ren", ownership: { "pl-2": 3 }, items: { contents: [] } });
  table.addActor({
    id: "ship-cv", type: "starship", name: "Wayfinder",
    flags: { [MODULE_ID]: { entityType: "ship", ship: {
      _id: "rec-ship", name: "Wayfinder", isCommandVehicle: true,
      position: { sectorId: "sec-1", nearestSettlementId: "actor-port", nearestPlanetId: null, nearestLocationId: null,
        freeText: "", updatedAt: 1, updatedBy: "set_a_course", narrationId: null, previous: null, tokenBefore: null },
    } } },
  });
  settlement("actor-port", "Port Vigil");
  settlement("actor-bleak", "Bleakhold");
  token = { id: "tok-ship", x: PORT_XY.x, y: PORT_XY.y, flags: { [MODULE_ID]: { commandVehicle: true } },
    update: vi.fn(async function (patch) { Object.assign(this, patch); }) };
  table.scenes.set("scene-1", {
    id: "scene-1", grid: { size: GRID },
    flags: { [MODULE_ID]: { sectorScene: true, sectorId: "sec-1" } },
    notes: { contents: [
      pin("note-port", PORT_XY, "Port Vigil", { settlementId: "gen-P", actorId: "actor-port", locationType: "orbital" }),
      pin("note-bleak", BLEAK_XY, "Bleakhold", { settlementId: "gen-B", actorId: "actor-bleak", locationType: "orbital" }),
    ] },
    drawings: { contents: [] },
    tokens: { contents: [token] },
  });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
}

async function setACourseWeak() {
  control.interpretation = { ...COURSE };
  control.dice = WEAK;
  await table.client("pl-1").chat("We plot the jump and hold the course for Bleakhold.", { speaker: { actor: "pc-kira" } });
  await table.settle();
  await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle();
  await table.drain();
}

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import("../../src/multiplayer/gmRelay.js");
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

const narratorCalls = () => table.claude.calls.filter(c => /MOVE OUTCOME|Narrate the consequence|THIS ROUND/.test(`${c.system}\n${c.userText}`));
const lastCallText  = () => { const c = narratorCalls().at(-1); return c ? `${c.system}\n${c.userText}` : ""; };
const narrations    = () => table.cards(f => f.narratorCard && f.resolutionId);
const courseCards   = () => table.cards(f => f.setACourseFeedback === true);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => { table?.scenes.delete("scene-1"); table?.teardown(); });

describe("issue #362 AC06 — a Set a Course weak hit upgraded to a strong hit is narrated as an arrival, at its place", () => {
  it("control: a weak hit that offers no burn is narrated at once, told the ship ARRIVED at Bleakhold", async () => {
    await seat({ momentum: 2 });
    const card = await setACourseWeak();
    expect(card.flags[MODULE_ID].awaitingUpgrade).toBeUndefined();
    expect(narrations()).toHaveLength(1);
    expect(lastCallText()).toContain(ARRIVED_AT_BLEAKHOLD);
  }, 30_000);

  it("control: a held weak hit that is KEPT is narrated with the ARRIVAL line", async () => {
    await seat();
    const card = await setACourseWeak();
    expect({ x: token.x, y: token.y }).toEqual(BLEAK_XY);
    await click(card, KEEP);
    expect(narrations()).toHaveLength(1);
    expect(lastCallText()).toContain(ARRIVED_AT_BLEAKHOLD);
  }, 30_000);

  it("held, BURNED to a strong hit: its one narration is told the ship ARRIVED at Bleakhold, in the strong hit's words — and the ship docks no second time", async () => {
    await seat();
    const card = await setACourseWeak();
    expect(card.flags[MODULE_ID].burn.move).toMatchObject({ arrivalPlace: "Bleakhold" });
    const tokenMoves = token.update.mock.calls.length;
    const coursesBefore = courseCards().length;

    await click(card, BURN);

    expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("strong_hit");
    const text = lastCallText();
    expect(text).toMatch(/Arrived, situation favors you/);
    expect(text).toContain(ARRIVED_AT_BLEAKHOLD);
    expect(text).toMatch(/The arrival favours the crew/);
    expect(text).not.toMatch(/The arrival comes with a cost or a complication/);
    // Arrived at the roll: no second docking, no second Set a Course card.
    expect(token.update.mock.calls.length).toBe(tokenMoves);
    expect(courseCards().length).toBe(coursesBefore);
    expect(table.world.getSetting("campaignState").currentLocationId).toBe("actor-bleak");
  }, 30_000);

  it("held, IMPROVED to a strong hit: the same", async () => {
    await seat({ momentum: 2 });
    control.abilities = FUGITIVE;
    const card = await setACourseWeak();
    expect(card.flags[MODULE_ID].awaitingUpgrade?.open).toBe(true);
    await click(card, IMPROVE);
    expect(table.world.message(card._id).flags[MODULE_ID].improve.consumed).toBe(true);
    expect(narrations()).toHaveLength(1);
    expect(lastCallText()).toContain(ARRIVED_AT_BLEAKHOLD);
    expect(lastCallText()).toMatch(/The arrival favours the crew/);
  }, 30_000);

  it("holding off: the burn's RE-narration of the strong hit is told the ship ARRIVED at Bleakhold", async () => {
    await seat({ settings: { holdResultForUpgrade: false } });
    const card = await setACourseWeak();
    expect(narrations()).toHaveLength(1);
    expect(lastCallText()).toContain(ARRIVED_AT_BLEAKHOLD);

    await click(card, BURN);

    expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(lastCallText()).toMatch(/Arrived, situation favors you/);
    expect(lastCallText()).toContain(ARRIVED_AT_BLEAKHOLD);
  }, 30_000);

  it("a Batch Mode round: the entry's weak hit burned before the round is narrated — the round is told the ship arrived", async () => {
    await seat();
    await table.client("gm-1").setSetting("batchMode.enabled", true);
    await table.settle();
    control.interpretation = { ...COURSE };
    control.dice = WEAK;
    const round = () => table.world.getSetting("batchMode.round");
    const submissionId = `sub-ac06-${++seq}`;
    await relay("pl-1", "batch.submit", { roundId: round().id, text: "We hold the course for Bleakhold.", submissionId });
    await relay("pl-1", "batch.confirm", { roundId: round().id, submissionId, choices: {} });
    await relay("pl-2", "batch.pass", { roundId: round().id });
    await table.drain();
    expect(round(), "the round waits on Kira's Burn / Keep (setup)").toMatchObject({ phase: "upgrading" });
    const cardId = round().entries["pl-1"].rolled.cardId;

    await relay("pl-1", "move.burnMomentum", { messageId: cardId });
    await table.drain();

    expect(table.world.message(cardId).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(table.cards(f => f.narratorCard && f.roundId).at(-1)?.flags[MODULE_ID].roundEntries[0].outcome).toBe("strong_hit");
    expect(lastCallText()).toMatch(/THIS ROUND/);
    expect(lastCallText()).toContain(ARRIVED_AT_BLEAKHOLD);
  }, 30_000);
});

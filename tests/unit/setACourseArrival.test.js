/**
 * STARFORGED COMPANION
 * tests/unit/setACourseArrival.test.js
 *
 * Issue #348 — Set a Course arrival (alpha 23 playtest, v1.8.0):
 *
 * PT08: a Strong Hit "Arrived" was narrated as setting off. The narrator got
 *   "[CONSEQUENCE: Arrived, situation favors you. Take +1 momentum.]" with no
 *   place, while the recent scene still had the crew leaving. It is told now:
 *   "The ship has ARRIVED at <place>. Open the scene there", a strong hit's
 *   arrival favouring the crew, ending on something unresolved there.
 * PT09: the card said "Token moved to the destination" whether a place was
 *   named or the token moved. It names the place, says "Token moved" only when
 *   the token moved, and otherwise says the position was not updated and
 *   points to `!at`.
 * PT10: the "Set a Course resolved" card was posted above the roll card it
 *   summarizes. It follows it now.
 *
 * On a booted table (tests/helpers/multiClient.js), with the sector Scene's
 * pins and the ship's token, as arrivalFragmentDocksShip.test.js.
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
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const REPLY = 'The docking clamps close around the hull.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const GRID = 100;
const PORT_XY  = { x: 2 * GRID, y: 2 * GRID };
const BLEAK_XY = { x: 9 * GRID, y: 4 * GRID };
const STRONG = [0.15, 0.25, 0.99];   // challenge 2, 3; action 6 + supply: a strong hit
const WEAK   = [0.25, 0.65, 0.5];    // challenge 3, 7; action 4 + supply 3 = 7: a weak hit

let table, ship, token;

const settlement = (id, name) => table.addActor({
  id, type: "location", name,
  flags: { [MODULE_ID]: { entityType: "settlement", settlement: { _id: `rec-${id}`, name, sectorId: "sec-1" } } },
});
function pin(id, xy, text, flags) {
  return { id, x: xy.x, y: xy.y, text, flags: { [MODULE_ID]: { sectorNote: true, ...flags } },
    update: vi.fn(async function (patch) { Object.assign(this, patch); }) };
}

async function setACourse(target, dice = STRONG) {
  control.interpretation = { adds: 0, rationale: "test", mischiefApplied: false,
    moveId: "set_a_course", moveName: "Set A Course", statUsed: "supply", moveTarget: target };
  control.dice = dice;
  await table.client("pl-1").chat("We plot the jump and hold the course.", { speaker: { actor: "pc-kira" } });
  await table.settle();
  await table.drain();
}

async function seat({ withShip = true } = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: "sess-1", sessionNumber: 2,
      currentSceneId: "sc-1", sceneTruths: [],
      sectors: [{ id: "sec-1", name: "Outlands Mark", region: "outlands", sceneId: "scene-1", mapData: { settlements: [], discoveries: [] } }],
      activeSectorId: "sec-1",
      settlementIds: ["actor-port", "actor-bleak", "actor-rock"], shipIds: withShip ? ["ship-cv"] : [],
      currentLocationId: "actor-port", currentLocationType: "settlement",
    },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 }, supply: 3 } });
  if (withShip) {
    ship = table.addActor({
      id: "ship-cv", type: "starship", name: "Wayfinder",
      flags: { [MODULE_ID]: { entityType: "ship", ship: {
        _id: "rec-ship", name: "Wayfinder", isCommandVehicle: true,
        position: { sectorId: "sec-1", nearestSettlementId: "actor-port", nearestPlanetId: null, nearestLocationId: null,
          freeText: "", updatedAt: 1, updatedBy: "set_a_course", narrationId: null, previous: null, tokenBefore: null },
      } } },
    });
  }
  settlement("actor-port", "Port Vigil");
  settlement("actor-bleak", "Bleakhold");
  settlement("actor-rock", "Rockhome");   // charted, but no pin on this map
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
}

const courseCards = () => table.cards(f => f.setACourseFeedback);
const narrationCall = () => table.claude.calls.filter(c => /SIDECAR|NARRATOR ROLE/.test(c.system ?? "")).at(-1);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => { table?.scenes.delete("scene-1"); table?.teardown(); });

describe("PT08 — the narrator is told the ship has arrived, and where", () => {
  beforeEach(() => seat());

  it("a strong hit's narration is told the ship has ARRIVED at Bleakhold, favouring the crew", async () => {
    await setACourse("Bleakhold");
    const text = narrationCall()?.userText ?? "";
    expect(text).toContain("[ARRIVAL: The ship has ARRIVED at Bleakhold. Open the scene there");
    expect(text).toMatch(/The arrival favours the crew; end the beat on something unresolved there/);
  }, 30_000);

  it("a weak hit's arrival comes with a cost or complication", async () => {
    await setACourse("Bleakhold", WEAK);
    expect(narrationCall()?.userText ?? "").toMatch(/ARRIVED at Bleakhold\..*a cost or a complication/);
  }, 30_000);

  it("a course that names no destination is still told it ARRIVED — at its destination", async () => {
    await setACourse(null);
    expect(narrationCall()?.userText ?? "").toContain("The ship has ARRIVED at its destination");
  }, 30_000);
});

describe("PT09 — the card names the place and says whether the token moved", () => {
  it("the token moved: \"Token moved to Bleakhold\"", async () => {
    await seat();
    await setACourse("Bleakhold");
    const [card] = courseCards();
    expect(card.content).toContain("Arrived at <strong>Bleakhold</strong>");
    expect(card.content).toContain("Token moved to <strong>Bleakhold</strong>");
    expect({ x: token.x, y: token.y }).toEqual(BLEAK_XY);
  }, 30_000);

  it("a charted place no pin marks: the position is set, and the card says the token did not move", async () => {
    await seat();
    await setACourse("Rockhome");
    const [card] = courseCards();
    expect(card.content).not.toContain("Token moved");
    expect(card.content).toMatch(/position is now <strong>Rockhome<\/strong>; no sector-map pin marks it/);
    expect({ x: token.x, y: token.y }).toEqual(PORT_XY);
  }, 30_000);

  it("no destination named: never \"the destination\" as a place — the card points to !at", async () => {
    await seat();
    await setACourse(null);
    const [card] = courseCards();
    expect(card.content).not.toContain("Token moved");
    expect(card.content).toMatch(/position was not updated — no destination was named/);
    expect(card.content).toContain("<code>!at &lt;place&gt;</code>");
  }, 30_000);

  it("no command vehicle: the position was not updated, and the card points to !at", async () => {
    await seat({ withShip: false });
    await setACourse("Bleakhold");
    const [card] = courseCards();
    expect(card.content).not.toContain("Token moved");
    expect(card.content).toMatch(/position was not updated\. Type <code>!at/);
  }, 30_000);
});

describe("PT10 — the Set a Course card follows the roll card it summarizes", () => {
  beforeEach(() => seat());

  it("is posted after the move card", async () => {
    await setACourse("Bleakhold");
    const messages = table.world.messages();
    const moveAt   = messages.findIndex(m => m.flags?.[MODULE_ID]?.moveResolution);
    const courseAt = messages.findIndex(m => m.flags?.[MODULE_ID]?.setACourseFeedback);
    expect(moveAt).toBeGreaterThanOrEqual(0);
    expect(courseAt).toBeGreaterThan(moveAt);
  }, 30_000);
});

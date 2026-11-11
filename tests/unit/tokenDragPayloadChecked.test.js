/**
 * STARFORGED COMPANION
 * tests/unit/tokenDragPayloadChecked.test.js
 *
 * Issue #347 AB23 (TOKEN-DRAG-PAYLOAD-UNCHECKED; the audit's
 * tokenDragPayloadUnchecked probe). A ship-token drop on a settlement pin posts
 * a forced Set a Course carrying `tokenDragSetCourse: { sceneId, tokenId,
 * destX, destY }` on the message's flags (sectorSceneHooks.js
 * dispatchSetACourseFromTokenDrag). index.js read the flag off ANY message and,
 * on a hit, moveCommandVehicleTokenToDestination moved whatever token it named,
 * on whatever Scene, to whatever coordinates — under the update option that
 * makes the module's own token hooks ignore it. Any user can create a chat
 * message with flags, so a player's macro could have the GM's client move an
 * NPC's token on a Scene they cannot see. decisions.md bounds a forged request
 * to "what the UI could have produced": the drop names the command vehicle's
 * token and a settlement pin of its sector Scene.
 *
 * The pipeline now reads the payload through checkedTokenDragCourse: a sector
 * Scene, the command vehicle's token on it, a settlement pin's coordinates —
 * else no token is moved and the move is an ordinary Set a Course.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [] }));
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
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const STRONG_HIT = [0.05, 0.05, 0.99];   // challenge 1, 1; action die 6

let table, pc, shipToken, freighterToken, raiderToken;

function makeToken(id, x, y, flags = {}) {
  const token = { id, x, y, flags, actorId: null };
  token.update = vi.fn(async (changes) => { Object.assign(token, changes); return token; });
  return token;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: "s1", sessionNumber: 1,
      currentSceneId: "scene-1", sceneTruths: [], clocks: [],
      sectors: [{ id: "sec-1", name: "Vega Reach" }], activeSectorId: "sec-1",
      settlementIds: ["actor-bleak"], shipIds: ["ship-cv"],
    },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
  table.addActor({
    id: "ship-cv", type: "starship", name: "Wayfarer",
    flags: { [MODULE_ID]: { entityType: "ship", ship: { _id: "rec-ship", name: "Wayfarer", isCommandVehicle: true, integritySheetReconciled: true } } },
  });
  table.addActor({
    id: "actor-bleak", type: "location", name: "Bleakhold",
    system: { subtype: "settlement", klass: "orbital" },
    flags: { [MODULE_ID]: { entityType: "settlement", settlement: { _id: "rec-bleak", name: "Bleakhold", sectorId: "sec-1" } } },
  });

  // The sector map: the ship's token, another ship's token, and Bleakhold's pin at (500, 300) …
  shipToken      = makeToken("tok-ship", 100, 100, { [MODULE_ID]: { commandVehicle: true, sectorId: "sec-1" } });
  freighterToken = makeToken("tok-freighter", 700, 700);
  table.scenes._reset();
  table.scenes.set("scene-sector", {
    id: "scene-sector", flags: { [MODULE_ID]: { sectorScene: true, sectorId: "sec-1" } },
    tokens: { contents: [shipToken, freighterToken] },
    notes: { contents: [{ id: "note-bleak", x: 500, y: 300, text: "Bleakhold",
      flags: { [MODULE_ID]: { settlementId: "rec-bleak", actorId: "actor-bleak" } } }] },
  });
  // … and an ordinary encounter Scene the GM prepared: a foe's token, which
  // no player owns. Not a sector Scene, not the command vehicle.
  raiderToken = makeToken("tok-raider", 1200, 800);
  table.scenes.set("scene-ambush", {
    id: "scene-ambush", flags: {},
    tokens: { contents: [raiderToken] }, notes: { contents: [] },
  });

  scriptClaude(table, { fallback: () => 'You arrive.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  control.dice = STRONG_HIT;
});

/** The forced Set a Course a ship-token drop posts, as `author` — with this payload. */
async function setCourseWithPayload(author, tokenDragSetCourse) {
  await table.client(author).chat("I set a course for Bleakhold.", {
    speaker: { actor: pc.id },
    flags: { [MODULE_ID]: {
      bypassPacing: true, forcedMoveId: "set_a_course",
      forcedMoveTarget: "Bleakhold", forcedMoveTargetId: "actor-bleak",
      tokenDragSetCourse,
    } },
  });
  await table.settle(); await table.drain();
}
const moveCards = () => table.cards(f => f.moveResolution);

describe("the token a Set a Course drop moves", () => {
  it("control: the real drop's payload moves the ship's own token onto its pin", async () => {
    await setCourseWithPayload("pl-1", { sceneId: "scene-sector", tokenId: "tok-ship", destX: 500, destY: 300 });

    expect(shipToken.update).toHaveBeenCalledWith({ x: 500, y: 300 }, { sfcPositionSync: true });
    expect(raiderToken.update).not.toHaveBeenCalled();
  });

  it("a payload naming another token on another Scene moves nothing — the Set a Course is still rolled", async () => {
    // A player's macro: ChatMessage.create with the drop's flags, the payload its own.
    await setCourseWithPayload("pl-1", { sceneId: "scene-ambush", tokenId: "tok-raider", destX: 0, destY: 0 });

    expect(raiderToken.update).not.toHaveBeenCalled();
    expect({ x: raiderToken.x, y: raiderToken.y }).toEqual({ x: 1200, y: 800 });
    expect(moveCards(), "the move itself is rolled").toHaveLength(1);
  });

  it("another token on the sector map is not moved onto the pin", async () => {
    await setCourseWithPayload("pl-1", { sceneId: "scene-sector", tokenId: "tok-freighter", destX: 500, destY: 300 });
    expect(freighterToken.update).not.toHaveBeenCalled();
  });

  it("the ship's own token is not moved to a spot that is no settlement pin", async () => {
    await setCourseWithPayload("pl-1", { sceneId: "scene-sector", tokenId: "tok-ship", destX: 3000, destY: 3000 });
    expect(shipToken.update).not.toHaveBeenCalledWith({ x: 3000, y: 3000 }, expect.anything());
    expect({ x: shipToken.x, y: shipToken.y }).not.toEqual({ x: 3000, y: 3000 });
  });
});

/**
 * PROBE (thirteenth audit, area: ui / sectors) — UI-3
 *
 * The `tokenDragSetCourse` payload a chat message carries is trusted whole:
 * on a hit, the canonical GM moves whatever token it names, on whatever
 * Scene, to whatever coordinates.
 *
 * sectorSceneHooks.js dispatchSetACourseFromTokenDrag posts the forced Set a
 * Course a ship-token drop makes, with `tokenDragSetCourse: { sceneId,
 * tokenId, destX, destY }` on the message's flags. index.js reads the flag off
 * ANY message (`message.flags[MODULE].tokenDragSetCourse ?? null`) and, on a
 * non-miss, applyOutcomeEffects hands it to
 * moveCommandVehicleTokenToDestination, which does
 *     scene  = game.scenes.get(payload.sceneId)
 *     token  = scene.tokens.find(t => t.id === payload.tokenId)
 *     token.update({ x: payload.destX, y: payload.destY }, { sfcPositionSync: true })
 * with no check that the Scene is a sector Scene, that the token is the
 * command vehicle's, or that the coordinates are a settlement pin's. Any user
 * may create a chat message with flags, so a player's macro can have the GM's
 * client move a token the player has no permission over — an NPC's, another
 * player's, on a Scene they are not viewing — to any point, under the update
 * option that makes the module's own token hooks ignore it. decisions.md
 * ("GM relay", accepted limitation) promises the opposite bound: "Value
 * validation bounds what even a forged request can do to what the UI could
 * have produced" — the UI only ever names the dragged command-vehicle token
 * and a settlement pin of its own sector Scene.
 *
 * Expected (asserted): a Set a Course whose payload names a token that is not
 * the command vehicle's moves no token.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock("../../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const STRONG_HIT = [0.05, 0.05, 0.99];   // challenge 1, 1; action die 6

let table, pc, shipToken, raiderToken;

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
    flags: { [MODULE_ID]: { entityType: "ship", ship: { _id: "rec-ship", name: "Wayfarer", isCommandVehicle: true } } },
  });
  table.addActor({
    id: "actor-bleak", type: "location", name: "Bleakhold",
    system: { subtype: "settlement", klass: "orbital" },
    flags: { [MODULE_ID]: { entityType: "settlement", settlement: { _id: "rec-bleak", name: "Bleakhold", sectorId: "sec-1" } } },
  });

  // The sector map, with the ship's token on it …
  shipToken = makeToken("tok-ship", 100, 100, { [MODULE_ID]: { commandVehicle: true, sectorId: "sec-1" } });
  table.scenes._reset();
  table.scenes.set("scene-sector", {
    id: "scene-sector", flags: { [MODULE_ID]: { sectorScene: true, sectorId: "sec-1" } },
    tokens: { contents: [shipToken] }, notes: { contents: [] },
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

describe("the token a Set a Course drop moves", () => {
  it("control: the real drop's payload moves the ship's own token onto its pin", async () => {
    await setCourseWithPayload("pl-1", { sceneId: "scene-sector", tokenId: "tok-ship", destX: 500, destY: 300 });

    expect(shipToken.update).toHaveBeenCalledWith({ x: 500, y: 300 }, { sfcPositionSync: true });
    expect(raiderToken.update).not.toHaveBeenCalled();
  });

  it("a payload naming another token on another Scene moves nothing", async () => {
    // A player's macro: ChatMessage.create with the drop's flags, the payload its own.
    await setCourseWithPayload("pl-1", { sceneId: "scene-ambush", tokenId: "tok-raider", destX: 0, destY: 0 });

    expect(raiderToken.update).not.toHaveBeenCalled();
    expect({ x: raiderToken.x, y: raiderToken.y }).toEqual({ x: 1200, y: 800 });
  });
});

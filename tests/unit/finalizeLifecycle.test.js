/**
 * STARFORGED COMPANION
 * tests/unit/finalizeLifecycle.test.js
 *
 * A ship's Finalise on a booted table (issue #311 P07): the Entity Panel's
 * ✦ Finalise runs finalizeEntity on the GM, which for a ship runs its full
 * seed (oracles, modules, the narrator's introduction into Notes). It never
 * recorded completion, so the panel kept offering Finalise, and pressing it
 * again wrote a fresh introduction over Notes the GM had edited — another
 * narrator call each time. Claude is answered at the fetch boundary.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, gm, finalizeEntity;
const world = () => table.world.campaignState();

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  gm = table.client("gm-1");
  ({ finalizeEntity } = await gm.import("../../src/entities/finalize.js"));
}, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, shipMapEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "fin-s1", sessionNumber: 1 },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  scriptClaude(table, { fallback: () => "Your vessel crosses the empty gulf." });
});

function addShip() {
  return table.addActor({ id: "ship-wayfarer", type: "starship", name: "Wayfarer",
    flags: { [MODULE_ID]: { entityType: "ship", entityId: "entity-ship", ship: {
      _id: "entity-ship", name: "Wayfarer", type: "Vessel", firstLook: "Weathered", mission: "Waiting",
      integrity: 5, integrityMax: 5, isCommandVehicle: false,
    } } },
  });
}

describe("P07 — a ship's Finalise completes once; Regenerate is the way to write it again", () => {
  it("the first Finalise stamps finalizedAt; a second ordinary one keeps the edited Notes and asks the narrator nothing", async () => {
    const ship  = addShip();
    const first = await gm.run(() => finalizeEntity("ship", ship.id, world()));
    expect(first).toMatchObject({ ok: true, reason: "finalized" });
    expect(ship.getFlag(MODULE_ID, "ship").finalizedAt).toEqual(expect.any(String));
    expect(ship.system.notes).toContain("Your vessel crosses the empty gulf.");
    const calls = table.claude.calls.length;

    await gm.run(() => ship.update({ "system.notes": "<p>Captain log: promised safe passage to Mara.</p>" }));
    const second = await gm.run(() => finalizeEntity("ship", ship.id, world()));

    expect(second).toMatchObject({ ok: true, reason: "already-finalized" });
    expect(ship.system.notes).toBe("<p>Captain log: promised safe passage to Mara.</p>");
    expect(table.claude.calls.length).toBe(calls);
  });

  it("Regenerate (force) writes the introduction again and re-stamps completion", async () => {
    const ship = addShip();
    await gm.run(() => finalizeEntity("ship", ship.id, world()));
    const stamped = ship.getFlag(MODULE_ID, "ship").finalizedAt;
    await gm.run(() => ship.update({ "system.notes": "<p>Edited.</p>" }));

    const again = await gm.run(() => finalizeEntity("ship", ship.id, world(), { force: true }));

    expect(again).toMatchObject({ ok: true, reason: "regenerated" });
    expect(ship.system.notes).toContain("Your vessel crosses the empty gulf.");
    expect(ship.getFlag(MODULE_ID, "ship").finalizedAt >= stamped).toBe(true);
  });
});

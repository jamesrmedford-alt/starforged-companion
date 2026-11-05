/**
 * STARFORGED COMPANION
 * tests/unit/oracleMemoryQueue.test.js
 *
 * Issue #331 X44 (ORACLE-MEMORY-LOST-UPDATE). Two oracle cards within one
 * write round trip — two players asking at once, a `!oracle` beside a custom
 * table's 🎲: the GM's capture hook read-modify-wrote `recentOracles` from
 * the cache, so the second write carried a ring without the first result and
 * the first's write then replaced it — one result lost from RECENT ORACLE
 * RESULTS. Issue #326 W53's CLOCK-LOST-UPDATE shape, unqueued here; the
 * captures now run through one queue on the canonical GM.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS } from "../helpers/multiClient.js";
import { holdWrites, campaignStateWrite } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: true, currentSessionId: "sess-1", sessionNumber: 1,
  } } } });
});

const ring = () => (table.world.campaignState().recentOracles ?? []).map(e => e.question);

describe("X44 — two oracle results within one write round trip are both remembered", () => {
  it("a second result captured while the first write is in flight does not lose the first", async () => {
    // Hold the GM's first campaignState write (the first result's capture) at the server.
    const held = holdWrites(table, campaignStateWrite("gm-1"));

    await table.client("pl-1").chat("!oracle yes likely is the hatch sealed");
    await held.arrived;                                   // the GM's capture of result 1 is in flight

    await table.client("pl-1").chat("!oracle yes unlikely is the hull breached");
    await table.settle();                                 // result 2 is captured from the cache, which lacks result 1

    held.release();                                       // the server now applies result 1's write
    await table.drain();

    // Both (it kept only "is the hatch sealed": the second write carried a ring
    // without the first result, and the first's write then replaced it).
    expect(ring()).toEqual(["is the hatch sealed", "is the hull breached"]);
  }, 30_000);

  it("a refused capture does not stop the next one", async () => {
    const { failWrites } = await import("../helpers/faults.js");
    failWrites(table, campaignStateWrite("gm-1"));
    await table.client("pl-1").chat("!oracle yes likely is the hatch sealed");
    await table.settle(); await table.drain();
    await table.client("pl-1").chat("!oracle yes unlikely is the hull breached");
    await table.settle(); await table.drain();
    expect(ring()).toEqual(["is the hull breached"]);
  }, 30_000);

  it("control: two results that land in sequence are both kept", async () => {
    await table.client("pl-1").chat("!oracle yes likely is the hatch sealed");
    await table.settle();
    await table.client("pl-1").chat("!oracle yes unlikely is the hull breached");
    await table.settle();
    expect(ring()).toEqual(["is the hatch sealed", "is the hull breached"]);
  }, 30_000);
});

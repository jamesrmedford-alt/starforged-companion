/**
 * PROBE — SEC-04 ORACLE-MEMORY-LOST-UPDATE
 * (src/index.js registerOracleMemoryCaptureHook lines 3856–3879: on every
 *  oracle card the canonical GM reads the cached campaignState, copies the
 *  ring, appends, and writes the whole setting; src/oracles/oracleMemory.js
 *  recordOracleResult)
 *
 * What the user does: two oracle results land within one write round trip —
 * two players ask the oracle at the same moment, a player's `!oracle` beside
 * a custom-table 🎲 press, the panel's 🎲 double-clicked.
 *
 * What happens: the GM's capture hook fires once per card. Each read-modify-
 * writes `campaignState.recentOracles` from the client's CACHE, which only
 * takes the first write once the server echoes it; the second capture
 * therefore reads a ring without the first result and writes it back over
 * it. One of the two results is lost — the narrator's RECENT ORACLE RESULTS
 * ("the dice established these") no longer holds it, so the narration can
 * contradict a roll the table just made. This is issue #326 W53's shape
 * (CLOCK-LOST-UPDATE: "two clock actions within one round trip each wrote
 * the old list"), fixed there with a per-client write queue
 * (serialiseClockWrite) and not here.
 *
 * What should happen: both results are remembered — every read-modify-write of
 * the ring runs through one queue on the canonical GM (W53's remedy), or the
 * write merges onto the store as it then is.
 *
 * Control (passes today): two results that land in sequence are both kept.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sectors/oracleMemoryLostUpdate.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS } from "../../helpers/multiClient.js";
import { holdWrites, campaignStateWrite } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

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

describe("PROBE SEC-04 — two oracle results within one write round trip are both remembered", () => {
  it("a second result captured while the first write is in flight does not lose the first", async () => {
    // Hold the GM's first campaignState write (the first result's capture) at the server.
    const held = holdWrites(table, campaignStateWrite("gm-1"));

    await table.client("pl-1").chat("!oracle yes likely is the hatch sealed");
    await held.arrived;                                   // the GM's capture of result 1 is in flight

    await table.client("pl-1").chat("!oracle yes unlikely is the hull breached");
    await table.settle();                                 // result 2 is captured from the cache, which lacks result 1

    held.release();                                       // the server now applies result 1's write
    await table.drain();

    // Expected: both. Today: ["is the hatch sealed"] — the second write carried a
    // ring without the first result, and the first's write then replaced it.
    expect(ring()).toEqual(["is the hatch sealed", "is the hull breached"]);
  }, 30_000);

  it("control: two results that land in sequence are both kept", async () => {
    await table.client("pl-1").chat("!oracle yes likely is the hatch sealed");
    await table.settle();
    await table.client("pl-1").chat("!oracle yes unlikely is the hull breached");
    await table.settle();
    expect(ring()).toEqual(["is the hatch sealed", "is the hull breached"]);
  }, 30_000);
});

/**
 * STARFORGED COMPANION
 * tests/unit/loreRecapStaleWrite.test.js
 *
 * `!lore` keeps what lands during its Claude call (issue #321 U06a).
 *
 * src/index.js handleLoreCommand reads campaignState and hands it to
 * generateLoreRecap (src/truths/generator.js), which awaits the lore Claude
 * call and then persists the recap. It used to write the pre-call snapshot
 * back whole (the STALE-SNAPSHOT-CLOBBER pattern): a player's X-Card played
 * while the recap generated was silently undone, and a move lock released
 * meanwhile was written back. The recap now writes only `loreRecap`, onto the
 * store as it is when the reply arrives (mergeOwnedFields).
 *
 * Runs on the simulated four-client table (tests/helpers/multiClient.js),
 * whose settings model Foundry's: `get` returns the client's cached parse —
 * the same object until the next update.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS } from "../helpers/multiClient.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const { GM, GM2, P1, P2 } = USERS;

let table;
const world = () => table.world.campaignState();

beforeAll(async () => {
  table = await simulateTable({ users: [GM, GM2, P1, P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({
    world: {
      settings: {
        campaignState: {
          ...CampaignStateSchema,
          sessionActive: true,
          xCardActive: false,
          xCardPlays: 0,
          // generateLoreRecap's structured fallback (no truths journal in this world)
          worldTruths: { cataclysm: { categoryName: "Cataclysm", title: "We escaped the ravages of a catastrophic war." } },
        },
      },
    },
  });
});

describe("!lore does not revert writes that land during its Claude call", () => {
  it("a player's X-Card played while the GM's !lore recap generates stays in force", async () => {
    await table.setClaudeKey("gm-1", "sk-ant-gina");

    // Hold the lore call (the recap model's system prompt) until released.
    let release;
    const held = new Promise(r => { release = r; });
    table.claude.respond(async (call) => {
      if (/world-weary spacer narrator/.test(call.system)) {
        await held;
        return "The Forge burns cold here. Everyone owes someone.";
      }
      return 'The station hums. Nothing moves.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
    });

    await table.client("gm-1").chat("!lore");
    await table.settle();
    expect(table.claude.calls.some(c => /world-weary spacer narrator/.test(c.system))).toBe(true);

    // Mid-call: a player plays the X-Card; the canonical GM records it.
    await table.client("pl-1").chat("!x");
    await table.settle();
    expect(world().xCardActive).toBe(true);           // the pause landed
    const playsAfterX = world().xCardPlays;

    // The recap comes back and is persisted.
    release();
    await table.settle();

    expect(world().loreRecap).toMatch(/Forge burns cold/);
    expect(world().xCardActive).toBe(true);            // the X-Card stays in force
    expect(world().xCardPlays).toBe(playsAfterX);
  });

  it("!lore typed while a player's move holds the lock does not resurrect the lock after the move releases it", async () => {
    await table.setClaudeKey("gm-1", "sk-ant-gina");
    let release;
    const held = new Promise(r => { release = r; });
    table.claude.respond(async (call) => {
      if (/world-weary spacer narrator/.test(call.system)) { await held; return "Cold stars, old debts."; }
      return 'The station hums.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
    });

    const gm = table.client("gm-1");
    // A player's move starts on the canonical GM: the pipeline claims the lock
    // exactly as src/index.js does (mutate the cached value, write it).
    await gm.run(async () => {
      const cs = game.settings.get("starforged-companion", "campaignState");
      cs.pendingMove = true;
      await game.settings.set("starforged-companion", "campaignState", cs);
    });
    await table.settle();
    expect(world().pendingMove).toBe(true);

    // The GM runs !lore while the move is being narrated…
    await gm.chat("!lore");
    await table.settle();

    // …the move finishes and releases its lock (the real release helper).
    await gm.run(() => gm.index.releasePendingMoveLock());
    await table.settle();
    expect(world().pendingMove).toBe(false);

    release();
    await table.settle();
    expect(world().loreRecap).toMatch(/Cold stars/);
    expect(world().pendingMove).toBe(false);           // not re-taken: later moves are not refused
  });
});

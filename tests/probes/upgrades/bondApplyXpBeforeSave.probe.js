/**
 * PROBE (moves-upgrade-suffer audit) — MU: BOND-APPLY-XP-BEFORE-SAVE
 *
 * What the user does: `!bond Sable` rolls a strong hit (with a match) and the
 * author's client relays it ("bond.apply"); on the canonical GM the world
 * refuses the campaignState write (a server error, a dropped connection —
 * the case every #306/#309/#321 payoff fix plans for).
 *
 * What happens: applyBondEffects (bondCommand.js:202-205) runs
 *   const campaignState = game.settings.get(MODULE_ID, "campaignState");
 *   addLegacyTicks(campaignState, "bonds", ticks);      // awardXp defaults to true
 *   await game.settings.set(MODULE_ID, "campaignState", campaignState);
 * — so (1) the box the two ticks fill pays every PC its 2 XP before the save
 * (addLegacyTicks launches awardLegacyBoxXP at once), (2) the ticks are put
 * on the CACHED setting object, so the GM's client holds a bonds legacy the
 * world does not, and the next campaignState write from that client carries
 * it, and (3) the refusal throws past the rest: the match's rank raise is
 * never applied, and no step reaches the GMs' payoff card.
 *
 * What should happen: as writeLegacyTicks does for every other payoff (issue
 * #306 R04, rules/foundry-api.md): write a copy, award the box XP only once
 * the save has landed, and put a refused tick write on the GMs' card — the
 * rank raise standing on its own.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/entities/connection.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getConnection:    vi.fn(),
  updateConnection: vi.fn(async () => {}),
}));

import { applyBondEffects } from "../../../src/moves/bondCommand.js";
import { getConnection, updateConnection } from "../../../src/entities/connection.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const MODULE_ID = "starforged-companion";
const KEY = `${MODULE_ID}.campaignState`;
const gmCtx = { requesterId: "test-user-gm", requesterIsGM: true };

let pcA, pcB;

async function flush() {
  for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r));
}

beforeEach(() => {
  ChatMessage._reset();
  updateConnection.mockClear();
  pcA = makeTestActor({ id: "pc-a", name: "Ash", system: { xp: 0 } });
  pcB = makeTestActor({ id: "pc-b", name: "Bex", system: { xp: 0 } });
  game.actors._setAll([pcA, pcB]);
  getConnection.mockImplementation((hostId) => hostId === "conn-1"
    ? { _id: "rec-sable", name: "Sable", rank: "dangerous", bonded: true, active: true }
    : null);
  // Two ticks already on the bonds legacy: the strong hit's two fill its first box (2 XP each PC).
  game.settings._store.set(KEY, { ...CampaignStateSchema, connectionIds: ["conn-1"], legacyTracks: { bonds: { ticks: 2 } } });
});

describe("BOND-APPLY-XP-BEFORE-SAVE", () => {
  it("control: a strong hit whose save lands marks the box and pays each PC 2 XP", async () => {
    await applyBondEffects({ outcome: "strong_hit", isMatch: false }, gmCtx);
    await flush();
    expect(game.settings._store.get(KEY).legacyTracks.bonds.ticks).toBe(4);
    expect([pcA.system.xp, pcB.system.xp]).toEqual([2, 2]);
  });

  async function strongHitRefused() {
    silenceConsoleErrors();
    const set = vi.spyOn(game.settings, "set").mockRejectedValueOnce(new Error("The server refused the write (probe)"));
    await applyBondEffects({ outcome: "strong_hit", isMatch: false }, gmCtx).catch(() => {});
    await flush();
    set.mockRestore();
  }

  it("a refused save pays no XP", async () => {
    await strongHitRefused();
    expect([pcA.system.xp, pcB.system.xp]).toEqual([0, 0]);                 // today: [2, 2]
  });

  it("a refused save leaves the GM's cached setting as the world has it", async () => {
    await strongHitRefused();
    expect(game.settings._store.get(KEY).legacyTracks.bonds.ticks).toBe(2);  // today: 4 (the cached object was mutated)
  });

  it("a refused tick save does not skip the match's rank raise", async () => {
    silenceConsoleErrors();
    const set = vi.spyOn(game.settings, "set").mockRejectedValueOnce(new Error("The server refused the write (probe)"));
    await applyBondEffects({ outcome: "strong_hit", isMatch: true, targetHostId: "conn-1", raisedRank: "formidable", actorId: "pc-a" }, gmCtx)
      .catch(() => {});
    await flush();
    set.mockRestore();

    expect(updateConnection).toHaveBeenCalledWith("conn-1", { rank: "formidable" });   // today: never called (the throw skips it)
  });
});

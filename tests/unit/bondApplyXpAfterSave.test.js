// tests/unit/bondApplyXpAfterSave.test.js
// bond.apply pays its bonds-legacy box XP once the ticks are saved, and a
// refused tick save does not skip the match's rank raise (issue #326 W52).
// applyBondEffects marked the ticks (addLegacyTicks awarding the box XP at
// once) before its own save; a refused save had paid each PC 2 XP for ticks
// never saved, and its throw skipped the strong-hit-with-a-match rank raise.

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/entities/connection.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getConnection:    vi.fn(),
  updateConnection: vi.fn(async () => {}),
}));

import { applyBondEffects } from "../../src/moves/bondCommand.js";
import { getConnection, updateConnection } from "../../src/entities/connection.js";
import { CampaignStateSchema } from "../../src/schemas.js";

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

describe("bond.apply pays its box XP once the ticks are saved (issue #326 W52)", () => {
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
    expect([pcA.system.xp, pcB.system.xp]).toEqual([0, 0]);                 // was [2, 2]
  });

  it("a refused tick save does not skip the match's rank raise", async () => {
    silenceConsoleErrors();
    const set = vi.spyOn(game.settings, "set").mockRejectedValueOnce(new Error("The server refused the write (probe)"));
    const refusal = await applyBondEffects({ outcome: "strong_hit", isMatch: true, targetHostId: "conn-1", raisedRank: "formidable", actorId: "pc-a" }, gmCtx)
      .then(() => null, (err) => err);
    await flush();
    set.mockRestore();

    expect(updateConnection).toHaveBeenCalledWith("conn-1", { rank: "formidable" });   // the throw skipped it
    expect(refusal?.message).toMatch(/refused/);                                         // and the refusal is still reported
  });
});

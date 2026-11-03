// tests/unit/bondApplyCachedState.test.js
// bond.apply marks the bonds legacy on a copy of the stored campaignState
// (issue #326 W51). applyBondEffects ran addLegacyTicks on the cached value
// game.settings.get returned, then wrote it: a refused save left the GM's
// client holding ticks the world never got, and the GM's next whole-object
// write carried them into the world (rules/foundry-api.md).

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/entities/connection.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getConnection:    vi.fn(),
  updateConnection: vi.fn(async () => {}),
}));

import { applyBondEffects } from "../../src/moves/bondCommand.js";
import { getConnection } from "../../src/entities/connection.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const MODULE_ID = "starforged-companion";
const KEY = `${MODULE_ID}.campaignState`;
const gmCtx = { requesterId: "test-user-gm", requesterIsGM: true };

async function flush() {
  for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r));
}

beforeEach(() => {
  ChatMessage._reset();
  game.actors._setAll([makeTestActor({ id: "pc-a", name: "Ash", system: { xp: 0 } })]);
  getConnection.mockImplementation((hostId) => hostId === "conn-1"
    ? { _id: "rec-sable", name: "Sable", rank: "dangerous", bonded: true, active: true }
    : null);
  game.settings._store.set(KEY, { ...CampaignStateSchema, connectionIds: ["conn-1"], legacyTracks: { bonds: { ticks: 2 } } });
});

describe("bond.apply's legacy ticks are marked on a copy (issue #326 W51)", () => {
  it("a refused save leaves the GM's cached setting as the world has it", async () => {
    silenceConsoleErrors();
    const set = vi.spyOn(game.settings, "set").mockRejectedValueOnce(new Error("The server refused the write"));
    await applyBondEffects({ outcome: "strong_hit", isMatch: false }, gmCtx).catch(() => {});
    await flush();
    set.mockRestore();
    expect(game.settings.get(MODULE_ID, "campaignState").legacyTracks.bonds.ticks).toBe(2);
  });

  it("control: a save that lands marks the two ticks", async () => {
    await applyBondEffects({ outcome: "strong_hit", isMatch: false }, gmCtx);
    await flush();
    expect(game.settings.get(MODULE_ID, "campaignState").legacyTracks.bonds.ticks).toBe(4);
  });
});

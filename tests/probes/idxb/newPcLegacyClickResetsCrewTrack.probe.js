/**
 * Probe IDXB — a player character created after the canonical GM's load
 * carries legacy tracks at 0; nothing mirrors the crew's shared tracks onto it
 * until the next GM load (src/index.js ready → backfillLegacySheets) or the
 * next mark of that same track (payLegacyMark → mirrorLegacyToSheets). The
 * vendor sheet's ▸ ("Mark 1 tick") writes `current + 1` from that sheet's own
 * value (vendor legacy-track.vue adjustTrack), and the canonical GM's sheet
 * sync (sharedLegacies.js registerLegacySheetSyncHook) takes the sheet's
 * absolute value as the crew's track and mirrors it to every other PC.
 *
 * Correct: one ▸ on any PC's sheet marks one tick on the crew's track — it
 * never takes the crew's track down to the lagging sheet's value.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS } from "../../helpers/multiClient.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

describe("IDXB: a ▸ on a PC created after the GM's load", () => {
  let table, kira;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    // The crew's quests legacy stands at 24 ticks (6 boxes, 12 XP each) — the
    // GM loaded with Kira's sheet in step.
    await table.reset({ world: { settings: { chronicleAutoEntry: false,
      campaignState: { ...CampaignStateSchema, legacyTracks: { quests: { ticks: 24, cycles: 0, cleared: false } } } } } });
    kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { legacies: { quests: 24 } } });
  });

  const shared = () => table.world.campaignState().legacyTracks?.quests;
  // The vendor Legacies tab's ▸: `system.legacies.<track> = current + 1`.
  const markOnSheet = (userId, pc) => table.client(userId).run(() =>
    pc.update({ "system.legacies.quests": Number(pc.system?.legacies?.quests ?? 0) + 1 }));

  it("marks one tick on the crew's quests legacy — it does not reset the crew's track to the new sheet's 1", async () => {
    // A second player's character is made mid-session: a new Actor, legacies empty.
    const zed = table.addActor({ id: "pc-zed", name: "Zed", ownership: { "pl-2": 3 }, system: { legacies: {} } });
    await table.settle(); await table.drain();
    expect(Number(zed.system.legacies?.quests ?? 0)).toBe(0);      // nothing brought the new sheet to the crew's 24
    expect(shared().ticks).toBe(24);

    await markOnSheet("pl-2", zed);
    await table.settle(); await table.drain();

    expect(shared().ticks).toBeGreaterThanOrEqual(24);             // the crew's track is not lowered
    expect(kira.system.legacies.quests).toBeGreaterThanOrEqual(24); // nor Kira's sheet (her earned XP)
  }, 30_000);

  it("control: the same ▸ on a sheet in step with the crew's track adds one tick for everyone", async () => {
    const ren = table.addActor({ id: "pc-ren", name: "Ren", ownership: { "pl-2": 3 }, system: { legacies: { quests: 24 } } });
    await markOnSheet("pl-2", ren);
    await table.settle(); await table.drain();
    expect(shared().ticks).toBe(25);
    expect(kira.system.legacies.quests).toBe(25);
  }, 30_000);
});

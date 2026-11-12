/**
 * STARFORGED COMPANION
 * tests/unit/legacyMarkFromLaggingSheet.test.js
 *
 * A ▸ on a sheet behind the crew's legacy track marks one tick (issue #347
 * AB07).
 *
 * The crew's legacy tracks are canonical in campaignState and mirrored to
 * every PC's sheet. A PC made after the canonical GM's load showed 0 (only
 * the ready backfill and the next mark of that track mirrored it), and the
 * vendor Legacies tab's ▸ writes the sheet's own value + 1. The canonical GM
 * took that value as the crew's track: one ▸ on the new sheet set the crew's
 * 24 ticks to 1 on every sheet, for good — the next backfill takes the
 * furthest sheet, which was now 1 everywhere.
 *
 * Now the client that makes a sheet edit stamps the sheet's values before it
 * into the update's options, and the GM moves the shared track by what the
 * edit changed; and a PC created mid-session is brought to the crew's tracks
 * at once.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS } from "../helpers/multiClient.js";
import { CampaignStateSchema } from "../../src/schemas.js";

describe("a ▸ on a sheet behind the crew's legacy track (issue #347 AB07)", () => {
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
  // The vendor Legacies tab's ▸ / ◂: `system.legacies.<track> = current ± 1`.
  const markOnSheet = (userId, pc, step = 1) => table.client(userId).run(() =>
    pc.update({ "system.legacies.quests": Math.max(0, Number(pc.system?.legacies?.quests ?? 0) + step) }));
  const quiet = async () => { await table.settle(); await table.drain(); };

  it("marks one tick on the crew's track — it does not reset the crew's track to the lagging sheet's 1", async () => {
    // A sheet nothing brought to the crew's 24 (made before this load's
    // backfill could see it, or an imported export): its legacies are empty.
    const zed = table.addActor({ id: "pc-zed", name: "Zed", ownership: { "pl-2": 3 }, system: { legacies: {} } });
    await quiet();
    expect(Number(zed.system.legacies?.quests ?? 0)).toBe(0);
    expect(shared().ticks).toBe(24);

    await markOnSheet("pl-2", zed);
    await quiet();

    expect(shared().ticks).toBe(25);                 // one tick, on the crew's 24
    expect(kira.system.legacies.quests).toBe(25);    // Kira's earned XP is not taken down
    expect(zed.system.legacies.quests).toBe(25);     // and the lagging sheet is brought in step
  }, 30_000);

  it("a ◂ on a lagging sheet takes one tick off — not the crew's track down to the sheet's value", async () => {
    const zed = table.addActor({ id: "pc-zed", name: "Zed", ownership: { "pl-2": 3 }, system: { legacies: { quests: 10 } } });
    await markOnSheet("pl-2", zed, -1);
    await quiet();
    expect(shared().ticks).toBe(23);
    expect([kira.system.legacies.quests, zed.system.legacies.quests]).toEqual([23, 23]);
  }, 30_000);

  it("a character created mid-session starts at the crew's tracks", async () => {
    let zed;
    await table.client("gm-1").run(async () => {
      zed = await Actor.create({ name: "Zed", type: "character", ownership: { "pl-2": 3 }, system: { legacies: {} } });
    });
    await quiet();
    expect(zed.system.legacies.quests).toBe(24);
    expect(shared().ticks).toBe(24);

    await markOnSheet("pl-2", zed);
    await quiet();
    expect(shared().ticks).toBe(25);
    expect(kira.system.legacies.quests).toBe(25);
  }, 30_000);

  it("two quick ▸ on one sheet are two ticks", async () => {
    const first = markOnSheet("pl-1", kira);
    const second = markOnSheet("pl-1", kira);
    await Promise.all([first, second]);
    await quiet();
    expect(shared().ticks).toBe(26);
    expect(kira.system.legacies.quests).toBe(26);
  }, 30_000);

  it("control: a ▸ on a sheet in step with the crew's track adds one tick for everyone", async () => {
    const ren = table.addActor({ id: "pc-ren", name: "Ren", ownership: { "pl-2": 3 }, system: { legacies: { quests: 24 } } });
    await markOnSheet("pl-2", ren);
    await quiet();
    expect(shared().ticks).toBe(25);
    expect(kira.system.legacies.quests).toBe(25);
  }, 30_000);

  it("control: an NPC card made mid-session is not given the crew's tracks", async () => {
    let card;
    await table.client("gm-1").run(async () => {
      card = await Actor.create({ name: "Vance", type: "character", flags: { "starforged-companion": { entityType: "connection" } }, system: { legacies: {} } });
    });
    await quiet();
    expect(Number(card.system.legacies?.quests ?? 0)).toBe(0);
  }, 30_000);
});

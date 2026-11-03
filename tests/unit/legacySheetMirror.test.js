/**
 * STARFORGED COMPANION
 * tests/unit/legacySheetMirror.test.js
 *
 * The crew's legacy tracks reach every PC's Starforged sheet (issue #326 D3).
 *
 * Legacy ticks lived in the shared `campaignState.legacyTracks` (no module UI
 * renders it) and the XP in each PC's `system.xp` — but the Starforged sheet
 * the module pins shows neither: its Legacies tab draws each legacy from the
 * PC's own `system.legacies.<track>` and derives "XP earned" from it (2 a box,
 * 1 a box past 40), and it has no `system.xp` field (the classic sheet's).
 * The XP the card promised could neither be seen nor spent.
 *
 * Decided: the shared track stays canonical and is written through to every
 * PC's `system.legacies.<track>` (ticks ever marked); a sheet edit flows back
 * the way the shared supply does; the canonical GM backfills the sheets at
 * ready. `system.xp` is no longer written.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { addLegacyTicks, awardSavedLegacyXp } from "../../src/index.js";
import { backfillLegacySheets } from "../../src/multiplayer/sharedLegacies.js";
import { simulateTable, USERS } from "../helpers/multiClient.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const MODULE_ID = "starforged-companion";
const KEY = `${MODULE_ID}.campaignState`;

function starforgedPc(id, name, legacies = {}) {
  const pc = makeTestActor({ id, name, type: "character", system: { xp: 0, legacies } });
  pc.flags.core = { sheetClass: "ironsworn.StarforgedCharacterSheet" };
  return pc;
}

describe("a saved legacy mark reaches every PC's sheet (issue #326 D3)", () => {
  beforeEach(() => {
    game.actors._reset();
    ChatMessage._reset();
  });

  it("three filled quests boxes show on both sheets — 6 XP earned there — and system.xp is not written", async () => {
    const kira = starforgedPc("pc-kira", "Kira");
    const ren  = starforgedPc("pc-ren", "Ren");
    game.actors._setAll([kira, ren]);
    const cs = { legacyTracks: {} };
    expect(addLegacyTicks(cs, "quests", 12).boxes).toBe(3);
    game.settings._store.set(KEY, cs);           // the copy's save lands …
    await awardSavedLegacyXp(cs);                // … then its mark is paid
    expect([kira.system.legacies.quests, ren.system.legacies.quests]).toEqual([12, 12]);
    expect([kira.system.xp, ren.system.xp]).toEqual([0, 0]);
    expect(ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.legacyXpCard)?.content).toMatch(/\+6 XP earned .*Legacies tab/);
  });

  it("control: an NPC card is not a sheet the mirror writes", async () => {
    const kira = starforgedPc("pc-kira", "Kira");
    const npc  = makeTestActor({ id: "npc-sable", name: "Sable", type: "character",
      flags: { [MODULE_ID]: { entityType: "connection", connection: { _id: "rec-s", name: "Sable" } } } });
    game.actors._setAll([kira, npc]);
    const cs = { legacyTracks: {} };
    addLegacyTicks(cs, "bonds", 4);
    game.settings._store.set(KEY, cs);
    await awardSavedLegacyXp(cs);
    expect(kira.system.legacies.bonds).toBe(4);
    expect(npc._updateHistory).toEqual([]);
  });
});

describe("the canonical GM backfills the sheets at ready (issue #326 D3)", () => {
  beforeEach(() => {
    game.actors._reset();
  });

  it("every sheet is set to the shared track", async () => {
    const kira = starforgedPc("pc-kira", "Kira");
    const ren  = starforgedPc("pc-ren", "Ren");
    game.actors._setAll([kira, ren]);
    game.settings._store.set(KEY, { legacyTracks: { quests: { ticks: 12, cycles: 0 }, discoveries: { ticks: 4, cycles: 1, cleared: true } } });
    await backfillLegacySheets();
    expect([kira.system.legacies.quests, ren.system.legacies.quests]).toEqual([12, 12]);
    expect([kira.system.legacies.discoveries, ren.system.legacies.discoveries]).toEqual([44, 44]);
  });

  it("a sheet further along raises the shared track — no mark is lost — and the others follow", async () => {
    const kira = starforgedPc("pc-kira", "Kira");
    const ren  = starforgedPc("pc-ren", "Ren", { bonds: 20 });      // marked on the sheet before the mirror
    game.actors._setAll([kira, ren]);
    game.settings._store.set(KEY, { legacyTracks: { bonds: { ticks: 6, cycles: 0 } } });
    const res = await backfillLegacySheets();
    expect(res.raised).toEqual(["bonds"]);
    expect(game.settings._store.get(KEY).legacyTracks.bonds).toEqual({ ticks: 20, cleared: false, cycles: 0 });
    expect([kira.system.legacies.bonds, ren.system.legacies.bonds]).toEqual([20, 20]);
  });

  it("a second run writes nothing", async () => {
    const kira = starforgedPc("pc-kira", "Kira");
    game.actors._setAll([kira]);
    game.settings._store.set(KEY, { legacyTracks: { quests: { ticks: 8, cycles: 0 } } });
    await backfillLegacySheets();
    const writes = kira._updateHistory.length;
    expect((await backfillLegacySheets()).written).toBe(0);
    expect(kira._updateHistory).toHaveLength(writes);
  });

  it("control: a client that is not the canonical GM backfills nothing", async () => {
    const kira = starforgedPc("pc-kira", "Kira");
    game.actors._setAll([kira]);
    game.settings._store.set(KEY, { legacyTracks: { quests: { ticks: 8, cycles: 0 } } });
    const restore = asPlayer();
    try { await backfillLegacySheets(); } finally { restore(); }
    expect(kira.system.legacies.quests).toBe(0);
  });
});

describe("a sheet edit flows back to the shared track (issue #326 D3)", () => {
  let table, kira, ren;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: { chronicleAutoEntry: false,
      campaignState: { ...CampaignStateSchema, legacyTracks: { quests: { ticks: 8, cycles: 0, cleared: false } } } } } });
    kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { legacies: { quests: 8 } } });
    ren  = table.addActor({ id: "pc-ren",  name: "Ren",  ownership: { "pl-2": 3 }, system: { legacies: { quests: 8 } } });
  });

  const shared = () => table.world.campaignState().legacyTracks?.quests;

  it("a player's ▸ on their Legacies tab marks the shared track and the crew's other sheets", async () => {
    await table.client("pl-1").run(() => kira.update({ "system.legacies.quests": 9 }));
    await table.settle(); await table.drain();
    expect(shared()).toEqual({ ticks: 9, cleared: false, cycles: 0 });
    expect(ren.system.legacies.quests).toBe(9);
  });

  it("a sheet edit past 40 is a cleared track", async () => {
    await table.client("pl-2").run(() => ren.update({ "system.legacies.quests": 44 }));
    await table.settle(); await table.drain();
    expect(shared()).toEqual({ ticks: 4, cleared: true, cycles: 1 });
    expect(kira.system.legacies.quests).toBe(44);
  });

  it("control: XP spent on a sheet is that PC's own", async () => {
    await table.client("pl-1").run(() => kira.update({ "system.legacies.questsXpSpent": 2 }));
    await table.settle(); await table.drain();
    expect(shared()).toEqual({ ticks: 8, cleared: false, cycles: 0 });
    expect(ren.system.legacies.questsXpSpent).toBe(0);
  });
});

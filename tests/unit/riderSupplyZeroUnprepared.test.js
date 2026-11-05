/**
 * STARFORGED COMPANION
 * tests/unit/riderSupplyZeroUnprepared.test.js
 *
 * Issue #331 X16 (RIDER-SUPPLY-ZERO-NO-UNPREPARED). An asset consequence
 * rider that costs supply ("suffer -1 supply" on an ability, auto-applied
 * after the move) is a loss of resources: "If your supply is exhausted
 * (reduced to 0), mark unprepared" — on the PC and every ally sharing the
 * supply, together (issue #315 S07), through the zero-supply impact's one
 * writer, sufferExecutor.markUnprepared (S04). applyMeterRiders took the
 * supply 1 → 0 through applyMeterChanges alone, and nobody was marked.
 *
 * The pipeline's summary card is pinned in assetEffects.test.js (X16).
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach } from "vitest";
import { applyMeterRiders } from "../../src/moves/consequenceRiders.js";
import { sacrificeResources } from "../../src/moves/sufferExecutor.js";
import { invalidateActorCache } from "../../src/character/actorBridge.js";

let kira, ren;
beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset();
  kira = makeTestActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { supply: { value: 1 } } });
  ren  = makeTestActor({ id: "pc-ren",  name: "Ren",  ownership: { "pl-2": 3 }, system: { supply: { value: 1 } } });
  game.actors._set(kira.id, kira);
  game.actors._set(ren.id, ren);
  invalidateActorCache(kira.id);
  invalidateActorCache(ren.id);
});

describe("X16 — an asset rider that exhausts the supply marks the crew unprepared", () => {
  it("a -1 supply rider at supply 1 marks the PC and the crew sharing the supply, and says so", async () => {
    const results = await applyMeterRiders(
      [{ resource: "supply", amount: -1, text: "suffer -1 supply", assetName: "Hoverbike" }],
      { characterActor: kira, shipActorId: null },
    );
    expect(results).toEqual([expect.objectContaining({ ok: true })]);
    expect(kira.system.supply.value).toBe(0);
    expect(kira.system.debility.unprepared).toBe(true);
    expect(ren.system.debility.unprepared).toBe(true);
    expect(results[0].note).toContain("Kira is marked <strong>unprepared</strong>");
    expect(results[0].note).toContain("Ren, sharing the supply, is marked <strong>unprepared</strong> too");
  });

  it("a supply cost and a supply gain that sum to nothing mark nothing (the write is the sum)", async () => {
    const results = await applyMeterRiders(
      [{ resource: "supply", amount: -1 }, { resource: "supply", amount: 1 }],
      { characterActor: kira, shipActorId: null },
    );
    expect(results.every(r => r.ok)).toBe(true);
    expect(kira.system.supply.value).toBe(1);
    expect(kira.system.debility.unprepared).toBe(false);
  });

  it("control: a rider that leaves supply above 0 marks nothing and adds no line", async () => {
    kira.system.supply.value = 3;
    invalidateActorCache(kira.id);
    const results = await applyMeterRiders([{ resource: "supply", amount: -1 }], { characterActor: kira, shipActorId: null });
    expect(kira.system.supply.value).toBe(2);
    expect(kira.system.debility.unprepared).toBe(false);
    expect(ren.system.debility.unprepared).toBe(false);
    expect(results[0].note).toBeUndefined();
  });

  it("control: a supply gain at 0 marks nothing", async () => {
    kira.system.supply.value = 0;
    invalidateActorCache(kira.id);
    const results = await applyMeterRiders([{ resource: "supply", amount: 1 }], { characterActor: kira, shipActorId: null });
    expect(kira.system.supply.value).toBe(1);
    expect(kira.system.debility.unprepared).toBe(false);
    expect(results[0].note).toBeUndefined();
  });

  it("a refused unprepared mark leaves the loss standing and says to mark it on the sheet", async () => {
    const realUpdate = kira.update.bind(kira);
    kira.update = async (changes) => {
      if (Object.keys(changes).some(k => k.includes("unprepared"))) throw new Error("refused (test fault)");
      return realUpdate(changes);
    };
    const results = await applyMeterRiders([{ resource: "supply", amount: -1 }], { characterActor: kira, shipActorId: null });
    expect(results[0].ok).toBe(true);
    expect(kira.system.supply.value).toBe(0);
    expect(results[0].note).toContain("could not be marked unprepared — mark it on the sheet");
  });

  it("control (issue #315 S04 / S07): Sacrifice Resources at 1 supply marks the PC and the crew", async () => {
    const res = await sacrificeResources(kira, 1);
    expect(res).toMatchObject({ before: 1, after: 0, atZero: true, unpreparedMarked: true });
    expect(kira.system.debility.unprepared).toBe(true);
    expect(ren.system.debility.unprepared).toBe(true);
  });
});

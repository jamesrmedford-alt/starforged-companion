/**
 * PROBE — UPG-04 RIDER-SUPPLY-ZERO-NO-UNPREPARED (ninth audit, area upgrades)
 *
 * What the user does: the crew's shared supply is 1. Kira's move triggers an
 * asset consequence rider that costs supply ("suffer -1 supply" / "Sacrifice
 * Resources (-1)" on the asset's ability), auto-applied by the GM after the
 * move (applyMoveConsequenceRiders → applyMeterRiders).
 *
 * What happens: consequenceRiders.applyMeterRiders (src/moves/consequenceRiders.js
 * :170-191) sums the deltas and writes them with applyMeterChanges alone:
 * supply 1 → 0 and Kira — and Ren, whose supply the sync mirrors to 0 — stay
 * prepared. The rider summary says the supply was taken; no card, no impact.
 *
 * What should happen: "If your supply is exhausted (reduced to 0), mark
 * unprepared" (vendor Sacrifice_Resources); "you and your allies … mark
 * unprepared together" (issue #315 S07). The repo made sufferExecutor.
 * markUnprepared "the zero-supply impact's one writer" — the executor,
 * Repair's supply trade (S04) and every other supply loss come to it. The
 * rider path is a supply loss that does not.
 *
 * Controls: a rider that leaves supply above 0 marks nothing; the Sacrifice
 * Resources executor at 1 supply marks the PC and the crew (S04 / S07).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/upgrades/riderSupplyZeroUnprepared.probe.js
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach } from "vitest";
import { applyMeterRiders } from "../../../src/moves/consequenceRiders.js";
import { sacrificeResources } from "../../../src/moves/sufferExecutor.js";
import { invalidateActorCache } from "../../../src/character/actorBridge.js";

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

describe("UPG-04 an asset rider that exhausts the supply marks nobody unprepared", () => {
  it("a -1 supply rider at supply 1 marks the PC (and the crew sharing the supply) unprepared", async () => {
    const results = await applyMeterRiders(
      [{ resource: "supply", amount: -1, text: "suffer -1 supply", assetName: "Hoverbike" }],
      { characterActor: kira, shipActorId: null },
    );
    expect(results).toEqual([expect.objectContaining({ ok: true })]);
    expect(kira.system.supply.value).toBe(0);
    // Expected: the zero-supply impact, on the PC who paid and the crew (S04 / S07). Actual: nobody.
    expect.soft(kira.system.debility.unprepared).toBe(true);
    expect.soft(ren.system.debility.unprepared).toBe(true);
  });

  it("control: a rider that leaves supply above 0 marks nothing", async () => {
    kira.system.supply.value = 3;
    invalidateActorCache(kira.id);
    await applyMeterRiders([{ resource: "supply", amount: -1 }], { characterActor: kira, shipActorId: null });
    expect(kira.system.supply.value).toBe(2);
    expect(kira.system.debility.unprepared).toBe(false);
  });

  it("control (issue #315 S04 / S07): Sacrifice Resources at 1 supply marks the PC and the crew", async () => {
    const res = await sacrificeResources(kira, 1);
    expect(res).toMatchObject({ before: 1, after: 0, atZero: true, unpreparedMarked: true });
    expect(kira.system.debility.unprepared).toBe(true);
    expect(ren.system.debility.unprepared).toBe(true);
  });
});

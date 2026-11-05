/**
 * PROBE — UPGRADES-02 RIDER-SUPPLY-LOSS-WHILE-UNPREPARED (tenth audit, area upgrades)
 *
 * What the user does: the crew's supply is 0 and Kira and Ren are unprepared
 * (a Sacrifice Resources took the last of it). Kira's move resolves and one of
 * her assets' consequence riders costs "-1 supply" — the loss issue #331 X16
 * made mark unprepared when it exhausts the supply.
 *
 * What happens: applyMeterRiders → writeCharacterMeters
 * (src/moves/consequenceRiders.js) writes supply 0 → 0 through
 * applyMeterChanges (the clamp), unpreparedAtZeroSupply finds the crew
 * already marked, and the rider comes back `{ ok: true }` with no note: the
 * summary card lists "-1 supply" under "✦ Asset effects applied". The loss is
 * settled for nothing, and nobody is told a cost is still owed.
 *
 * What should happen: "When you suffer a loss of resources while unprepared,
 * envision how this causes you hardship and apply the cost to a different
 * suffer move" (vendored Sacrifice Resources). The executor already does this
 * for its own losses — issue #325 W16: sacrificeResources at 0 while
 * unprepared posts a "Make a suffer move (-N)" picker that excludes Sacrifice
 * Resources, instead of settling the choice free. A rider's supply loss is the
 * same loss at a second site (X16 reached only the unprepared mark), so it
 * owes the same picker — or, at the least, a line saying the cost is owed to
 * another suffer move rather than "applied".
 *
 * Control: sacrificeResources() at 0 while unprepared posts the picker; a
 * rider at supply 1 marks the crew unprepared (X16 holds).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/upgrades/riderSupplyLossWhileUnprepared.probe.js
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach } from "vitest";
import { applyMeterRiders } from "../../../src/moves/consequenceRiders.js";
import { sacrificeResources } from "../../../src/moves/sufferExecutor.js";
import { invalidateActorCache } from "../../../src/character/actorBridge.js";

const MODULE_ID = "starforged-companion";

/** The W16 picker: an "any" suffer card that excludes Sacrifice Resources. */
const redirectPickers = () => ChatMessage._created.filter(m => {
  const f = m.flags?.[MODULE_ID];
  return f?.sufferCard && f.sufferPrompt?.kind === "any" && (f.sufferPrompt.exclude ?? []).includes("sacrifice_resources");
});

let kira, ren;
beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset();
  kira = makeTestActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { supply: { value: 0 }, debility: { unprepared: true } } });
  ren  = makeTestActor({ id: "pc-ren",  name: "Ren",  ownership: { "pl-2": 3 },
    system: { supply: { value: 0 }, debility: { unprepared: true } } });
  game.actors._set(kira.id, kira);
  game.actors._set(ren.id, ren);
  invalidateActorCache(kira.id);
  invalidateActorCache(ren.id);
});

describe("UPGRADES-02 a rider's supply loss at 0 supply while unprepared", () => {
  it("is redirected to another suffer move (the W16 picker), not settled for nothing", async () => {
    const results = await applyMeterRiders(
      [{ resource: "supply", amount: -1, text: "suffer -1 supply", assetName: "Hoverbike", label: "-1 supply" }],
      { characterActor: kira, shipActorId: null },
    );

    // Sanity: nothing to take — the supply stays 0, the crew was already unprepared.
    expect(kira.system.supply.value).toBe(0);
    expect(kira.system.debility.unprepared).toBe(true);

    // Expected: the loss goes to a different suffer move — the picker the executor posts (W16).
    // Actual: no picker; the rider is `{ ok: true }` and the summary lists "-1 supply" as applied.
    expect(redirectPickers()).toHaveLength(1);
    expect.soft(results[0].ok === false || /another suffer move/i.test(results[0].note ?? "")).toBe(true);
  });

  it("control: the executor's own loss at 0 while unprepared posts the picker (W16)", async () => {
    const res = await sacrificeResources(kira, 1, {});
    expect(res).toMatchObject({ atZero: true, redirected: true });
    expect(redirectPickers()).toHaveLength(1);
    expect(kira.system.supply.value).toBe(0);
  });

  it("control: a rider at supply 1, not unprepared, takes the supply and marks the crew (X16)", async () => {
    kira.system.supply.value = 1; kira.system.debility.unprepared = false;
    ren.system.supply.value  = 1; ren.system.debility.unprepared  = false;
    invalidateActorCache(kira.id); invalidateActorCache(ren.id);
    const results = await applyMeterRiders([{ resource: "supply", amount: -1, label: "-1 supply" }], { characterActor: kira, shipActorId: null });
    expect(results[0]).toMatchObject({ ok: true });
    expect(kira.system.supply.value).toBe(0);
    expect(kira.system.debility.unprepared).toBe(true);
    expect(ren.system.debility.unprepared).toBe(true);
    expect(redirectPickers()).toHaveLength(0);
  });
});

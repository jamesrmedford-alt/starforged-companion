/**
 * PROBE — UPG-02 ENDURE-AT-ZERO-MARK-AND-ROLL (ninth audit, area upgrades)
 *
 * What the user does: Kira is at 1 health. She rolls Endure Harm (the resist
 * roll) and misses; on its choice card she takes "-1 health". Or: her Face
 * Danger misses and the Pay the Price d100 lands on "You are harmed" (75–81),
 * which routes Endure Harm (-1).
 *
 * What happens: sufferExecutor.endureHarm (src/moves/sufferExecutor.js:198-235)
 * takes the health to 0 and then, at 0, BOTH marks wounded (line 212-216) AND
 * — because `opts.isMiss` is set (the choice card's executorOpts, or the Pay
 * the Price dispatcher's "always a miss context", src/index.js:6046-6050) —
 * rolls the mortal-wound d100 (line 217-220): "Health: 1 → 0 — marked wounded
 * / Mortal Wound (d100 7): You suffer mortal harm. Face Death." Endure Stress
 * (lines 241-276) does the same with shaken and the desolation table.
 *
 * What should happen: the move — "On a miss … If your health is 0, you must
 * also mark wounded or permanently harmed, OR roll on the table below"
 * (vendor Endure_Harm_905205c073b09eac; play kit p. 6: "at 0 mark
 * wounded/permanently harmed or roll the mortal-wound d100"). One of the
 * three, the player's choice — never an impact (momentum max and reset each
 * -1, health capped at 4) AND a table result that can say "Face Death". The
 * same for Endure Stress (shaken / permanently traumatized / the desolation
 * table). No decision records the double (decisions.md only notes these
 * escalations are not invertible, issue #311).
 *
 * The second describe is the harm-step half, which NEEDS A DECISION
 * (UPG-D2 ENDURE-HARM-STEP-ESCALATION): the move puts the wounded mark and
 * the table on the RESIST ROLL's miss — the harm step itself only takes the
 * meter and, at 0, Lose Momentum for the remainder, after which "if your
 * health is 0 … roll +health or +iron". The Pay the Price route (every routed
 * miss) and a weak hit's "any" pick run the harm step with the miss
 * escalation, so a Face Danger miss at 1 health marks wounded and can roll
 * "Face Death" with no Endure Harm roll ever made.
 *
 * Controls: a harm that leaves health above 0 marks nothing and rolls
 * nothing; harm past 0 overflows to momentum (issue #314 Q02).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/upgrades/endureAtZeroMarkAndRoll.probe.js
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach } from "vitest";
import { endureHarm, endureStress } from "../../../src/moves/sufferExecutor.js";
import { invalidateActorCache } from "../../../src/character/actorBridge.js";
import { applyPayThePriceSufferFromRelay } from "../../../src/index.js";

const GM = { requesterId: "gm-1", requesterIsGM: true, requester: { id: "gm-1", isGM: true } };

let pc;
beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset();
  pc = makeTestActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { health: { value: 1 }, spirit: { value: 1 }, momentum: { value: 5 } } });
  game.actors._set(pc.id, pc);
  invalidateActorCache(pc.id);
});

describe("UPG-02 Endure Harm / Endure Stress at 0 on a miss: mark the impact OR roll the table, never both", () => {
  it("Endure Harm's miss at 1 health: wounded is marked AND the mortal-wound table rolled", async () => {
    const res = await endureHarm(pc, 1, { isMiss: true, fixedRoll: 60 });
    expect(res.after).toBe(0);
    // Expected: one of the move's alternatives. Actual: both — woundedMarked true and a table result.
    expect.soft(res.woundedMarked && !!res.mortalWound).toBe(false);
    expect.soft(pc.system.debility.wounded === true && !!res.mortalWound).toBe(false);
  });

  it("Endure Stress's miss at 1 spirit: shaken is marked AND the desolation table rolled", async () => {
    const res = await endureStress(pc, 1, { isMiss: true, fixedRoll: 60 });
    expect(res.after).toBe(0);
    expect.soft(res.shakenMarked && !!res.desolation).toBe(false);
    expect.soft(pc.system.debility.shaken === true && !!res.desolation).toBe(false);
  });

  it("control: harm that leaves health above 0 marks nothing and rolls nothing", async () => {
    pc.system.health.value = 3;
    invalidateActorCache(pc.id);
    const res = await endureHarm(pc, 1, { isMiss: true, fixedRoll: 60 });
    expect(res.after).toBe(2);
    expect(res.woundedMarked).toBe(false);
    expect(res.mortalWound).toBeNull();
    expect(pc.system.debility.wounded).toBe(false);
  });

  it("control (issue #314 Q02): harm past 0 overflows to momentum", async () => {
    const res = await endureHarm(pc, 2, { isMiss: false });
    expect(res.after).toBe(0);
    expect(res.momentumLoss).toMatchObject({ amount: 1, taken: 1, before: 5, after: 4 });
    expect(pc.system.momentum.value).toBe(4);
  });
});

describe("UPG-D2 (needs a decision) the harm step runs the resist roll's miss escalation", () => {
  it("a Pay the Price 'You are harmed' at 1 health marks wounded and rolls the mortal-wound table with no Endure Harm roll made", async () => {
    const res = await applyPayThePriceSufferFromRelay({ routes: [{ move: "endure_harm", amount: 1 }], actorId: pc.id }, GM);
    expect(res.applied).toBe(true);
    const landed = res.landed[0];
    expect(landed.after).toBe(0);
    // Option A (the move's text): the harm step takes the meter and the overflow only; the
    // wounded mark / table belong to the resist roll's miss, which nothing rolled here.
    // Actual: woundedMarked true, mortalWound rolled (option B keeps this approximation).
    expect.soft(landed.woundedMarked).toBe(false);
    expect.soft(landed.mortalWound).toBeNull();
  });
});

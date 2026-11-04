/**
 * STARFORGED COMPANION
 * tests/unit/endureAtZeroChoice.test.js
 *
 * Issue #329 X03 (ENDURE-AT-ZERO-MARK-AND-ROLL) — Endure Harm / Endure Stress
 * at 0 on a miss: mark the impact OR roll the table, never both.
 *
 * Kira is at 1 health. Her Endure Harm misses and she takes "-1 health" on its
 * choice card — or a Face Danger miss's Pay the Price lands on "You are
 * harmed". The executor took health to 0 and then BOTH marked wounded AND
 * rolled the mortal-wound d100 ("marked wounded / Mortal Wound (d100 7): …
 * Face Death"). The move: "If your health is 0, you must also mark wounded or
 * permanently harmed, or roll on the table below" — one of three, the
 * player's choice (Endure Stress: shaken or traumatized, or the desolation
 * table). Now the executor marks nothing and rolls nothing: a follow-up
 * choice card offers the three, and a pick applies exactly that one.
 *
 * The choice is the resist roll's own miss's (`resistMiss` — Endure Harm /
 * Stress's miss card): a Pay the Price harm, or any other harm step, at 0
 * owes that roll instead (issue #330 D3).
 *
 * (Converted from the ninth audit's probe
 * tests/probes/upgrades/endureAtZeroMarkAndRoll.probe.js.)
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach } from "vitest";
import { endureHarm, endureStress } from "../../src/moves/sufferExecutor.js";
import { applySufferPickFromRelay } from "../../src/moves/sufferCard.js";
import { invalidateActorCache } from "../../src/character/actorBridge.js";
import { applyPayThePriceSufferFromRelay } from "../../src/index.js";

const MODULE_ID = "starforged-companion";
const GM = { requesterId: "gm-1", requesterIsGM: true, requester: { id: "gm-1", isGM: true } };

let pc;
beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset();
  globalThis.game.messages = {
    get: (id) => ChatMessage._created.find(m => m.id === id) ?? null,
    get contents() { return ChatMessage._created; },
  };
  pc = makeTestActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { health: { value: 1 }, spirit: { value: 1 }, momentum: { value: 5 } } });
  game.actors._set(pc.id, pc);
  invalidateActorCache(pc.id);
});

/** The at-0 choice card posted for `meter` ("health" | "spirit"), newest. */
const atZeroCard = (meter) => ChatMessage._created
  .filter(m => m.flags?.[MODULE_ID]?.sufferCard && m.flags[MODULE_ID].sufferPrompt?.atZero === meter).at(-1) ?? null;
const optionLabels = (card) => card.flags[MODULE_ID].sufferPrompt.options.map(o => o.label);
const pick = (card, index) => applySufferPickFromRelay({ messageId: card.id, pickKind: "enum", optionIndex: index }, GM);

describe("issue #329 X03 — at 0 on a miss: mark the impact OR roll the table, never both", () => {
  it("Endure Harm's miss at 1 health marks nothing and rolls nothing — the choice card offers the three", async () => {
    const res = await endureHarm(pc, 1, { resistMiss: true, fixedRoll: 60 });
    expect(res.after).toBe(0);
    expect(res).toMatchObject({ woundedMarked: false, mortalWound: null, impactChoice: true });
    expect(pc.system.debility.wounded).toBe(false);
    expect(pc.system.debility.permanentlyharmed).toBe(false);
    const card = atZeroCard("health");
    expect(card).not.toBeNull();
    expect(optionLabels(card)).toEqual(["Mark wounded", "Mark permanently harmed", "Roll on the mortal-wound table"]);
    expect(card.flags[MODULE_ID].actorId).toBe("pc-kira");
  });

  it("Endure Stress's miss at 1 spirit marks nothing and rolls nothing — the choice card offers the three", async () => {
    const res = await endureStress(pc, 1, { resistMiss: true, fixedRoll: 60 });
    expect(res.after).toBe(0);
    expect(res).toMatchObject({ shakenMarked: false, desolation: null, impactChoice: true });
    expect(pc.system.debility.shaken).toBe(false);
    expect(optionLabels(atZeroCard("spirit"))).toEqual(["Mark shaken", "Mark traumatized", "Roll on the desolation table"]);
  });

  it("picking 'Mark wounded' marks wounded — and rolls no table", async () => {
    await endureHarm(pc, 1, { resistMiss: true, fixedRoll: 60 });
    expect(await pick(atZeroCard("health"), 0)).toMatchObject({ applied: true });
    expect(pc.system.debility.wounded).toBe(true);
    expect(pc.system.debility.permanentlyharmed).toBe(false);
    expect(ChatMessage._created.some(m => m.flags?.[MODULE_ID]?.suffer === "impact_table")).toBe(false);
  });

  it("picking 'Mark permanently harmed' marks it — not wounded", async () => {
    await endureHarm(pc, 1, { resistMiss: true, fixedRoll: 60 });
    expect(await pick(atZeroCard("health"), 1)).toMatchObject({ applied: true });
    expect(pc.system.debility.permanentlyharmed).toBe(true);
    expect(pc.system.debility.wounded).toBe(false);
  });

  it("picking the table rolls it — and marks no impact", async () => {
    await endureHarm(pc, 1, { resistMiss: true, fixedRoll: 1 });
    expect(await pick(atZeroCard("health"), 2)).toMatchObject({ applied: true });
    const rolled = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.suffer === "impact_table");
    expect(rolled.flags[MODULE_ID]).toMatchObject({ table: "mortal_wound", roll: 1 });
    expect(rolled.content).toMatch(/Mortal Wound/);
    expect(pc.system.debility.wounded).toBe(false);
    expect(pc.system.debility.permanentlyharmed).toBe(false);
  });

  it("Endure Stress: the desolation table, picked, marks neither shaken nor traumatized", async () => {
    await endureStress(pc, 1, { resistMiss: true, fixedRoll: 5 });
    expect(await pick(atZeroCard("spirit"), 2)).toMatchObject({ applied: true });
    expect(ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.suffer === "impact_table").flags[MODULE_ID].table).toBe("desolation");
    expect(pc.system.debility.shaken).toBe(false);
    expect(pc.system.debility.traumatized).toBe(false);
  });

  it("an impact already marked is not offered (marking it again would cost nothing)", async () => {
    pc.system.debility.wounded = true;
    await endureHarm(pc, 1, { resistMiss: true, fixedRoll: 60 });
    const card = atZeroCard("health");
    expect(card.content).toMatch(/Mark wounded \(unavailable\)/);
    expect(await pick(card, 0)).toMatchObject({ applied: false, reason: "not-offered" });
  });

  it("a Pay the Price 'You are harmed' at 1 health owes the resist roll — no choice, nothing marked (issue #330 D3)", async () => {
    const res = await applyPayThePriceSufferFromRelay({ routes: [{ move: "endure_harm", amount: 1 }], actorId: pc.id }, GM);
    expect(res.applied).toBe(true);
    expect(res.landed[0]).toMatchObject({ after: 0, woundedMarked: false, mortalWound: null, impactChoice: false, resistOwed: true });
    expect(atZeroCard("health")).toBeNull();
    expect(pc.system.debility.wounded).toBe(false);
  });

  it("control: harm that leaves health above 0 marks nothing, rolls nothing and offers no choice", async () => {
    pc.system.health.value = 3;
    invalidateActorCache(pc.id);
    const res = await endureHarm(pc, 1, { resistMiss: true, fixedRoll: 60 });
    expect(res.after).toBe(2);
    expect(res).toMatchObject({ woundedMarked: false, mortalWound: null, impactChoice: false });
    expect(atZeroCard("health")).toBeNull();
  });

  it("control (issue #314 Q02): harm past 0 overflows to momentum", async () => {
    const res = await endureHarm(pc, 2, { isMiss: false });
    expect(res.after).toBe(0);
    expect(res.momentumLoss).toMatchObject({ amount: 1, taken: 1, before: 5, after: 4 });
    expect(pc.system.momentum.value).toBe(4);
  });
});

/**
 * STARFORGED COMPANION
 * tests/unit/sufferExecutor.test.js
 *
 * Unit tests for the six suffer-move executors (F16 Phase C).
 * Each executor is tested for:
 *   - happy path (meter decrements by `amount`)
 *   - at-0 escalation (debility mark + d100 roll where applicable)
 *   - input validation (zero / negative / null actor)
 *   - chat-card emission (postSufferCard called)
 *
 * The actorBridge writes are tested by their own suites (actorBridge.test.js).
 * Here we just confirm the executor calls applyMeterChanges / setDebility
 * with the right arguments, and that the at-0 escalation tables fire.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock actorBridge — track applyMeterChanges + setDebility calls.
// ---------------------------------------------------------------------------

const bridgeCalls = { applyMeterChanges: [], setDebility: [] };
// The player characters the shared-supply crew is drawn from (sharedSupply.js).
const roster = vi.hoisted(() => ({ actors: [] }));
vi.mock("../../src/character/actorBridge.js", async (importOriginal) => ({
  // The companion's and the support vehicle's track writers are the real
  // ones (SUFFER-EXECUTOR-ASSET-SCHEMA): they read and write the vendor
  // asset's `system.track`.
  ...(({ applyCompanionHealthChange, applyVehicleAssetIntegrityChange, listSupportVehicleAssets }) =>
    ({ applyCompanionHealthChange, applyVehicleAssetIntegrityChange, listSupportVehicleAssets }))(await importOriginal()),
  // The at-0 choice card (sufferCard.js, issue #329 X03) reads these.
  getActor:            vi.fn(() => null),
  readCompanionHealth: vi.fn(() => null),
  getPlayerActors: vi.fn(() => roster.actors.filter(a => a.type === "character" && !a.flags?.["starforged-companion"]?.entityType)),
  isPlayerCharacterActor: (a) => a?.type === "character" && !a?.flags?.["starforged-companion"]?.entityType,
  applyMeterChanges: vi.fn(async (actor, changes) => {
    bridgeCalls.applyMeterChanges.push({ actor, changes });
    // Mutate the mock actor so subsequent reads see the new value, clamped
    // as actorBridge clamps (momentum at -6, the others at 0).
    const floor = (k) => (k === "momentum" ? -6 : 0);
    for (const [k, delta] of Object.entries(changes)) {
      if (actor.system?.[k] && typeof actor.system[k] === "object") {
        actor.system[k].value = Math.max(floor(k), (actor.system[k].value ?? 0) + delta);
      } else {
        actor.system = actor.system ?? {};
        actor.system[k] = Math.max(floor(k), (actor.system[k] ?? 0) + delta);
      }
    }
  }),
  setDebility: vi.fn(async (actor, key, value) => {
    bridgeCalls.setDebility.push({ actor, key, value });
    actor.system = actor.system ?? {};
    actor.system.debility = { ...(actor.system.debility ?? {}), [key]: value };
  }),
}));

// The command vehicle — its integrity through the ship record's writer
// (entities/ship.js changeIntegrity).
const ship = vi.hoisted(() => ({ id: "ship-1", name: "Kobayashi V", integrity: 5, refuse: false }));
vi.mock("../../src/entities/ship.js", () => ({
  getCommandVehicleActorId: vi.fn(() => ship.id),
  changeIntegrity: vi.fn(async (id, delta) => {
    if (id !== ship.id) return { ok: false, reason: "no-vehicle" };
    const before = ship.integrity;
    if (ship.refuse) return { ok: false, reason: "refused", error: "test: refused", name: ship.name, before };
    ship.integrity = Math.max(0, Math.min(5, before + delta));
    return { ok: true, name: ship.name, before, after: ship.integrity };
  }),
}));

// ChatMessage stub — track calls so we can assert the card posted.
const chatCalls = [];
beforeEach(() => {
  bridgeCalls.applyMeterChanges.length = 0;
  bridgeCalls.setDebility.length = 0;
  roster.actors = [];
  chatCalls.length = 0;
  globalThis.ChatMessage = {
    create: vi.fn(async (data) => {
      chatCalls.push(data);
      return data;
    }),
  };
});

import {
  loseMomentum,
  endureHarm,
  endureStress,
  sacrificeResources,
  markUnprepared,
  companionTakesAHit,
  withstandDamage,
  executeSuffer,
  SUFFER_EXECUTORS,
} from "../../src/moves/sufferExecutor.js";


// ─────────────────────────────────────────────────────────────────────────────
// Lose Momentum
// ─────────────────────────────────────────────────────────────────────────────

describe("loseMomentum", () => {
  function actor(momentum) {
    return { id: "a1", system: { momentum: { value: momentum, max: 10, min: -6 } } };
  }

  it("applies -amount to momentum and posts a card", async () => {
    const a = actor(3);
    const r = await loseMomentum(a, 1);
    expect(bridgeCalls.applyMeterChanges).toHaveLength(1);
    expect(bridgeCalls.applyMeterChanges[0].changes).toEqual({ momentum: -1 });
    expect(r.before).toBe(3);
    expect(r.after).toBe(2);
    expect(r.atMin).toBe(false);
    expect(chatCalls).toHaveLength(1);
    expect(chatCalls[0].content).toContain("Momentum: 3 → 2");
  });

  it("flags atMin when momentum drops to -6", async () => {
    const a = actor(-5);
    const r = await loseMomentum(a, 1);
    expect(r.after).toBe(-6);
    expect(r.atMin).toBe(true);
  });

  it("respects skipCard", async () => {
    await loseMomentum(actor(3), 1, { skipCard: true });
    expect(chatCalls).toHaveLength(0);
  });

  it("skips on zero / negative amount", async () => {
    const a = actor(3);
    expect((await loseMomentum(a, 0)).skipped).toBe(true);
    expect((await loseMomentum(a, -2)).skipped).toBe(true);
    expect(bridgeCalls.applyMeterChanges).toHaveLength(0);
  });

  it("skips on null actor", async () => {
    expect((await loseMomentum(null, 1)).skipped).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Endure Harm
// ─────────────────────────────────────────────────────────────────────────────

describe("endureHarm", () => {
  function actor(health, wounded = false) {
    return {
      id: "a1",
      system: {
        health: { value: health, max: 5, min: 0 },
        debility: { wounded },
      },
    };
  }

  it("applies -amount to health and posts a card", async () => {
    const a = actor(3);
    const r = await endureHarm(a, 1);
    expect(bridgeCalls.applyMeterChanges[0].changes).toEqual({ health: -1 });
    expect(r.before).toBe(3);
    expect(r.after).toBe(2);
    expect(r.atZero).toBe(false);
    expect(chatCalls[0].content).toContain("Health: 3 → 2");
  });

  // Issue #330 D3: at 0 the harm step owes the resist roll — "Then, if your
  // health is 0 … roll +health or +iron" — and marks nothing (it marked
  // wounded with no roll made).
  it("at 0 health the harm step owes the resist roll — a card that rolls Endure Harm; nothing is marked", async () => {
    const a = actor(2);
    const r = await endureHarm(a, 2);
    expect(r).toMatchObject({ atZero: true, woundedMarked: false, mortalWound: null, impactChoice: false, resistOwed: true });
    expect(bridgeCalls.setDebility).toHaveLength(0);
    expect(chatCalls[0].content).toContain("at 0 health you must resist: roll Endure Harm on the card below");
    const resist = chatCalls[1].flags["starforged-companion"];
    expect(resist.sufferCard).toBe(true);
    expect(resist.sufferPrompt).toMatchObject({ resist: "health", options: [{ resist: "endure_harm" }] });
  });

  it("an already wounded character at 0 owes the resist roll too, and nothing is marked", async () => {
    const a = actor(2, true);
    const r = await endureHarm(a, 2);
    expect(r).toMatchObject({ atZero: true, woundedMarked: false, resistOwed: true });
    expect(bridgeCalls.setDebility).toHaveLength(0);
  });

  // Issue #329 X03: at 0 on the resist roll's miss the player chooses — mark
  // wounded, mark permanently harmed, or roll the mortal-wound table. It
  // marked wounded AND rolled the table.
  it("on the resist roll's miss at 0 health offers the choice — marks nothing, rolls nothing", async () => {
    const a = actor(1);
    const r = await endureHarm(a, 1, { resistMiss: true, fixedRoll: 1 });
    expect(r).toMatchObject({ atZero: true, woundedMarked: false, mortalWound: null, impactChoice: true, resistOwed: false });
    expect(bridgeCalls.setDebility).toHaveLength(0);
    expect(chatCalls[0].content).toContain("at 0 health, choose one on the card below");
    const choice = chatCalls[1].flags["starforged-companion"];
    expect(choice.sufferCard).toBe(true);
    expect(choice.sufferPrompt.options.map(o => o.label)).toEqual(
      ["Mark wounded", "Mark permanently harmed", "Roll on the mortal-wound table"]);
  });

  it("another move's miss at 0 is a harm step: the resist roll is owed, not the choice (issue #330 D3)", async () => {
    const a = actor(1);
    const r = await endureHarm(a, 1, { isMiss: true, fixedRoll: 1 });
    expect(r).toMatchObject({ atZero: true, mortalWound: null, impactChoice: false, resistOwed: true });
  });

  it("skips on zero / negative amount", async () => {
    const a = actor(3);
    expect((await endureHarm(a, 0)).skipped).toBe(true);
    expect(bridgeCalls.applyMeterChanges).toHaveLength(0);
  });

  // Issue #314 Q02: "if your health is 0, suffer -momentum equal to any
  // remaining harm" — the remainder vanished in the meter's clamp.
  describe("harm past 0 health is momentum", () => {
    const withMomentum = (health, momentum, wounded = false) => {
      const a = actor(health, wounded);
      a.system.momentum = { value: momentum, max: 10, min: -6 };
      return a;
    };

    it("a loss of 3 at health 1: health 1 → 0, the other 2 as momentum 5 → 3", async () => {
      const a = withMomentum(1, 5);
      const r = await endureHarm(a, 3);
      expect(bridgeCalls.applyMeterChanges.map(c => c.changes)).toEqual([{ health: -1 }, { momentum: -2 }]);
      expect(r).toMatchObject({ before: 1, after: 0, atZero: true,
        momentumLoss: { amount: 2, taken: 2, remaining: 0, before: 5, after: 3, atMin: false } });
      expect(a.system.momentum.value).toBe(3);
      // The summary card and the resist card it owes at 0 — the overflow has no card of its own.
      expect(chatCalls.map(c => !!c.flags["starforged-companion"].sufferPrompt)).toEqual([false, true]);
      expect(chatCalls[0].content).toContain("Health: 1 → 0 — 2 more as momentum: 5 → 3");
      expect(chatCalls[0].flags["starforged-companion"].momentumLoss).toMatchObject({ amount: 2, taken: 2 });
    });

    it("a loss equal to the health left takes no momentum", async () => {
      const a = withMomentum(2, 5);
      const r = await endureHarm(a, 2);
      expect(r.momentumLoss).toBeNull();
      expect(a.system.momentum.value).toBe(5);
      expect(chatCalls[0].content).toContain("Health: 2 → 0");
      expect(chatCalls[0].content).not.toContain("as momentum");
    });

    it("a loss below the health left takes no momentum", async () => {
      const a = withMomentum(3, 5);
      const r = await endureHarm(a, 1);
      expect(r.momentumLoss).toBeNull();
      expect(bridgeCalls.applyMeterChanges.map(c => c.changes)).toEqual([{ health: -1 }]);
    });

    it("at 0 health already, the whole loss is momentum, and no health write is made", async () => {
      const a = withMomentum(0, 1, true);
      const r = await endureHarm(a, 2);
      expect(bridgeCalls.applyMeterChanges.map(c => c.changes)).toEqual([{ momentum: -2 }]);
      expect(r).toMatchObject({ before: 0, after: 0, atZero: true, woundedMarked: false,
        momentumLoss: { amount: 2, taken: 2, before: 1, after: -1 } });
      expect(chatCalls[0].content).toContain("Health: 0 → 0 — 2 more as momentum: 1 → -1");
    });

    it("at the momentum minimum, what cannot be taken goes to a picker of another suffer move, and the card says so", async () => {
      const a = withMomentum(1, -5);
      const r = await endureHarm(a, 3);
      expect(a.system.momentum.value).toBe(-6);
      expect(r.momentumLoss).toMatchObject({ amount: 2, taken: 1, remaining: 1, before: -5, after: -6, atMin: true, redirected: true });
      // MOMENTUM-MIN-REDIRECT-MANUAL: the remainder's picker — any suffer move but Lose Momentum.
      const picker = chatCalls.find(c => c.flags?.["starforged-companion"]?.sufferPrompt);
      expect(picker.flags["starforged-companion"].sufferPrompt).toMatchObject({ kind: "any", amount: 1, exclude: ["lose_momentum"] });
      const card = chatCalls.find(c => c.flags?.["starforged-companion"]?.suffer === "endure_harm");
      expect(card.content).toContain(
        "Health: 1 → 0 — 2 more as momentum: -5 → -6 (at minimum; 1 not taken — make another suffer move or clear progress: choose it on its card)");
    });
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Endure Stress
// ─────────────────────────────────────────────────────────────────────────────

describe("endureStress", () => {
  function actor(spirit, shaken = false) {
    return {
      id: "a1",
      system: {
        spirit: { value: spirit, max: 5, min: 0 },
        debility: { shaken },
      },
    };
  }

  it("applies -amount to spirit and posts a card", async () => {
    const a = actor(4);
    const r = await endureStress(a, 1);
    expect(bridgeCalls.applyMeterChanges[0].changes).toEqual({ spirit: -1 });
    expect(r.after).toBe(3);
    expect(chatCalls[0].content).toContain("Spirit: 4 → 3");
  });

  it("at 0 spirit the stress step owes the resist roll — Endure Stress — and marks nothing (issue #330 D3)", async () => {
    const r = await endureStress(actor(1), 1);
    expect(r).toMatchObject({ atZero: true, shakenMarked: false, resistOwed: true });
    expect(bridgeCalls.setDebility).toHaveLength(0);
    expect(chatCalls[1].flags["starforged-companion"].sufferPrompt).toMatchObject({ resist: "spirit", options: [{ resist: "endure_stress" }] });
  });

  it("on the resist roll's miss at 0 spirit offers the choice — marks nothing, rolls nothing (issue #329 X03)", async () => {
    const r = await endureStress(actor(1), 1, { resistMiss: true, fixedRoll: 5 });
    expect(r).toMatchObject({ atZero: true, shakenMarked: false, desolation: null, impactChoice: true });
    expect(bridgeCalls.setDebility).toHaveLength(0);
    expect(chatCalls[1].flags["starforged-companion"].sufferPrompt.options.map(o => o.label)).toEqual(
      ["Mark shaken", "Mark traumatized", "Roll on the desolation table"]);
  });

  // Issue #314 Q02 — symmetric to Endure Harm.
  it("stress past 0 spirit is momentum: a loss of 3 at spirit 1, momentum 5 → 3", async () => {
    const a = actor(1);
    a.system.momentum = { value: 5, max: 10, min: -6 };
    const r = await endureStress(a, 3);
    expect(bridgeCalls.applyMeterChanges.map(c => c.changes)).toEqual([{ spirit: -1 }, { momentum: -2 }]);
    expect(r).toMatchObject({ before: 1, after: 0, atZero: true, shakenMarked: false, resistOwed: true,
      momentumLoss: { amount: 2, taken: 2, remaining: 0, before: 5, after: 3 } });
    expect(chatCalls[0].content).toContain("Spirit: 1 → 0 — 2 more as momentum: 5 → 3 — at 0 spirit you must resist");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Sacrifice Resources
// ─────────────────────────────────────────────────────────────────────────────

describe("sacrificeResources", () => {
  function actor(supply, unprepared = false) {
    return {
      id: "a1",
      system: {
        supply: { value: supply, max: 5, min: 0 },
        debility: { unprepared },
      },
    };
  }

  it("applies -amount to supply", async () => {
    const r = await sacrificeResources(actor(4), 2);
    expect(bridgeCalls.applyMeterChanges[0].changes).toEqual({ supply: -2 });
    expect(r.before).toBe(4);
    expect(r.after).toBe(2);
  });

  it("marks unprepared at 0 supply", async () => {
    const r = await sacrificeResources(actor(1), 1);
    expect(r.atZero).toBe(true);
    expect(r.unpreparedMarked).toBe(true);
  });

  // Already unprepared, the loss is not the supply's at any supply (issue #338
  // D3): this pinned a PC unprepared at 1 paying it 1 → 0 ("does not re-mark
  // if already unprepared") — the loss now goes to another suffer move.
  it("already unprepared at supply 1: nothing is taken or re-marked — the loss goes to another suffer move", async () => {
    const r = await sacrificeResources(actor(1, true), 1);
    expect(r).toMatchObject({ before: 1, after: 1, atZero: false, unpreparedMarked: false, redirected: true });
    expect(bridgeCalls.applyMeterChanges).toEqual([]);
    expect(bridgeCalls.setDebility).toEqual([]);
    expect(chatCalls.some(c => /the loss goes to another suffer move/.test(c.content ?? ""))).toBe(true);
  });

  // Issue #315 S07: the crew shares one supply, and "because you and your
  // allies share the same supply value, you mark unprepared together" — only
  // the PC who paid was marked; the sync mirrored the number alone.
  describe("the crew sharing the supply is marked unprepared together", () => {
    const pc = (id, name, { supply = 1, unprepared = false, entityType } = {}) => ({
      id, name, type: "character",
      flags: entityType ? { "starforged-companion": { entityType } } : {},
      system: { supply: { value: supply, max: 5, min: 0 }, debility: { unprepared } },
    });
    const marked = () => bridgeCalls.setDebility.map(c => `${c.actor.id}:${c.key}`);

    it("two PCs at supply 1: A's sacrifice to 0 marks A and B, and the card names B", async () => {
      const a = pc("pc-a", "Kira"), b = pc("pc-b", "Ren");
      roster.actors = [a, b];
      const r = await sacrificeResources(a, 1);
      expect(r.unpreparedMarked).toBe(true);
      expect([a, b].map(x => x.system.debility.unprepared)).toEqual([true, true]);
      expect(chatCalls[0].content).toMatch(/marked <strong>unprepared<\/strong> — Ren, sharing the supply, is marked <strong>unprepared<\/strong> too/);
    });

    it("an ally already unprepared is not marked again or named", async () => {
      const a = pc("pc-a", "Kira"), b = pc("pc-b", "Ren", { unprepared: true });
      roster.actors = [a, b];
      await sacrificeResources(a, 1);
      expect(marked()).toEqual(["pc-a:unprepared"]);
      expect(chatCalls[0].content).not.toMatch(/Ren/);
    });

    // A roller already unprepared loses no supply to Sacrifice Resources
    // (issue #338 D3 — this drove the mark through it, 1 → 0); the crew's
    // mark still reaches an ally the impact's other writers leave unmarked —
    // Repair's trade, an asset rider's supply cost (markUnprepared).
    it("the roller already unprepared: markUnprepared still marks the allies", async () => {
      const a = pc("pc-a", "Kira", { unprepared: true }), b = pc("pc-b", "Ren");
      roster.actors = [a, b];
      const marks = await markUnprepared(a);
      expect(marks).toMatchObject({ unpreparedMarked: false, alliesMarked: ["Ren"] });
      expect(marked()).toEqual(["pc-b:unprepared"]);
    });

    it("the roller already unprepared: its Sacrifice Resources is redirected, and marks no one", async () => {
      const a = pc("pc-a", "Kira", { unprepared: true }), b = pc("pc-b", "Ren");
      roster.actors = [a, b];
      const r = await sacrificeResources(a, 1);
      expect(r.redirected).toBe(true);
      expect(a.system.supply.value).toBe(1);
      expect(marked()).toEqual([]);
    });

    it("an ally's refused write: the others stand, nothing throws, and the card says to mark it", async () => {
      const a = pc("pc-a", "Kira"), b = pc("pc-b", "Ren"), c = pc("pc-c", "Ash");
      roster.actors = [a, b, c];
      const { setDebility } = await import("../../src/character/actorBridge.js");
      setDebility.mockImplementationOnce(async (x, key, value) => {          // A's own mark lands
        bridgeCalls.setDebility.push({ actor: x, key, value });
        x.system.debility[key] = value;
      }).mockImplementationOnce(async () => { throw new Error("write rejected"); });   // Ren's is refused
      const r = await sacrificeResources(a, 1);
      expect(r.unpreparedMarked).toBe(true);
      expect([a, b, c].map(x => x.system.debility.unprepared)).toEqual([true, false, true]);
      expect(chatCalls[0].content).toMatch(/Ash, sharing the supply, is marked[\s\S]*Ren could not be marked unprepared — mark it on the sheet/);
    });

    it("an NPC card is no crew, and a sacrifice short of 0 marks no one", async () => {
      const a = pc("pc-a", "Kira", { supply: 3 }), npc = pc("npc-1", "Sable", { entityType: "connection" });
      roster.actors = [a, npc];
      await sacrificeResources(a, 1);
      expect(marked()).toEqual([]);
      a.system.supply.value = 1;
      await sacrificeResources(a, 1);
      expect(marked()).toEqual(["pc-a:unprepared"]);
    });
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Companion Takes a Hit
// ─────────────────────────────────────────────────────────────────────────────

describe("companionTakesAHit", () => {
  // The vendor's companion asset: its health is the condition track
  // (`system.track`) — SUFFER-EXECUTOR-ASSET-SCHEMA: the executor wrote
  // `system.condition` / `system.health`, which it has not.
  function companion(id, health = 3, name = "Loyal Hound") {
    const item = {
      id, name, type: "asset",
      system: { category: "Companion", track: { enabled: true, name: "Health", value: health, min: 0, max: 5 } },
      update: vi.fn(async function (patch) {
        if (patch["system.track.value"] != null) this.system.track.value = patch["system.track.value"];
      }),
    };
    return item;
  }
  function actor(health = 3, extra = []) {
    const item = companion("comp-1", health);
    const items = [item, ...extra];
    return { id: "a1", name: "Kira", system: { momentum: { value: 2, max: 10, min: -6 } },
      items: { contents: items, get: (id) => items.find(i => i.id === id) ?? null, find: (fn) => items.find(fn) ?? null },
      __item: item };
  }

  it("decrements the companion's health track", async () => {
    const a = actor(3);
    const r = await companionTakesAHit(a, "comp-1", 1);
    expect(r.before).toBe(3);
    expect(r.after).toBe(2);
    expect(a.__item.system.track.value).toBe(2);
    expect(a.__item.update).toHaveBeenCalledWith({ "system.track.value": 2 });
  });

  it("with no item id (the any-picker's button), the only companion takes it", async () => {
    const a = actor(3);
    const r = await companionTakesAHit(a, null, 2);
    expect(r).toMatchObject({ before: 3, after: 1, itemId: "comp-1" });
    expect(chatCalls[0].content).toMatch(/Loyal Hound: 3 → 1/);
  });

  it("harm past 0 health is momentum", async () => {
    const a = actor(1);
    const r = await companionTakesAHit(a, "comp-1", 3);
    expect(r).toMatchObject({ before: 1, after: 0, atZero: true });
    expect(r.momentumLoss).toMatchObject({ amount: 2, taken: 2, before: 2, after: 0 });
    expect(chatCalls[0].content).toMatch(/2 more as momentum: 2 → 0/);
  });

  it("flags destroyed on miss-with-match at 0", async () => {
    const a = actor(1);
    const r = await companionTakesAHit(a, "comp-1", 1, { isMissWithMatch: true });
    expect(r.atZero).toBe(true);
    expect(r.destroyed).toBe(true);
    expect(chatCalls[0].content).toMatch(/companion destroyed/i);
    expect(chatCalls[0].content).toMatch(/discard/i);
  });

  it("at 0 without miss-with-match is just out-of-action", async () => {
    const a = actor(1);
    const r = await companionTakesAHit(a, "comp-1", 1);
    expect(r.atZero).toBe(true);
    expect(r.destroyed).toBe(false);
    expect(chatCalls[0].content).toMatch(/out of action/i);
  });

  it("surfaces a not-found warning when the companion id is bogus, or no companion is named among several", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await companionTakesAHit(actor(3), "doesnt-exist", 1);
    expect(r).toMatchObject({ skipped: true, ok: false, reason: "no-companion" });
    expect(chatCalls[0].content).toMatch(/not found/i);
    const two = actor(3, [companion("comp-2", 4, "Glowcat")]);
    expect(await companionTakesAHit(two, null, 1)).toMatchObject({ skipped: true, reason: "no-companion" });
    expect(two.__item.system.track.value).toBe(3);
    warn.mockRestore();
  });

  it("a refused write throws (the card reports it, with a Retry)", async () => {
    const a = actor(3);
    a.__item.update = vi.fn(async () => { throw new Error("test: refused"); });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(companionTakesAHit(a, "comp-1", 1)).rejects.toThrow(/refused/);
    warn.mockRestore();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Withstand Damage
// ─────────────────────────────────────────────────────────────────────────────

describe("withstandDamage", () => {
  // A support vehicle: the vendor asset's Integrity track. With no item id,
  // the command vehicle: the ship record's integrity writer.
  function actor(integrity = 5) {
    const item = {
      id: "veh-1", type: "asset",
      name: "Hoverbike",
      system: { category: "Support Vehicle", track: { enabled: true, name: "Integrity", value: integrity, min: 0, max: 5 }, conditions: [] },
      update: vi.fn(async function (patch) {
        if (patch["system.track.value"] != null) this.system.track.value = patch["system.track.value"];
      }),
    };
    const items = [item];
    return {
      id: "a1", name: "Kira", system: { momentum: { value: 2, max: 10, min: -6 } },
      items: { contents: items, get: (id) => items.find(i => i.id === id) ?? null, find: (fn) => items.find(fn) ?? null },
      __item: item,
    };
  }
  beforeEach(() => { ship.integrity = 5; ship.refuse = false; });

  it("decrements a support vehicle's Integrity track", async () => {
    const a = actor(4);
    const r = await withstandDamage(a, "veh-1", 1);
    expect(r.before).toBe(4);
    expect(r.after).toBe(3);
    expect(a.__item.system.track.value).toBe(3);
    expect(r.isCommandVehicle).toBe(false);
  });

  it("with no item id (the any-picker's button, a Pay the Price route), the command vehicle takes it", async () => {
    const a = actor(4);
    const r = await withstandDamage(a, null, 2);
    expect(r).toMatchObject({ before: 5, after: 3, isCommandVehicle: true, vehicleActorId: "ship-1" });
    expect(ship.integrity).toBe(3);
    expect(a.__item.system.track.value).toBe(4);
    expect(chatCalls[0].content).toMatch(/Kobayashi V: 5 → 3/);
  });

  it("rolls vehicle-damage d100 at 0 integrity, and damage past 0 is momentum", async () => {
    const r = await withstandDamage(actor(1), "veh-1", 2, { fixedRoll: 5 });
    expect(r.atZero).toBe(true);
    expect(r.vehicleDamage).toEqual({ roll: 5, result: expect.stringMatching(/catastrophic/i) });
    expect(r.momentumLoss).toMatchObject({ amount: 1, taken: 1 });
    expect(chatCalls[0].content).toMatch(/Vehicle Damage \(d100 5\)/);
    // A support vehicle's catastrophic result is no command vehicle's destruction.
    expect(chatCalls[0].content).not.toMatch(/Command vehicle destruction/i);
  });

  it("surfaces Overcome Destruction prompt for command vehicle on catastrophic result", async () => {
    ship.integrity = 1;
    const r = await withstandDamage(actor(5), null, 1, { fixedRoll: 5 });
    expect(r.atZero).toBe(true);
    expect(chatCalls[0].content).toMatch(/Command vehicle destruction/i);
    expect(chatCalls[0].content).toMatch(/Overcome Destruction/i);
  });

  it("a bogus vehicle id posts not-found; a refused write throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await withstandDamage(actor(4), "nope", 1)).toMatchObject({ skipped: true, ok: false, reason: "no-vehicle" });
    expect(chatCalls[0].content).toMatch(/not found/i);
    ship.refuse = true;
    await expect(withstandDamage(actor(4), null, 1)).rejects.toThrow(/refused/);
    warn.mockRestore();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Dispatch
// ─────────────────────────────────────────────────────────────────────────────

describe("executeSuffer dispatch", () => {
  it("dispatches each known suffer id to the right executor", async () => {
    const a = { id: "a1", system: { momentum: { value: 3, max: 10, min: -6 } } };
    const r = await executeSuffer("lose_momentum", a, { amount: 1, skipCard: true });
    expect(r.before).toBe(3);
    expect(r.after).toBe(2);
  });

  it("returns an unknown-suffer-id error for a bogus id", async () => {
    const r = await executeSuffer("not_a_real_suffer", {}, { amount: 1 });
    expect(r.skipped).toBe(true);
    expect(r.error).toBe("unknown-suffer-id");
  });

  it("forwards itemId to companion/vehicle executors", async () => {
    const item = {
      id: "comp-1", type: "asset",
      name: "Drone",
      system: { category: "Companion", track: { enabled: true, value: 2, min: 0, max: 5 } },
      update: vi.fn(async function (patch) { this.system.track.value = patch["system.track.value"]; }),
    };
    const a = { id: "a1", items: { contents: [item], get: id => id === "comp-1" ? item : null, find: fn => fn(item) ? item : null } };
    const r = await executeSuffer("companion_takes_a_hit", a, { itemId: "comp-1", amount: 1, skipCard: true });
    expect(r.before).toBe(2);
    expect(r.after).toBe(1);
  });

  it("the SUFFER_EXECUTORS table contains exactly the six rulebook suffer moves", () => {
    expect(Object.keys(SUFFER_EXECUTORS).sort()).toEqual([
      "companion_takes_a_hit",
      "endure_harm",
      "endure_stress",
      "lose_momentum",
      "sacrifice_resources",
      "withstand_damage",
    ]);
  });
});

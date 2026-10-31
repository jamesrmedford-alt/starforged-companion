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
vi.mock("../../src/character/actorBridge.js", () => ({
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

  it("marks wounded when health hits 0 from a hit (no mortal-wound roll)", async () => {
    const a = actor(2);
    const r = await endureHarm(a, 2);
    expect(r.atZero).toBe(true);
    expect(r.woundedMarked).toBe(true);
    expect(r.mortalWound).toBeNull();
    expect(bridgeCalls.setDebility).toContainEqual({ actor: a, key: "wounded", value: true });
  });

  it("does not re-mark wounded if already wounded", async () => {
    const a = actor(2, true);
    const r = await endureHarm(a, 2);
    expect(r.atZero).toBe(true);
    expect(r.woundedMarked).toBe(false);
    expect(bridgeCalls.setDebility).toHaveLength(0);
  });

  it("rolls mortal-wound d100 on miss at 0 health", async () => {
    const a = actor(1);
    // Fixed roll 1 → "You suffer mortal harm. Face Death." (1-10 band)
    const r = await endureHarm(a, 1, { isMiss: true, fixedRoll: 1 });
    expect(r.atZero).toBe(true);
    expect(r.mortalWound).toEqual({ roll: 1, result: expect.stringMatching(/mortal harm/i) });
    expect(chatCalls[0].content).toMatch(/Mortal Wound \(d100 1\)/);
  });

  it("does not roll mortal-wound if not a miss", async () => {
    const a = actor(1);
    const r = await endureHarm(a, 1, { fixedRoll: 1 });
    expect(r.atZero).toBe(true);
    expect(r.mortalWound).toBeNull();
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
      expect(chatCalls).toHaveLength(1);   // one card: the overflow has no card of its own
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

    it("at the momentum minimum, what cannot be taken is said on the card, not lost in silence", async () => {
      const a = withMomentum(1, -5);
      const r = await endureHarm(a, 3);
      expect(a.system.momentum.value).toBe(-6);
      expect(r.momentumLoss).toMatchObject({ amount: 2, taken: 1, remaining: 1, before: -5, after: -6, atMin: true });
      expect(chatCalls[0].content).toContain(
        "Health: 1 → 0 — 2 more as momentum: -5 → -6 (at minimum; 1 not taken — redirect it to another suffer move or clear progress)");
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

  it("marks shaken on at-0", async () => {
    const r = await endureStress(actor(1), 1);
    expect(r.shakenMarked).toBe(true);
    expect(bridgeCalls.setDebility[0]).toMatchObject({ key: "shaken", value: true });
  });

  it("rolls desolation d100 on miss at 0 spirit", async () => {
    const r = await endureStress(actor(1), 1, { isMiss: true, fixedRoll: 5 });
    expect(r.desolation).toEqual({ roll: 5, result: expect.stringMatching(/overwhelmed/i) });
  });

  // Issue #314 Q02 — symmetric to Endure Harm.
  it("stress past 0 spirit is momentum: a loss of 3 at spirit 1, momentum 5 → 3", async () => {
    const a = actor(1);
    a.system.momentum = { value: 5, max: 10, min: -6 };
    const r = await endureStress(a, 3);
    expect(bridgeCalls.applyMeterChanges.map(c => c.changes)).toEqual([{ spirit: -1 }, { momentum: -2 }]);
    expect(r).toMatchObject({ before: 1, after: 0, atZero: true, shakenMarked: true,
      momentumLoss: { amount: 2, taken: 2, remaining: 0, before: 5, after: 3 } });
    expect(chatCalls[0].content).toContain("Spirit: 1 → 0 — 2 more as momentum: 5 → 3 — marked <strong>shaken</strong>");
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

  it("does not re-mark if already unprepared", async () => {
    const r = await sacrificeResources(actor(1, true), 1);
    expect(r.atZero).toBe(true);
    expect(r.unpreparedMarked).toBe(false);
    expect(chatCalls[0].content).toMatch(/redirect/i);
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

    it("the roller already unprepared: the allies are still marked", async () => {
      const a = pc("pc-a", "Kira", { unprepared: true }), b = pc("pc-b", "Ren");
      roster.actors = [a, b];
      await sacrificeResources(a, 1);
      expect(marked()).toEqual(["pc-b:unprepared"]);
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
  function actor(condition = 3) {
    const item = {
      id: "comp-1",
      name: "Loyal Hound",
      system: { condition: { value: condition, max: 3 } },
      update: vi.fn(async function (patch) {
        if (patch["system.condition.value"] != null) {
          this.system.condition.value = patch["system.condition.value"];
        }
      }),
    };
    return {
      id: "a1",
      items: {
        get: (id) => (id === item.id ? item : null),
        find: (fn) => (fn(item) ? item : null),
      },
      __item: item,
    };
  }

  it("decrements the companion's condition meter", async () => {
    const a = actor(3);
    const r = await companionTakesAHit(a, "comp-1", 1);
    expect(r.before).toBe(3);
    expect(r.after).toBe(2);
    expect(a.__item.system.condition.value).toBe(2);
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

  it("surfaces a not-found warning when the companion id is bogus", async () => {
    const a = actor(3);
    const r = await companionTakesAHit(a, "doesnt-exist", 1);
    expect(r.skipped).toBe(true);
    expect(chatCalls[0].content).toMatch(/not found/i);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Withstand Damage
// ─────────────────────────────────────────────────────────────────────────────

describe("withstandDamage", () => {
  function actor(integrity = 5) {
    const item = {
      id: "veh-1",
      name: "Kobayashi V",
      system: { condition: { value: integrity, max: 5 } },
      update: vi.fn(async function (patch) {
        if (patch["system.condition.value"] != null) {
          this.system.condition.value = patch["system.condition.value"];
        }
      }),
    };
    return {
      id: "a1",
      items: {
        get: (id) => (id === item.id ? item : null),
        find: (fn) => (fn(item) ? item : null),
      },
      __item: item,
    };
  }

  it("decrements vehicle integrity", async () => {
    const r = await withstandDamage(actor(4), "veh-1", 1);
    expect(r.before).toBe(4);
    expect(r.after).toBe(3);
  });

  it("rolls vehicle-damage d100 at 0 integrity", async () => {
    const r = await withstandDamage(actor(1), "veh-1", 1, { fixedRoll: 5 });
    expect(r.atZero).toBe(true);
    expect(r.vehicleDamage).toEqual({ roll: 5, result: expect.stringMatching(/catastrophic/i) });
    expect(chatCalls[0].content).toMatch(/Vehicle Damage \(d100 5\)/);
  });

  it("surfaces Overcome Destruction prompt for command vehicle on catastrophic result", async () => {
    const r = await withstandDamage(actor(1), "veh-1", 1, { fixedRoll: 5, isCommandVehicle: true });
    expect(r.atZero).toBe(true);
    expect(chatCalls[0].content).toMatch(/Command vehicle destruction/i);
    expect(chatCalls[0].content).toMatch(/Overcome Destruction/i);
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
      id: "comp-1",
      name: "Drone",
      system: { condition: { value: 2 } },
      update: vi.fn(async () => {}),
    };
    const a = { id: "a1", items: { get: id => id === "comp-1" ? item : null, find: fn => fn(item) ? item : null } };
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

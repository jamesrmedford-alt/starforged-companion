/**
 * Consequence riders — auto-applying asset resource effects from a move's
 * outcome (momentum/health/spirit/supply/integrity/progress). Covers the pure
 * decision logic (condition matching, validation, partition, summing), the
 * LLM extraction contract (with an injected transport), the meter application,
 * and the dialog's prompt grouping.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  conditionFires,
  normaliseRider,
  collectFiringRiders,
  partitionRiders,
  sumMeterDeltas,
  applyMeterRiders,
  extractRiders,
} from "../../src/moves/consequenceRiders.js";
import { groupPromptedRiders } from "../../src/moves/riderDialog.js";

describe("conditionFires", () => {
  it("maps each condition to the right outcomes", () => {
    expect(conditionFires("any", "miss", false)).toBe(true);
    expect(conditionFires("hit", "strong_hit", false)).toBe(true);
    expect(conditionFires("hit", "weak_hit", false)).toBe(true);
    expect(conditionFires("hit", "miss", false)).toBe(false);
    expect(conditionFires("strong_hit", "strong_hit", false)).toBe(true);
    expect(conditionFires("strong_hit", "weak_hit", false)).toBe(false);
    expect(conditionFires("weak_hit", "weak_hit", false)).toBe(true);
    expect(conditionFires("miss", "miss", false)).toBe(true);
    expect(conditionFires("match", "weak_hit", true)).toBe(true);
    expect(conditionFires("match", "weak_hit", false)).toBe(false);
    expect(conditionFires("strong_hit_match", "strong_hit", true)).toBe(true);
    expect(conditionFires("strong_hit_match", "strong_hit", false)).toBe(false);
    expect(conditionFires("bogus", "strong_hit", true)).toBe(false);
  });
});

describe("normaliseRider", () => {
  it("accepts a well-formed meter rider", () => {
    const r = normaliseRider({ resource: "momentum", condition: "strong_hit", amount: 1 }, "Veteran");
    expect(r).toMatchObject({ resource: "momentum", condition: "strong_hit", amount: 1, assetName: "Veteran" });
  });
  it("rejects unknown resources, zero/non-integer/oversized amounts, bad conditions", () => {
    expect(normaliseRider({ resource: "ammo", condition: "hit", amount: 1 })).toBeNull();
    expect(normaliseRider({ resource: "momentum", condition: "hit", amount: 0 })).toBeNull();
    expect(normaliseRider({ resource: "momentum", condition: "hit", amount: 1.5 })).toBeNull();
    expect(normaliseRider({ resource: "momentum", condition: "hit", amount: 99 })).toBeNull();
    expect(normaliseRider({ resource: "momentum", condition: "whenever", amount: 1 })).toBeNull();
  });
  it("carries optional / choiceGroup and synthesises a label", () => {
    const r = normaliseRider({ resource: "health", condition: "any", amount: -1, optional: true, choiceGroup: "g1" });
    expect(r.optional).toBe(true);
    expect(r.choiceGroup).toBe("g1");
    expect(r.label).toContain("health");
  });
});

describe("collectFiringRiders", () => {
  const extracted = [{
    key: "a:0", assetName: "Banshee",
    riders: [
      { resource: "momentum", condition: "hit",              amount: 1 },
      { resource: "momentum", condition: "strong_hit_match", amount: 1 },
      { resource: "supply",   condition: "miss",             amount: -1 },
    ],
  }];

  it("returns only riders whose condition fires for the outcome", () => {
    const onWeak = collectFiringRiders(extracted, "weak_hit", false);
    expect(onWeak).toHaveLength(1);
    expect(onWeak[0].condition).toBe("hit");

    const onStrongMatch = collectFiringRiders(extracted, "strong_hit", true);
    expect(onStrongMatch.map(r => r.condition).sort()).toEqual(["hit", "strong_hit_match"]);

    const onMiss = collectFiringRiders(extracted, "miss", false);
    expect(onMiss).toHaveLength(1);
    expect(onMiss[0].resource).toBe("supply");
  });

  it("carries the source key and drops malformed riders", () => {
    const ex = [{ key: "k", assetName: "X", riders: [{ resource: "bogus", condition: "any", amount: 1 }] }];
    expect(collectFiringRiders(ex, "strong_hit", false)).toEqual([]);
  });
});

describe("partitionRiders", () => {
  it("routes optional / choice / progress to prompted, the rest to automatic", () => {
    const firing = [
      { resource: "momentum", amount: 1, optional: false, choiceGroup: null },
      { resource: "momentum", amount: 1, optional: true,  choiceGroup: null },
      { resource: "health",   amount: 1, optional: false, choiceGroup: "g1" },
      { resource: "progress", amount: 1, optional: false, choiceGroup: null },
    ];
    const { automatic, prompted } = partitionRiders(firing);
    expect(automatic).toHaveLength(1);
    expect(prompted).toHaveLength(3);
  });
});

describe("sumMeterDeltas", () => {
  it("sums character meters and integrity separately, ignoring progress", () => {
    const { character, integrity } = sumMeterDeltas([
      { resource: "momentum", amount: 1 },
      { resource: "momentum", amount: 1 },
      { resource: "supply",   amount: -1 },
      { resource: "integrity", amount: 1 },
      { resource: "progress", amount: 1 },
    ]);
    expect(character).toEqual({ momentum: 2, health: 0, spirit: 0, supply: -1 });
    expect(integrity).toBe(1);
  });
});

describe("applyMeterRiders", () => {
  it("applies summed character-meter deltas to the actor", async () => {
    const actor = global.makeTestActor({ type: "character", name: "PC" });
    const before = actor.system.momentum.value;
    const applied = await applyMeterRiders(
      [{ resource: "momentum", amount: 1, label: "+1 momentum", assetName: "Veteran" }],
      { characterActor: actor },
    );
    expect(actor.system.momentum.value).toBe(before + 1);
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ label: "+1 momentum", assetName: "Veteran" });
  });

  it("returns nothing when there are no meter riders", async () => {
    const actor = global.makeTestActor({ type: "character", name: "PC" });
    expect(await applyMeterRiders([{ resource: "progress", amount: 1 }], { characterActor: actor })).toEqual([]);
  });
});

describe("extractRiders", () => {
  const abilities = [{ key: "a:0", assetName: "Banshee", abilityName: "", text: "take +1 momentum on a hit" }];

  it("returns [] with no API key (caller falls back to surfacing)", async () => {
    expect(await extractRiders({ abilities, moveName: "Face Danger", apiKey: "" })).toEqual([]);
  });

  it("parses a well-formed extractor response and keys it back to the ability", async () => {
    const _call = async () => JSON.stringify({
      abilities: [{ key: "a:0", riders: [{ resource: "momentum", condition: "hit", amount: 1, label: "+1 momentum" }] }],
    });
    const out = await extractRiders({ abilities, moveName: "Face Danger", apiKey: "k", _call });
    expect(out).toHaveLength(1);
    expect(out[0].assetName).toBe("Banshee");
    expect(out[0].riders[0]).toMatchObject({ resource: "momentum", condition: "hit", amount: 1 });
  });

  it("drops malformed riders and ignores unknown keys", async () => {
    const _call = async () => JSON.stringify({
      abilities: [
        { key: "a:0", riders: [{ resource: "ammo", condition: "hit", amount: 1 }] },
        { key: "ghost", riders: [{ resource: "momentum", condition: "hit", amount: 1 }] },
      ],
    });
    expect(await extractRiders({ abilities, moveName: "X", apiKey: "k", _call })).toEqual([]);
  });

  it("returns [] on a transport throw or unparseable response (never guesses)", async () => {
    expect(await extractRiders({ abilities, moveName: "X", apiKey: "k", _call: async () => { throw new Error("boom"); } })).toEqual([]);
    expect(await extractRiders({ abilities, moveName: "X", apiKey: "k", _call: async () => "not json" })).toEqual([]);
  });
});

describe("groupPromptedRiders (riderDialog)", () => {
  it("buckets optional, choice-group, and progress riders", () => {
    const { optionals, choices, progress } = groupPromptedRiders([
      { resource: "momentum", amount: 1, optional: true,  choiceGroup: null },
      { resource: "health",   amount: 1, optional: false, choiceGroup: "g1" },
      { resource: "momentum", amount: 1, optional: false, choiceGroup: "g1" },
      { resource: "progress", amount: 1, optional: false, choiceGroup: null },
    ]);
    expect(optionals).toHaveLength(1);
    expect(choices).toHaveLength(1);
    expect(choices[0].options).toHaveLength(2);
    expect(progress).toHaveLength(1);
  });
});

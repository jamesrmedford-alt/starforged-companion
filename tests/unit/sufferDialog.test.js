/**
 * STARFORGED COMPANION
 * tests/unit/sufferDialog.test.js
 *
 * Unit tests for the SufferChoiceDialog's pure logic (F16 Phase D).
 *
 * The dialog has three pieces:
 *   - resolveSufferSelection(sufferPrompt, selection) — pure mapping
 *     from sufferPrompt + selection to a list of executor calls
 *   - isOptionAvailable(option, ctx) — predicate gating for "requires"
 *   - runSufferResolution(calls, actor, opts) — async runner that
 *     dispatches the calls; uses postSufferCard and the executors
 *
 * The ApplicationV2 subclass itself is exercised by Quench in Phase D's
 * live-Foundry verification; here we test the resolver + runner against
 * mocked executor dispatch.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the executor module so the runner doesn't actually write meters.
const executeCalls = [];
vi.mock("../../src/moves/sufferExecutor.js", () => ({
  executeSuffer: vi.fn(async (sufferId, _actor, args) => {
    executeCalls.push({ sufferId, args });
    return { sufferId, before: 5, after: 5 - (args.amount ?? 1), ...args };
  }),
}));

// Mock actorBridge so meter / debility writes register without a live Foundry.
const bridgeCalls = { applyMeterChanges: [], setDebility: [] };
vi.mock("../../src/character/actorBridge.js", () => ({
  applyMeterChanges: vi.fn(async (actor, changes) => {
    bridgeCalls.applyMeterChanges.push({ actor, changes });
  }),
  setDebility: vi.fn(async (actor, key, value) => {
    bridgeCalls.setDebility.push({ actor, key, value });
  }),
}));

// Mock the track store + position applier so the combat-position / progress
// executors run without a live Foundry journal.
const trackState = { tracks: [], marked: [], created: [] };
vi.mock("../../src/ui/progressTracks.js", () => ({
  listProgressTracks: vi.fn(async () => trackState.tracks),
  markProgressById:   vi.fn(async (id) => { trackState.marked.push(id); return null; }),
  addProgressTrack:   vi.fn(async (data) => {
    const t = { id: `new-${trackState.created.length + 1}`, ticks: 0, completed: false, ...data };
    trackState.created.push(t);
    return t;
  }),
}));
const positionCalls = [];
vi.mock("../../src/moves/combatTracker.js", () => ({
  applyCombatPositionToTrack: vi.fn(async (trackId, position, actor) => {
    positionCalls.push({ trackId, position, actor });
  }),
}));

const chatCalls = [];
beforeEach(() => {
  executeCalls.length = 0;
  bridgeCalls.applyMeterChanges.length = 0;
  bridgeCalls.setDebility.length = 0;
  chatCalls.length = 0;
  trackState.tracks = [];
  trackState.marked = [];
  trackState.created = [];
  positionCalls.length = 0;
  globalThis.ChatMessage = { create: vi.fn(async (d) => { chatCalls.push(d); return d; }) };
});

import {
  resolveSufferSelection,
  runSufferResolution,
  isOptionAvailable,
} from "../../src/moves/sufferDialog.js";


// ─────────────────────────────────────────────────────────────────────────────
// resolveSufferSelection — pure logic
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveSufferSelection — B1 'any' prompts", () => {
  it("returns one suffer call per `count` for a single-amount prompt", () => {
    const prompt = { kind: "any", amount: 1, count: 1 };
    const r = resolveSufferSelection(prompt, { anyChoice: "endure_harm" });
    expect(r).toEqual([
      { kind: "suffer", sufferId: "endure_harm", amount: 1, itemId: null },
    ]);
  });

  it("repeats N times when count > 1 (e.g. set_a_course 'two suffer moves -1')", () => {
    const prompt = { kind: "any", amount: 1, count: 2 };
    const r = resolveSufferSelection(prompt, { anyChoice: "lose_momentum" });
    expect(r).toHaveLength(2);
    expect(r.every(c => c.sufferId === "lose_momentum" && c.amount === 1)).toBe(true);
  });

  it("returns empty when no anyChoice is supplied", () => {
    expect(resolveSufferSelection({ kind: "any", amount: 1, count: 1 }, {})).toEqual([]);
  });
});


describe("resolveSufferSelection — B2 enumerated prompts", () => {
  it("maps suffer-routed options to suffer calls", () => {
    const prompt = { kind: "enumerated", options: [
      { label: "Sacrifice Resources (-1)", suffer: "sacrifice_resources", amount: 1 },
      { label: "Lose Momentum (-2)",       suffer: "lose_momentum",       amount: 2 },
    ]};
    const r = resolveSufferSelection(prompt, { optionIndices: [1] });
    expect(r).toEqual([
      { kind: "suffer", sufferId: "lose_momentum", amount: 2, itemId: null },
    ]);
  });

  it("maps meter-delta options to meter calls", () => {
    const prompt = { kind: "enumerated", options: [
      { label: "+1 health",   health:   1 },
      { label: "+1 momentum", momentum: 1 },
    ]};
    const r = resolveSufferSelection(prompt, { optionIndices: [0] });
    expect(r).toEqual([{ kind: "meter", meterKey: "health", delta: 1 }]);
  });

  it("expands chained options into multiple calls", () => {
    const prompt = { kind: "enumerated", options: [
      {
        label: "Lose Momentum (-1) for +1 health",
        chain: [{ suffer: "lose_momentum", amount: 1 }, { health: 1 }],
      },
    ]};
    const r = resolveSufferSelection(prompt, { optionIndices: [0] });
    expect(r).toEqual([
      { kind: "suffer", sufferId: "lose_momentum", amount: 1, itemId: null },
      { kind: "meter",  meterKey: "health", delta: 1 },
    ]);
  });

  it("maps complication options to complication calls with scope", () => {
    const prompt = { kind: "enumerated", options: [
      { label: "Complication at destination", complication: true, scope: "destination" },
    ]};
    const r = resolveSufferSelection(prompt, { optionIndices: [0] });
    expect(r).toEqual([{ kind: "complication", scope: "destination" }]);
  });

  it("maps route options to route calls (Pay the Price, Swear an Iron Vow)", () => {
    const prompt = { kind: "enumerated", options: [
      { label: "Pay the Price",          route: "pay_the_price" },
      { label: "Swear an Iron Vow (formidable+)", route: "swear_an_iron_vow", rank: "formidable" },
    ]};
    const a = resolveSufferSelection(prompt, { optionIndices: [0] });
    expect(a).toEqual([{ kind: "route", route: "pay_the_price" }]);
    const b = resolveSufferSelection(prompt, { optionIndices: [1] });
    expect(b).toEqual([{ kind: "route", route: "swear_an_iron_vow", rank: "formidable" }]);
  });

  it("combatProgress option emits combat-progress call", () => {
    const prompt = { kind: "enumerated", options: [{ label: "Mark progress", combatProgress: 1 }] };
    expect(resolveSufferSelection(prompt, { optionIndices: [0] })).toEqual([{ kind: "combat-progress", count: 1 }]);
  });

  it("expeditionProgress option emits expedition-progress call", () => {
    const prompt = { kind: "enumerated", options: [{ label: "Mark expedition progress", expeditionProgress: 1 }] };
    expect(resolveSufferSelection(prompt, { optionIndices: [0] })).toEqual([{ kind: "expedition-progress", count: 1 }]);
  });

  // Regression: enter_the_fray's weak hit ("+2 momentum OR you are in control")
  // — the position option's string value used to fall through the numeric
  // meter loop, producing zero calls ("Applied: no change").
  it("combatPosition option emits combat-position call (enter_the_fray weak hit)", () => {
    const prompt = { kind: "enumerated", options: [
      { label: "+2 momentum",        momentum: 2 },
      { label: "You are in control", combatPosition: "in_control" },
    ]};
    expect(resolveSufferSelection(prompt, { optionIndices: [1] }))
      .toEqual([{ kind: "combat-position", position: "in_control" }]);
    // The sibling momentum option still maps to a meter write.
    expect(resolveSufferSelection(prompt, { optionIndices: [0] }))
      .toEqual([{ kind: "meter", meterKey: "momentum", delta: 2 }]);
  });

  it("nextBonus option emits next-bonus call", () => {
    const prompt = { kind: "enumerated", options: [{ label: "+1 on next move", nextBonus: 1 }] };
    expect(resolveSufferSelection(prompt, { optionIndices: [0] })).toEqual([{ kind: "next-bonus", amount: 1 }]);
  });

  it("clearImpact option emits clear-impact call", () => {
    const prompt = { kind: "enumerated", options: [{ label: "Clear wounded", clearImpact: "wounded" }] };
    expect(resolveSufferSelection(prompt, { optionIndices: [0] })).toEqual([{ kind: "clear-impact", debility: "wounded" }]);
  });

  it("chain with clearImpact + meter emits both calls in order (heal pattern)", () => {
    const prompt = { kind: "enumerated", options: [{
      label: "Clear wounded + +2 health",
      chain: [{ clearImpact: "wounded" }, { health: 2 }],
    }]};
    const r = resolveSufferSelection(prompt, { optionIndices: [0] });
    expect(r[0]).toEqual({ kind: "clear-impact", debility: "wounded" });
    expect(r[1]).toEqual({ kind: "meter", meterKey: "health", delta: 2 });
  });

  it("multi: handles multiple selected indices — combat-progress + momentum", () => {
    const prompt = { kind: "enumerated", multi: 2, options: [
      { label: "Mark progress",   combatProgress: 1 },
      { label: "+2 momentum",     momentum:       2 },
      { label: "+1 next move",    nextBonus:      1 },
    ]};
    const r = resolveSufferSelection(prompt, { optionIndices: [0, 1] });
    expect(r).toContainEqual({ kind: "combat-progress", count: 1 });
    expect(r).toContainEqual({ kind: "meter", meterKey: "momentum",  delta: 2 });
  });

  it("noop option produces a noop call (e.g. 'Press on')", () => {
    const prompt = { kind: "enumerated", options: [
      { label: "Trade momentum", chain: [{ suffer: "lose_momentum", amount: 1 }, { health: 1 }] },
      { label: "Press on",       noop:  true },
    ]};
    expect(resolveSufferSelection(prompt, { optionIndices: [1] })).toEqual([{ kind: "noop" }]);
  });

  it("nested 'any' sub-prompt (set_a_course weak hit's 'One suffer move (-2)') without anyChoice surfaces needs-any", () => {
    const prompt = { kind: "enumerated", options: [
      { label: "One suffer move (-2)",       kind: "any", amount: 2, count: 1 },
      { label: "Two suffer moves (-1 each)", kind: "any", amount: 1, count: 2 },
      { label: "Complication at destination", complication: true, scope: "destination" },
    ]};
    const r = resolveSufferSelection(prompt, { optionIndices: [0] });
    expect(r).toEqual([{ kind: "needs-any", amount: 2, count: 1 }]);
  });

  it("nested 'any' sub-prompt resolves to N suffer calls when anyChoice is supplied", () => {
    const prompt = { kind: "enumerated", options: [
      { label: "Two suffer moves (-1 each)", kind: "any", amount: 1, count: 2 },
    ]};
    const r = resolveSufferSelection(prompt, { optionIndices: [0], anyChoice: "endure_harm" });
    expect(r).toHaveLength(2);
    expect(r.every(c => c.sufferId === "endure_harm" && c.amount === 1)).toBe(true);
  });

  it("returns empty for unknown / null prompt", () => {
    expect(resolveSufferSelection(null, {})).toEqual([]);
    expect(resolveSufferSelection({ kind: "weird" }, {})).toEqual([]);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// isOptionAvailable
// ─────────────────────────────────────────────────────────────────────────────

describe("isOptionAvailable", () => {
  function actor(debility = {}) { return { system: { debility } }; }

  it("returns true with no requires clause", () => {
    expect(isOptionAvailable({ label: "Free" }, { actor: actor() })).toBe(true);
  });

  it("respects '!wounded' / '!shaken' / '!battered'", () => {
    const a1 = actor({ wounded: false });
    const a2 = actor({ wounded: true });
    expect(isOptionAvailable({ requires: "!wounded" }, { actor: a1 })).toBe(true);
    expect(isOptionAvailable({ requires: "!wounded" }, { actor: a2 })).toBe(false);
  });

  it("respects 'companionHealth>0' via ctx", () => {
    const a = actor();
    expect(isOptionAvailable({ requires: "companionHealth>0" }, { actor: a, companionHealth: 0 })).toBe(false);
    expect(isOptionAvailable({ requires: "companionHealth>0" }, { actor: a, companionHealth: 1 })).toBe(true);
  });

  it("fail-opens on unknown requires (returns true rather than dropping the option)", () => {
    expect(isOptionAvailable({ requires: "barbarian-language" }, { actor: actor() })).toBe(true);
  });

  it("respects positive 'wounded' / 'shaken' / 'unprepared' requires", () => {
    const clean   = actor({});
    const wounded = actor({ wounded: true });
    const shaken  = actor({ shaken: true });
    const unprepared = actor({ unprepared: true });
    expect(isOptionAvailable({ requires: "wounded" },    { actor: clean })).toBe(false);
    expect(isOptionAvailable({ requires: "wounded" },    { actor: wounded })).toBe(true);
    expect(isOptionAvailable({ requires: "shaken" },     { actor: shaken })).toBe(true);
    expect(isOptionAvailable({ requires: "unprepared" }, { actor: unprepared })).toBe(true);
    expect(isOptionAvailable({ requires: "!unprepared" }, { actor: unprepared })).toBe(false);
    expect(isOptionAvailable({ requires: "!unprepared" }, { actor: clean })).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// runSufferResolution
// ─────────────────────────────────────────────────────────────────────────────

describe("runSufferResolution — dispatches calls into executors / bridge", () => {
  const actor = { id: "a1", system: {} };

  it("dispatches suffer calls into executeSuffer", async () => {
    await runSufferResolution(
      [{ kind: "suffer", sufferId: "lose_momentum", amount: 1, itemId: null }],
      actor,
    );
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0]).toMatchObject({ sufferId: "lose_momentum", args: expect.objectContaining({ amount: 1 }) });
  });

  it("dispatches meter calls into applyMeterChanges", async () => {
    await runSufferResolution(
      [{ kind: "meter", meterKey: "health", delta: -1 }],
      actor,
    );
    expect(bridgeCalls.applyMeterChanges).toHaveLength(1);
    expect(bridgeCalls.applyMeterChanges[0].changes).toEqual({ health: -1 });
  });

  it("dispatches mark calls into setDebility", async () => {
    await runSufferResolution(
      [{ kind: "mark", debility: "doomed" }],
      actor,
    );
    expect(bridgeCalls.setDebility).toContainEqual({ actor, key: "doomed", value: true });
  });

  it("complication calls post a deferred chat card with the scope flag", async () => {
    await runSufferResolution(
      [{ kind: "complication", scope: "destination" }],
      actor,
    );
    expect(chatCalls).toHaveLength(1);
    expect(chatCalls[0].content).toMatch(/Pending complication \(destination\)/);
    expect(chatCalls[0].flags["starforged-companion"]).toMatchObject({ complication: true, scope: "destination" });
  });

  it("route calls post a deferred chat card pointing at the follow-up move", async () => {
    await runSufferResolution(
      [{ kind: "route", route: "pay_the_price" }],
      actor,
    );
    expect(chatCalls[0].content).toMatch(/Trigger: pay_the_price/);
  });

  it("noop calls produce a noop result without writes", async () => {
    const r = await runSufferResolution([{ kind: "noop" }], actor);
    expect(r).toEqual([{ kind: "noop" }]);
    expect(bridgeCalls.applyMeterChanges).toHaveLength(0);
    expect(executeCalls).toHaveLength(0);
  });

  it("forwards executor opts (isMiss → mortal-wound check)", async () => {
    await runSufferResolution(
      [{ kind: "suffer", sufferId: "endure_harm", amount: 2, itemId: null }],
      actor,
      { isMiss: true, fixedRoll: 50 },
    );
    expect(executeCalls[0].args).toMatchObject({ amount: 2, isMiss: true, fixedRoll: 50 });
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// promptSufferChoice — test-env fallback
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// runSufferResolution — combat-position executor (enter_the_fray weak hit)
// ─────────────────────────────────────────────────────────────────────────────

describe("runSufferResolution — combat-position", () => {
  it("applies the position to the sole open combat track", async () => {
    trackState.tracks = [{ id: "ct1", type: "combat", completed: false }];
    const actor = { id: "pc1" };
    const r = await runSufferResolution([{ kind: "combat-position", position: "in_control" }], actor);
    expect(positionCalls).toEqual([{ trackId: "ct1", position: "in_control", actor }]);
    expect(r).toEqual([{ kind: "combat-position", position: "in_control", trackId: "ct1" }]);
  });

  it("stashes the position on the pending threshold card when no track exists yet", async () => {
    trackState.tracks = [];
    const updates = [];
    const thresholdMsg = {
      flags:  { "starforged-companion": { combatThresholdCard: true } },
      update: async (c) => updates.push(c),
    };
    const priorMessages = globalThis.game.messages;
    globalThis.game.messages = { contents: [thresholdMsg] };
    try {
      const r = await runSufferResolution([{ kind: "combat-position", position: "in_control" }], { id: "pc1" });
      expect(updates).toEqual([{ "flags.starforged-companion.position": "in_control" }]);
      expect(r[0]).toMatchObject({ kind: "combat-position", stashed: true });
      expect(positionCalls).toEqual([]);
    } finally {
      globalThis.game.messages = priorMessages;
    }
  });

  it("warns and skips when no track and no threshold card exist", async () => {
    trackState.tracks = [];
    const priorMessages = globalThis.game.messages;
    globalThis.game.messages = { contents: [] };
    try {
      const r = await runSufferResolution([{ kind: "combat-position", position: "bad_spot" }], { id: "pc1" });
      expect(r[0]).toMatchObject({ kind: "combat-position", skipped: true });
      expect(getCapturedWarns().some(w => w.includes("combat-position"))).toBe(true);
    } finally {
      globalThis.game.messages = priorMessages;
    }
  });

  it("warns and skips when multiple fights are open (ambiguous)", async () => {
    trackState.tracks = [
      { id: "a", type: "combat", completed: false },
      { id: "b", type: "combat", completed: false },
    ];
    const r = await runSufferResolution([{ kind: "combat-position", position: "bad_spot" }], { id: "pc1" });
    expect(r[0]).toMatchObject({ kind: "combat-position", skipped: true });
    expect(positionCalls).toEqual([]);
    expect(getCapturedWarns().some(w => w.includes("combat-position"))).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// runSufferResolution — expedition-progress executor (Explore a Waypoint pick)
// WAYPOINT-PROGRESS-NOOP regression: picking "mark expedition progress" with no
// open expedition used to skip silently. It now resolve-or-creates.
// ─────────────────────────────────────────────────────────────────────────────

describe("runSufferResolution — expedition-progress", () => {
  it("marks the sole open expedition", async () => {
    trackState.tracks = [{ id: "e1", type: "expedition", completed: false }];
    const r = await runSufferResolution([{ kind: "expedition-progress", count: 1 }], { id: "pc1" });
    expect(trackState.marked).toEqual(["e1"]);
    expect(r[0]).toMatchObject({ kind: "expedition-progress", trackId: "e1" });
  });

  it("creates a default expedition and marks it when none is open", async () => {
    trackState.tracks = [];
    const r = await runSufferResolution([{ kind: "expedition-progress", count: 1 }], { id: "pc1" });
    expect(trackState.created).toHaveLength(1);
    expect(trackState.created[0]).toMatchObject({ label: "Expedition", type: "expedition", rank: "dangerous" });
    expect(trackState.marked).toEqual([trackState.created[0].id]);
    expect(r[0]).toMatchObject({ kind: "expedition-progress", created: true });
  });

  it("warns and skips when several expeditions are open (ambiguous)", async () => {
    trackState.tracks = [
      { id: "e1", type: "expedition", completed: false },
      { id: "e2", type: "expedition", completed: false },
    ];
    const r = await runSufferResolution([{ kind: "expedition-progress", count: 1 }], { id: "pc1" });
    expect(r[0]).toMatchObject({ kind: "expedition-progress", skipped: true });
    expect(trackState.marked).toEqual([]);
    expect(getCapturedWarns().some(w => w.includes("expedition-progress"))).toBe(true);
  });
});

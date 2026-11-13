/**
 * STARFORGED COMPANION
 * tests/unit/sceneChallengeVariantMoves.test.js
 *
 * Issue #338 D2 (SCENE-CHALLENGE-VARIANT-MOVES), option A in issue #326 D6's
 * shape. The rulebook's scene-challenge moves (pp. 239–241; vendored
 * Starforged/Moves/Scene_Challenge) had one module twin — Finish the Scene.
 * Within an open challenge, Face Danger and Secure an Advantage are their own
 * moves: Face Danger's strong hit marks progress (twice on a match), its weak
 * hit marks progress and fills a clock segment; Secure an Advantage takes
 * both (+2 momentum, +1 next move) and, with a match, marks progress; a miss
 * on either fills a segment (two on a match) and pays the price. The module
 * rolled the ordinary moves: no progress on any hit, no segment on a weak
 * hit, one segment on a miss through the Pay the Price clock advance, never
 * two. Now two interpreter-typable move ids, scored against the open
 * challenge (the pipeline's scene-challenge hop), the card saying what it
 * did; Begin the Scene is named as missing in the coverage doc (the Progress
 * Tracks panel's Add sets the challenge up).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [12] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
// Pay the Price 12, "You face a tough choice": no suffer route.
vi.mock("../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== "pay_the_price") return real.rollOracle(...args);
    const rng = vi.spyOn(Math, "random");
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { toMoveId, moveRollKind } from "../../src/schemas.js";
import { mapConsequences } from "../../src/moves/resolver.js";
import { scoreSceneChallenge, moveOutsideSceneChallenge } from "../../src/moves/sceneChallenge.js";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

// ─────────────────────────────────────────────────────────────────────────────
// Every vendored scene-challenge move is a module move, or the coverage doc
// names it as missing (the probe).
// ─────────────────────────────────────────────────────────────────────────────

const MOVES_DIR = fileURLToPath(new URL("../../vendor/foundry-ironsworn/json-packs/starforged-moves", import.meta.url));
const HAVE_VENDOR = fs.existsSync(MOVES_DIR) && fs.readdirSync(MOVES_DIR).length > 0;
const DOC = fs.readFileSync(fileURLToPath(new URL("../../docs/rules-reference/playkit-rules-and-coverage.md", import.meta.url)), "utf8");
const sceneMoves = () => fs.readdirSync(MOVES_DIR).sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(MOVES_DIR, f), "utf8")))
  .filter(d => d.type === "sfmove" && d.system?.Category === "Starforged/Moves/Scene_Challenge")
  .map(d => d.name);

describe.skipIf(!HAVE_VENDOR)("every vendored scene-challenge move is covered (issue #338 D2)", () => {
  it("each is a module move, or the coverage doc names it as missing", () => {
    const uncovered = sceneMoves().filter(name => toMoveId(name) === null && !DOC.includes(name));
    expect(uncovered).toEqual([]);
  });

  it("Face Danger and Secure an Advantage (Scene Challenge) are module moves, rolled like their ordinary twins", () => {
    expect(toMoveId("Face Danger (Scene Challenge)")).toBe("face_danger_scene_challenge");
    expect(toMoveId("Secure an Advantage (Scene Challenge)")).toBe("secure_an_advantage_scene_challenge");
    expect(moveRollKind("face_danger_scene_challenge")).toBe("action");
    expect(moveRollKind("secure_an_advantage_scene_challenge")).toBe("action");
    // Begin the Scene has no move — the doc names it as the missing one.
    expect(toMoveId("Begin the Scene")).toBeNull();
    expect(DOC).toMatch(/\*\*Begin the Scene\*\* is the one scene-challenge move with no module move/);
  });

  it("control: Finish the Scene is a module move (issue #326 D6) and the doc names it", () => {
    expect(sceneMoves()).toContain("Finish the Scene");
    expect(toMoveId("Finish the Scene")).toBe("finish_the_scene");
    expect(DOC.includes("Finish the Scene")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The consequences, per outcome (the vendored text).
// ─────────────────────────────────────────────────────────────────────────────

const scene = (c) => ({ progress: c.sceneProgress, segments: c.sceneSegments, ptp: !!c.routePayThePrice });

describe("the scene-challenge moves' outcomes (issue #338 D2)", () => {
  it("Face Danger (Scene Challenge): progress on a hit, twice on a strong-hit match; a segment on a weak hit; one or two and Pay the Price on a miss", () => {
    expect(scene(mapConsequences("face_danger_scene_challenge", "strong_hit", false))).toEqual({ progress: 1, segments: 0, ptp: false });
    expect(scene(mapConsequences("face_danger_scene_challenge", "strong_hit", true))).toEqual({ progress: 2, segments: 0, ptp: false });
    expect(scene(mapConsequences("face_danger_scene_challenge", "weak_hit", false))).toEqual({ progress: 1, segments: 1, ptp: false });
    expect(scene(mapConsequences("face_danger_scene_challenge", "miss", false))).toEqual({ progress: 0, segments: 1, ptp: true });
    expect(scene(mapConsequences("face_danger_scene_challenge", "miss", true))).toEqual({ progress: 0, segments: 2, ptp: true });
    // No momentum, no suffer move: the scene's progress and clock are its stakes.
    for (const o of ["strong_hit", "weak_hit", "miss"]) {
      const c = mapConsequences("face_danger_scene_challenge", o, false);
      expect([c.momentumChange, c.sufferPrompt]).toEqual([0, null]);
    }
  });

  it("Secure an Advantage (Scene Challenge): take both, and progress on a match; the weak hit's choice; one or two segments and Pay the Price on a miss", () => {
    const strong = mapConsequences("secure_an_advantage_scene_challenge", "strong_hit", false);
    expect([strong.momentumChange, strong.nextMoveBonus, strong.sceneProgress]).toEqual([2, 1, 0]);
    expect(mapConsequences("secure_an_advantage_scene_challenge", "strong_hit", true).sceneProgress).toBe(1);
    const weak = mapConsequences("secure_an_advantage_scene_challenge", "weak_hit", false);
    expect(weak.sufferPrompt.options.map(o => o.label)).toEqual(["+2 momentum", "+1 on your next move"]);
    expect([weak.sceneProgress, weak.sceneSegments]).toEqual([0, 0]);
    expect(scene(mapConsequences("secure_an_advantage_scene_challenge", "miss", false))).toEqual({ progress: 0, segments: 1, ptp: true });
    expect(scene(mapConsequences("secure_an_advantage_scene_challenge", "miss", true))).toEqual({ progress: 0, segments: 2, ptp: true });
  });

  it("control: the ordinary Face Danger marks no challenge", () => {
    const c = mapConsequences("face_danger", "strong_hit", true);
    expect([c.sceneProgress ?? 0, c.sceneSegments ?? 0, c.momentumChange]).toEqual([0, 0, 1]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scoreSceneChallenge — the challenge it scores, and an upgrade's clock.
// ─────────────────────────────────────────────────────────────────────────────

function store({ ticks = 0, filled = 0, tracks = null } = {}) {
  const list = tracks ?? [{ id: "sc-1", label: "The Negotiation", type: "scene_challenge", rank: "dangerous", ticks, completed: false, tensionClockId: "clk-1" }];
  const clock = { _id: "clk-1", segments: 4, filled };
  return {
    clock,
    deps: {
      listTracks:   async () => list.map(t => ({ ...t })),
      getTrack:     async (id) => list.find(t => t.id === id) ?? null,
      markProgress: async (id, times) => { const t = list.find(x => x.id === id); t.ticks = Math.min(40, t.ticks + 8 * times); return { ...t }; },
      adjustClock:  async (_id, delta) => {
        const before = clock.filled;
        clock.filled = Math.max(0, Math.min(clock.segments, before + delta));
        return { _id: "clk-1", before, filled: clock.filled, segments: clock.segments, changed: clock.filled - before };
      },
    },
  };
}

describe("scoreSceneChallenge (issue #338 D2)", () => {
  it("marks the challenge it names and fills its clock", async () => {
    const { clock, deps } = store();
    const r = await scoreSceneChallenge({ moveTarget: "the negotiation" }, { marks: 1, segments: 1 }, deps);
    expect([r.track.id, r.track.ticks, r.marked, clock.filled]).toEqual(["sc-1", 8, 1, 1]);
  });

  it("several open and none named: nothing is marked ('which?'); none open: nothing", async () => {
    const two = store({ tracks: [
      { id: "a", label: "Chase", type: "scene_challenge", ticks: 0, completed: false },
      { id: "b", label: "Heist", type: "scene_challenge", ticks: 0, completed: false },
    ] });
    expect(await scoreSceneChallenge({}, { marks: 1 }, two.deps)).toEqual({ track: null, reason: "ambiguous" });
    expect(await scoreSceneChallenge({}, { marks: 1 }, store({ tracks: [] }).deps)).toEqual({ track: null, reason: "none" });
    expect(await scoreSceneChallenge({ trackId: "gone" }, { marks: 1 }, store().deps)).toEqual({ track: null, reason: "gone" });
  });

  it("an upgrade leaves the clock as its outcome would have from the original's receipt", async () => {
    // A miss filled 1 (from 1): burned to a strong hit, the segment comes back.
    let s = store({ filled: 2 });
    await scoreSceneChallenge({ trackId: "sc-1" }, { segments: 0, receipt: { clockBefore: 1, clockFilled: 1, clockSegments: 4 } }, s.deps);
    expect(s.clock.filled).toBe(1);
    // A miss with a match filled 2 (from 1): improved to a weak hit, one comes back.
    s = store({ filled: 3 });
    await scoreSceneChallenge({ trackId: "sc-1" }, { segments: 1, receipt: { clockBefore: 1, clockFilled: 2, clockSegments: 4 } }, s.deps);
    expect(s.clock.filled).toBe(2);
    // The clock was full: the miss filled nothing, so the strong hit takes nothing back.
    s = store({ filled: 4 });
    await scoreSceneChallenge({ trackId: "sc-1" }, { segments: 0, receipt: { clockBefore: 4, clockFilled: 0, clockSegments: 4 } }, s.deps);
    expect(s.clock.filled).toBe(4);
    // At 3 a matched miss filled the last one; its weak hit would have too — nothing changes.
    s = store({ filled: 4 });
    await scoreSceneChallenge({ trackId: "sc-1" }, { segments: 1, receipt: { clockBefore: 3, clockFilled: 1, clockSegments: 4 } }, s.deps);
    expect(s.clock.filled).toBe(4);
  });

  it("moveOutsideSceneChallenge: a variant with no challenge open is the ordinary move; never the reverse", () => {
    const open = [{ type: "scene_challenge", completed: false }];
    expect(moveOutsideSceneChallenge("face_danger_scene_challenge", [])).toBe("face_danger");
    expect(moveOutsideSceneChallenge("secure_an_advantage_scene_challenge", [{ type: "scene_challenge", completed: true }])).toBe("secure_an_advantage");
    expect(moveOutsideSceneChallenge("face_danger_scene_challenge", open)).toBe("face_danger_scene_challenge");
    expect(moveOutsideSceneChallenge("face_danger", open)).toBe("face_danger");
  });

  it("moveOutsideSceneChallenge: given its own challenge, a variant is the ordinary move once that one ended, whatever else is open (ROUND-VARIANT-TWO-CHALLENGES)", () => {
    const tracks = [
      { id: "escape", type: "scene_challenge", completed: true },
      { id: "storm",  type: "scene_challenge", completed: false },
    ];
    expect(moveOutsideSceneChallenge("face_danger_scene_challenge", tracks, { trackId: "escape" })).toBe("face_danger");
    expect(moveOutsideSceneChallenge("secure_an_advantage_scene_challenge", tracks, { trackId: "gone" })).toBe("secure_an_advantage");
    expect(moveOutsideSceneChallenge("face_danger_scene_challenge", tracks, { trackId: "storm" })).toBe("face_danger_scene_challenge");
    expect(moveOutsideSceneChallenge("face_danger_scene_challenge", tracks)).toBe("face_danger_scene_challenge");   // control: no challenge named — any open one
    expect(moveOutsideSceneChallenge("face_danger", tracks, { trackId: "storm" })).toBe("face_danger");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// End to end on a booted table: a scene challenge open, the moves typed.
// ─────────────────────────────────────────────────────────────────────────────

let table, pc, journal, challenge, reactor;
const STRONG       = [0.0, 0.15, 0.9];    // challenge 1, 2; die 6 + iron 3
const STRONG_MATCH = [0.15, 0.15, 0.9];   // challenge 2, 2; die 6
const WEAK         = [0.25, 0.85, 0.5];   // challenge 3, 9; die 4 → 7
const MISS         = [0.85, 0.95, 0.0];   // challenge 9, 10; die 1 → 4
const MISS_MATCH   = [0.85, 0.85, 0.0];   // challenge 9, 9; die 1 → 4
const BURNABLE     = [0.65, 0.75, 0.0];   // challenge 7, 8; die 1 → 4: a miss; momentum 9 burned → 10, a strong hit

const gm        = () => table.client("gm-1");
const ticks     = () => (journal.getFlag(MODULE_ID, "tracks") ?? []).find(t => t.id === challenge.id)?.ticks;
const clockOf   = (id) => (table.world.campaignState().clocks ?? []).find(c => c._id === id)?.filled;
const sceneCard = () => table.cards(f => f.sceneChallengeCard).at(-1)?.content ?? "";
const lastMove  = () => table.cards(f => f.narratorCard && f.resolutionId).at(-1)?.flags[MODULE_ID];

/** The progress store's journal, its flags in memory (the assetEffects pattern). */
function progressJournal() {
  const flags = {};
  return {
    id: "sc-progress", name: "Starforged Progress Tracks",
    getFlag: (scope, key) => flags[`${scope}.${key}`],
    setFlag: async (scope, key, value) => { flags[`${scope}.${key}`] = structuredClone(value); },
  };
}

async function roll(moveId, dice, { moveTarget = "The Negotiation" } = {}) {
  control.interpretation = { moveId, moveName: moveId, statUsed: "iron", adds: 0, moveTarget, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat("I press our terms across the table.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

describe("the scene-challenge moves through the pipeline (issue #338 D2, on a table)", () => {
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    control.ptp = [12];
    await table.reset({ world: { settings: {
    // The price is paid and the result narrated at once, and an upgrade
    // undoes them — the flow these tests are about. (Asking first is the
    // default since issue #354 P2-10: heldResultBeforePrice.test.js.)
    holdResultForUpgrade: false,
      chronicleAutoEntry: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "sc-s1", sessionNumber: 1,
        currentSceneId: "sc-scene", sceneTruths: [], clocks: [] },
    } } });
    await table.setClaudeKey("gm-1", "sk-ant-test");
    pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } } });
    journal = progressJournal();
    table.journal._set(journal);
    // The GM opens the challenge in the panel (a track and its 4-segment clock),
    // beside another tension clock already running.
    const store  = await gm().import("../../src/ui/progressTracks.js");
    const clocks = await gm().import("../../src/clocks/clocks.js");
    reactor   = await gm().run(() => clocks.createClock({ name: "Reactor breach", segments: 6, type: "tension" }));
    challenge = await gm().run(() => store.addProgressTrack({ label: "The Negotiation", type: "scene_challenge", rank: "dangerous" }));
    await table.settle();
    scriptClaude(table, { fallback: () => 'The envoy weighs your words.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  });

  it("Face Danger's strong hit marks progress — twice with a match — and the card says so", async () => {
    await roll("face_danger_scene_challenge", STRONG);
    expect(lastMove()).toMatchObject({ moveId: "face_danger_scene_challenge", outcome: "strong_hit" });
    expect([ticks(), clockOf(challenge.tensionClockId)]).toEqual([8, 0]);
    expect(sceneCard()).toMatch(/The Negotiation<\/strong> — progress marked once \(2\/10 boxes\)/);
    expect(pc.system.momentum.value).toBe(9);   // no momentum: the challenge's progress is the gain

    await roll("face_danger_scene_challenge", STRONG_MATCH);
    expect(ticks()).toBe(24);
    expect(sceneCard()).toMatch(/progress marked twice \(6\/10 boxes\)/);
  }, 30_000);

  it("Face Danger's weak hit marks progress and fills a segment — no suffer move", async () => {
    await roll("face_danger_scene_challenge", WEAK);
    expect([ticks(), clockOf(challenge.tensionClockId)]).toEqual([8, 1]);
    expect(sceneCard()).toMatch(/its danger clock fills a segment \(1\/4\)/);
    expect(table.cards(f => f.sufferCard)).toHaveLength(0);
  }, 30_000);

  it("a miss fills one segment and pays the price — the price's advance skips that clock, not the others", async () => {
    await roll("face_danger_scene_challenge", MISS);
    expect([ticks(), clockOf(challenge.tensionClockId)]).toEqual([0, 1]);    // one fill, not two
    expect(table.cards(f => f.payThePriceCard)).toHaveLength(1);
    expect(clockOf(reactor._id)).toBe(1);                                      // the other clock turns
    const turns = table.cards(f => f.payThePriceAdvance).at(-1)?.content ?? "";
    expect(turns).toMatch(/Reactor breach/);
    expect(turns).not.toMatch(/The Negotiation/);
  }, 30_000);

  it("a miss with a match fills two segments", async () => {
    await roll("face_danger_scene_challenge", MISS_MATCH);
    expect(clockOf(challenge.tensionClockId)).toBe(2);
    expect(sceneCard()).toMatch(/fills 2 segments \(2\/4\)/);
  }, 30_000);

  it("Secure an Advantage's strong hit takes both; with a match it marks progress too", async () => {
    await roll("secure_an_advantage_scene_challenge", STRONG);
    expect(pc.system.momentum.value).toBe(10);       // +2, to the maximum
    expect(ticks()).toBe(0);
    await roll("secure_an_advantage_scene_challenge", STRONG_MATCH);
    expect(ticks()).toBe(8);
  }, 30_000);

  it("Secure an Advantage's miss fills a segment and pays the price", async () => {
    await roll("secure_an_advantage_scene_challenge", MISS);
    expect(clockOf(challenge.tensionClockId)).toBe(1);
    expect(table.cards(f => f.payThePriceCard)).toHaveLength(1);
  }, 30_000);

  it("the clock filling says the scene is due to finish", async () => {
    await gm().run(async () => (await import("../../src/clocks/clocks.js")).adjustClockSegments(challenge.tensionClockId, 3));
    await table.settle();
    await roll("face_danger_scene_challenge", WEAK);
    expect(clockOf(challenge.tensionClockId)).toBe(4);
    expect(sceneCard()).toMatch(/Its danger clock is full: the scene is due to end — <strong>Finish the Scene<\/strong>/);
  }, 30_000);

  it("a burned miss takes back its segment and marks the strong hit's progress; the price's other clock rewinds too", async () => {
    const card = await roll("face_danger_scene_challenge", BURNABLE);
    expect([ticks(), clockOf(challenge.tensionClockId), clockOf(reactor._id)]).toEqual([0, 1, 1]);
    expect(table.world.message(card._id).flags[MODULE_ID].burn.targets.sceneChallenge)
      .toMatchObject({ trackId: challenge.id, clockId: challenge.tensionClockId, clockBefore: 0, clockFilled: 1, clockSegments: 4 });

    await table.client("pl-1").click(card._id, '[data-action="sf-burn-momentum"]');
    await table.settle(); await table.drain();

    expect(lastMove()).toMatchObject({ outcome: "strong_hit" });
    expect([ticks(), clockOf(challenge.tensionClockId), clockOf(reactor._id)]).toEqual([8, 0, 0]);
  }, 30_000);

  it("a variant typed with no challenge open is resolved as the ordinary move", async () => {
    await gm().run(async () => (await import("../../src/ui/progressTracks.js")).completeProgressTrack(challenge.id));
    await table.settle();
    await roll("face_danger_scene_challenge", STRONG);
    expect(lastMove()).toMatchObject({ moveId: "face_danger", outcome: "strong_hit" });
    expect(pc.system.momentum.value).toBe(10);       // the ordinary strong hit's +1
    expect(table.cards(f => f.sceneChallengeCard)).toHaveLength(0);
  }, 30_000);

  it("control: the ordinary Face Danger while the challenge is open marks nothing on it (never re-keyed)", async () => {
    await roll("face_danger", STRONG, { moveTarget: null });
    expect(lastMove()).toMatchObject({ moveId: "face_danger" });
    expect([ticks(), clockOf(challenge.tensionClockId)]).toEqual([0, 0]);
  }, 30_000);
});

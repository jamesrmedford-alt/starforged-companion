/**
 * STARFORGED COMPANION
 * tests/unit/noRollMoves.test.js
 *
 * A move with no action roll rolls nothing (issue #316 T05), end to end on a
 * booted GM / player table (tests/helpers/multiClient.js): a player's Explore
 * a Waypoint comes up a strong hit with a match, and the player clicks the
 * result card's real "🔭 Make a Discovery" button; the GM's pipeline resolves
 * the forced follow-up.
 *
 * The resolver knew progress moves from "everything else" and rolled an
 * action die for every other move: Make a Discovery — a table roll, no
 * action roll — came out "+null (0)", "Action: 1 + 0 = 1 vs 7, 8", a Miss,
 * with a "Burn Momentum (9 → Strong Hit)" button that spent momentum 9 → 2 on
 * an outcome the rules never had. Moves resolve by their data now: a no-roll
 * move has no dice, no outcome, no Burn or Improve, and its consequences
 * apply as written.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE" })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({
    ...control.interpretation, playerNarration: text, inputMethod: "chat", rationale: "test", mischiefApplied: false,
  })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// Scripted Math.random inside the REAL resolveMove; `rolled.last` is the
// resolution it returned — its dice are the dice drawn.
const rolled = vi.hoisted(() => ({ last: null }));
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const n of control.dice) rng.mockReturnValueOnce(n);
    try { return (rolled.last = real.resolveMove(...args)); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, pc;
const world = () => table.world.campaignState();
const moveCards = () => table.cards(f => f.moveResolution);
const WAYPOINT_MATCH = [0.15, 0.15, 0.99];   // challenge 2 and 2, action die 6: a strong hit with a match

async function type(interpretation, dice) {
  control.interpretation = interpretation;
  control.dice = dice;
  await table.client("pl-1").chat("I look closer.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  rolled.last = null;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "nr-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "nr-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("T05 — Make a Discovery from a waypoint match rolls nothing and offers no burn", () => {
  it("the follow-up card has no dice, no outcome and no Burn Momentum; momentum stays 9; the legacy is marked", async () => {
    await type({ moveId: "explore_a_waypoint", moveName: "Explore a Waypoint", statUsed: "wits", adds: 0 }, WAYPOINT_MATCH);
    const parent = table.cards(f => f.waypointOracleCard).at(-1);
    expect(parent.flags[MODULE_ID].waypointOracleCard).toBe("make_a_discovery");
    expect(rolled.last).toMatchObject({ moveId: "explore_a_waypoint", rollKind: "action", outcome: "strong_hit", isMatch: true });

    control.dice = [0.65, 0.75, 0];   // would be challenge 7, 8 and an action die of 1 — never drawn
    await table.client("pl-1").click(parent._id, '[data-action="sf-waypoint-oracle"]');
    await table.settle(); await table.drain();

    expect(rolled.last).toMatchObject({ moveId: "make_a_discovery", rollKind: "none", actionDie: 0, challengeDice: [], outcome: null });
    const card = moveCards().at(-1);
    expect(card.content).toMatch(/Make A Discovery/);
    expect(card.content).toMatch(/no action roll/);
    expect(card.content).not.toMatch(/\+null|Action:|Challenge:|Miss|sf-burn-momentum|sf-improve-result/);
    expect(card.flags[MODULE_ID].burn).toBeUndefined();
    expect(card.flags[MODULE_ID].improve).toBeUndefined();

    expect(pc.system.momentum.value).toBe(9);
    expect(world().legacyTracks.discoveries.ticks).toBe(2);
    expect(world().sessionLogs["nr-s1"].at(-1)).toMatchObject({ moveId: "make_a_discovery", outcome: null });
    const narration = table.cards(f => f.narratorCard && f.moveId === "make_a_discovery").at(-1);
    expect(narration.flags[MODULE_ID].outcome).toBeNull();
  });

  it("a typed Make a Discovery rolls nothing even when the interpreter names a stat", async () => {
    await type({ moveId: "make_a_discovery", moveName: "Make a Discovery", statUsed: "iron", adds: 0 }, [0.65, 0.75, 0]);
    const card = moveCards().at(-1);
    expect(rolled.last).toMatchObject({ rollKind: "none", actionDie: 0, challengeDice: [], outcome: null });
    expect(card.content).toMatch(/no action roll/);
    expect(card.content).not.toMatch(/\+iron|Miss|sf-burn-momentum/);
    expect(pc.system.momentum.value).toBe(9);
    expect(world().legacyTracks.discoveries.ticks).toBe(2);
  });

  it("control: an action move still rolls its dice and offers a burn on a miss", async () => {
    await type({ moveId: "face_danger", moveName: "Face Danger", statUsed: "iron", adds: 0 }, [0.65, 0.75, 0]);
    const card = moveCards().at(-1);
    expect(rolled.last).toMatchObject({ rollKind: "action", actionDie: 1, challengeDice: [7, 8], outcome: "miss" });
    expect(card.content).toMatch(/Challenge: 7, 8/);
    expect(card.content).toMatch(/Miss/);
    expect(card.flags[MODULE_ID].burn).toMatchObject({ canBurn: true, originalOutcome: "miss" });
  });
});

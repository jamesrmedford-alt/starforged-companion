/**
 * MOVA-04 · UPGRADED-OUTCOME-UNSEEDED
 *
 * Scenario: issue #353 Phase 0 — "Where a move's outcome says to envision
 * something, the resolver rolls the matching table once and the narration is
 * given the result as an oracle seed" (decisions.md → "Oracles behind the
 * scenes"): a Gather Information hit's Story Clue, a Compel weak hit's
 * counteroffer (Action + Theme), an Undertake an Expedition hit's waypoint.
 * A player rolls Gather Information and misses with momentum that beats both
 * challenge dice. Free-flow holds the result (issue #354 P2-10, default on);
 * the player burns momentum: a strong hit, narrated once — "the move's one
 * narration".
 *
 * Correct: that narration is seeded as any Gather Information strong hit is —
 * "What you learn — Story Clue: …" — rolled once.
 *
 * Today: a burned (or improved) outcome is built outside resolveMove with
 * `oracleSeeds: null` (burnMomentum.js buildBurnedResolution, improveResult.js)
 * and nothing rolls for it: the one narration of a burned Gather Information
 * hit, a burned Compel weak hit or a burned expedition waypoint gets no oracle
 * result, and the narrator fills the "envision" from its own defaults — the
 * behaviour Phase 0 was written to end.
 *
 * Production path: the player's typed line and Burn Momentum click on a booted
 * GM + player table — the real pipeline, resolver, held-result flow, burn
 * handler and narrator prompt. Scripted: the pacing decision, the
 * interpretation, the ability scan, the confirm dialog, the dice.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

let table, pc;
const flags      = (id) => table.world.message(id).flags[MODULE_ID];
const narrations = () => table.cards(f => f.narratorCard && f.resolutionId);
const narratorCalls = () => table.claude.calls.filter(c => /MOVE OUTCOME/.test(`${c.userText}`));
const promptOf = (call) => `${call?.system ?? ""}\n${call?.userText ?? ""}`;
const BURN = '[data-action="sf-burn-momentum"]';

// [challenge, challenge, action] Math.random values.
const STRONG      = [0.05, 0.15, 0.9];   // challenge 1, 2 — a strong hit
const MISS_6_7    = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — a miss; momentum 9 burns to a strong hit
const MISS_4_8    = [0.35, 0.75, 0.0];   // challenge 4, 8; action die 1 — a miss; momentum 6 burns to a weak hit

async function roll(moveId, statUsed, dice, line) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat(line, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  silenceConsoleErrors();
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "mova4-s1", sessionNumber: 1,
      currentSceneId: "mova4-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira-mova4", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("MOVA-04 — a burned outcome that says to envision something is given its oracle roll", () => {
  it("control: a rolled Gather Information strong hit is narrated with its Story Clue", async () => {
    await roll("gather_information", "wits", STRONG, "I comb the wreck's logs for who sent it.");
    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("strong_hit");
    expect(promptOf(narratorCalls().at(-1))).toMatch(/What you learn — Story Clue: \S/);
  }, 60_000);

  it("control: a rolled Compel weak hit is narrated with their counteroffer", async () => {
    pc.system.momentum.value = 2;
    // challenge 3, 7; action die 4 + heart 2 = 6: a weak hit; momentum 2 cannot improve it.
    await roll("compel", "heart", [0.25, 0.65, 0.5], "I press the quartermaster to open the vault.");
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("weak_hit");
    expect(promptOf(narratorCalls().at(-1))).toMatch(/Their counteroffer — Action \+ Theme: \S/);
  }, 60_000);

  it("a Gather Information miss burned to a strong hit: its one narration is seeded with a Story Clue", async () => {
    const card = await roll("gather_information", "wits", MISS_6_7, "I comb the wreck's logs for who sent it.");
    expect(flags(card._id).awaitingUpgrade?.open, "the burnable miss is held, not narrated (setup)").toBe(true);
    expect(narrations()).toEqual([]);

    await click(card, BURN);

    expect(flags(card._id).burn.consumed).toBe(true);
    expect(narrations(), "the burned result is the move's one narration (setup)").toHaveLength(1);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("strong_hit");
    expect(promptOf(narratorCalls().at(-1))).toMatch(/What you learn — Story Clue: \S/);
  }, 60_000);

  it("a Compel miss burned to a weak hit: its one narration is seeded with their counteroffer", async () => {
    pc.system.momentum.value = 6;
    const card = await roll("compel", "heart", MISS_4_8, "I press the quartermaster to open the vault.");
    expect(flags(card._id).awaitingUpgrade?.open, "the burnable miss is held (setup)").toBe(true);

    await click(card, BURN);

    expect(narrations(), "the burned result is the move's one narration (setup)").toHaveLength(1);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("weak_hit");
    expect(promptOf(narratorCalls().at(-1))).toMatch(/Their counteroffer — Action \+ Theme: \S/);
  }, 60_000);
});

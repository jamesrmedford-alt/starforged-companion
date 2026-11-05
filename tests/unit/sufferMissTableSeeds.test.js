/**
 * STARFORGED COMPANION
 * tests/unit/sufferMissTableSeeds.test.js
 *
 * Issue #336 Y21 (SUFFER-MISS-TABLE-SEEDED-UNROLLED). Kira, at 3 health,
 * misses an Endure Harm. buildOracleSeeds rolled the mortal-wound d100 on
 * EVERY Endure Harm miss (desolation on every Endure Stress miss, vehicle
 * damage on every Withstand Damage miss) and handed the row to the narrator
 * as an ORACLE SEED — "Mortal wound (if health at 0): You are dying…" —
 * whatever the meter held. The book rolls the table only on the resist roll's
 * miss at 0, and only if the player picks it over marking wounded /
 * permanently harmed (issue #329 X03): the at-0 choice card rolls its own d100
 * (rollImpactTable), so the narration depicted a wound the table never rolled
 * — the issue #321 U03 / #326 W47 shape. No seed is rolled now; the choice
 * card's one roll is what the narrator is told (its card's oracle memory →
 * RECENT ORACLE RESULTS).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
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
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { buildOracleSeeds } from "../../src/moves/resolver.js";
import { rollImpactTable } from "../../src/moves/sufferExecutor.js";
import { MORTAL_WOUND } from "../../src/oracles/tables/sufferAndCombat.js";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const results = (seeds) => (seeds?.results ?? []).join(" | ");

describe("a suffer move's miss seeds no at-0 table (issue #336 Y21)", () => {
  it("an Endure Harm miss does not pre-roll the mortal-wound table for the narrator", () => {
    expect(results(buildOracleSeeds("endure_harm", "miss", false))).not.toMatch(/mortal wound/i);
  });

  it("an Endure Stress miss does not pre-roll desolation; a Withstand Damage miss does not pre-roll vehicle damage", () => {
    expect(results(buildOracleSeeds("endure_stress", "miss", false))).not.toMatch(/desolation/i);
    expect(results(buildOracleSeeds("withstand_damage", "miss", false))).not.toMatch(/vehicle damage/i);
  });

  it("control: Make a Discovery seeds its own table — the table is the move", () => {
    expect(results(buildOracleSeeds("make_a_discovery", null, false))).toMatch(/Make a Discovery:/);
  });

  it("control: a matched waypoint strong hit seeds no discovery (W47); a routed miss seeds no price (U03)", () => {
    expect(results(buildOracleSeeds("explore_a_waypoint", "strong_hit", true))).not.toMatch(/Make a Discovery:/);
    expect(results(buildOracleSeeds("face_danger", "miss", false, null, { routesPayThePrice: true }))).not.toMatch(/Pay the Price:/);
  });
});

describe("the at-0 choice card's table roll is the narrator's (issue #336 Y21)", () => {
  beforeEach(() => { globalThis.ChatMessage?._reset?.(); });

  it("the roll's card carries it as an oracle result: the table, whose roll, the row it gave", async () => {
    const rolled = await rollImpactTable("mortal_wound", { fixedRoll: 15, actorName: "Kira" });
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.suffer === "impact_table");
    expect(rolled.result).toBe(MORTAL_WOUND.find(e => 15 >= e.min && 15 <= e.max).result);
    expect(card.flags[MODULE_ID].oracleMemory).toEqual({ name: "Mortal Wound", question: "Kira", answer: rolled.result });
    expect(card.content).toContain(rolled.result);   // the card and the memory are the one roll
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The composition on a booted table: the miss's narration, the at-0 choice,
// the table's roll, and the next narration's prompt.
// ─────────────────────────────────────────────────────────────────────────────

let table, pc;
const MISS   = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — a miss
const STRONG = [0.0, 0.15, 0.9];    // challenge 1, 2; action die 6 — a strong hit

async function roll(moveId, statUsed, dice, line) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat(line, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
}
async function pick(card, index) {
  await table.client("pl-1").click(card._id, '[data-action="sf-suffer-pick"]', { index });
  await table.settle(); await table.drain();
}
const narrationSystems = () => table.claude.calls.map(c => c.system).filter(s => /ORACLE|NARRAT/i.test(s ?? ""));

describe("the narration knows the table's one roll, and only it (issue #336 Y21, on a table)", () => {
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "s1", sessionNumber: 1,
        currentSceneId: "scene-1", sceneTruths: [], clocks: [] },
    } } });
    await table.setClaudeKey("gm-1", "sk-ant-test");
    pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
      system: { momentum: { value: 5 }, health: { value: 0 }, spirit: { value: 3 } } });
    scriptClaude(table, { fallback: () => 'It is worse than you thought.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  });

  it("a miss at 0 health: no mortal wound in its narration; the table rolled on the choice card reaches the next one", async () => {
    await roll("endure_harm", "iron", MISS, "I take the blow — endure harm.");
    expect(narrationSystems().length).toBeGreaterThan(0);
    expect(narrationSystems().join("\n")).not.toMatch(/mortal wound/i);   // it seeded one on every miss

    // "-1 health" at 0 → the at-0 choice; pick "Roll on the mortal-wound table".
    const missCard = table.cards(f => f.sufferCard && f.sufferPrompt && !f.sufferPrompt.atZero).at(-1);
    await pick(missCard, 0);
    const atZero = table.cards(f => f.sufferCard && f.sufferPrompt?.atZero === "health").at(-1);
    expect(atZero.flags[MODULE_ID].sufferPrompt.options[2].label).toBe("Roll on the mortal-wound table");
    await pick(atZero, 2);

    const rolled = table.cards(f => f.suffer === "impact_table").at(-1);
    const answer = rolled.flags[MODULE_ID].result;
    expect(answer).toBeTruthy();
    // The canonical GM ledgers the card's roll — the same row the card shows.
    expect(table.world.campaignState().recentOracles).toEqual([
      expect.objectContaining({ name: "Mortal Wound", question: "Kira", answer }),
    ]);

    // The next narration is told what the dice established.
    const before = table.claude.calls.length;
    await roll("face_danger", "edge", STRONG, "I stagger to my feet and run for the hatch.");
    const next = table.claude.calls.slice(before).map(c => c.system).filter(s => /RECENT ORACLE RESULTS/.test(s ?? ""));
    expect(next.length).toBeGreaterThan(0);
    expect(next[0]).toContain(`Mortal Wound: "Kira" → ${answer}`);
  }, 30_000);

  it("a miss above 0 health (the finding's 3 health): no mortal wound in its narration, and no table is asked", async () => {
    pc.system.health.value = 3;
    await roll("endure_harm", "iron", MISS, "I take the blow — endure harm.");
    expect(narrationSystems().join("\n")).not.toMatch(/mortal wound/i);
    const missCard = table.cards(f => f.sufferCard && f.sufferPrompt && !f.sufferPrompt.atZero).at(-1);
    await pick(missCard, 0);
    expect(table.cards(f => f.sufferCard && f.sufferPrompt?.atZero === "health")).toHaveLength(0);
    expect(table.cards(f => f.suffer === "impact_table")).toHaveLength(0);
  }, 30_000);
});

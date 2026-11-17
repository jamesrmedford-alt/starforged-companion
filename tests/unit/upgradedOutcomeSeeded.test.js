/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/upgradedOutcomeSeeded.test.js
 *
 * Issue #362 AC05 UPGRADED-OUTCOME-UNSEEDED (an incomplete fix of issue #353
 * Phase 0). decisions.md → "Oracles behind the scenes": "Where a move's
 * outcome says to envision something, the resolver rolls the matching table
 * once and the narration is given the result as an oracle seed". An outcome
 * reached by Burn Momentum or Improve Result got none — buildBurnedResolution
 * and buildImprovedResolution set `oracleSeeds: null` — and since issue #354
 * P2-10 that is the move's only narration: a burned Gather Information hit
 * had no Story Clue, a burned Compel weak hit no counteroffer, a burned Make
 * a Connection no role or goal. A Battle or Clash burned to a weak hit that
 * pays the price too was not told the price it keeps.
 *
 * Fixed: the upgraded resolution's seeds are rolled for its own outcome
 * (resolver.js upgradedOracleSeeds → buildOracleSeeds), with the price that
 * stands seeded as the pipeline seeds it.
 *
 * From the probe tests/probes/mova/upgradedOutcomeUnseeded.probe.js, with its
 * controls.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, abilities: [], ptp: [78] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => control.abilities),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/entities/entityExtractor.js", async (original) => ({
  ...(await original()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
vi.mock("../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== "pay_the_price") return real.rollOracle(...args);
    const rng = vi.spyOn(Math, "random");
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, pc, seq = 0;
const flags      = (id) => table.world.message(id).flags[MODULE_ID];
const narrations = () => table.cards(f => f.narratorCard && f.resolutionId);
const narratorCalls = () => table.claude.calls.filter(c => /MOVE OUTCOME|THIS ROUND/.test(`${c.userText}`));
const promptOf = (call) => `${call?.system ?? ""}\n${call?.userText ?? ""}`;
const lastPrompt = () => promptOf(narratorCalls().at(-1));
const BURN    = '[data-action="sf-burn-momentum"]';
const IMPROVE = '[data-action="sf-improve-result"]';
const FUGITIVE = [{ assetId: null, assetName: "Fugitive", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];

// [challenge, challenge, action] Math.random values.
const STRONG   = [0.05, 0.15, 0.9];   // challenge 1, 2 — a strong hit
const MISS_6_7 = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — a miss; momentum 9 burns to a strong hit
const MISS_4_8 = [0.35, 0.75, 0.0];   // challenge 4, 8; action die 1 — a miss; momentum 6 burns to a weak hit
const STORY_CLUE = /What you learn — Story Clue: \S/;
const UNWELCOME  = /The unwelcome truth — Story Complication: \S/;

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

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import("../../src/multiplayer/gmRelay.js");
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

async function resetTable(settings = {}) {
  control.abilities = [];
  control.ptp = [78];   // Pay the Price 78: "You are harmed" — Endure Harm (-1)
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false, ...settings,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "ac05-s1", sessionNumber: 1,
      currentSceneId: "ac05-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, items: { contents: [] }, system: { momentum: { value: 9 } } });
  table.addActor({ id: "pc-ren", name: "Ren", ownership: { "pl-2": 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => { await resetTable(); });

describe("issue #362 AC05 — an outcome reached by an upgrade is given its own behind-the-scenes oracle rolls", () => {
  it("control: a rolled Gather Information strong hit is narrated with its Story Clue", async () => {
    await roll("gather_information", "wits", STRONG, "I comb the wreck's logs for who sent it.");
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("strong_hit");
    expect(lastPrompt()).toMatch(STORY_CLUE);
  }, 60_000);

  it("control: a rolled Compel weak hit is narrated with their counteroffer", async () => {
    pc.system.momentum.value = 2;
    await roll("compel", "heart", [0.25, 0.65, 0.5], "I press the quartermaster to open the vault.");
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("weak_hit");
    expect(lastPrompt()).toMatch(/Their counteroffer — Action \+ Theme: \S/);
  }, 60_000);

  it("held, a Gather Information miss burned to a strong hit: its one narration is seeded with a Story Clue", async () => {
    const card = await roll("gather_information", "wits", MISS_6_7, "I comb the wreck's logs for who sent it.");
    expect(flags(card._id).awaitingUpgrade?.open, "the burnable miss is held (setup)").toBe(true);

    await click(card, BURN);

    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("strong_hit");
    expect(lastPrompt()).toMatch(STORY_CLUE);
    expect(lastPrompt()).not.toMatch(UNWELCOME);   // the miss's own roll is not the strong hit's
  }, 60_000);

  it("held, a Compel miss burned to a weak hit: its one narration is seeded with their counteroffer", async () => {
    pc.system.momentum.value = 6;
    const card = await roll("compel", "heart", MISS_4_8, "I press the quartermaster to open the vault.");
    await click(card, BURN);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("weak_hit");
    expect(lastPrompt()).toMatch(/Their counteroffer — Action \+ Theme: \S/);
  }, 60_000);

  it("held, a Make a Connection miss burned to a strong hit: the new connection's role and goal are rolled for it", async () => {
    const card = await roll("make_a_connection", "heart", MISS_6_7, "I look for someone in the market who knows the old routes.");
    await click(card, BURN);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("strong_hit");
    expect(lastPrompt()).toMatch(/Character role: \S/);
    expect(lastPrompt()).toMatch(/Character goal: \S/);
  }, 60_000);

  it("held, a Gather Information miss IMPROVED to a strong hit: the same Story Clue", async () => {
    pc.system.momentum.value = 2;
    control.abilities = FUGITIVE;
    const card = await roll("gather_information", "wits", MISS_6_7, "I comb the wreck's logs for who sent it.");
    expect(flags(card._id).awaitingUpgrade?.open).toBe(true);
    await click(card, IMPROVE);
    expect(flags(card._id).improve.consumed).toBe(true);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("strong_hit");
    expect(lastPrompt()).toMatch(STORY_CLUE);
  }, 60_000);

  it("holding off: the miss is narrated with its unwelcome truth; the burn's re-narration gets a Story Clue instead", async () => {
    await resetTable({ holdResultForUpgrade: false });
    const card = await roll("gather_information", "wits", MISS_6_7, "I comb the wreck's logs for who sent it.");
    expect(lastPrompt(), "the miss's own seed (setup)").toMatch(UNWELCOME);

    await click(card, BURN);

    expect(flags(card._id).burn.consumed).toBe(true);
    expect(lastPrompt()).toMatch(/OUTCOME: Strong Hit/);
    expect(lastPrompt()).toMatch(STORY_CLUE);
    expect(lastPrompt()).not.toMatch(UNWELCOME);
  }, 60_000);

  it("holding off: a Battle miss burned to a weak hit keeps its Pay the Price — and the re-narration is seeded with it", async () => {
    await resetTable({ holdResultForUpgrade: false });
    pc.system.momentum.value = 6;
    pc.system.iron = 1;
    const card = await roll("battle", "iron", MISS_4_8, "Kira throws herself into the fight.");
    expect(table.cards(f => f.payThePriceCard), "the miss paid its price at the roll (setup)").toHaveLength(1);

    await click(card, BURN);

    expect(flags(card._id).burn.consumed).toBe(true);
    expect(table.cards(f => f.payThePriceCard && !f.priceSuperseded), "the weak hit keeps the price").toHaveLength(1);
    expect(lastPrompt()).toMatch(/OUTCOME: Weak Hit/);
    expect(lastPrompt()).toContain("Pay the Price: You are harmed");
  }, 60_000);

  it("a Batch Mode round: an entry's Gather Information miss burned before the round is narrated — the round is given the Story Clue", async () => {
    await table.client("gm-1").setSetting("batchMode.enabled", true);
    await table.settle();
    control.interpretation = { moveId: "gather_information", moveName: "Gather Information", statUsed: "wits", adds: 0, rationale: "test", mischiefApplied: false };
    control.dice = MISS_6_7;
    const round = () => table.world.getSetting("batchMode.round");
    const submissionId = `sub-ac05-${++seq}`;
    await relay("pl-1", "batch.submit", { roundId: round().id, text: "I comb the wreck's logs for who sent it.", submissionId });
    await relay("pl-1", "batch.confirm", { roundId: round().id, submissionId, choices: {} });
    await relay("pl-2", "batch.pass", { roundId: round().id });
    await table.drain();
    expect(round(), "the round waits on Kira's Burn / Keep (setup)").toMatchObject({ phase: "upgrading" });

    await relay("pl-1", "move.burnMomentum", { messageId: round().entries["pl-1"].rolled.cardId });
    await table.drain();

    expect(table.cards(f => f.narratorCard && f.roundId).at(-1)?.flags[MODULE_ID].roundEntries[0].outcome).toBe("strong_hit");
    expect(lastPrompt()).toMatch(/THIS ROUND/);
    expect(lastPrompt()).toMatch(STORY_CLUE);
  }, 60_000);
});

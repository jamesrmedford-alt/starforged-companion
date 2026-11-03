// tests/unit/upgradeCardText.test.js
// Two upgrade card-text defects (issue #326 W57): buildBurnedCardContent
// inserted the "🔥 Burned → …" block before the card's FIRST </div> — the
// move-name header's — so the burned outcome rendered inside the bold
// title; and Improve Result struck the old narration with the burn's fixed
// note, "momentum was burned to upgrade this outcome", though no momentum
// was burned. The block now follows the struck outcome, and the note says
// what superseded the narration.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, abilities: [] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
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
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { parseHTML } from "../helpers/cardDom.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, pc;
const WEAK = [0.25, 0.65, 0.5];   // challenge 3, 7; die 4 — wits 2 → 6: a weak hit
const FUGITIVE = [{ assetId: null, abilityIndex: null, assetName: "Fugitive",
  text: "improve the result to a strong hit", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];

async function roll(moveId, statUsed, dice) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: "probe", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat(`I attempt ${moveId}.`, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.abilities = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "probe-s1", sessionNumber: 1,
      currentSceneId: "probe-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 8 } } });
  scriptClaude(table, { fallback: () => 'The signal clears.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("a burned card shows the burned outcome below the struck one (issue #326 W57)", () => {
  it("control: the move card's header holds the move name alone before the burn", async () => {
    const card = await roll("gather_information", "wits", WEAK);
    const root = parseHTML(table.world.message(card._id).content);
    expect(root.querySelector(".sf-move-name").querySelector("div")).toBeNull();
  });

  it("after a burn, the burned-result block is not inside the move-name header", async () => {
    const card = await roll("gather_information", "wits", WEAK);
    await click(card, '[data-action="sf-burn-momentum"]');
    const root = parseHTML(table.world.message(card._id).content);
    const note = root.querySelector(".sf-move-burn-result");
    expect(root.querySelector(".sf-move-name").textContent).not.toMatch(/Burned/);
    expect(note).not.toBeNull();
    expect(note.closest(".sf-move-name")).toBeNull();          // the block sat inside .sf-move-name
  });
});

describe("an improved result's struck narration says it was improved (issue #326 W57)", () => {
  it("control: the improvement strikes the pre-improvement narration", async () => {
    control.abilities = FUGITIVE;
    const card = await roll("gather_information", "wits", WEAK);
    const narration = table.cards(f => f.narratorCard && f.resolutionId === card.flags[MODULE_ID].resolutionId).at(-1);
    expect(narration).toBeTruthy();
    await click(card, '[data-action="sf-improve-result"]');
    expect(table.world.message(narration._id).flags[MODULE_ID].burnSuperseded).toBe(true);
  });

  it("the struck narration does not say momentum was burned when the result was improved", async () => {
    control.abilities = FUGITIVE;
    const card = await roll("gather_information", "wits", WEAK);
    const narration = table.cards(f => f.narratorCard && f.resolutionId === card.flags[MODULE_ID].resolutionId).at(-1);
    const momentum = pc.system.momentum.value;
    await click(card, '[data-action="sf-improve-result"]');
    expect(pc.system.momentum.value).toBe(momentum + 1);       // the strong hit's +2 for the weak hit's +1: no burn
    const struck = table.world.message(narration._id).content;
    expect(struck).not.toMatch(/momentum was burned/);       // it said so
    expect(struck).toMatch(/the result was improved/);
  });
  it("control: a burn's struck narration still says momentum was burned", async () => {
    const card = await roll("gather_information", "wits", WEAK);
    const narration = table.cards(f => f.narratorCard && f.resolutionId === card.flags[MODULE_ID].resolutionId).at(-1);
    await click(card, '[data-action="sf-burn-momentum"]');
    expect(table.world.message(narration._id).content).toMatch(/momentum was burned/);
  });
});

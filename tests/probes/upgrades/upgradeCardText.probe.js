/**
 * PROBE (moves-upgrade-suffer audit) — two card-text defects of the result
 * upgrades, driven end to end on a booted table (the real move card from the
 * pipeline's formatMoveResult, the real narration card, the player's click).
 *
 *  MU: BURN-NOTE-IN-MOVE-NAME — buildBurnedCardContent (burnMomentum.js:712)
 *    puts the "🔥 Burned → …" block in with
 *      strikethrough.replace("</div>", `${burnNote}</div>`)
 *    i.e. before the FIRST `</div>` of the card — the move-name header's
 *    (`<div class="sf-move-name">Gather Information</div>` comes first in
 *    formatMoveResult). The burned outcome, its effect text and the effects
 *    note render inside the bold title, above the stat line and the struck
 *    original outcome. It should follow the struck outcome inside the card.
 *
 *  MU: IMPROVE-SUPERSEDE-SAYS-BURNED — Improve Result strikes the old
 *    narration through the burn's supersedeOriginalNarration, whose note is
 *    fixed text (buildSupersededNarrationContent, burnMomentum.js:685):
 *    "Superseded — momentum was burned to upgrade this outcome." After a
 *    Fugitive improvement, with momentum untouched, the narration card tells
 *    the table momentum was burned.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, abilities: [] }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => control.abilities),
}));
vi.mock("../../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
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
import { parseHTML } from "../../helpers/cardDom.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

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

describe("BURN-NOTE-IN-MOVE-NAME", () => {
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
    expect(note).not.toBeNull();
    expect(note.closest(".sf-move-name")).toBeNull();          // today: the block sits inside .sf-move-name
  });
});

describe("IMPROVE-SUPERSEDE-SAYS-BURNED", () => {
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
    expect(table.world.message(narration._id).content).not.toMatch(/momentum was burned/);   // today: it says so
  });
});

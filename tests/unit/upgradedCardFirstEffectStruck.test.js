/**
 * STARFORGED COMPANION
 * tests/unit/upgradedCardFirstEffectStruck.test.js
 *
 * Issue #364 UPGRADED-CARD-FIRST-EFFECT-UNSTRUCK (left open by issue #362
 * AC31). A move card states its outcome's consequence under the outcome — a
 * miss's "Dire threat or unwelcome truth uncovered. Pay the Price." Burning
 * momentum struck the outcome and (since AC31) its match line, and Improve
 * Result its match line, but the consequence line stood unstruck below the
 * upgraded block: "Burned → Strong Hit … Take +2 momentum." above a live
 * "Pay the Price." — on a held result, a price that was never paid.
 *
 * Fixed: both rewriters strike the first outcome's consequence line
 * (burnMomentum.js struckEffectLine), and the burned card's own consequence
 * line stands.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, abilities: [], ptp: [78] }));
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
import { struckEffectLine } from "../../src/moves/burnMomentum.js";

let table, pc;
const flags   = (id) => table.world.message(id).flags[MODULE_ID];
const content = (id) => String(table.world.message(id).content);
// What the card still says once struck-through text is set aside.
const standing = (id) => content(id).replace(/<s>[\s\S]*?<\/s>/g, "");

// [challenge, challenge, action] Math.random values.
const MISS    = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 + wits 2 = 3: a miss
const BURN    = '[data-action="sf-burn-momentum"]';
const IMPROVE = '[data-action="sf-improve-result"]';
const FUGITIVE = [{ assetId: null, assetName: "Fugitive", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];
const MISS_COST   = "Dire threat or unwelcome truth uncovered. Pay the Price.";
const STRONG_GAIN = "Path or action to make progress is clear. Take +2 momentum.";

async function roll(dice) {
  control.interpretation = { moveId: "gather_information", moveName: "Gather Information", statUsed: "wits", adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat("I search the wreck for what happened here.", { speaker: { actor: pc.id } });
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
  control.ptp = [78];
  control.abilities = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "i364-s1", sessionNumber: 1,
      currentSceneId: "i364-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // Momentum 9 beats 6 and 7: the burn makes a strong hit.
  pc = table.addActor({ id: "pc-kira-i364", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("issue #364 UPGRADED-CARD-FIRST-EFFECT-UNSTRUCK — an upgraded card strikes the first outcome's consequence", () => {
  it("control: a miss's card states its consequence, unstruck", async () => {
    const card = await roll(MISS);
    expect(content(card._id)).toContain(`<div class="sf-move-effect">${MISS_COST}</div>`);
    expect(standing(card._id)).toContain(MISS_COST);
  }, 30_000);

  it("a miss burned to a strong hit: the miss's \"Pay the Price.\" is struck, and the strong hit's consequence stands", async () => {
    const card = await roll(MISS);
    await click(card, BURN);

    expect(flags(card._id).burn).toMatchObject({ consumed: true });
    expect(content(card._id)).toMatch(/Burned → Strong Hit/);
    expect(standing(card._id), "the miss's consequence no longer reads as live").not.toContain("Pay the Price");
    expect(content(card._id), "struck, as the miss is").toContain(`<s>${MISS_COST}</s>`);
    expect(standing(card._id), "the burned result's own consequence is not struck").toContain(STRONG_GAIN);
  }, 30_000);

  it("a miss improved to a strong hit: the miss's consequence is struck the same way", async () => {
    pc.system.momentum.value = 2;      // no burn to offer: the asset's improvement alone
    control.abilities = FUGITIVE;
    const card = await roll(MISS);
    expect(standing(card._id)).toContain(MISS_COST);

    await click(card, IMPROVE);

    expect(flags(card._id).improve).toMatchObject({ consumed: true });
    expect(content(card._id)).toContain("Result improved to a strong hit");
    expect(standing(card._id)).not.toContain("Pay the Price");
    expect(content(card._id)).toContain(`<s>${MISS_COST}</s>`);
  }, 30_000);
});

describe("struckEffectLine — only the first outcome's own consequence line", () => {
  it("strikes the card's consequence line and leaves the course-reroute line and an upgrade's notes", () => {
    const card = '<div class="sf-move-result sf-miss"><div class="sf-move-outcome">Miss</div>'
      + '<div class="sf-move-effect">Pay the Price.</div>'
      + '<div class="sf-move-effect sf-move-reroute">🧭 Rerouted to Bleakhold</div>'
      + '<div class="sf-move-effect sf-upgrade-effects">+2 momentum.</div></div>';
    const out = struckEffectLine(card);
    expect(out).toContain('<div class="sf-move-effect sf-move-effect--struck"><s>Pay the Price.</s></div>');
    expect(out).toContain('<div class="sf-move-effect sf-move-reroute">🧭 Rerouted to Bleakhold</div>');
    expect(out).toContain('<div class="sf-move-effect sf-upgrade-effects">+2 momentum.</div>');
  });

  it("returns a card with no consequence line as it is, and strikes nothing twice", () => {
    const bare = '<div class="sf-move-result"><div class="sf-move-outcome">Miss</div></div>';
    expect(struckEffectLine(bare)).toBe(bare);
    const once = struckEffectLine('<div class="sf-move-effect">Pay the Price.</div>');
    expect(struckEffectLine(once)).toBe(once);
    expect(struckEffectLine(null)).toBe("");
  });
});

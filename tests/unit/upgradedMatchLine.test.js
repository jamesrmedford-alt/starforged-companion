/**
 * STARFORGED COMPANION
 * tests/unit/upgradedMatchLine.test.js
 *
 * Issue #362 AC31 MATCH-LINE-STALE-AFTER-UPGRADE. A move card says what a
 * match adds (issue #354 P2-14): on a miss "✦ Match: a dire turn — the
 * outcome is worse…", on a hit "a twist — something unexpected, or a new
 * opportunity". Burning a matched miss always makes a matched strong hit
 * (equal dice are both beaten), yet the card kept the miss's line, unstruck,
 * under "🔥 Burned → Strong Hit ✦ Match" — buildBurnedCardContent struck only
 * the outcome, and buildImprovedCardContent only appended a banner.
 *
 * Fixed: both rewriters strike the first outcome's match line and show the
 * upgraded outcome's.
 *
 * From the probe tests/probes/idxc/matchLineAfterBurn.probe.js, with its
 * controls; plus Improve Result.
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

let table, pc;
const flags   = (id) => table.world.message(id).flags[MODULE_ID];
const content = (id) => String(table.world.message(id).content);
// What the card still says once struck-through text is set aside.
const standing = (id) => content(id).replace(/<s>[\s\S]*?<\/s>/g, "");

// [challenge, challenge, action] Math.random values.
const MISS_MATCH = [0.55, 0.55, 0.1];   // challenge 6, 6 — a match; action die 1 + wits 2 = 3: a miss
const MISS       = [0.55, 0.65, 0.1];   // challenge 6, 7 — no match; a miss
const BURN    = '[data-action="sf-burn-momentum"]';
const IMPROVE = '[data-action="sf-improve-result"]';
const FUGITIVE = [{ assetId: null, assetName: "Fugitive", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];
const DIRE  = "a dire turn";
const TWIST = "✦ Match: a twist — something unexpected, or a new opportunity.";

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
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "ac31-s1", sessionNumber: 1,
      currentSceneId: "ac31-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // Momentum 9 beats 6 and 6: the burn makes a strong hit.
  pc = table.addActor({ id: "pc-kira-ac31", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("issue #362 AC31 — an upgraded card's match line follows the upgraded outcome", () => {
  it("control: a miss with a match says the match is a dire turn; a burnable miss with no match says nothing of one", async () => {
    const matched = await roll(MISS_MATCH);
    expect(flags(matched._id).burn).toMatchObject({ canBurn: true });
    expect(content(matched._id)).toContain(`✦ Match: ${DIRE}`);
    const plain = await roll(MISS);
    expect(content(plain._id)).not.toContain("sf-move-match");
  }, 30_000);

  it("control: burning a miss with no match strikes the miss, shows the strong hit, and adds no match line", async () => {
    const card = await roll(MISS);
    await click(card, BURN);
    expect(flags(card._id).burn).toMatchObject({ consumed: true });
    expect(content(card._id)).toMatch(/Burned → Strong Hit/);
    expect(content(card._id)).not.toContain("sf-move-match");
  }, 30_000);

  it("a matched miss burned to a strong hit: the dire turn is struck, and the card says the match is a twist", async () => {
    const card = await roll(MISS_MATCH);
    await click(card, BURN);

    expect(flags(card._id).burn).toMatchObject({ consumed: true });
    expect(content(card._id)).toMatch(/Burned → Strong Hit ✦ Match/);
    expect(standing(card._id)).not.toContain(DIRE);
    expect(content(card._id)).toMatch(/<s>✦ Match: a dire turn[^<]*<\/s>/);   // struck, as the miss is
    expect(standing(card._id)).toContain(TWIST);
  }, 30_000);

  it("a matched miss improved to a strong hit: the same", async () => {
    pc.system.momentum.value = 2;      // no burn to offer: the asset's improvement alone
    control.abilities = FUGITIVE;
    const card = await roll(MISS_MATCH);
    expect(content(card._id)).toContain(`✦ Match: ${DIRE}`);

    await click(card, IMPROVE);

    expect(flags(card._id).improve).toMatchObject({ consumed: true });
    expect(content(card._id)).toContain("Result improved to a strong hit");
    expect(standing(card._id)).not.toContain(DIRE);
    expect(standing(card._id)).toContain(TWIST);
  }, 30_000);
});

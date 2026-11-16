/**
 * PROBE — IDXC-02 · MATCH-LINE-STALE-AFTER-UPGRADE
 *
 * Scenario: a move misses with a match (challenge dice 6 and 6, action score
 * 3). Its card says what the match adds (index.js formatMoveResult →
 * matchLine, issue #354 P2-14): "✦ Match: a dire turn — the outcome is worse,
 * with a complication or a new peril." The roller, at momentum 9, burns
 * momentum: both dice are beaten, so the result is a strong hit — still with
 * a match, which on a hit is "a twist — something unexpected, or a new
 * opportunity".
 *
 * Correct: the burned card no longer tells the roller the match is a dire
 * turn that makes the outcome worse (the line is replaced, or struck with the
 * outcome it belonged to).
 *
 * Today: burnMomentum.js buildBurnedCardContent strikes only the
 * `sf-move-outcome` div and adds "🔥 Burned → Strong Hit ✦ Match"; the
 * `sf-move-match` div formatMoveResult rendered for the MISS stays on the
 * card, unstruck, under the burned strong hit.
 *
 * End to end on a booted table, as tests/unit/heldResultBeforePrice.test.js
 * runs it: the interpretation, the abilities and the dice are scripted at
 * their boundaries; the pipeline, the card and the burn are real.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [78] }));
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
vi.mock("../../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== "pay_the_price") return real.rollOracle(...args);
    const rng = vi.spyOn(Math, "random");
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

let table, pc;
const flags   = (id) => table.world.message(id).flags[MODULE_ID];
const content = (id) => String(table.world.message(id).content);
// What the card still says once struck-through text is set aside.
const standing = (id) => content(id).replace(/<s>[\s\S]*?<\/s>/g, "");

// [challenge, challenge, action] Math.random values.
const MISS_MATCH = [0.55, 0.55, 0.1];   // challenge 6, 6 — a match; action die 1 + wits 2 = 3: a miss
const MISS       = [0.55, 0.65, 0.1];   // challenge 6, 7 — no match; a miss
const BURN = '[data-action="sf-burn-momentum"]';

const DIRE = "a dire turn";

async function roll(dice) {
  control.interpretation = { moveId: "gather_information", moveName: "Gather Information", statUsed: "wits", adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat("I search the wreck for what happened here.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function click(card, selector, user = "pl-1") {
  await table.client(user).click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = [78];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "idxc-m1", sessionNumber: 1,
      currentSceneId: "idxc-m-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // Momentum 9 beats 6 and 6: the burn makes a strong hit.
  pc = table.addActor({ id: "pc-kira-m", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("IDXC-02 — the match line of a result that is burned", () => {
  it("control: a miss with a match says the match is a dire turn; a burnable miss with no match says nothing of one", async () => {
    const matched = await roll(MISS_MATCH);
    expect(flags(matched._id).burn).toMatchObject({ canBurn: true });
    expect(content(matched._id)).toContain(`✦ Match: ${DIRE}`);

    const plain = await roll(MISS);
    expect(content(plain._id)).not.toContain("sf-move-match");
  }, 30_000);

  it("control: burning a miss with no match strikes the miss and shows the strong hit", async () => {
    const card = await roll(MISS);
    await click(card, BURN);
    expect(flags(card._id).burn).toMatchObject({ consumed: true });
    expect(content(card._id)).toMatch(/Burned → Strong Hit/);
    expect(standing(card._id)).not.toContain(DIRE);
  }, 30_000);

  it("a matched miss burned to a strong hit no longer says its match is a dire turn that makes the outcome worse", async () => {
    const card = await roll(MISS_MATCH);
    expect(content(card._id)).toContain(`✦ Match: ${DIRE}`);

    await click(card, BURN);

    expect(flags(card._id).burn).toMatchObject({ consumed: true });
    expect(content(card._id)).toMatch(/Burned → Strong Hit ✦ Match/);
    // The result is a strong hit with a match — a twist, not a dire turn.
    expect(standing(card._id)).not.toContain(DIRE);
  }, 30_000);
});

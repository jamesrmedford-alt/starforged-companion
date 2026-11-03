/**
 * STARFORGED COMPANION
 * tests/unit/upgradeClosedByLaterMove.test.js
 *
 * An upgrade belongs to the move being made (issue #326 D4).
 *
 * "When you make a move and roll the action die, you may burn momentum … You
 * must burn momentum before applying any other effects of the move." A move
 * card's Burn Momentum / Improve Result stayed live until used or its choice
 * was picked: Kira's earlier weak hit could be burned after her next move,
 * at her CURRENT momentum, swapping the old outcome's effects in after the
 * fact and re-narrating a past beat. Decided: once the same roller's next
 * move has resolved, that card's upgrades close — the GM refuses them, and
 * the buttons say so.
 *
 * Driven end to end on a booted table (interpretation and dice scripted at
 * their boundaries); the player clicks on their own client.
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

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { resultUpgradeBlocker, UPGRADE_REFUSALS } from "../../src/moves/burnMomentum.js";

let table, kira, quinn;
const flags = (id) => table.world.message(id).flags[MODULE_ID];

const WEAK   = [0.25, 0.65, 0.5];   // challenge 3, 7; die 4 — wits 2 → 6: a weak hit
const STRONG = [0.25, 0.45, 0.9];   // challenge 3, 5; die 6 — edge 2 → 8: a strong hit

async function roll(user, pc, moveId, statUsed, dice) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client(user).chat(`I attempt ${moveId}.`, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function click(user, card, selector) {
  await table.client(user).click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "lm-s1", sessionNumber: 1,
      currentSceneId: "lm-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  kira  = table.addActor({ id: "pc-kira",  name: "Kira",  ownership: { "pl-1": 3 }, system: { momentum: { value: 8 } } });
  quinn = table.addActor({ id: "pc-quinn", name: "Quinn", ownership: { "pl-2": 3 }, system: { momentum: { value: 8 } } });
  scriptClaude(table, { fallback: () => 'The moment passes.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe("a move card's upgrades close after the roller's next move (issue #326 D4)", () => {
  it("control: burned at once, the weak Gather Information becomes a strong hit (reset 2 + 2)", async () => {
    const first = await roll("pl-1", kira, "gather_information", "wits", WEAK);
    expect(kira.system.momentum.value).toBe(9);
    await click("pl-1", first, '[data-action="sf-burn-momentum"]');
    expect(flags(first._id).burn.consumed).toBe(true);
    expect(kira.system.momentum.value).toBe(4);
  });

  it("after Kira's next move, the earlier card's Burn Momentum is closed and refused", async () => {
    const first = await roll("pl-1", kira, "gather_information", "wits", WEAK);
    await roll("pl-1", kira, "face_danger", "edge", STRONG);        // momentum 9 → 10
    expect(kira.system.momentum.value).toBe(10);
    expect(flags(first._id).burn.laterMove).toBe(true);           // the buttons say so on every client

    await click("pl-1", first, '[data-action="sf-burn-momentum"]');
    expect(flags(first._id).burn.consumed).toBeFalsy();
    expect(kira.system.momentum.value).toBe(10);                  // not burned at its current value
  });

  it("the move just made keeps its own upgrades open", async () => {
    await roll("pl-1", kira, "gather_information", "wits", WEAK);
    const latest = await roll("pl-1", kira, "gather_information", "wits", WEAK);
    expect(flags(latest._id).burn.laterMove).toBeUndefined();
    expect(resultUpgradeBlocker(flags(latest._id).burn, flags(latest._id).improve)).toBeNull();
  });

  it("control: another character's move leaves Kira's card open", async () => {
    const first = await roll("pl-1", kira, "gather_information", "wits", WEAK);
    await roll("pl-2", quinn, "face_danger", "edge", STRONG);
    expect(flags(first._id).burn.laterMove).toBeUndefined();
    await click("pl-1", first, '[data-action="sf-burn-momentum"]');
    expect(flags(first._id).burn.consumed).toBe(true);
  });

  it("a card the closing never stamped is still refused once a later move follows it", async () => {
    const first = await roll("pl-1", kira, "gather_information", "wits", WEAK);
    await roll("pl-1", kira, "face_danger", "edge", STRONG);
    // A card posted before the closing existed: no stamp.
    await table.client("gm-1").run(() => game.messages.get(first._id).update({ [`flags.${MODULE_ID}.burn.laterMove`]: false }));
    await table.settle();
    await click("pl-1", first, '[data-action="sf-burn-momentum"]');
    expect(flags(first._id).burn.consumed).toBeFalsy();
    expect(kira.system.momentum.value).toBe(10);
  });
});

describe("the blocker reads the closing (issue #326 D4)", () => {
  it("a closed upgrade is refused as a later move, and the refusal reads so", () => {
    const upgrade = { originalApplied: true, laterMove: true };
    expect(resultUpgradeBlocker(upgrade, {})).toBe("later-move");
    expect(UPGRADE_REFUSALS["later-move"]).toMatch(/another move since/);
  });

  it("control: an open upgrade has no blocker", () => {
    expect(resultUpgradeBlocker({ originalApplied: true }, {})).toBeNull();
  });
});

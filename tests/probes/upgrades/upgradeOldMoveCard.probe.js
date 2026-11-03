/**
 * PROBE (moves-upgrade-suffer audit) — MU: UPGRADE-OLD-MOVE-CARD
 *
 * Rule (quoted at the top of burnMomentum.js, Reference Guide p. 117): "When
 * you make a move and roll the action die, you may burn momentum … You must
 * burn momentum before applying any other effects of the move."
 *
 * What the user does: Kira rolls Gather Information (a weak hit she could
 * burn), does not burn, makes another move (a strong-hit Face Danger), then
 * scrolls up and presses the first card's 🔥 Burn Momentum — or presses it
 * sessions later.
 *
 * What happens: a move card's Burn Momentum / Improve Result stays live until
 * it is used or the move's choice card is picked (resultUpgradeBlocker,
 * burnMomentum.js:140; consequenceChosen). Nothing closes it when the roller
 * makes a later move, so the old roll is re-resolved now: momentum is burned
 * at its CURRENT value (raised by the later move — burnableMomentum reads the
 * live sheet), reset, and the old outcome's effects are swapped in after the
 * fact — for a fight, the old card's position overwrites the one the later
 * moves set; for a miss, its Pay the Price refund and clock rewind land on
 * clocks that have moved on; the re-narration describes a long-past beat as
 * the scene's latest.
 *
 * What should happen: an upgrade belongs to the move being made — once the
 * roller's next move has resolved, the earlier card's upgrades are closed
 * (and the GM handler refuses them).
 *
 * Driven end to end on a booted table (interpretation and dice scripted at
 * their boundaries); the player clicks on their own client.
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
const flags = (id) => table.world.message(id).flags[MODULE_ID];
const log   = () => table.world.campaignState().sessionLogs?.["probe-s1"] ?? [];

const WEAK   = [0.25, 0.65, 0.5];   // challenge 3, 7; die 4 — wits 2 → 6: a weak hit
const STRONG = [0.25, 0.45, 0.9];   // challenge 3, 5; die 6 — edge 2 → 8: a strong hit

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
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "probe-s1", sessionNumber: 1,
      currentSceneId: "probe-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 8 } } });
  scriptClaude(table, { fallback: () => 'The moment passes.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("UPGRADE-OLD-MOVE-CARD", () => {
  it("control: burned at once, the weak Gather Information becomes a strong hit (reset 2 + 2)", async () => {
    const first = await roll("gather_information", "wits", WEAK);
    expect(pc.system.momentum.value).toBe(9);
    await click(first, '[data-action="sf-burn-momentum"]');
    expect(flags(first._id).burn.consumed).toBe(true);
    expect(pc.system.momentum.value).toBe(4);
  });

  it("after Kira's next move, the earlier card's Burn Momentum no longer re-resolves the old roll", async () => {
    const first = await roll("gather_information", "wits", WEAK);
    expect(pc.system.momentum.value).toBe(9);
    await roll("face_danger", "edge", STRONG);       // a later move: momentum 9 → 10
    expect(pc.system.momentum.value).toBe(10);
    const logged = log().length;

    await click(first, '[data-action="sf-burn-momentum"]');

    expect(flags(first._id).burn.consumed).toBeFalsy();   // today: true — the old roll is burned now
    expect(pc.system.momentum.value).toBe(10);            // today: 4 (momentum 10 burned, reset 2 + 2)
    expect(log().length).toBe(logged);                    // today: a strong-hit Gather Information is logged after the Face Danger
  });
});

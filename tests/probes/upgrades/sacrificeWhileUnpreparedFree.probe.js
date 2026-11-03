/**
 * PROBE (moves-upgrade-suffer audit) — MU: SACRIFICE-UNPREPARED-FREE
 *
 * Rule (vendored Sacrifice Resources text): "If your supply is exhausted
 * (reduced to 0), mark unprepared. When you suffer a loss of resources while
 * unprepared, envision how this causes you hardship and apply the cost to a
 * different suffer move."
 *
 * What the user does: the crew is out of supply (0, unprepared); a weak-hit
 * Face Danger posts "Make a suffer move (-1)"; the player taps Sacrifice
 * Resources.
 *
 * What happens: the executor writes supply 0 - 1 → 0 (clamped), finds the PC
 * already unprepared, and posts "Supply: 0 → 0 — further loss redirects to
 * another suffer move" (sufferExecutor.js:345-371); the choice card resolves
 * "Applied: Sacrifice Resources (-1)" and nothing offers the redirect. The
 * cost is never paid — at 0 supply Sacrifice Resources is a free answer to
 * every "make a suffer move". (The Lose Momentum twin at -6 is the open
 * MOMENTUM-MIN-REDIRECT-MANUAL; this is the supply rule, which no open item
 * names.)
 *
 * What should happen: the loss goes to a different suffer move — the pick is
 * refused / unavailable while unprepared (or a picker for the redirect
 * follows), and the card says what was paid.
 *
 * Driven end to end on a booted table (interpretation and dice scripted).
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
const WEAK = [0.25, 0.65, 0.5];   // challenge 3, 7; die 4 — iron 3 → 7: a weak hit
const SACRIFICE_RESOURCES = 3;    // ANY_SUFFER_MOVES order (sufferCard.js)

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "probe-s1", sessionNumber: 1,
      currentSceneId: "probe-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { supply: { value: 0 }, momentum: { value: 4 }, debility: { unprepared: true } } });
  scriptClaude(table, { fallback: () => 'You make it, barely.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

async function weakFaceDanger() {
  control.interpretation = { moveId: "face_danger", moveName: "Face Danger", statUsed: "iron", adds: 0, rationale: "probe", mischiefApplied: false };
  control.dice = WEAK;
  await table.client("pl-1").chat("I force the jammed hatch.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.sufferCard && f.sufferPrompt).at(-1);
}

const meters = () => ({ health: pc.system.health.value, spirit: pc.system.spirit.value, supply: pc.system.supply.value, momentum: pc.system.momentum.value });

describe("SACRIFICE-UNPREPARED-FREE", () => {
  it("control: the weak hit posts the 'make a suffer move (-1)' picker", async () => {
    const card = await weakFaceDanger();
    expect(card.flags[MODULE_ID].sufferPrompt).toMatchObject({ kind: "any", amount: 1 });
  });

  it("Sacrifice Resources at 0 supply while unprepared does not settle the cost for nothing", async () => {
    const card = await weakFaceDanger();
    const before = meters();
    await table.client("pl-1").click(card._id, '[data-action="sf-suffer-pick"]', { index: SACRIFICE_RESOURCES });
    await table.settle(); await table.drain();

    const paid = Object.keys(before).some(k => meters()[k] < before[k]);
    const stillOpen = table.world.message(card._id).flags[MODULE_ID].resolved !== true
      || table.cards(f => f.sufferCard && f.sufferPrompt && !f.resolved).length > 0;
    expect(paid || stillOpen).toBe(true);   // today: false — no meter moved, the card resolved "Applied: Sacrifice Resources (-1)"
  });
});

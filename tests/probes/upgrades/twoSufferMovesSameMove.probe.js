/**
 * PROBE (moves-upgrade-suffer audit) — MU: TWO-SUFFER-MOVES-ONE-MOVE
 *
 * Rule (vendored Set a Course / Undertake an Expedition text): on a weak hit,
 * "Suffer costs en route: Make a suffer move (-2), or two suffer moves (-1)."
 * Two suffer moves at -1 each spread the cost — e.g. Endure Harm (-1) and
 * Sacrifice Resources (-1).
 *
 * What the user does: a weak-hit Set a Course; on its choice card the player
 * picks "Two suffer moves (-1 each)"; a follow-up card "Make a suffer move
 * (2 × -1)" offers the six suffer moves; the player taps Endure Harm.
 *
 * What happens: the follow-up is a one-pick card (sufferMultiCap → 1 for
 * kind "any") and resolveSufferSelection repeats the ONE chosen move `count`
 * times (sufferDialog.js:66-72), so the tap applies Endure Harm (-1) twice —
 * health 5 → 3 — and resolves the card. The player can never take two
 * different suffer moves; "two suffer moves (-1)" collapses into the same
 * move at -2.
 *
 * What should happen: each tap applies one suffer move at -1, and the card
 * stays open for the second (the same move twice only if the player taps it
 * twice).
 *
 * Driven end to end on a booted table: the player's narration goes through
 * the GM's real pipeline (interpretation and dice scripted at their
 * boundaries), and the player clicks the cards on their own client.
 * tests/unit/sufferDialog.test.js "repeats N times when count > 1" pins the
 * pure function's current reading.
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
// challenge 3, 7; action die 4 — supply 3 + 4 = 7: beats the 3, not the 7 → weak hit
const WEAK = [0.25, 0.65, 0.5];
// ANY_SUFFER_MOVES order on the "any" card (sufferCard.js)
const ENDURE_HARM = 0;
const SACRIFICE_RESOURCES = 3;

const choiceCards = () => table.cards(f => f.sufferCard && f.sufferPrompt);

async function rollSetACourseWeak() {
  control.interpretation = { moveId: "set_a_course", moveName: "Set a Course", statUsed: "supply", adds: 0,
    moveTarget: "the outpost", rationale: "probe", mischiefApplied: false };
  control.dice = WEAK;
  await table.client("pl-1").chat("I plot a course to the outpost.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
}

async function click(id, selector, opts) {
  await table.client("pl-1").click(id, selector, opts);
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
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 2 } } });
  scriptClaude(table, { fallback: () => 'The route bends.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("TWO-SUFFER-MOVES-ONE-MOVE", () => {
  it("control: a weak-hit Set a Course posts the three-way choice card", async () => {
    await rollSetACourseWeak();
    const choice = choiceCards().at(-1);
    expect(choice.flags[MODULE_ID].sufferPrompt.options.map(o => o.label))
      .toEqual(["One suffer move (-2)", "Two suffer moves (-1 each)", "Complication at destination"]);
  });

  it("'Two suffer moves (-1 each)': one tap applies ONE suffer move at -1, and the card waits for the second", async () => {
    await rollSetACourseWeak();
    const choice = choiceCards().at(-1);
    await click(choice._id, '[data-action="sf-suffer-pick"]', { index: 1 });   // Two suffer moves (-1 each)

    const followUp = choiceCards().at(-1);
    expect(followUp._id).not.toBe(choice._id);
    expect(pc.system.health.value).toBe(5);

    await click(followUp._id, '[data-action="sf-suffer-pick"]', { index: ENDURE_HARM });
    expect(pc.system.health.value).toBe(4);                                   // today: 3 (Endure Harm -1, twice)
    expect(table.world.message(followUp._id).flags[MODULE_ID].resolved).toBe(false);   // today: true

    await click(followUp._id, '[data-action="sf-suffer-pick"]', { index: SACRIFICE_RESOURCES });
    expect(pc.system.supply.value).toBe(2);                                   // the second move, a different one
    expect(pc.system.health.value).toBe(4);
  });
});

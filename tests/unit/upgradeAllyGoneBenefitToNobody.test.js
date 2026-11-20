/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/upgradeAllyGoneBenefitToNobody.test.js
 *
 * Issue #364 UPGRADE-ALLY-GONE-BONUS-TO-ROLLER.
 *
 * Aid Your Ally's benefits are the ally's ("they (instead of you) take the
 * benefits of the move"). A Burn Momentum or Improve Result that upgrades the
 * move pays the upgraded hit to the ally its card names (`targets.allyActorId`).
 * When that ally was deleted before the upgrade, the strong hit's +1 on the
 * next move went to the roller (the effects applier fell back to whoever
 * rolled), and the ally's share of the momentum went to the GMs' payoff card
 * as a step whose Retry could only answer that the sheet is gone.
 *
 * Now a named ally who is gone gets nothing, and nobody else does: the move
 * card's "Not applied" line says so in plain words, and nothing goes to the
 * GMs. An upgrade whose ally is still there pays them, as before.
 *
 * On a booted table: the real move pipeline posts the Aid Your Ally card
 * (interpretation, dice and the asset scan scripted at their boundaries), and
 * the roller's player presses its real Burn / Improve button.
 */

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
import { CampaignStateSchema } from "../../src/schemas.js";

const WEAK     = [0.25, 0.75, 0.6];   // challenge 3, 8; die 4 — edge 2 → 6: a weak hit
const BURN     = '[data-action="sf-burn-momentum"]';
const IMPROVE  = '[data-action="sf-improve-result"]';
const FUGITIVE = [{ assetId: null, assetName: "Fugitive", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];
const GONE     = "the character's sheet is gone from the world, so there is no one left to receive it";

let table, ash, kira;
const bonuses   = () => table.world.campaignState().nextMoveBonuses ?? {};
const moveCard  = () => table.cards(f => f.moveResolution).at(-1);
const cardText  = (card) => table.client("gm-1").render(card._id).textContent.replace(/\s+/g, " ");
const failCards = () => table.cards(f => f.payoffFailureCard);

async function ashAidsKira(dice) {
  control.interpretation = { moveId: "aid_your_ally", moveName: "Aid Your Ally", statUsed: "edge", adds: 0,
    moveTarget: "Kira", rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat("I draw their fire so Kira can slip past.", { speaker: { actor: ash.id } });
  await table.settle(); await table.drain();
  return moveCard();
}
async function press(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.abilities = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "uag-s1", sessionNumber: 1,
      currentSceneId: "uag-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  scriptClaude(table, { fallback: () => 'The distraction works.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
  ash  = table.addActor({ id: "pc-ash",  name: "Ash",  ownership: { "pl-1": 3 }, system: { edge: 2, momentum: { value: 2 } } });
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-2": 3 }, system: { momentum: { value: 2 } } });
});

describe("issue #364 UPGRADE-ALLY-GONE-BONUS-TO-ROLLER — an upgraded Aid Your Ally whose ally is gone", () => {
  it("Burn Momentum: the strong hit's +1 is nobody's, the burner's momentum resets, and the card says why", async () => {
    ash.system.momentum.value = 9;
    const card = await ashAidsKira(WEAK);
    expect(card.flags[MODULE_ID].burn?.canBurn, "Ash can burn").toBe(true);
    table.actors.delete("pc-kira");

    await press(card, BURN);

    expect(bonuses()["pc-ash"], "the +1 is not the burner's").toBeUndefined();
    expect(ash.system.momentum.value, "reset, none of the ally's +2").toBe(2);
    const text = cardText(card);
    expect(text).toContain(`Not applied: +2 momentum for the character Ash aided — ${GONE}`);
    expect(text).toContain(`+1 on the next move for the character Ash aided — ${GONE}`);
    expect(failCards(), "nothing for the GMs to retry").toEqual([]);
  }, 30_000);

  it("Improve Result: the strong hit's +1 and +2 momentum are nobody's, and the card says why", async () => {
    control.abilities = FUGITIVE;
    const card = await ashAidsKira(WEAK);
    expect(card.flags[MODULE_ID].improve?.canImprove, "Ash can improve").toBe(true);
    table.actors.delete("pc-kira");

    await press(card, IMPROVE);

    expect(bonuses()["pc-ash"]).toBeUndefined();
    expect(ash.system.momentum.value).toBe(2);
    const text = cardText(card);
    expect(text).toContain(`+2 momentum for the character Ash aided — ${GONE}`);
    expect(text).toContain(`+1 on the next move for the character Ash aided — ${GONE}`);
    expect(failCards()).toEqual([]);
  }, 30_000);

  it("control: the ally still there — the burned hit's +2 momentum and +1 are theirs, and nothing is said not applied", async () => {
    ash.system.momentum.value = 9;
    const card = await ashAidsKira(WEAK);

    await press(card, BURN);

    expect(kira.system.momentum.value).toBe(4);
    expect(bonuses()["pc-kira"]?.value).toBe(1);
    expect(bonuses()["pc-ash"]).toBeUndefined();
    expect(ash.system.momentum.value).toBe(2);
    expect(cardText(card)).not.toContain("for the character Ash aided");
    expect(failCards()).toEqual([]);
  }, 30_000);
});

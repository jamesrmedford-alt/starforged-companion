/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/wonFightNoVowIdFulfilAsksWhichVow.test.js
 *
 * Issue #364 ATTEMPT-FULFIL-NO-ID-CARD.
 *
 * A won fight's victory card with no vow id has the vow's name alone (its vow
 * was on no sheet by its name when the card was posted — deleted, or renamed;
 * issue #364 NO-VOW-ID-CARD-MARKS-WRONG-VOW). Its 🏁 Attempt to Fulfill found
 * the vow by that name through the name ladder, whose last rung is the
 * table's sole open vow — so the press rolled Fulfill Your Vow on another
 * vow, by that vow's Item id; and when several vows were open, the forced
 * move went out with the name alone and the pipeline's Fulfill Your Vow fell
 * to the roller's one open vow. Either way a vow the fight never served was
 * rolled, and on a strong hit fulfilled.
 *
 * Now, as the card's ⚑: the press acts only on a vow its name names (exactly,
 * or as whole words); otherwise it asks with Fulfill Your Vow's own "Which
 * vow?" card — nothing is rolled until a person chooses.
 *
 * On a booted table: the GM's own poster, the player's real 🏁 press and the
 * real "Which vow?" pick; the pipeline rolls the forced move (its dice
 * scripted at the resolver).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock("../../src/pacing/router.js", async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (importOriginal) => ({
  ...(await importOriginal()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (importOriginal) => ({
  ...(await importOriginal()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/moves/resolver.js", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, resolveMove: vi.fn((...args) => {
    const dice = vi.spyOn(Math, "random");
    for (const d of control.dice) dice.mockReturnValueOnce(d);
    try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const REPLY   = 'The vow holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const FULFIL  = '[data-action="sf-fulfill-vow"]';
const WHICH   = '[data-action="sf-which-vow"]';

let table, gm, index, kira;

// Each vow at 10 boxes: a Fulfill Your Vow on it is a strong hit (challenge 3, 5).
function vowItem(id, name) {
  const item = {
    id, type: "progress", name, system: { subtype: "vow", rank: "dangerous", current: 40, completed: false },
    flags: { [MODULE_ID]: { vowId: id } },
    update: async (changes) => {
      if ("system.current" in changes) item.system.current = changes["system.current"];
      if ("system.completed" in changes) item.system.completed = changes["system.completed"];
      return item;
    },
    setFlag: async (mod, key, value) => { (item.flags[mod] ??= {})[key] = structuredClone(value); },
  };
  return item;
}
const vowOf   = (actor, id) => actor.items.contents.find(i => i.id === id);
const dropVow = (actor, id) => { const at = actor.items.contents.findIndex(i => i.id === id); actor.items.contents.splice(at, 1); };
const victory = () => table.cards(f => f.fightVowCard).at(-1) ?? null;
const whichVow = () => table.cards(f => f.whichVowCard);
const forced  = () => table.cards(f => f.forcedMoveId === "fulfill_your_vow");

async function post(vowName) {
  await gm.run(() => index.postFightVowMilestoneCard(vowName, 2, "pc-kira", {}));
  await table.settle(); await table.drain();
  return victory();
}
async function press(card, selector, data) {
  control.dice = [0.25, 0.45, 0.9];
  await table.client("pl-1").click(card._id, selector, data);
  await table.settle(); await table.drain();
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
  gm = table.client("gm-1");
  index = await gm.import("../../src/index.js");
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "afn-s1", sessionNumber: 1,
      currentSceneId: "sc-1", sceneTruths: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { iron: 2 },
    items: { contents: [vowItem("v-beacon", "Bring the beacon home"), vowItem("v-guard", "Guard the Ship")] } });
});

describe("issue #364 ATTEMPT-FULFIL-NO-ID-CARD — 🏁 on a victory card with no vow id, its vow deleted", () => {
  it.each([
    ["the table's only open vow", () => {}],
    ["the roller's only open vow, another PC holding one too", () => table.addActor({ id: "pc-ash", name: "Ash",
      ownership: { "pl-2": 3 }, items: { contents: [vowItem("v-oath", "Keep the Oath")] } })],
  ])("%s: the press rolls nothing on it — it asks with Fulfill Your Vow's \"Which vow?\" card", async (_what, seatOthers) => {
    seatOthers();
    dropVow(kira, "v-beacon");
    const card = await post("Bring the beacon home");
    expect(card.flags[MODULE_ID].vowId ?? null, "a card with no vow id (setup)").toBeNull();

    await press(card, FULFIL);

    expect(vowOf(kira, "v-guard").system.completed, "the other vow is not fulfilled by itself").toBe(false);
    expect(forced(), "no Fulfill Your Vow rolled").toEqual([]);
    expect(whichVow()).toHaveLength(1);
    expect(whichVow()[0].flags[MODULE_ID]).toMatchObject({ actorId: "pc-kira", choices: [{ itemId: "v-guard", name: "Guard the Ship" }] });
    expect(table.client("pl-1").render(whichVow()[0]._id).textContent).toContain(
      "The vow this victory served, “Bring the beacon home”, is on no character's sheet by that name — deleted, or renamed?");
    expect(table.world.message(card._id).flags[MODULE_ID].fulfilAttempted, "the 🏁 is spent").toBe(true);

    // A person chooses: the pick rolls that vow, as the roller.
    await press(whichVow()[0], WHICH, { itemId: "v-guard" });
    expect(forced().map(m => m.flags[MODULE_ID].forcedMoveTargetId)).toEqual(["v-guard"]);
    expect(vowOf(kira, "v-guard").system.completed).toBe(true);
  }, 30_000);

  it("control: a card whose name names its vow rolls that vow, with no picker", async () => {
    const card = await post("Bring the beacon home");

    await press(card, FULFIL);

    expect(whichVow()).toEqual([]);
    expect(forced().map(m => m.flags[MODULE_ID].forcedMoveTargetId)).toEqual(["v-beacon"]);
    expect(vowOf(kira, "v-beacon").system.completed).toBe(true);
    expect(vowOf(kira, "v-guard").system.completed).toBe(false);
  }, 30_000);
});

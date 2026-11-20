/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/wonFightUpgradeRewardOnlyTheServedVow.test.js
 *
 * Issue #364 WON-FIGHT-UPGRADE-REWARD-DELETED-VOW-SOLE-OPEN.
 *
 * A Battle won on a weak hit and burned to a strong hit pays the promised
 * reward's strong-hit difference (issue #362 D7) — of the vow the fight
 * served. When that vow was deleted between the win and the burn, the payoff
 * looked it up by name, and the name ladder's last rung (the table's sole
 * open vow) found another vow: a reward that vow had been granted at a weak
 * hit by its own fight was raised to the strong hit's and its second point
 * given, for a fight that never served it.
 *
 * Now the difference is paid only for the vow the fight served (by the
 * track's vow id, or a name that names it): a vow gone pays nothing more, and
 * no other vow's reward is touched. The burn itself, and a vow still there,
 * are unchanged.
 *
 * On a booted table: the pipeline's own weak-hit Battle win and the player's
 * real Burn press.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ interpretation: null, dice: [] }));
vi.mock("../../src/pacing/router.js", async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
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

const REPLY = 'The corsairs break.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 3, 7; action die 4 + iron 2 = 6: a weak hit — momentum 9 burns it to a strong hit
const WEAK = [0.25, 0.65, 0.5];
const BURN = '[data-action="sf-burn-momentum"]';

let table, kira, beacon, guard, tracksStore;

function vowItem(id, name, reward) {
  const item = {
    id, type: "progress", name, system: { subtype: "vow", rank: "dangerous", current: 0, completed: false },
    flags: { [MODULE_ID]: { vowId: id, reward } },
    update: async (changes) => {
      if ("system.current" in changes) item.system.current = changes["system.current"];
      if ("system.completed" in changes) item.system.completed = changes["system.completed"];
      return item;
    },
    setFlag: async (mod, key, value) => { (item.flags[mod] ??= {})[key] = structuredClone(value); },
  };
  return item;
}
const dropVow = (actor, id) => { const at = actor.items.contents.findIndex(i => i.id === id); actor.items.contents.splice(at, 1); };

async function battleWeak() {
  control.interpretation = { adds: 0, rationale: "test", mischiefApplied: false,
    moveId: "battle", moveName: "Battle", statUsed: "iron", moveTarget: "Corsairs", moveTargetId: "fight-1" };
  control.dice = WEAK;
  await table.client("pl-1").chat("We throw everything we have at the corsairs.", { speaker: { actor: "pc-kira" } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}
async function burn(card) {
  expect(card.flags[MODULE_ID].burn).toMatchObject({ canBurn: true, originalOutcome: "weak_hit", previewOutcome: "strong_hit" });
  await table.client("pl-1").click(card._id, BURN);
  await table.settle(); await table.drain();
  expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed, "the burn landed").toBe(true);
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "wfu-s1", sessionNumber: 2,
      currentSceneId: "sc-1", sceneTruths: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // The fight's vow, its reward promised; and Kira's other vow, whose own
  // fight granted its reward at a weak hit.
  beacon = vowItem("v-beacon", "Bring the beacon home", { status: "promised", description: "Fuel cells", form: "supply" });
  guard  = vowItem("v-guard", "Guard the Ship", { status: "granted", grantedAt: "weak_hit", description: "Spare parts", form: "supply" });
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: 9, max: 10, min: -6, resetValue: 2 }, iron: 2 },
    items: { contents: [beacon, guard] } });
  kira.system.supply.value = 1;
  tracksStore = { [`${MODULE_ID}.tracks`]: [
    { id: "fight-1", label: "Corsairs", type: "combat", rank: "formidable", ticks: 16, completed: false,
      combatState: "in_control", positions: { "pc-kira": "in_control" },
      linkedVowId: "v-beacon", linkedVowName: "Bring the beacon home", createdAt: 1 },
  ] };
  table.journal._set({
    id: "tracks-journal", name: "Starforged Progress Tracks",
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); },
  });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});

describe("issue #364 WON-FIGHT-UPGRADE-REWARD-DELETED-VOW-SOLE-OPEN — the fight's vow deleted between the win and the burn", () => {
  it("the burn pays no other vow's reward difference — the other vow's reward stays the weak hit's, and no supply is given", async () => {
    const card = await battleWeak();
    expect(beacon.flags[MODULE_ID].reward, "the weak-hit win paid its own vow (setup)").toMatchObject({ status: "granted", grantedAt: "weak_hit" });
    expect(kira.system.supply.value).toBe(2);
    dropVow(kira, "v-beacon");

    await burn(card);

    expect(guard.flags[MODULE_ID].reward, "the other vow's reward is untouched").toMatchObject({ status: "granted", grantedAt: "weak_hit" });
    expect(kira.system.supply.value, "no second point of another vow's reward").toBe(2);
    expect(table.cards(f => f.rewardGrantCard && f.rewardUpgraded)).toEqual([]);
  }, 30_000);

  it("control: the fight's vow still there — its own reward's second point lands, the other vow's is untouched", async () => {
    const card = await battleWeak();

    await burn(card);

    expect(beacon.flags[MODULE_ID].reward).toMatchObject({ status: "granted", grantedAt: "strong_hit" });
    expect(guard.flags[MODULE_ID].reward).toMatchObject({ status: "granted", grantedAt: "weak_hit" });
    expect(kira.system.supply.value).toBe(3);
  }, 30_000);
});

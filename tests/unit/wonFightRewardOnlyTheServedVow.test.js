/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/wonFightRewardOnlyTheServedVow.test.js
 *
 * Issue #364 WON-FIGHT-REWARD-DELETED-VOW-SOLE-OPEN.
 *
 * A won fight grants the promised reward of the vow it served. When that vow
 * was deleted before the win, the payoff looked the vow up by its name, and
 * the name ladder's last rung — the table's sole open vow — found another
 * vow: that vow's promised reward was granted for a fight that never served
 * it.
 *
 * Now a won fight's reward is granted only for the vow its fight served — by
 * the track's vow id, or a name that names it (exactly or as whole words). A
 * vow gone grants nothing, no other vow's reward in its place, and the GMs
 * are told so in plain words on their payoff card (no Retry: nothing is owed).
 *
 * On a booted table: the pipeline's own Battle win (interpretation and dice
 * scripted at their boundaries).
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

const REPLY  = 'The corsairs break.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const STRONG = [0.25, 0.45, 0.9];   // challenge 3, 5; action die 6 + iron 2 = 8: a strong hit
const RETRY  = '[data-action="sf-payoff-retry"]';
const TOLD   = "Any reward promised for “Bring the beacon home” — the vow is on no character's sheet any more; "
  + "none was given, and no other vow's reward in its place.";

let table, gm, kira, tracksStore;

function vowItem(id, name, reward = null) {
  const item = {
    id, type: "progress", name, system: { subtype: "vow", rank: "dangerous", current: 0, completed: false },
    flags: { [MODULE_ID]: { vowId: id, ...(reward ? { reward: { status: "promised", ...reward } } : {}) } },
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
const rewardOf = (id) => vowOf(kira, id).flags[MODULE_ID].reward;
const grants   = () => table.cards(f => f.rewardGrantCard);
const fails    = () => table.cards(f => f.payoffFailureCard);

function fight(link) {
  tracksStore[`${MODULE_ID}.tracks`].push({ id: "fight-1", label: "Corsairs", type: "combat", rank: "formidable",
    ticks: 16, completed: false, combatState: "in_control", positions: { "pc-kira": "in_control" },
    linkedVowName: "Bring the beacon home", ...link, createdAt: 1 });
}
async function kiraWins() {
  control.interpretation = { adds: 0, rationale: "test", mischiefApplied: false,
    moveId: "battle", moveName: "Battle", statUsed: "iron", moveTarget: "Corsairs", moveTargetId: "fight-1" };
  control.dice = STRONG;
  await table.client("pl-1").chat("We throw everything we have at the corsairs.", { speaker: { actor: "pc-kira" } });
  await table.settle(); await table.drain();
  expect(table.cards(f => f.fightVowCard), "the win posted its victory card").toHaveLength(1);
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  gm = table.client("gm-1");
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "wfr-s1", sessionNumber: 1,
      currentSceneId: "sc-1", sceneTruths: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
  // Kira's vow the fight served, and her other vow — whose reward is promised.
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { iron: 2, momentum: { value: 2 } },
    items: { contents: [
      vowItem("v-beacon", "Bring the beacon home", { description: "The beacon's bounty", form: "momentum" }),
      vowItem("v-guard", "Guard the Ship", { description: "A berth on the Meridian", form: "momentum" }),
    ] } });
  tracksStore = { [`${MODULE_ID}.tracks`]: [] };
  table.journal._set({
    id: "tracks-journal", name: "Starforged Progress Tracks",
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); },
  });
});

describe("issue #364 WON-FIGHT-REWARD-DELETED-VOW-SOLE-OPEN — the fight's vow deleted before the win", () => {
  it.each([
    ["a fight linked by the vow's id", { linkedVowId: "v-beacon" }],
    ["a fight linked by the vow's name alone", {}],
  ])("%s: the table's only other open vow keeps its reward promised — nothing granted, and the GMs are told", async (_what, link) => {
    fight(link);
    dropVow(kira, "v-beacon");

    await kiraWins();

    expect(rewardOf("v-guard").status, "the other vow's reward is not granted").toBe("promised");
    expect(kira.system.momentum.value, "the strong hit's +2 alone, no reward's").toBe(4);
    expect(grants()).toEqual([]);
    expect(fails(), "one card for the GMs").toHaveLength(1);
    const [told] = fails();
    expect(told.flags[MODULE_ID].retryable).toBe(false);
    expect(String(told.content)).toContain("Not applied — and no longer owed:");
    expect(String(told.content)).toContain(TOLD);
    expect(gm.render(told._id).querySelector(RETRY)).toBeNull();
  }, 30_000);

  it("control: the fight's vow on the sheet — its own reward is granted, the other vow's stays promised", async () => {
    fight({ linkedVowId: "v-beacon" });

    await kiraWins();

    expect(rewardOf("v-beacon").status).toBe("granted");
    expect(rewardOf("v-guard").status).toBe("promised");
    expect(kira.system.momentum.value, "the hit's +2 and the reward's +2").toBe(6);
    expect(fails()).toEqual([]);
  }, 30_000);

  it("control: a fight linked by name, its vow renamed to a name that holds the old one — that vow's reward is granted", async () => {
    fight({});
    vowOf(kira, "v-beacon").name = "Bring the beacon home at last";

    await kiraWins();

    expect(rewardOf("v-beacon").status).toBe("granted");
    expect(rewardOf("v-guard").status).toBe("promised");
    expect(fails()).toEqual([]);
  }, 30_000);
});

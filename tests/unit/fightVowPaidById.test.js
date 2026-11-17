/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/fightVowPaidById.test.js
 *
 * Issue #362 AC46 PANEL-FIGHT-VOW-LINK-PAID-BY-NAME. A fight the Progress
 * Tracks panel's add linked to a vow stores the link's canonical half, the
 * vow's id (`linkedVowId`), beside the name it was linked under (issue #353
 * R3: "a renamed vow keeps its link"). The won fight's payoff (index.js
 * applyWonFightPayoff → postFightVowMilestoneCard / grantLinkedVowReward) was
 * handed `track.linkedVowName` alone: with the vow renamed on its sheet while
 * the fight was open, the victory card named a vow nobody held (`vowId`
 * null), its ⚑ Mark milestone had nothing to mark, and the promised reward
 * was not found.
 *
 * Fixed: the payoff finds the vow by the track's `linkedVowId` first (its
 * copies, its current name); a fight linked by name only (its threshold
 * card) is paid by the name, as before.
 *
 * From the probe tests/probes/uisec/panelFightVowLinkPaidByName.probe.js,
 * with its control; plus the milestone press and the promised reward.
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
const OLD_NAME = "Find the lost beacon";
const NEW_NAME = "Bring the beacon home";
const FUEL = { description: "Fuel cells", form: "supply" };

let table, kira, tracksStore, beacon;

function vowItem(id, name, { reward = null } = {}) {
  const item = {
    id, type: "progress", name, system: { subtype: "vow", rank: "dangerous", current: 8, completed: false },
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

async function winTheFight() {
  control.interpretation = {
    adds: 0, rationale: "test", mischiefApplied: false,
    moveId: "take_decisive_action", moveName: "Take Decisive Action", statUsed: null,
    isProgressMove: true, moveTarget: "Corsairs", moveTargetId: "fight-1",
  };
  control.dice = [0.25, 0.35];   // challenge 3, 4 against progress 10: a strong hit
  await table.client("pl-1").chat("I end it — one clean shot through their drive.", { speaker: { actor: "pc-kira" } });
  await table.settle();
  await table.drain();
}

const fightCard = () => table.cards(f => f.fightVowCard)[0] ?? null;
const fight = (over = {}) => ({ id: "fight-1", label: "Corsairs", type: "combat", rank: "dangerous", ticks: 40, completed: false,
  combatState: "in_control", positions: { "pc-kira": "in_control" }, createdAt: 1, ...over });

async function seat(track) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "ac46-s1", sessionNumber: 2,
      currentSceneId: "sc-1", sceneTruths: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  beacon = vowItem("v-beacon", OLD_NAME, { reward: FUEL });
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 } },
    items: { contents: [vowItem("v-hollow", "Avenge the Iron Hollow"), beacon] } });
  kira.system.supply.value = 1;
  tracksStore = { [`${MODULE_ID}.tracks`]: [track] };
  table.journal._set({
    id: "tracks-journal", name: "Starforged Progress Tracks",
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); },
  });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

describe("issue #362 AC46 — a fight the panel linked to a vow by id pays that vow", () => {
  beforeEach(async () => {
    // The fight as the panel's Add stores it with a vow chosen (resolveVowChoice → { linkedVowId, linkedVowName }).
    await seat(fight({ linkedVowId: "v-beacon", linkedVowName: OLD_NAME }));
  });

  it("control: the vow still under the name it was linked by — the victory card is that vow's", async () => {
    await winTheFight();
    expect(tracksStore[`${MODULE_ID}.tracks`][0].completed).toBe(true);
    expect(fightCard()?.flags[MODULE_ID]).toMatchObject({ vowName: OLD_NAME, vowId: "v-beacon", vowRank: "dangerous", actorId: "pc-kira" });
  }, 30_000);

  it("the vow renamed mid-fight: the victory card is still that vow's, under its name now", async () => {
    beacon.name = NEW_NAME;
    await winTheFight();
    expect(tracksStore[`${MODULE_ID}.tracks`][0].completed).toBe(true);
    const f = fightCard()?.flags[MODULE_ID];
    expect(f).toMatchObject({ vowId: "v-beacon", vowName: NEW_NAME, vowRank: "dangerous" });
    expect(fightCard().content).toContain(NEW_NAME);
  }, 30_000);

  it("the vow renamed mid-fight: its promised reward is granted, and ⚑ Mark milestone marks it", async () => {
    beacon.name = NEW_NAME;
    await winTheFight();
    expect(beacon.flags[MODULE_ID].reward.status).toBe("granted");
    expect(kira.system.supply.value).toBe(3);   // +2 supply on a strong hit
    expect(table.cards(f => f.rewardGrantCard)).toHaveLength(1);
    expect(table.cards(f => f.payoffFailureCard)).toEqual([]);

    const before = beacon.system.current;
    await table.client("pl-1").click(fightCard()._id, '[data-action="sf-mark-milestone"]');
    await table.settle(); await table.drain();
    expect(beacon.system.current).toBeGreaterThan(before);
  }, 30_000);
});

describe("issue #362 AC46 — control: a fight linked at its threshold card (by name alone) pays by the name", () => {
  it("the victory card and the reward are the named vow's", async () => {
    await seat(fight({ linkedVowName: OLD_NAME }));
    await winTheFight();
    expect(fightCard()?.flags[MODULE_ID]).toMatchObject({ vowName: OLD_NAME, vowId: "v-beacon" });
    expect(beacon.flags[MODULE_ID].reward.status).toBe("granted");
  }, 30_000);
});

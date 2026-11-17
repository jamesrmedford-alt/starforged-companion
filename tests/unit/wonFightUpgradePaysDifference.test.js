/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/wonFightUpgradePaysDifference.test.js
 *
 * Issue #362 D7 WON-FIGHT-PAYOFF-NOT-RESCALED — the maintainer's answer B:
 * "on upgrade, pay the difference of a won fight's milestone marks and reward
 * scale (like legacy ticks / companion health / progress)". It was the issue
 * #313 trade-off — "a Battle won on a weak hit and improved to a strong one
 * keeps the weak hit's milestone count and reward" — and with results held
 * (issue #354 P2-10) that weak-scale payoff landed before the roller chose.
 *
 * Now: the victory card the weak hit posted (named by its move's resolution)
 * shows the strong hit's milestone count when its ⚑ is still to press, or the
 * marks it lacks are marked once it was; a reward granted at the weak hit's
 * scale (`grantedAt`) gets the strong hit's — a supply or momentum reward's
 * second point, any other reward its string lifted. Never twice.
 *
 * On a booted table: the player's Battle through the GM's real pipeline, the
 * Burn Momentum / Improve Result on its card, the victory card's ⚑.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const control = vi.hoisted(() => ({ interpretation: null, dice: [], abilities: [] }));
vi.mock("../../src/pacing/router.js", async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (importOriginal) => ({
  ...(await importOriginal()), scanForApplicableAbilities: vi.fn(async () => control.abilities),
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
import { milestoneTicks } from "../../src/moves/milestone.js";

const REPLY = 'The corsairs break.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 3, 7; action die 4 + iron 2 = 6: a weak hit — momentum 9 burns it to a strong hit
const WEAK = [0.25, 0.65, 0.5];
const BURN    = '[data-action="sf-burn-momentum"]';
const IMPROVE = '[data-action="sf-improve-result"]';
const MARK    = '[data-action="sf-mark-milestone"]';
const FUGITIVE = [{ assetId: null, assetName: "Fugitive", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];
const PER_MARK = milestoneTicks("dangerous");   // the vow's rank sets each mark's ticks

let table, kira, tracksStore, beacon;

function vowItem(id, name, reward) {
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

async function seat({ fightRank = "formidable", reward = { description: "Fuel cells", form: "supply" }, momentum = 9 } = {}) {
  control.abilities = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "d7-s1", sessionNumber: 2,
      currentSceneId: "sc-1", sceneTruths: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  beacon = vowItem("v-beacon", "Bring the beacon home", reward);
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: momentum, max: 10, min: -6, resetValue: 2 }, iron: 2 },
    items: { contents: [beacon] } });
  kira.system.supply.value = 1;
  tracksStore = { [`${MODULE_ID}.tracks`]: [
    { id: "fight-1", label: "Corsairs", type: "combat", rank: fightRank, ticks: 16, completed: false,
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
}

/** Kira's Battle against the fight, a weak hit: it ends the fight and pays the win at the weak hit's scale. */
async function battleWeak() {
  control.interpretation = { adds: 0, rationale: "test", mischiefApplied: false,
    moveId: "battle", moveName: "Battle", statUsed: "iron", moveTarget: "Corsairs", moveTargetId: "fight-1" };
  control.dice = WEAK;
  await table.client("pl-1").chat("We throw everything we have at the corsairs.", { speaker: { actor: "pc-kira" } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}

const fightCard = () => table.cards(f => f.fightVowCard).at(-1) ?? null;
const live = (card) => table.world.message(card._id);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

describe("issue #362 D7 — a weak-hit win burned or improved to a strong hit pays the difference", () => {
  it("the weak-hit win pays its scale and says so — the victory card ×1 naming its move, the reward +1 supply granted at the weak hit", async () => {
    await seat();
    const card = await battleWeak();
    expect(tracksStore[`${MODULE_ID}.tracks`][0].completed, "the weak hit ended the fight (setup)").toBe(true);
    expect(card.flags[MODULE_ID].burn).toMatchObject({ canBurn: true, originalOutcome: "weak_hit", previewOutcome: "strong_hit" });
    expect(fightCard().flags[MODULE_ID]).toMatchObject({ marks: 1, vowId: "v-beacon", resolutionId: card.flags[MODULE_ID].resolutionId });
    expect(kira.system.supply.value).toBe(2);
    expect(beacon.flags[MODULE_ID].reward).toMatchObject({ status: "granted", grantedAt: "weak_hit" });
  }, 30_000);

  it("burned before ⚑ is pressed: the victory card's milestone becomes ×2, the reward's second point lands — and ⚑ marks both", async () => {
    await seat();
    const card = await battleWeak();
    await click(card, BURN);

    expect(live(card).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(fightCard().flags[MODULE_ID].marks).toBe(2);
    expect(fightCard().content).toContain("⚑ Mark milestone (×2)");
    expect(kira.system.supply.value).toBe(3);                       // +1 at the weak hit, +1 more now
    expect(beacon.flags[MODULE_ID].reward).toMatchObject({ status: "granted", grantedAt: "strong_hit" });
    expect(table.cards(f => f.rewardGrantCard && f.rewardUpgraded)).toHaveLength(1);
    expect(String(live(card).content)).toMatch(/milestone toward Bring the beacon home raised to ×2/);

    await click(fightCard(), MARK);
    expect(beacon.system.current).toBe(2 * PER_MARK);
  }, 30_000);

  it("burned after ⚑ was pressed: the mark it lacks is marked now — once; pressing again marks nothing", async () => {
    await seat();
    const card = await battleWeak();
    await click(fightCard(), MARK);
    expect(beacon.system.current, "the weak hit's one mark (setup)").toBe(PER_MARK);

    await click(card, BURN);

    expect(beacon.system.current).toBe(2 * PER_MARK);
    expect(String(live(card).content)).toMatch(/1 more milestone mark toward Bring the beacon home/);
    // The card's ⚑ is spent; a press sent anyway marks nothing more.
    const { applyFightVowMarkMilestone } = await table.client("gm-1").import("../../src/moves/cardActions.js");
    await table.client("gm-1").run(() => applyFightVowMarkMilestone({ messageId: fightCard()._id }, { requesterIsGM: true }));
    await table.settle(); await table.drain();
    expect(beacon.system.current).toBe(2 * PER_MARK);
    expect(kira.system.supply.value).toBe(3);
  }, 30_000);

  it("improved instead of burned: the same difference", async () => {
    await seat({ momentum: 2 });
    control.abilities = FUGITIVE;
    const card = await battleWeak();
    expect(live(card).flags[MODULE_ID].improve?.canImprove, "the improvement is offered (setup)").toBe(true);
    await click(card, IMPROVE);
    expect(live(card).flags[MODULE_ID].improve.consumed).toBe(true);
    expect(fightCard().flags[MODULE_ID].marks).toBe(2);
    expect(kira.system.supply.value).toBe(3);
  }, 30_000);

  it("a reward of gear: granted with a string on the weak hit, the strong hit lifts it — no meter, one card", async () => {
    await seat({ reward: { description: "A custom raygun", form: "gear" } });
    const card = await battleWeak();
    expect(table.cards(f => f.rewardGrantCard).at(-1).content).toContain("with a string");
    await click(card, BURN);
    const upgraded = table.cards(f => f.rewardGrantCard && f.rewardUpgraded);
    expect(upgraded).toHaveLength(1);
    expect(upgraded[0].content).toContain("no string attached now");
    expect(beacon.flags[MODULE_ID].reward).toMatchObject({ grantedAt: "strong_hit" });
    expect(kira.system.supply.value).toBe(1);
  }, 30_000);

  it("control: a lost Battle burned to a win pays the strong hit's payoff in full, once — no difference on top", async () => {
    await seat();
    control.interpretation = { adds: 0, rationale: "test", mischiefApplied: false,
      moveId: "battle", moveName: "Battle", statUsed: "iron", moveTarget: "Corsairs", moveTargetId: "fight-1" };
    control.dice = [0.55, 0.65, 0.0];   // challenge 6, 7; action die 1 + iron 2 = 3: a miss; momentum 9 burns it to a strong hit
    await table.client("pl-1").chat("We throw everything we have at the corsairs.", { speaker: { actor: "pc-kira" } });
    await table.settle(); await table.drain();
    const card = table.cards(f => f.moveResolution).at(-1);
    expect(table.cards(f => f.fightVowCard), "the miss won nothing (setup)").toEqual([]);

    await click(card, BURN);

    expect(table.cards(f => f.fightVowCard)).toHaveLength(1);
    expect(fightCard().flags[MODULE_ID].marks).toBe(2);
    expect(kira.system.supply.value).toBe(3);                       // the strong hit's +2, once
    expect(table.cards(f => f.rewardGrantCard)).toHaveLength(1);
    expect(table.cards(f => f.rewardGrantCard && f.rewardUpgraded)).toEqual([]);
  }, 30_000);

  it("a dangerous fight marks one milestone on either hit — no mark is added; the reward still gets its point", async () => {
    await seat({ fightRank: "dangerous" });
    const card = await battleWeak();
    expect(fightCard().flags[MODULE_ID].marks).toBe(1);
    await click(card, BURN);
    expect(fightCard().flags[MODULE_ID].marks).toBe(1);
    expect(fightCard().content).toContain("⚑ Mark milestone (×1)");
    expect(kira.system.supply.value).toBe(3);
  }, 30_000);
});

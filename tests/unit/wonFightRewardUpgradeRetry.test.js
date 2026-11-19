/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/wonFightRewardUpgradeRetry.test.js
 *
 * Issue #364 WON-FIGHT-REWARD-UPGRADE-NO-RETRY (left open by issue #362 D7).
 * A Battle won on a weak hit and burned or improved to a strong hit is paid
 * the difference of its promised reward: the reward's `grantedAt` is raised
 * first — the claim — and then the strong hit's second point is given. A
 * give the world refused went to the GMs' payoff card with a Retry; a
 * refused CLAIM was only a line under "Not applied" on the upgraded move
 * card: nothing was given, the burn was spent, and nothing could give the
 * difference afterwards.
 *
 * Now the refused claim is a `rewardUpgrade` step on the GMs' payoff card,
 * whose Retry runs the upgrade again — claim first, so never twice.
 *
 * On a booted table: the player's Battle through the GM's real pipeline, the
 * Burn Momentum on its card, the GM's Retry on the payoff card.
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

const REPLY = 'The corsairs break.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 3, 7; action die 4 + iron 2 = 6: a weak hit — momentum 9 burns it to a strong hit
const WEAK  = [0.25, 0.65, 0.5];
const BURN  = '[data-action="sf-burn-momentum"]';
const RETRY = '[data-action="sf-payoff-retry"]';

let table, kira, tracksStore, beacon;
/** How many of the reward's next claims at the strong hit's scale the world refuses. */
let refuseStrongClaims = 0;
/** The next such claim reaches the world, and its confirmation is lost. */
let claimLandsUnconfirmed = false;

function vowItem(id, name, reward) {
  const item = {
    id, type: "progress", name, system: { subtype: "vow", rank: "dangerous", current: 0, completed: false },
    flags: { [MODULE_ID]: { vowId: id, reward: { status: "promised", ...reward } } },
    update: async (changes) => {
      if ("system.current" in changes) item.system.current = changes["system.current"];
      if ("system.completed" in changes) item.system.completed = changes["system.completed"];
      return item;
    },
    setFlag: async (mod, key, value) => {
      if (key === "reward" && value?.grantedAt === "strong_hit" && refuseStrongClaims > 0) {
        refuseStrongClaims -= 1;
        throw new Error("the world refused the write");
      }
      (item.flags[mod] ??= {})[key] = structuredClone(value);
      if (key === "reward" && value?.grantedAt === "strong_hit" && claimLandsUnconfirmed) {
        claimLandsUnconfirmed = false;
        throw new Error("the connection dropped");
      }
    },
  };
  return item;
}

async function seat() {
  control.abilities = [];
  refuseStrongClaims = 0;
  claimLandsUnconfirmed = false;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "i364-s1", sessionNumber: 2,
      currentSceneId: "sc-1", sceneTruths: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  beacon = vowItem("v-beacon", "Bring the beacon home", { description: "Fuel cells", form: "supply" });
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: 9, max: 10, min: -6, resetValue: 2 }, iron: 2 },
    items: { contents: [beacon] } });
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

async function click(userId, card, selector) {
  await table.client(userId).click(card._id, selector);
  await table.settle(); await table.drain();
}

const live = (card) => table.world.message(card._id);
const failCards = () => table.cards(f => f.payoffFailureCard);
const upgradedRewardCards = () => table.cards(f => f.rewardGrantCard && f.rewardUpgraded);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

describe("issue #364 WON-FIGHT-REWARD-UPGRADE-NO-RETRY — a refused claim of the reward's strong-hit difference has a Retry", () => {
  it("control: the claim lands — the second point is given, and no payoff card is posted", async () => {
    await seat();
    const card = await battleWeak();
    expect(kira.system.supply.value, "the weak hit's +1 (setup)").toBe(2);
    await click("pl-1", card, BURN);
    expect(kira.system.supply.value).toBe(3);
    expect(beacon.flags[MODULE_ID].reward).toMatchObject({ status: "granted", grantedAt: "strong_hit" });
    expect(failCards()).toEqual([]);
  }, 30_000);

  it("the claim refused: nothing is given, and the GMs get a payoff card with a rewardUpgrade step and a Retry", async () => {
    await seat();
    const card = await battleWeak();
    refuseStrongClaims = 1;
    await click("pl-1", card, BURN);

    expect(live(card).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(kira.system.supply.value, "no second point: the claim did not land").toBe(2);
    expect(beacon.flags[MODULE_ID].reward).toMatchObject({ status: "granted", grantedAt: "weak_hit" });
    expect(upgradedRewardCards()).toEqual([]);

    expect(failCards()).toHaveLength(1);
    const [report] = failCards();
    expect(report.flags[MODULE_ID]).toMatchObject({ source: "fight", vowId: "v-beacon", outcome: "strong_hit",
      retryable: true, resolved: false, steps: [{ step: "rewardUpgrade", rewardDescription: "Fuel cells" }] });
    expect(report.whisper).toEqual(["gm-1"]);
    expect(report.content).toContain("sf-payoff-retry");
    expect(report.content).toContain("The strong hit's share of the promised reward “Fuel cells”");
    expect(report.content).toContain("recorded as granted on the weak hit now");
    expect(String(live(card).content), "the roller's card says where it went").toContain("the GMs have a Retry");
  }, 30_000);

  it("the GMs' Retry runs the upgrade: the second point lands once, and a second press gives nothing more", async () => {
    await seat();
    const card = await battleWeak();
    refuseStrongClaims = 1;
    await click("pl-1", card, BURN);
    const [report] = failCards();

    await click("gm-1", report, RETRY);
    expect(kira.system.supply.value).toBe(3);
    expect(beacon.flags[MODULE_ID].reward).toMatchObject({ status: "granted", grantedAt: "strong_hit" });
    expect(upgradedRewardCards()).toHaveLength(1);
    expect(live(report).flags[MODULE_ID].resolved).toBe(true);
    expect(failCards(), "nothing failed again").toHaveLength(1);

    await click("gm-1", report, RETRY);
    expect(kira.system.supply.value).toBe(3);
    expect(upgradedRewardCards()).toHaveLength(1);
  }, 30_000);

  it("a claim refused again on the Retry goes on a fresh card, whose Retry still runs the upgrade", async () => {
    await seat();
    const card = await battleWeak();
    refuseStrongClaims = 2;
    await click("pl-1", card, BURN);
    await click("gm-1", failCards()[0], RETRY);

    expect(kira.system.supply.value).toBe(2);
    expect(failCards()).toHaveLength(2);
    const again = failCards()[1];
    expect(again.flags[MODULE_ID]).toMatchObject({ source: "fight", vowId: "v-beacon", outcome: "strong_hit",
      steps: [{ step: "rewardUpgrade" }] });

    await click("gm-1", again, RETRY);
    expect(kira.system.supply.value).toBe(3);
    expect(beacon.flags[MODULE_ID].reward.grantedAt).toBe("strong_hit");
    expect(failCards()).toHaveLength(2);
  }, 30_000);

  it("a claim that reached the world unconfirmed: the card says the reward is recorded as the strong hit's, and the Retry gives nothing twice", async () => {
    await seat();
    const card = await battleWeak();
    claimLandsUnconfirmed = true;
    await click("pl-1", card, BURN);

    expect(beacon.flags[MODULE_ID].reward.grantedAt, "the claim is in the world").toBe("strong_hit");
    expect(kira.system.supply.value, "its give never ran").toBe(2);
    const [report] = failCards();
    expect(report.flags[MODULE_ID].steps).toMatchObject([{ step: "rewardUpgrade" }]);
    expect(report.content).toContain("recorded as the strong hit's now");
    expect(report.content).toContain("hand over the difference yourself");

    await click("gm-1", report, RETRY);
    expect(kira.system.supply.value, "claimed once: the Retry pays no second difference").toBe(2);
    expect(failCards()).toHaveLength(1);
  }, 30_000);
});

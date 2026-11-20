/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/wonFightMilestoneUpgradeRetry.test.js
 *
 * Issue #364 WON-FIGHT-MILESTONE-UPGRADE-NO-RETRY (left open by
 * WON-FIGHT-REWARD-UPGRADE-NO-RETRY). A Battle won on a weak hit and burned
 * or improved to a strong hit is paid the difference of its milestone (issue
 * #362 D7): the victory card's ⚑ count is raised to the strong hit's while it
 * is still to press, or — once pressed — the marks it lacked are marked,
 * once. A raise or a mark the world refused was only a line under "Not
 * applied" on the upgraded move card: the burn was spent, and nothing could
 * pay the milestone afterwards.
 *
 * Now each is a `milestoneUpgrade` step on the GMs' payoff card, whose Retry
 * decides again by the victory card as it stands — and never marks twice (the
 * vow's payoff ledger, `milestone:<card>:upgrade`).
 *
 * On a booted table: the player's Battle through the GM's real pipeline, the
 * Burn Momentum on its card, ⚑ on the victory card, the GM's Retry.
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
import { scriptClaude, failWrites } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { milestoneTicks } from "../../src/moves/milestone.js";

const REPLY = 'The corsairs break.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 3, 7; action die 4 + iron 2 = 6: a weak hit — momentum 9 burns it to a strong hit
const WEAK  = [0.25, 0.65, 0.5];
const BURN  = '[data-action="sf-burn-momentum"]';
const MARK  = '[data-action="sf-mark-milestone"]';
const RETRY = '[data-action="sf-payoff-retry"]';
const PER_MARK = milestoneTicks("dangerous");   // the vow's rank sets each mark's ticks

let table, kira, tracksStore, beacon;
/** How many of the vow's next progress writes the world refuses. */
let refuseMarks = 0;
/** How many of the reward's next claims at the strong hit's scale the world refuses. */
let refuseStrongClaims = 0;

function vowItem(id, name, reward) {
  const item = {
    id, type: "progress", name, system: { subtype: "vow", rank: "dangerous", current: 0, completed: false },
    flags: { [MODULE_ID]: { vowId: id, reward: { status: "promised", ...reward } } },
    update: async (changes) => {
      if ("system.current" in changes && refuseMarks > 0) {
        refuseMarks -= 1;
        throw new Error("the world refused the write");
      }
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
    },
  };
  return item;
}

async function seat() {
  control.abilities = [];
  refuseMarks = 0;
  refuseStrongClaims = 0;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "i364-ms1", sessionNumber: 2,
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
const fightCard = () => table.cards(f => f.fightVowCard).at(-1) ?? null;
const failCards = () => table.cards(f => f.payoffFailureCard);
const ledger = () => beacon.flags[MODULE_ID].fulfilPayoff ?? {};
/** The raise of the victory card's ⚑ count: its `marks` flag written. */
const raiseOf = (card) => (w) => w.kind === "message.update" && w.id === card._id
  && Object.keys(w.changes ?? {}).some(k => k.endsWith(".marks"));

/** The failure card's steps run again as the GM's Retry runs them — past the card's own once-only claim. */
async function rerun(report) {
  const { retryPayoffSteps } = await table.client("gm-1").import("../../src/index.js");
  const failed = await table.client("gm-1").run(() => retryPayoffSteps(report.flags[MODULE_ID]));
  await table.settle(); await table.drain();
  return failed;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

describe("issue #364 WON-FIGHT-MILESTONE-UPGRADE-NO-RETRY — a refused raise of the victory card's milestone has a Retry", () => {
  it("control: the raise lands — the victory card shows ×2, and no payoff card is posted", async () => {
    await seat();
    const card = await battleWeak();
    expect(fightCard().flags[MODULE_ID].marks, "the weak hit's one mark (setup)").toBe(1);
    await click("pl-1", card, BURN);
    expect(fightCard().flags[MODULE_ID].marks).toBe(2);
    expect(failCards()).toEqual([]);
  }, 30_000);

  it("the raise refused: the card stays ×1, and the GMs get a payoff card with a milestoneUpgrade step and a Retry", async () => {
    await seat();
    const card = await battleWeak();
    const fault = failWrites(table, raiseOf(fightCard()));
    await click("pl-1", card, BURN);

    expect(fault.refused).toBe(1);
    expect(live(card).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(fightCard().flags[MODULE_ID].marks).toBe(1);
    expect(fightCard().content).toContain("⚑ Mark milestone (×1)");
    expect(kira.system.supply.value, "the reward's difference still lands").toBe(3);

    expect(failCards()).toHaveLength(1);
    const [report] = failCards();
    expect(report.flags[MODULE_ID]).toMatchObject({ source: "fight", vowId: "v-beacon", outcome: "strong_hit",
      retryable: true, resolved: false, steps: [{ step: "milestoneUpgrade", cardId: fightCard()._id, marks: 2, lacking: null }] });
    expect(report.whisper).toEqual(["gm-1"]);
    expect(report.content).toContain("sf-payoff-retry");
    expect(report.content).toContain("The victory card's ⚑ milestone on “Bring the beacon home” raised to ×2");
    expect(report.content).toContain("The card shows ×1 now.");
    expect(String(live(card).content), "the roller's card says where it went")
      .toContain("the strong hit's milestone ×2 on the victory card — the GMs have a Retry");
  }, 30_000);

  it("the GMs' Retry raises the card: ⚑ then marks both, and a second Retry changes nothing", async () => {
    await seat();
    const card = await battleWeak();
    failWrites(table, raiseOf(fightCard()));
    await click("pl-1", card, BURN);
    const [report] = failCards();

    await click("gm-1", report, RETRY);
    expect(fightCard().flags[MODULE_ID].marks).toBe(2);
    expect(fightCard().content).toContain("⚑ Mark milestone (×2)");
    expect(live(report).flags[MODULE_ID].resolved).toBe(true);
    expect(failCards(), "nothing failed again").toHaveLength(1);
    expect(beacon.system.current, "a raise marks nothing by itself").toBe(0);

    await click("gm-1", report, RETRY);
    expect(await rerun(report), "its steps run again: the card already shows ×2").toEqual([]);
    expect(fightCard().flags[MODULE_ID].marks).toBe(2);

    await click("pl-1", fightCard(), MARK);
    expect(beacon.system.current).toBe(2 * PER_MARK);
  }, 30_000);

  it("⚑ pressed at ×1 before the Retry: the Retry marks the one it lacked — once, however often its steps run", async () => {
    await seat();
    const card = await battleWeak();
    failWrites(table, raiseOf(fightCard()));
    await click("pl-1", card, BURN);
    const [report] = failCards();
    await click("pl-1", fightCard(), MARK);
    expect(beacon.system.current, "the press marked the card's ×1").toBe(PER_MARK);

    await click("gm-1", report, RETRY);
    expect(beacon.system.current).toBe(2 * PER_MARK);
    expect(ledger()[`milestone:${fightCard()._id}:upgrade`], "claimed on the vow's payoff ledger").toBe(true);
    expect(fightCard().flags[MODULE_ID].marks, "a pressed card's count is left").toBe(1);
    expect(failCards()).toHaveLength(1);

    expect(await rerun(report)).toEqual([]);
    expect(beacon.system.current, "never twice").toBe(2 * PER_MARK);
  }, 30_000);
});

describe("issue #364 WON-FIGHT-MILESTONE-UPGRADE-NO-RETRY — a refused mark after ⚑ was pressed has a Retry", () => {
  it("the mark refused: the vow keeps the weak hit's mark, and the GMs' card carries the marks it lacks", async () => {
    await seat();
    const card = await battleWeak();
    await click("pl-1", fightCard(), MARK);
    expect(beacon.system.current, "the weak hit's one mark (setup)").toBe(PER_MARK);
    refuseMarks = 1;
    await click("pl-1", card, BURN);

    expect(beacon.system.current).toBe(PER_MARK);
    expect(ledger()[`milestone:${fightCard()._id}:upgrade`]).toBeUndefined();
    expect(failCards()).toHaveLength(1);
    const [report] = failCards();
    expect(report.flags[MODULE_ID]).toMatchObject({ source: "fight", vowId: "v-beacon", retryable: true,
      steps: [{ step: "milestoneUpgrade", cardId: fightCard()._id, marks: 2, lacking: 1 }] });
    expect(report.content).toContain("⚑ 1 more milestone mark on “Bring the beacon home”");
    expect(report.content).toContain(`It stands at ${PER_MARK}/40 ticks now.`);
    expect(String(live(card).content)).toContain("1 more milestone mark toward Bring the beacon home — the GMs have a Retry");
  }, 30_000);

  it("the GMs' Retry marks it once: a second press, and its steps run again, mark nothing more", async () => {
    await seat();
    const card = await battleWeak();
    await click("pl-1", fightCard(), MARK);
    refuseMarks = 1;
    await click("pl-1", card, BURN);
    const [report] = failCards();

    await click("gm-1", report, RETRY);
    expect(beacon.system.current).toBe(2 * PER_MARK);
    expect(ledger()[`milestone:${fightCard()._id}:upgrade`]).toBe(true);
    expect(failCards()).toHaveLength(1);

    await click("gm-1", report, RETRY);
    expect(await rerun(report)).toEqual([]);
    expect(beacon.system.current, "never twice").toBe(2 * PER_MARK);
  }, 30_000);

  it("a mark refused again on the Retry goes on a fresh card, whose Retry still marks it once", async () => {
    await seat();
    const card = await battleWeak();
    await click("pl-1", fightCard(), MARK);
    refuseMarks = 2;
    await click("pl-1", card, BURN);
    await click("gm-1", failCards()[0], RETRY);

    expect(beacon.system.current).toBe(PER_MARK);
    expect(failCards()).toHaveLength(2);
    const again = failCards()[1];
    expect(again.flags[MODULE_ID]).toMatchObject({ source: "fight", vowId: "v-beacon",
      steps: [{ step: "milestoneUpgrade", cardId: fightCard()._id, marks: 2, lacking: 1 }] });

    await click("gm-1", again, RETRY);
    expect(beacon.system.current).toBe(2 * PER_MARK);
    expect(failCards()).toHaveLength(2);
  }, 30_000);

  it("the victory card deleted before the Retry: the marks it lacked are still marked, once", async () => {
    await seat();
    const card = await battleWeak();
    await click("pl-1", fightCard(), MARK);
    refuseMarks = 1;
    await click("pl-1", card, BURN);
    const [report] = failCards();
    const victoryId = fightCard()._id;
    await table.client("gm-1").run(() => globalThis.game.messages.get(victoryId).delete());
    await table.settle(); await table.drain();
    expect(fightCard(), "the victory card is gone (setup)").toBeNull();

    await click("gm-1", report, RETRY);
    expect(beacon.system.current).toBe(2 * PER_MARK);
    expect(ledger()[`milestone:${victoryId}:upgrade`]).toBe(true);
    expect(await rerun(report)).toEqual([]);
    expect(beacon.system.current).toBe(2 * PER_MARK);
  }, 30_000);

  it("the mark and the reward's claim both refused: one card, two steps, one Retry pays both", async () => {
    await seat();
    const card = await battleWeak();
    await click("pl-1", fightCard(), MARK);
    refuseMarks = 1;
    refuseStrongClaims = 1;
    await click("pl-1", card, BURN);

    expect(failCards()).toHaveLength(1);
    const [report] = failCards();
    expect(report.flags[MODULE_ID].steps).toMatchObject([
      { step: "milestoneUpgrade", lacking: 1 }, { step: "rewardUpgrade", rewardDescription: "Fuel cells" }]);
    expect(kira.system.supply.value).toBe(2);

    await click("gm-1", report, RETRY);
    expect(beacon.system.current).toBe(2 * PER_MARK);
    expect(kira.system.supply.value).toBe(3);
    expect(failCards()).toHaveLength(1);
  }, 30_000);

  it("control: a vow fulfilled since has nothing to mark — a line on the move card, and no step to retry", async () => {
    await seat();
    const card = await battleWeak();
    await click("pl-1", fightCard(), MARK);
    beacon.system.completed = true;
    await click("pl-1", card, BURN);

    expect(beacon.system.current).toBe(PER_MARK);
    expect(failCards().flatMap(c => c.flags[MODULE_ID].steps).filter(s => s.step === "milestoneUpgrade")).toEqual([]);
    // In words, not its code (issue #364 MOVE-CARD-RAW-REASON-CODE).
    expect(String(live(card).content)).toContain("1 more milestone mark toward Bring the beacon home — the vow is fulfilled — nothing to mark");
  }, 30_000);
});
